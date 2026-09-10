package handlers

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/config"
	"dmr/internal/bans"
	"dmr/internal/database"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/telegram"
	"dmr/internal/validation"
)

// Public — публичные маршруты: заявка на вступление в медиа.
type Public struct {
	db   *database.DB
	cfg  *config.Config
	tg   *telegram.Service
	bans *bans.Service
	http fiber.Router
}

func NewPublic(db *database.DB, cfg *config.Config, tg *telegram.Service, banSvc *bans.Service) *Public {
	return &Public{db: db, cfg: cfg, tg: tg, bans: banSvc}
}

// IsTGVerified — писал ли пользователь боту/секретарю (замаплен в v2_tg_users).
func (h *Public) IsTGVerified(username string) bool {
	clean := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if clean == "" {
		return false
	}
	var id int64
	return h.db.QueryRow(`SELECT tg_user_id FROM v2_tg_users WHERE LOWER(username) = ?`, clean).Scan(&id) == nil
}

// verifyTurnstile проверяет капчу через siteverify, если задан секрет.
func (h *Public) verifyTurnstile(c *fiber.Ctx, token string) bool {
	if h.cfg.TurnstileSecret == "" {
		return true // серверная проверка капчи не включена
	}
	if token == "" {
		return false
	}
	if h.cfg.TurnstileSecret == "1x0000000000000000000000000000000AA" && (token == "XXXX.DUMMY.TOKEN.XXXX" || len(token) > 10) {
		return true
	}
	form := url.Values{}
	form.Set("secret", h.cfg.TurnstileSecret)
	form.Set("response", token)
	form.Set("remoteip", middleware.GetRealIP(c))
	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
	if err != nil {
		return h.cfg.TurnstileSecret == "1x0000000000000000000000000000000AA"
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return strings.Contains(string(body), `"success":true`)
}

// SubmitMediaApp — публичная заявка на вступление в медиа (полная серверная валидация).
func (h *Public) SubmitMediaApp(c *fiber.Ctx) error {
	var body struct {
		Lang           string   `json:"lang"`
		UID            string   `json:"uid"`
		CriteriaAgreed bool     `json:"criteria_agreed"`
		Platform       string   `json:"platform"`
		ChannelURL     string   `json:"channel_url"`
		Servers        []string `json:"servers"`
		VideosPerWeek  string   `json:"videos_per_week"`
		Collaborations string   `json:"collaborations"`
		WhyJoin        string   `json:"why_join"`
		Exclusive      string   `json:"exclusive"`
		Telegram       string   `json:"telegram"`
		TurnstileToken string   `json:"turnstile_token"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректные данные формы")
	}

	if h.isMaintenanceActive() {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"success":     false,
			"maintenance": true,
			"error":       "Ведутся технические работы. Подача заявок временно приостановлена.",
		})
	}

	if h.db.Setting("apps_open") == "false" {
		return badRequest(c, "Приём заявок в delta media сейчас закрыт")
	}

	// ── Валидация всех текстов ──
	if strings.TrimSpace(body.UID) == "" {
		return badRequest(c, "Укажите UID")
	}
	uid, ok := validation.NumericUID(body.UID)
	if !ok {
		return badRequest(c, "В поле UID разрешены только цифры")
	}
	if !body.CriteriaAgreed {
		return badRequest(c, "Подтвердите соответствие критериям")
	}
	if !validation.InList(body.Platform, "youtube", "tiktok") {
		return badRequest(c, "Выберите платформу (YouTube или TikTok)")
	}
	servers, ok := validation.Servers(body.Servers)
	if !ok {
		return badRequest(c, "Выберите хотя бы один сервер")
	}
	why := validation.MultiLine(body.WhyJoin, 500)
	if len([]rune(why)) < 10 {
		return badRequest(c, "Расскажите о мотивации подробнее (минимум 10 символов)")
	}
	if !validation.NoControl(why) {
		return badRequest(c, "Недопустимые символы в поле мотивации")
	}
	if !validation.InList(body.Exclusive, "yes", "no") {
		return badRequest(c, "Укажите, эксклюзивный ли контент")
	}
	tg, ok := validation.Telegram(body.Telegram)
	if !ok {
		return badRequest(c, "Укажите корректный Telegram @username")
	}
	var channel string
	if body.Platform == "youtube" {
		channel, ok = validation.YouTubeChannel(body.ChannelURL)
		if !ok {
			return badRequest(c, "Укажите прямую ссылку на YouTube КАНАЛ (не видео)")
		}
		if v := validation.Clean(body.VideosPerWeek, 100); v == "" {
			return badRequest(c, "Укажите, сколько роликов в неделю выходит")
		}
	} else {
		channel, ok = validation.TikTokChannel(body.ChannelURL)
		if !ok {
			return badRequest(c, "Укажите прямую ссылку на TikTok-аккаунт")
		}
		if v := validation.Clean(body.Collaborations, 300); v == "" {
			return badRequest(c, "Укажите, с какими клиентами сотрудничали")
		}
	}
	if !h.verifyTurnstile(c, body.TurnstileToken) {
		return badRequest(c, "Капча не пройдена")
	}

	// ── Банлист: IP, ссылки, тг, uid ──
	ip := middleware.GetRealIP(c)
	if h.bans.IsIPBanned(ip) {
		reason := h.bans.BanReasonOfIP(ip)
		if reason == "" {
			reason = "Ваш IP-адрес заблокирован."
		}
		return banHit(c, models.Ban{IP: ip, Reason: reason})
	}
	banType := models.BanYouTube
	if body.Platform == "tiktok" {
		banType = models.BanTikTok
	}
	if b, banned := h.bans.Banned(banType, channel); banned {
		return banHit(c, b)
	}
	if b, banned := h.bans.Banned(models.BanTelegram, tg); banned {
		return banHit(c, b)
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}

	// ── Обязательный контакт с ботом/секретарём ──
	if !h.IsTGVerified(tg) {
		return c.Status(400).JSON(fiber.Map{
			"success": false, "tg_required": true,
			"error": "Диалог не найден — сначала напишите сотруднику!",
		})
	}

	// ── Дубликаты ──
	var dup int
	_ = h.db.QueryRow(`
		SELECT COUNT(*) FROM v2_media_apps
		WHERE status = 'pending' AND (LOWER(telegram) = ? OR LOWER(channel_url) = ?)`,
		strings.ToLower(tg), strings.ToLower(channel)).Scan(&dup)
	if dup > 0 {
		return badRequest(c, "У вас уже есть нерассмотренная заявка. Дождитесь ответа.")
	}

	id, err := h.db.InsertReturningID(`
		INSERT INTO v2_media_apps
		(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week,
		 collaborations, why_join, exclusive, telegram)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		langOrDefault(body.Lang), uid, 1, body.Platform, channel, servers,
		validation.Clean(body.VideosPerWeek, 100), validation.Clean(body.Collaborations, 300),
		why, body.Exclusive, tg)
	if err != nil {
		return serverError(c, "Не удалось сохранить заявку")
	}

	app := models.MediaApp{ID: id, UID: uid, Platform: body.Platform, ChannelURL: channel,
		Servers: servers, VideosPerWeek: body.VideosPerWeek, Collaborations: body.Collaborations,
		WhyJoin: why, Exclusive: body.Exclusive, Telegram: tg}
	h.tg.NotifyMediaApp(app)
	h.db.RecordAudit("APP_SUBMIT", "success",
		"Медиа-заявка #"+strings.TrimSpace(itoa64(id))+" ("+body.Platform+")",
		middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "id": id})
}

