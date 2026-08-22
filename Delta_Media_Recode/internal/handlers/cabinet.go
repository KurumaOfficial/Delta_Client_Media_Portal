package handlers

import (
	"strconv"
	"strings"

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
		UID      string `json:"uid"`
		Duration string `json:"duration"`
		Want     string `json:"want"`
		Amount   string `json:"amount"`
		Method   string `json:"method"`
		LotURL   string `json:"lot_url"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.UID(body.UID)
	if !ok {
		return badRequest(c, "Укажите корректный UID")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	r.Kind = models.KindPayout
	r.UID = uid
	r.Duration = validation.Clean(body.Duration, 100)
	r.Want = validation.MultiLine(body.Want, 300)
	if r.Duration == "" || r.Want == "" {
		return badRequest(c, "Заполните «сколько вы в медиа» и «что хотите получить»")
	}

	switch strings.ToLower(body.Method) {
	case "usdt":
		amount, ok := validation.Amount(body.Amount)
		if !ok {
			return badRequest(c, "Укажите корректную сумму USDT")
		}
		r.Method = models.MethodUSDT
		r.Amount = strconv.FormatFloat(amount, 'f', -1, 64)
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

// SubmitLot — таб 2 медиа: заявка на лот (FunPay → ссылка на лот).
func (h *Cabinet) SubmitLot(c *fiber.Ctx) error {
	var body struct {
		ChannelURL string `json:"channel_url"`
		Platform   string `json:"platform"`
		LotURL     string `json:"lot_url"`
		Want       string `json:"want"`
		UID        string `json:"uid"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные")
	}

	r, _, _ := h.baseRequest(c)
	uid, ok := validation.UID(body.UID)
	if !ok {
		return badRequest(c, "Укажите корректный UID")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}
	r.Kind = models.KindLot
	r.UID = uid
	r.Want = validation.MultiLine(body.Want, 300)
	if r.Want == "" {
		return badRequest(c, "Укажите, что хотите получить")
	}

	platform := strings.ToLower(validation.Clean(body.Platform, 20))
	switch platform {
	case "youtube":
		channel, ok := validation.YouTubeChannel(body.ChannelURL)
		if !ok {
			return badRequest(c, "Укажите ссылку на YouTube-канал")
		}
		r.Platform, r.ChannelURL = platform, channel
		if b, banned := h.bans.Banned(models.BanYouTube, channel); banned {
			return banHit(c, b)
		}
	case "tiktok":
		channel, ok := validation.TikTokChannel(body.ChannelURL)
		if !ok {
			return badRequest(c, "Укажите ссылку на TikTok-аккаунт")
		}
		r.Platform, r.ChannelURL = platform, channel
		if b, banned := h.bans.Banned(models.BanTikTok, channel); banned {
			return banHit(c, b)
		}
	case "funpay":
		r.Platform = platform
		lot, ok := validation.FunPayLot(body.LotURL)
		if !ok {
			return badRequest(c, "Для FunPay укажите ссылку на лот")
		}
		r.LotURL = lot
	default:
		return badRequest(c, "Выберите платформу: YouTube, TikTok или FunPay")
	}

	id, err := h.pays.Create(r)
	if err != nil {
		return badRequest(c, err.Error())
	}
	full, _ := h.pays.Get(id)
	h.tg.NotifyCabinetRequest(full)
	h.db.RecordAudit("LOT_SUBMIT", "success",
		"Лот #"+itoa64(id)+" от "+r.Nickname, middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id, "week": h.pays.WeekLabel()})
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
	uid, ok := validation.UID(body.UID)
	if !ok {
		return badRequest(c, "Укажите корректный UID")
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

// MyRequests — история заявок кабинета.
func (h *Cabinet) MyRequests(c *fiber.Ctx) error {
	account, _ := auth.AccountOf(c)
	list, err := h.pays.MyRequests(account.ID)
	if err != nil {
		return serverError(c, "Не удалось загрузить заявки")
	}
	if list == nil {
		list = []models.Request{}
	}
	return c.JSON(fiber.Map{"success": true, "data": list, "week": h.pays.WeekLabel(),
		"window_open": h.pays.WindowOpen()})
}
