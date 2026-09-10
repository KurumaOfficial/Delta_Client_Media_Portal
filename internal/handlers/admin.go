package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/config"
	"dmr/internal/auth"
	"dmr/internal/bans"
	"dmr/internal/database"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/payouts"
	"dmr/internal/telegram"
)

// Admin — панель администратора. Все методы требуют роль admin (middleware).
type Admin struct {
	db     *database.DB
	cfg    *config.Config
	auth   *auth.Service
	tg     *telegram.Service
	bans   *bans.Service
	pays   *payouts.Service
	crypto *telegram.CryptoBot
}

func NewAdmin(db *database.DB, cfg *config.Config, authSvc *auth.Service, tg *telegram.Service,
	banSvc *bans.Service, pays *payouts.Service, crypto *telegram.CryptoBot) *Admin {
	return &Admin{db: db, cfg: cfg, auth: authSvc, tg: tg, bans: banSvc, pays: pays, crypto: crypto}
}

// ── Статистика ───────────────────────────────────────────────

func (h *Admin) Stats(c *fiber.Ctx) error {
	count := func(table, where string) int {
		var n int
		_ = h.db.QueryRow("SELECT COUNT(*) FROM " + table + " " + where).Scan(&n)
		return n
	}
	week, _ := h.pays.CurrentWeek()
	st := h.pays.Stats(week.ID)
	mEnabled := h.db.Setting("maintenance_enabled") == "true"
	mUntilStr := h.db.Setting("maintenance_until")
	mRemainingSec := int64(0)
	if mEnabled && mUntilStr != "" {
		if t, err := time.Parse(time.RFC3339, mUntilStr); err == nil {
			rem := int64(time.Until(t).Seconds())
			if rem > 0 {
				mRemainingSec = rem
			} else {
				mEnabled = false
				_ = h.db.SetSetting("maintenance_enabled", "false")
			}
		}
	}

	return c.JSON(fiber.Map{"success": true, "stats": fiber.Map{
		"media_pending":            count("v2_media_apps", "WHERE status = 'pending'"),
		"hwid_pending":             count("v2_hwid_requests", "WHERE status = 'pending'"),
		"discord_pending":          count("v2_discord_bans", "WHERE status = 'pending'"),
		"accounts_total":           count("v2_accounts", "WHERE is_active = 1"),
		"payouts_pending":          st.Pending,
		"payouts_total":            st.Total,
		"week_label":               week.Label,
		"week_open":                h.pays.WindowOpen(),
		"apps_open":                h.db.Setting("apps_open") != "false",
		"maintenance_enabled":      mEnabled,
		"maintenance_until":        mUntilStr,
		"maintenance_seconds_left": mRemainingSec,
	}})
}