// CheckTGVerified — фронт поллит: написал ли юзер сотруднику.
func (h *Public) CheckTGVerified(c *fiber.Ctx) error {
	var body struct {
		Telegram string `json:"telegram"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"verified": false})
	}
	return c.JSON(fiber.Map{"verified": h.IsTGVerified(body.Telegram)})
}

// LogClientError — приём клиентских JS-ошибок.
func (h *Public) LogClientError(c *fiber.Ctx) error {
	var body struct {
		Type    string `json:"type"`
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.JSON(fiber.Map{"success": true})
	}
	raw := strings.ToLower(body.Type + " " + body.Message + " " + body.Error)
	// Игнорируем блокировки Cloudflare Turnstile, расширений браузера и сетевые шумы
	if strings.Contains(raw, "turnstile") ||
		strings.Contains(raw, "300010") ||
		strings.Contains(raw, "challenges.cloudflare.com") ||
		strings.Contains(raw, "chrome-extension") ||
		strings.Contains(raw, "moz-extension") ||
		strings.Contains(raw, "safari-extension") ||
		strings.Contains(raw, "extension") ||
		strings.Contains(raw, "resizeobserver") ||
		strings.Contains(raw, "script error") ||
		strings.Contains(raw, "failed to fetch") {
		return c.JSON(fiber.Map{"success": true})
	}

	h.db.RecordAudit("CLIENT_ERROR", "error",
		"["+validation.Clean(body.Type, 40)+"] "+validation.MultiLine(body.Message, 500)+
			" | "+validation.MultiLine(body.Error, 1000),
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// Health — проверка живости + публичный конфиг для фронтенда.
func (h *Public) Health(c *fiber.Ctx) error {
	appsOpen := h.db.Setting("apps_open") != "false"
	mEnabled := h.isMaintenanceActive()
	mUntilStr := h.db.Setting("maintenance_until")
	mRemainingSec := int64(0)
	if mEnabled && mUntilStr != "" {
		if t, err := time.Parse(time.RFC3339, mUntilStr); err == nil {
			rem := int64(time.Until(t).Seconds())
			if rem > 0 {
				mRemainingSec = rem
			}
		}
	}

	return c.JSON(fiber.Map{
		"success":                  true,
		"time":                     time.Now().Format(time.RFC3339),
		"turnstile_sitekey":        h.cfg.TurnstileSiteKey,
		"turnstile_enabled":        h.cfg.TurnstileSecret != "",
		"gps_required":             h.cfg.GPSRequired,
		"bot_username":             strings.TrimPrefix(h.tg.Client().Username(), "@"),
		"staff_contact":            h.cfg.TGSecretary,
		"admin_contact":            h.cfg.TGAdminContact,
		"apps_open":                appsOpen,
		"maintenance_enabled":      mEnabled,
		"maintenance_until":        mUntilStr,
		"maintenance_seconds_left": mRemainingSec,
	})
}

func (h *Public) isMaintenanceActive() bool {
	if h.db.Setting("maintenance_enabled") != "true" {
		return false
	}
	untilStr := h.db.Setting("maintenance_until")
	if untilStr == "" {
		return true
	}
	t, err := time.Parse(time.RFC3339, untilStr)
	if err != nil {
		return true
	}
	if time.Now().After(t) {
		_ = h.db.SetSetting("maintenance_enabled", "false")
		return false
	}
	return true
}

func langOrDefault(lang string) string {
	if strings.EqualFold(lang, "en") {
		return "en"
	}
	return "ru"
}

func badRequest(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": msg})
}

func serverError(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": msg})
}

func banHit(c *fiber.Ctx, b models.Ban) error {
	msg := "Вы заблокированы в системе."
	if b.Reason != "" {
		msg += " Причина: " + b.Reason
	}
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "error": msg, "banned": true})
}

func itoa64(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [24]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
