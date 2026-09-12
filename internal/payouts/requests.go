package payouts

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"dmr/internal/models"
	"dmr/internal/validation"
)

// Create — новая заявка (из кабинета или Telegram-пасты).
func (s *Service) Create(r models.Request) (int64, error) {
	if r.Kind == models.KindPayout {
		// Ограничение по времени применяется ТОЛЬКО к заявкам на выплату:
		week, err := s.EnsureCurrentWeek()
		if err != nil {
			return 0, fmt.Errorf("приём заявок на выплату закрыт (окно: пн 00:00 — пн 23:00 МСК)")
		}

		// максимум 2 незакрытые заявки на выплату на аккаунт за неделю
		var dup int
		_ = s.db.QueryRow(
			`SELECT COUNT(*) FROM v2_requests WHERE week_id = ? AND account_id = ? AND kind = ? AND status = 'pending'`,
			week.ID, r.AccountID, r.Kind).Scan(&dup)
		if dup >= 2 {
			return 0, fmt.Errorf("у вас уже есть 2 нерассмотренные заявки на выплату на текущей неделе")
		}

		return s.db.InsertReturningID(`
			INSERT INTO v2_requests
			(week_id, kind, source, account_id, nickname, telegram, tg_user_id, uid, duration,
			 want, amount, method, platform, channel_url, lot_url, promo_code, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
			week.ID, r.Kind, r.Source, r.AccountID, r.Nickname, r.Telegram, r.TGUserID,
			r.UID, r.Duration, r.Want, r.Amount, r.Method, r.Platform, r.ChannelURL, r.LotURL, r.PromoCode)
	}

	// Для лотов (KindLot) и любых других заявок — разрешено ВСЕГДА 24/7 без ограничений по времени!
	week, _ := s.GetOrCreateWeek()
	var weekID int64
	if week.ID != 0 {
		weekID = week.ID
	}

	// Проверка на наличие незакрытой заявки того же типа у аккаунта
	var dup int
	_ = s.db.QueryRow(
		`SELECT COUNT(*) FROM v2_requests WHERE account_id = ? AND kind = ? AND status = 'pending'`,
		r.AccountID, r.Kind).Scan(&dup)
	if dup > 0 {
		typeName := "лот"
		if r.Kind == models.KindGiveaway {
			typeName = "ключ для розыгрыша"
		}
		return 0, fmt.Errorf("у вас уже есть нерассмотренная заявка на %s. Дождитесь ответа администратора.", typeName)
	}

	return s.db.InsertReturningID(`
		INSERT INTO v2_requests
		(week_id, kind, source, account_id, nickname, telegram, tg_user_id, uid, duration,
		 want, amount, method, platform, channel_url, lot_url, promo_code, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
		weekID, r.Kind, r.Source, r.AccountID, r.Nickname, r.Telegram, r.TGUserID,
		r.UID, r.Duration, r.Want, r.Amount, r.Method, r.Platform, r.ChannelURL, r.LotURL, r.PromoCode)
}

// parsePaste разбирает сообщение по строкам шаблона «Префикс: {field}».
func parsePaste(template, message string) (map[string]string, error) {
	fields := map[string]string{}
	for _, tLine := range strings.Split(template, "\n") {
		tLine = strings.TrimSpace(tLine)
		if !strings.Contains(tLine, "{") || !strings.Contains(tLine, ":") {
			continue
		}
		prefix := strings.ToLower(strings.TrimSpace(strings.SplitN(tLine, "{", 2)[0]))
		prefix = strings.TrimSuffix(strings.TrimSpace(prefix), ":")
		if prefix == "" {
			continue
		}
		for _, mLine := range strings.Split(message, "\n") {
			mLine = strings.TrimSpace(mLine)
			lower := strings.ToLower(mLine)
			if !strings.HasPrefix(lower, prefix) {
				continue
			}
			rest := mLine[len(prefix):]
			if !strings.HasPrefix(strings.TrimSpace(rest), ":") {
				continue
			}
			value := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rest), ":"))
			for _, name := range []string{"uid", "duration", "want", "amount", "method", "lot_url"} {
				if strings.Contains(tLine, "{"+name+"}") {
					fields[name] = value
				}
			}
			break
		}
	}
	if len(fields) == 0 {
		return nil, fmt.Errorf("не найдено ни одного поля шаблона")
	}
	return fields, nil
}

func parseMethod(raw string) (string, error) {
	l := strings.ToLower(raw)
	switch {
	case l == "":
		return "", fmt.Errorf("не указан способ выплаты")
	case strings.Contains(l, "funpay") || strings.Contains(l, "фан"):
		return models.MethodFunPay, nil
	case strings.Contains(l, "usdt") || strings.Contains(l, "чек") ||
		strings.Contains(l, "crypto") || strings.Contains(l, "крипт"):
		return models.MethodUSDT, nil
	}
	return "", fmt.Errorf("способ должен быть USDT-чек или FunPay")
}