// StatsChart — динамика подачи заявок (день, неделя, месяц, год, всё время) для графика-кривой.
func (h *Admin) StatsChart(c *fiber.Ctx) error {
	rows, err := h.db.Query(`SELECT created_at FROM v2_media_apps ORDER BY created_at ASC`)
	if err != nil {
		return serverError(c, "Ошибка чтения статистики")
	}
	defer rows.Close()

	var timestamps []time.Time
	for rows.Next() {
		var raw interface{}
		if err := rows.Scan(&raw); err == nil {
			switch v := raw.(type) {
			case time.Time:
				timestamps = append(timestamps, v)
			case string:
				for _, layout := range []string{
					"2006-01-02 15:04:05",
					time.RFC3339,
					"2006-01-02T15:04:05Z07:00",
					"2006-01-02",
				} {
					if t, err := time.Parse(layout, v); err == nil {
						timestamps = append(timestamps, t)
						break
					}
				}
			case []byte:
				str := string(v)
				for _, layout := range []string{
					"2006-01-02 15:04:05",
					time.RFC3339,
					"2006-01-02T15:04:05Z07:00",
					"2006-01-02",
				} {
					if t, err := time.Parse(layout, str); err == nil {
						timestamps = append(timestamps, t)
						break
					}
				}
			}
		}
	}

	now := time.Now()

	// 1. День (24 часа)
	dayLabels := make([]string, 24)
	dayValues := make([]int, 24)
	dayTotal := 0
	hourStart := now.Truncate(time.Hour).Add(-23 * time.Hour)
	for i := 0; i < 24; i++ {
		bStart := hourStart.Add(time.Duration(i) * time.Hour)
		bEnd := bStart.Add(time.Hour)
		dayLabels[i] = bStart.Format("15:04")
		for _, ts := range timestamps {
			if !ts.Before(bStart) && ts.Before(bEnd) {
				dayValues[i]++
				dayTotal++
			}
		}
	}

	// 2. Неделя (7 дней)
	weekLabels := make([]string, 7)
	weekValues := make([]int, 7)
	weekTotal := 0
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	for i := 0; i < 7; i++ {
		bStart := todayStart.AddDate(0, 0, -6+i)
		bEnd := bStart.AddDate(0, 0, 1)
		weekLabels[i] = bStart.Format("02.01")
		for _, ts := range timestamps {
			if !ts.Before(bStart) && ts.Before(bEnd) {
				weekValues[i]++
				weekTotal++
			}
		}
	}

	// 3. Месяц (30 дней)
	monthLabels := make([]string, 30)
	monthValues := make([]int, 30)
	monthTotal := 0
	for i := 0; i < 30; i++ {
		bStart := todayStart.AddDate(0, 0, -29+i)
		bEnd := bStart.AddDate(0, 0, 1)
		monthLabels[i] = bStart.Format("02.01")
		for _, ts := range timestamps {
			if !ts.Before(bStart) && ts.Before(bEnd) {
				monthValues[i]++
				monthTotal++
			}
		}
	}

	// 4. Год (12 месяцев)
	ruMonths := []string{"", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"}
	yearLabels := make([]string, 12)
	yearValues := make([]int, 12)
	yearTotal := 0
	curMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	for i := 0; i < 12; i++ {
		bStart := curMonthStart.AddDate(0, -11+i, 0)
		bEnd := bStart.AddDate(0, 1, 0)
		yearLabels[i] = ruMonths[int(bStart.Month())]
		for _, ts := range timestamps {
			if !ts.Before(bStart) && ts.Before(bEnd) {
				yearValues[i]++
				yearTotal++
			}
		}
	}

	// 5. Всё время (All time)
	allLabels := []string{}
	allValues := []int{}
	allTotal := len(timestamps)
	if len(timestamps) > 0 {
		first := timestamps[0]
		firstMonth := time.Date(first.Year(), first.Month(), 1, 0, 0, 0, 0, now.Location())
		if curMonthStart.Sub(firstMonth) < 5*30*24*time.Hour {
			firstMonth = curMonthStart.AddDate(0, -5, 0)
		}
		cursor := firstMonth
		for !cursor.After(curMonthStart) {
			bEnd := cursor.AddDate(0, 1, 0)
			lbl := ruMonths[int(cursor.Month())]
			if cursor.Year() != now.Year() {
				lbl += " '" + strconv.Itoa(cursor.Year()%100)
			}
			allLabels = append(allLabels, lbl)
			cnt := 0
			for _, ts := range timestamps {
				if !ts.Before(cursor) && ts.Before(bEnd) {
					cnt++
				}
			}
			allValues = append(allValues, cnt)
			cursor = cursor.AddDate(0, 1, 0)
		}
	} else {
		for i := 5; i >= 0; i-- {
			m := curMonthStart.AddDate(0, -i, 0)
			allLabels = append(allLabels, ruMonths[int(m.Month())])
			allValues = append(allValues, 0)
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"chart": fiber.Map{
			"day": fiber.Map{
				"labels": dayLabels,
				"values": dayValues,
				"total":  dayTotal,
				"title":  "За последние 24 часа",
			},
			"week": fiber.Map{
				"labels": weekLabels,
				"values": weekValues,
				"total":  weekTotal,
				"title":  "За последнюю неделю",
			},
			"month": fiber.Map{
				"labels": monthLabels,
				"values": monthValues,
				"total":  monthTotal,
				"title":  "За последние 30 дней",
			},
			"year": fiber.Map{
				"labels": yearLabels,
				"values": yearValues,
				"total":  yearTotal,
				"title":  "За последние 12 месяцев",
			},
			"all": fiber.Map{
				"labels": allLabels,
				"values": allValues,
				"total":  allTotal,
				"title":  "За всё время",
			},
		},
		"total_apps": allTotal,
	})
}

// ── Заявки: списки (новые внизу — ASC) ──────────────────────

func (h *Admin) MediaApps(c *fiber.Ctx) error {
	rows, err := h.db.Query(`
		SELECT id, lang, uid, criteria_agreed, platform, channel_url, servers,
		       videos_per_week, collaborations, why_join, exclusive, telegram,
		       status, admin_comment, created_at, updated_at
		FROM v2_media_apps ORDER BY id ASC`)
	if err != nil {
		return serverError(c, "Ошибка загрузки")
	}
	defer rows.Close()
	list := []models.MediaApp{}
	for rows.Next() {
		var a models.MediaApp
		var crit int
		if rows.Scan(&a.ID, &a.Lang, &a.UID, &crit, &a.Platform, &a.ChannelURL, &a.Servers,
			&a.VideosPerWeek, &a.Collaborations, &a.WhyJoin, &a.Exclusive, &a.Telegram,
			&a.Status, &a.AdminComment, &a.CreatedAt, &a.UpdatedAt) == nil {
			a.CriteriaAgreed = crit == 1
			list = append(list, a)
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *Admin) HWIDRequests(c *fiber.Ctx) error {
	rows, err := h.db.Query(`
		SELECT id, mod_nickname, uuid, proof_type, proof_file, proof_link, reason,
		       status, admin_comment, created_at
		FROM v2_hwid_requests ORDER BY id ASC`)
	if err != nil {
		return serverError(c, "Ошибка загрузки")
	}
	defer rows.Close()
	list := []models.HWIDRequest{}
	for rows.Next() {
		var r models.HWIDRequest
		if rows.Scan(&r.ID, &r.ModNickname, &r.UUID, &r.ProofType, &r.ProofFile, &r.ProofLink,
			&r.Reason, &r.Status, &r.AdminComment, &r.CreatedAt) == nil {
			list = append(list, r)
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *Admin) DiscordBans(c *fiber.Ctx) error {
	rows, err := h.db.Query(`
		SELECT id, mod_nickname, offender_id, proof_type, proof_file, proof_link, reason,
		       status, admin_comment, created_at
		FROM v2_discord_bans ORDER BY id ASC`)
	if err != nil {
		return serverError(c, "Ошибка загрузки")
	}
	defer rows.Close()
	list := []models.DiscordBan{}
	for rows.Next() {
		var r models.DiscordBan
		if rows.Scan(&r.ID, &r.ModNickname, &r.OffenderID, &r.ProofType, &r.ProofFile, &r.ProofLink,
			&r.Reason, &r.Status, &r.AdminComment, &r.CreatedAt) == nil {
			list = append(list, r)
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}

// ── Решения по заявкам (HTTP-панель и Telegram-кнопки) ───────

func (h *Admin) DecideMedia(c *fiber.Ctx) error {
	var body models.StatusUpdate
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректное решение")
	}
	approve := strings.EqualFold(body.Status, "approved")
	id, _ := strconv.ParseInt(c.Params("id"), 10, 64)
	if err := h.decideMedia(id, approve, body.AdminComment, actorInfo(c)); err != nil {
		return badRequest(c, err.Error())
	}
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) decideMedia(id int64, approve bool, comment, actor string) error {
	var tgUsername, status string
	err := h.db.QueryRow(`SELECT telegram, status FROM v2_media_apps WHERE id = ?`, id).Scan(&tgUsername, &status)
	if err != nil {
		return simpleErr("Заявка не найдена")
	}
	if status != "pending" {
		return simpleErr("Заявка уже рассмотрена")
	}
	st := "rejected"
	if approve {
		st = "approved"
	}
	if _, err := h.db.Exec(`UPDATE v2_media_apps SET status = ?, admin_comment = ?, updated_at = ? WHERE id = ?`,
		st, comment, time.Now(), id); err != nil {
		return err
	}
	h.tg.SendVerdict(tgUsername, "media", id, approve, comment)
	h.db.RecordAudit("STATUS_CHANGE", st, "Медиа-заявка #"+itoa64(id)+" → "+st+" ("+actor+")", "", "")
	return nil
}

func (h *Admin) DecideHWID(c *fiber.Ctx) error {
	var body models.StatusUpdate
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректное решение")
	}
	approve := strings.EqualFold(body.Status, "approved")
	id, _ := strconv.ParseInt(c.Params("id"), 10, 64)
	if err := h.decideHWID(id, approve, body.AdminComment, actorInfo(c)); err != nil {
		return badRequest(c, err.Error())
	}
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) decideHWID(id int64, approve bool, comment, actor string) error {
	var uuid, modNick, status string
	err := h.db.QueryRow(`SELECT uuid, mod_nickname, status FROM v2_hwid_requests WHERE id = ?`, id).
		Scan(&uuid, &modNick, &status)
	if err != nil {
		return simpleErr("Заявка не найдена")
	}
	if status != "pending" {
		return simpleErr("Заявка уже рассмотрена")
	}
	st := "rejected"
	if approve {
		st = "approved"
	}
	if _, err := h.db.Exec(`UPDATE v2_hwid_requests SET status = ?, admin_comment = ? WHERE id = ?`, st, comment, id); err != nil {
		return err
	}
	// Уведомление в Telegram для HWID отключено по требованию
	h.db.RecordAudit("STATUS_CHANGE", st, "Запрос сброса #"+itoa64(id)+" → "+st+" ("+actor+")", "", "")
	return nil
}

func (h *Admin) DecideDiscord(c *fiber.Ctx) error {
	var body models.StatusUpdate
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректное решение")
	}
	approve := strings.EqualFold(body.Status, "approved")
	id, _ := strconv.ParseInt(c.Params("id"), 10, 64)
	if err := h.decideDiscord(id, approve, body.AdminComment, actorInfo(c)); err != nil {
		return badRequest(c, err.Error())
	}
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) decideDiscord(id int64, approve bool, comment, actor string) error {
	var offender, modNick, status string
	err := h.db.QueryRow(`SELECT offender_id, mod_nickname, status FROM v2_discord_bans WHERE id = ?`, id).
		Scan(&offender, &modNick, &status)
	if err != nil {
		return simpleErr("Заявка не найдена")
	}
	if status != "pending" {
		return simpleErr("Заявка уже рассмотрена")
	}
	st := "rejected"
	if approve {
		st = "approved"
	}
	if _, err := h.db.Exec(`UPDATE v2_discord_bans SET status = ?, admin_comment = ? WHERE id = ?`, st, comment, id); err != nil {
		return err
	}
	h.notifyAccountVerdict(modNick, "discord", id, approve, comment)
	h.db.RecordAudit("STATUS_CHANGE", st, "Discord-бан #"+itoa64(id)+" → "+st+" ("+actor+")", "", "")
	return nil
}

// notifyAccountVerdict шлёт вердикт модератору по нику его аккаунта.
func (h *Admin) notifyAccountVerdict(nickname, kind string, id int64, approve bool, comment string) {
	var telegram string
	_ = h.db.QueryRow(`SELECT telegram FROM v2_accounts WHERE nickname = ? ORDER BY id ASC LIMIT 1`, nickname).Scan(&telegram)
	if telegram == "" {
		return
	}
	h.tg.SendVerdict(telegram, kind, id, approve, comment)
}

// DecideFromTelegram — вход для inline-кнопок бота.
func (h *Admin) DecideFromTelegram(kind string, id int64, approve bool) error {
	switch kind {
	case "media":
		return h.decideMedia(id, approve, "", "telegram")
	case "hwid":
		return h.decideHWID(id, approve, "", "telegram")
	case "discord":
		return h.decideDiscord(id, approve, "", "telegram")
	case "pay":
		return h.DecidePayoutInternal(id, approve, "", "telegram")
	}
	return simpleErr("Неизвестный тип заявки")
}

// ── Журнал ───────────────────────────────────────────────────

func (h *Admin) Logs(c *fiber.Ctx) error {
	rows, err := h.db.Query(`
		SELECT id, event_type, status, details, ip, user_agent, created_at
		FROM v2_audit_logs ORDER BY id DESC LIMIT 200`)
	if err != nil {
		return serverError(c, "Ошибка загрузки журнала")
	}
	defer rows.Close()
	list := []models.AuditLog{}
	for rows.Next() {
		var l models.AuditLog
		if rows.Scan(&l.ID, &l.EventType, &l.Status, &l.Details, &l.IP, &l.UserAgent, &l.CreatedAt) == nil {
			list = append(list, l)
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}

// ── Настройки (пасты и тексты) ───────────────────────────────

func (h *Admin) Settings(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "data": h.db.AllSettings()})
}

func (h *Admin) UpdateSetting(c *fiber.Ctx) error {
	var body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := c.BodyParser(&body); err != nil || body.Key == "" {
		return badRequest(c, "Некорректный запрос")
	}
	if !isEditableSetting(body.Key) {
		return badRequest(c, "Этот параметр не редактируется через панель")
	}
	if len(body.Value) > 4000 {
		return badRequest(c, "Текст слишком длинный (максимум 4000 символов)")
	}
	if err := h.db.SetSetting(body.Key, body.Value); err != nil {
		return serverError(c, "Не удалось сохранить")
	}
	h.db.RecordAudit("SETTINGS", "success", "Обновлена настройка "+body.Key,
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) ToggleApps(c *fiber.Ctx) error {
	var body struct {
		Open *bool `json:"open"`
	}
	var nextVal string
	if err := c.BodyParser(&body); err == nil && body.Open != nil {
		if *body.Open {
			nextVal = "true"
		} else {
			nextVal = "false"
		}
	} else {
		current := h.db.Setting("apps_open") != "false"
		if current {
			nextVal = "false"
		} else {
			nextVal = "true"
		}
	}
	if err := h.db.SetSetting("apps_open", nextVal); err != nil {
		return serverError(c, "Не удалось сохранить статус приёма заявок")
	}
	h.db.RecordAudit("TOGGLE_APPS", "success", "Приём заявок: "+nextVal,
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "apps_open": nextVal == "true"})
}

func (h *Admin) ToggleMaintenance(c *fiber.Ctx) error {
	var body struct {
		Enabled         *bool  `json:"enabled"`
		DurationMinutes int    `json:"duration_minutes"`
		Until           string `json:"until"`
	}
	_ = c.BodyParser(&body)

	enabled := false
	if body.Enabled != nil {
		enabled = *body.Enabled
	} else {
		enabled = h.db.Setting("maintenance_enabled") != "true"
	}

	var untilStr string
	if enabled {
		if body.Until != "" {
			if t, err := time.Parse(time.RFC3339, body.Until); err == nil {
				untilStr = t.Format(time.RFC3339)
			}
		}
		if untilStr == "" && body.DurationMinutes > 0 {
			untilStr = time.Now().Add(time.Duration(body.DurationMinutes) * time.Minute).Format(time.RFC3339)
		}
		if untilStr == "" {
			untilStr = time.Now().Add(2 * time.Hour).Format(time.RFC3339)
		}
		_ = h.db.SetSetting("maintenance_enabled", "true")
		_ = h.db.SetSetting("maintenance_until", untilStr)
		h.db.RecordAudit("MAINTENANCE", "success", "Включены техработы до "+untilStr,
			middleware.GetRealIP(c), c.Get("User-Agent"))
	} else {
		_ = h.db.SetSetting("maintenance_enabled", "false")
		_ = h.db.SetSetting("maintenance_until", "")
		h.db.RecordAudit("MAINTENANCE", "success", "Техработы выключены",
			middleware.GetRealIP(c), c.Get("User-Agent"))
	}

	mRemainingSec := int64(0)
	if enabled && untilStr != "" {
		if t, err := time.Parse(time.RFC3339, untilStr); err == nil {
			rem := int64(time.Until(t).Seconds())
			if rem > 0 {
				mRemainingSec = rem
			}
		}
	}

	return c.JSON(fiber.Map{
		"success":                  true,
		"maintenance_enabled":      enabled,
		"maintenance_until":        untilStr,
		"maintenance_seconds_left": mRemainingSec,
	})
}

func isEditableSetting(key string) bool {
	switch key {
	case "payout_paste_template", "payout_funpay_text", "payout_reject_text",
		"payout_usdt_text", "week_summary_template", "apps_open", "maintenance_enabled", "maintenance_until",
		"media_approve_text", "media_reject_text",
		"hwid_approve_text", "hwid_reject_text",
		"discord_approve_text", "discord_reject_text",
		"tg_window_nudge_text", "tg_bot_start_text":
		return true
	}
	return false
}

func actorInfo(c *fiber.Ctx) string {
	if account, ok := auth.AccountOf(c); ok {
		return account.Nickname
	}
	return middleware.GetRealIP(c)
}

func simpleErr(msg string) error { return &errText{msg} }

type errText struct{ msg string }

func (e *errText) Error() string { return e.msg }
