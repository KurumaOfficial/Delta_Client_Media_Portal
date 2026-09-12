package handlers

import (
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/auth"
	"dmr/internal/bans"
	"dmr/internal/database"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/payouts"
	"dmr/internal/telegram"
	"dmr/internal/validation"
)

// Cabinet — личный кабинет медиа и фримедиа.
type Cabinet struct {
	db   *database.DB
	tg   *telegram.Service
	bans *bans.Service
	pays *payouts.Service
}

func NewCabinet(db *database.DB, tg *telegram.Service, banSvc *bans.Service, pays *payouts.Service) *Cabinet {
	return &Cabinet{db: db, tg: tg, bans: banSvc, pays: pays}
}

// baseRequest строит заявку из общих полей аккаунта.
func (h *Cabinet) baseRequest(c *fiber.Ctx) (models.Request, models.Account, error) {
	account, _ := auth.AccountOf(c)
	r := models.Request{
		Source: "cabinet", AccountID: account.ID,
		Nickname: account.Nickname, Telegram: account.Telegram, TGUserID: account.TGUserID,
	}
	return r, account, nil
}

// SubmitPayout — таб 1 медиа: заявка на выплату за снятые видео.
func (h *Cabinet) SubmitPayout(c *fiber.Ctx) error {
	var body struct {
		UID       string `json:"uid"`
		PromoCode string `json:"promo_code"`
		Want      string `json:"want"`
		Rate      string `json:"rate"`
		Amount    string `json:"amount"`
		Method    string `json:"method"`
		LotURL    string `json:"lot_url"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.NumericUID(body.UID)
	if !ok {
		return badRequest(c, "В поле UID разрешены только цифры")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	r.Kind = models.KindPayout
	r.UID = uid

	promo := validation.Clean(body.PromoCode, 64)
	if promo == "" {
		return badRequest(c, "Укажите ваш промокод")
	}
	r.PromoCode = promo

	r.Want = validation.MultiLine(body.Want, 300)
	if r.Want == "" {
		return badRequest(c, "Заполните «что хотите получить»")
	}

	rate := validation.Clean(body.Rate, 100)
	if rate == "" {
		rate = validation.Clean(body.Amount, 100)
	}
	if rate == "" {
		return badRequest(c, "Укажите вашу ставку")
	}
	r.Amount = rate

	switch strings.ToLower(body.Method) {
	case "usdt":
		r.Method = models.MethodUSDT
	case "funpay":
		lot, ok := validation.FunPayLot(body.LotURL)
		if !ok {
			return badRequest(c, "Для FunPay укажите ссылку на лот (https://funpay.com/lots/...)")
		}
		r.Method = models.MethodFunPay
		r.LotURL = lot
	default:
		return badRequest(c, "Выберите способ выплаты: USDT-чек или FunPay")
	}

	id, err := h.pays.Create(r)
	if err != nil {
		return badRequest(c, err.Error())
	}
	full, _ := h.pays.Get(id)
	h.tg.NotifyCabinetRequest(full)
	h.db.RecordAudit("PAYOUT_SUBMIT", "success",
		"Выплата #"+itoa64(id)+" от "+r.Nickname, middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id, "week": h.pays.WeekLabel()})
}

// SubmitLot — таб 2 медиа: заявка на лот (выдача сабки, косметика или что-то другое).
func (h *Cabinet) SubmitLot(c *fiber.Ctx) error {
	var body struct {
		UID         string `json:"uid"`
		Platform    string `json:"platform"`
		Duration    string `json:"duration"`
		LotType     string `json:"lot_type"` // sub | giveaway | cosmetics | other
		Want        string `json:"want"`
		Comment     string `json:"comment"`
		ChannelURL  string `json:"channel_url"`
		LotURL      string `json:"lot_url"`
		GiveawayURL string `json:"giveaway_url"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.NumericUID(body.UID)
	if !ok {
		return badRequest(c, "В поле UID разрешены только цифры")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	if body.LotType == "giveaway" {
		r.Kind = models.KindGiveaway
		if body.GiveawayURL != "" {
			r.LotURL = validation.Clean(body.GiveawayURL, 300)
		} else if body.LotURL != "" {
			r.LotURL = validation.Clean(body.LotURL, 300)
		}
	} else {
		r.Kind = models.KindLot
	}
	r.UID = uid

	duration := validation.Clean(body.Duration, 100)
	if duration == "" {
		return badRequest(c, "Укажите, сколько вы в медиа Delta")
	}
	r.Duration = duration

	platform := strings.ToLower(validation.Clean(body.Platform, 20))
	if platform != "youtube" && platform != "tiktok" {
		platform = "youtube"
	}
	r.Platform = platform

	want := strings.TrimSpace(body.Want)
	if want == "" {
		switch body.LotType {
		case "sub":
			want = "Выдача сабки"
			if body.Comment != "" {
				want += " (" + strings.TrimSpace(body.Comment) + ")"
			}
		case "giveaway":
			want = "Ключ для розыгрыша"
			if body.Comment != "" {
				want += " (" + strings.TrimSpace(body.Comment) + ")"
			}
		case "cosmetics":
			want = "Косметика"
			if body.Comment != "" {
				want += " (" + strings.TrimSpace(body.Comment) + ")"
			}
		case "other":
			want = strings.TrimSpace(body.Comment)
		default:
			want = strings.TrimSpace(body.Comment)
		}
	}
	r.Want = validation.MultiLine(want, 300)
	if r.Want == "" {
		return badRequest(c, "Укажите, что хотите получить (сабка, ключ для розыгрыша, косметика или своё пожелание)")
	}

	id, err := h.pays.Create(r)
	if err != nil {
		return badRequest(c, err.Error())
	}
	full, _ := h.pays.Get(id)
	h.tg.NotifyCabinetRequest(full)
	auditType := "LOT_SUBMIT"
	auditDesc := "Лот #" + itoa64(id) + " от " + r.Nickname + " (" + r.Want + ")"
	if r.Kind == models.KindGiveaway {
		auditType = "GIVEAWAY_SUBMIT"
		auditDesc = "Заявка на ключ для розыгрыша #" + itoa64(id) + " от " + r.Nickname
	}
	h.db.RecordAudit(auditType, "success",
		auditDesc, middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id, "week": h.pays.WeekLabel()})
}

// SubmitGiveaway — выделенная заявка медиа на ключ для розыгрыша.
func (h *Cabinet) SubmitGiveaway(c *fiber.Ctx) error {
	var body struct {
		UID         string `json:"uid"`
		Platform    string `json:"platform"`
		Duration    string `json:"duration"`
		GiveawayURL string `json:"giveaway_url"`
		Comment     string `json:"comment"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.NumericUID(body.UID)
	if !ok {
		return badRequest(c, "В поле UID разрешены только цифры")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	r.Kind = models.KindGiveaway
	r.UID = uid

	duration := validation.Clean(body.Duration, 100)
	if duration == "" {
		return badRequest(c, "Укажите, сколько вы в медиа Delta")
	}
	r.Duration = duration

	platform := strings.ToLower(validation.Clean(body.Platform, 20))
	if platform != "youtube" && platform != "tiktok" {
		platform = "youtube"
	}
	r.Platform = platform

	giveawayURL := strings.TrimSpace(body.GiveawayURL)
	if giveawayURL == "" {
		return badRequest(c, "Укажите ссылку на пост, видео или стрим с розыгрышем")
	}
	r.LotURL = validation.Clean(giveawayURL, 300)

	want := "Ключ для розыгрыша"
	if body.Comment != "" {
		want += " (" + strings.TrimSpace(body.Comment) + ")"
	}
	r.Want = validation.MultiLine(want, 300)

	id, err := h.pays.Create(r)
	if err != nil {
		return badRequest(c, err.Error())
	}
	full, _ := h.pays.Get(id)
	h.tg.NotifyCabinetRequest(full)
	h.db.RecordAudit("GIVEAWAY_SUBMIT", "success",
		"Заявка на ключ для розыгрыша #"+itoa64(id)+" от "+r.Nickname, middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id, "week": h.pays.WeekLabel()})
}

// SubmitIdeaBug — вкладка «Идеи и баги» в кабинете.
func (h *Cabinet) SubmitIdeaBug(c *fiber.Ctx) error {
	account, ok := auth.AccountOf(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "error": "Требуется авторизация"})
	}

	category := strings.ToLower(strings.TrimSpace(c.FormValue("category")))
	if category != "bug" {
		category = "idea"
	}

	title := validation.Clean(c.FormValue("title"), 150)
	if len([]rune(title)) < 3 {
		return badRequest(c, "Укажите тему обращения (минимум 3 символа)")
	}

	description := validation.MultiLine(c.FormValue("description"), 1000)
	if len([]rune(description)) < 5 {
		return badRequest(c, "Укажите подробное описание (минимум 5 символов)")
	}

	files, link, _ := parseProof(c)

	id, err := h.db.InsertReturningID(`
		INSERT INTO v2_ideas_bugs (account_id, nickname, role, category, title, description, proof_files, proof_link, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
		account.ID, account.Nickname, account.Role, category, title, description, files, link)
	if err != nil {
		return serverError(c, "Не удалось сохранить обращение")
	}

	h.tg.NotifyIdeaBug(models.IdeaBug{
		ID: id, AccountID: account.ID, Nickname: account.Nickname, Role: account.Role,
		Category: category, Title: title, Description: description,
		ProofFiles: files, ProofLink: link,
	})

	h.db.RecordAudit("FEEDBACK_SUBMIT", "success",
		strings.ToUpper(category)+" #"+itoa64(id)+" от "+account.Nickname+": "+title,
		middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "id": id, "category": category})
}

// SubmitSubscription — фримедиа: запрос подписки.
func (h *Cabinet) SubmitSubscription(c *fiber.Ctx) error {
	var body struct {
		UID        string `json:"uid"`
		Want       string `json:"want"`
		ChannelURL string `json:"channel_url"`
		Platform   string `json:"platform"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.NumericUID(body.UID)
	if !ok {
		return badRequest(c, "В поле UID разрешены только цифры")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	r.Kind = models.KindSubscription
	r.UID = uid
	r.Want = validation.MultiLine(body.Want, 300)
	if r.Want == "" {
		return badRequest(c, "Укажите, какую подписку вы хотите получить")
	}
	if channel := strings.TrimSpace(body.ChannelURL); channel != "" {
		if _, ok := validation.AnyURL(channel); !ok {
			return badRequest(c, "Некорректная ссылка на канал")
		}
		r.ChannelURL, r.Platform = validation.Clean(channel, 200), validation.Clean(body.Platform, 20)
	}

	id, err := h.pays.Create(r)
	if err != nil {
		return badRequest(c, err.Error())
	}
	full, _ := h.pays.Get(id)
	h.tg.NotifyCabinetRequest(full)
	h.db.RecordAudit("SUB_SUBMIT", "success",
		"Подписка #"+itoa64(id)+" от "+r.Nickname, middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id, "week": h.pays.WeekLabel()})
}

// MyRequests — история заявок кабинета (включая выплаты, лоты, идеи и баги).
func (h *Cabinet) MyRequests(c *fiber.Ctx) error {
	account, _ := auth.AccountOf(c)
	list, err := h.pays.MyRequests(account.ID)
	if err != nil {
		return serverError(c, "Не удалось загрузить заявки")
	}
	if list == nil {
		list = []models.Request{}
	}

	// Подтягиваем идеи и баги пользователя
	rows, err := h.db.Query(`
		SELECT id, category, title, description, proof_files, proof_link, status, admin_comment, created_at
		FROM v2_ideas_bugs WHERE account_id = ? OR nickname = ?
		ORDER BY created_at DESC LIMIT 50`, account.ID, account.Nickname)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var cat, title, desc, files, link, status, adminComment string
			var t interface{}
			if err := rows.Scan(&id, &cat, &title, &desc, &files, &link, &status, &adminComment, &t); err == nil {
				createdAt := time.Now()
				switch val := t.(type) {
				case time.Time:
					createdAt = val
				case string:
					if parsed, pErr := time.Parse(time.RFC3339, val); pErr == nil {
						createdAt = parsed
					} else if parsed2, pErr2 := time.Parse("2006-01-02 15:04:05", val); pErr2 == nil {
						createdAt = parsed2
					}
				}
				list = append(list, models.Request{
					ID:              id,
					Kind:            cat,
					Source:          "cabinet",
					AccountID:       account.ID,
					Nickname:        account.Nickname,
					Want:            desc,
					Status:          status,
					DecisionComment: adminComment,
					CreatedAt:       createdAt,
					Title:           title,
					ProofFiles:      files,
					ProofLink:       link,
				})
			}
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})

	return c.JSON(fiber.Map{"success": true, "data": list, "week": h.pays.WeekLabel(),
		"window_open": h.pays.WindowOpen()})
}