// HandlePaste — приём заявки на выплату пастой из Telegram (PayoutSink).
func (s *Service) HandlePaste(nickname, telegram string, tgUserID int64, text string) (int64, string, error) {
	fields, err := parsePaste(s.db.Setting("payout_paste_template"), text)
	if err != nil {
		return 0, "", err
	}

	uid, ok := validation.NumericUID(fields["uid"])
	if !ok {
		return 0, "", fmt.Errorf("в поле UID разрешены только цифры")
	}
	method, err := parseMethod(fields["method"])
	if err != nil {
		return 0, "", err
	}
	if fields["duration"] == "" || fields["want"] == "" {
		return 0, "", fmt.Errorf("заполните «В медиа» и «Что хочу получить»")
	}

	r := models.Request{
		Kind: models.KindPayout, Source: "telegram",
		Nickname: nickname, Telegram: telegram, TGUserID: tgUserID,
		UID: uid, Duration: validation.Clean(fields["duration"], 100),
		Want: validation.Clean(fields["want"], 300), Method: method,
	}
	if method == models.MethodUSDT {
		amount, ok := validation.Amount(fields["amount"])
		if !ok {
			return 0, "", fmt.Errorf("укажите корректную сумму USDT")
		}
		r.Amount = strconv.FormatFloat(amount, 'f', 2, 64)
	} else {
		lot, ok := validation.FunPayLot(fields["lot_url"])
		if !ok {
			return 0, "", fmt.Errorf("для FunPay укажите ссылку на лот (https://funpay.com/lots/...)")
		}
		r.LotURL = lot
	}

	var accountID int64
	_ = s.db.QueryRow(
		`SELECT id FROM v2_accounts WHERE LOWER(LTRIM(telegram,'@')) = ?`,
		strings.ToLower(strings.TrimPrefix(telegram, "@"))).Scan(&accountID)
	r.AccountID = accountID

	id, err := s.Create(r)
	return id, "", err
}

// ListByWeek — заявки недели для админ-таблицы (новые вверху = DESC).
func (s *Service) ListByWeek(weekID int64) ([]models.Request, error) {
	return s.ListPayoutsByWeek(weekID)
}

// ListPayoutsByWeek — только заявки на выплату за неделю.
func (s *Service) ListPayoutsByWeek(weekID int64) ([]models.Request, error) {
	rows, err := s.db.Query(`
		SELECT id, week_id, kind, source, account_id, nickname, telegram, tg_user_id,
		       uid, duration, want, amount, method, platform, channel_url, lot_url,
		       promo_code, status, decision_comment, tx_ref, created_at, decided_at
		FROM v2_requests WHERE week_id = ? AND kind = 'payout' ORDER BY id DESC`, weekID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRequests(rows)
}

// ListLots — все заявки на лоты и подписки (24/7).
func (s *Service) ListLots(limit, offset int) ([]models.Request, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(`
		SELECT id, week_id, kind, source, account_id, nickname, telegram, tg_user_id,
		       uid, duration, want, amount, method, platform, channel_url, lot_url,
		       promo_code, status, decision_comment, tx_ref, created_at, decided_at
		FROM v2_requests WHERE kind IN ('lot', 'subscription', 'giveaway') ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRequests(rows)
}

// MyRequests — история заявок аккаунта (для кабинета).
func (s *Service) MyRequests(accountID int64) ([]models.Request, error) {
	rows, err := s.db.Query(`
		SELECT id, week_id, kind, source, account_id, nickname, telegram, tg_user_id,
		       uid, duration, want, amount, method, platform, channel_url, lot_url,
		       promo_code, status, decision_comment, tx_ref, created_at, decided_at
		FROM v2_requests WHERE account_id = ? ORDER BY id DESC LIMIT 50`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRequests(rows)
}

func scanRequests(rows *sql.Rows) ([]models.Request, error) {
	list := make([]models.Request, 0, 16)
	for rows.Next() {
		var r models.Request
		if rows.Scan(&r.ID, &r.WeekID, &r.Kind, &r.Source, &r.AccountID, &r.Nickname, &r.Telegram,
			&r.TGUserID, &r.UID, &r.Duration, &r.Want, &r.Amount, &r.Method, &r.Platform,
			&r.ChannelURL, &r.LotURL, &r.PromoCode, &r.Status, &r.DecisionComment, &r.TXRef, &r.CreatedAt, &r.DecidedAt) == nil {
			list = append(list, r)
		}
	}
	return list, nil
}

// Get — одна заявка.
func (s *Service) Get(id int64) (models.Request, error) {
	var r models.Request
	err := s.db.QueryRow(`
		SELECT id, week_id, kind, source, account_id, nickname, telegram, tg_user_id,
		       uid, duration, want, amount, method, platform, channel_url, lot_url,
		       promo_code, status, decision_comment, tx_ref, created_at, decided_at
		FROM v2_requests WHERE id = ?`, id,
	).Scan(&r.ID, &r.WeekID, &r.Kind, &r.Source, &r.AccountID, &r.Nickname, &r.Telegram,
		&r.TGUserID, &r.UID, &r.Duration, &r.Want, &r.Amount, &r.Method, &r.Platform,
		&r.ChannelURL, &r.LotURL, &r.PromoCode, &r.Status, &r.DecisionComment, &r.TXRef, &r.CreatedAt, &r.DecidedAt)
	return r, err
}

// Decide применяет решение (комментарий/причина и tx_ref опциональны).
func (s *Service) Decide(id int64, approve bool, reason, txRef string) error {
	status := "rejected"
	if approve {
		status = "approved"
	}
	res, err := s.db.Exec(`
		UPDATE v2_requests SET status = ?, decision_comment = ?, tx_ref = ?, decided_at = ?
		WHERE id = ? AND status = 'pending'`, status, reason, txRef, time.Now(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("заявка уже рассмотрена")
	}
	return nil
}

// ── Недели и итоговый текст ──────────────────────────────────

// CurrentWeek для панели (с итоговым текстом).
func (s *Service) CurrentWeek() (models.Week, bool) {
	w, err := s.EnsureCurrentWeek()
	if err == nil {
		_ = s.db.QueryRow(`SELECT summary_text FROM v2_weeks WHERE id = ?`, w.ID).Scan(&w.SummaryText)
		return w, true
	}
	// Если окно приёма закрыто, возвращаем последнюю созданную неделю для админки
	var last models.Week
	err = s.db.QueryRow(
		`SELECT id, label, opens_at, closes_at, is_current, summary_text
		 FROM v2_weeks ORDER BY id DESC LIMIT 1`,
	).Scan(&last.ID, &last.Label, &last.OpensAt, &last.ClosesAt, &last.IsCurrent, &last.SummaryText)
	if err != nil {
		return models.Week{}, false
	}
	return last, true
}

// GetOrCreateWeek возвращает текущую или последнюю неделю, либо создаёт её (для лотов и админки вне окна выплат).
func (s *Service) GetOrCreateWeek() (models.Week, error) {
	if w, ok := s.CurrentWeek(); ok {
		return w, nil
	}
	now := time.Now().In(s.tz)
	monday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, s.tz)
	for monday.Weekday() != time.Monday {
		monday = monday.AddDate(0, 0, -1)
	}
	closes := monday.Add(23 * time.Hour)
	label := weekLabel(monday, closes)

	var w models.Week
	err := s.db.QueryRow(`SELECT id, label, opens_at, closes_at, is_current, summary_text FROM v2_weeks WHERE opens_at = ?`, monday).
		Scan(&w.ID, &w.Label, &w.OpensAt, &w.ClosesAt, &w.IsCurrent, &w.SummaryText)
	if err == nil {
		return w, nil
	}

	id, err := s.db.InsertReturningID(
		`INSERT INTO v2_weeks (label, opens_at, closes_at, is_current) VALUES (?, ?, ?, 0)`,
		label, monday, closes)
	if err != nil {
		return models.Week{}, err
	}
	return models.Week{ID: id, Label: label, OpensAt: monday, ClosesAt: closes, IsCurrent: false}, nil
}

func (s *Service) WeekByID(id int64) (models.Week, error) {
	var w models.Week
	err := s.db.QueryRow(
		`SELECT id, label, opens_at, closes_at, is_current, summary_text FROM v2_weeks WHERE id = ?`, id,
	).Scan(&w.ID, &w.Label, &w.OpensAt, &w.ClosesAt, &w.IsCurrent, &w.SummaryText)
	return w, err
}

// SetSummary сохраняет редактируемый итоговый текст недели.
func (s *Service) SetSummary(weekID int64, text string) error {
	_, err := s.db.Exec(`UPDATE v2_weeks SET summary_text = ? WHERE id = ?`, text, weekID)
	return err
}

// HistoryWeeks — прошедшие недели (для просмотра архивов).
func (s *Service) HistoryWeeks() ([]models.Week, error) {
	rows, err := s.db.Query(
		`SELECT id, label, opens_at, closes_at, is_current, summary_text
		 FROM v2_weeks ORDER BY opens_at DESC LIMIT 30`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]models.Week, 0, 8)
	for rows.Next() {
		var w models.Week
		if rows.Scan(&w.ID, &w.Label, &w.OpensAt, &w.ClosesAt, &w.IsCurrent, &w.SummaryText) == nil {
			list = append(list, w)
		}
	}
	return list, nil
}
