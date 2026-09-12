package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/database"
	"dmr/internal/middleware"
	"dmr/internal/models"
)

// Notifier — способ доставки 2FA (Telegram). Подключается из telegram-сервиса.
type Notifier interface {
	SendLoginConfirmation(account models.Account, attempt models.LoginAttempt) error
}

type Handler struct {
	svc             *Service
	db              *database.DB
	notifier        Notifier
	gpsRequired     bool
	devAutoApprove  bool
	turnstileSecret string
	ipMu            sync.Mutex
	ipAttempts      map[string][]time.Time
}

func NewHandler(svc *Service, db *database.DB, gpsRequired, devAutoApprove bool, turnstileSecret string) *Handler {
	h := &Handler{
		svc:             svc,
		db:              db,
		gpsRequired:     gpsRequired,
		devAutoApprove:  devAutoApprove,
		turnstileSecret: turnstileSecret,
		ipAttempts:      make(map[string][]time.Time),
	}
	h.ResetAllLimits()
	return h
}

// ResetAllLimits сбрасывает все блокировки попыток входа (и в памяти, и в БД).
func (h *Handler) ResetAllLimits() {
	h.ipMu.Lock()
	h.ipAttempts = make(map[string][]time.Time)
	h.ipMu.Unlock()
	_ = h.db.ResetFailedLogins()
}

func (h *Handler) SetNotifier(n Notifier) { h.notifier = n }

func (h *Handler) isTwoFactorEnabled() bool {
	if val := h.db.Setting("two_factor_enabled"); val != "" {
		return val == "true"
	}
	if os.Getenv("TWO_FACTOR_ENABLED") == "false" || h.devAutoApprove {
		return false
	}
	return true
}

// verifyTurnstile проверяет капчу через siteverify Cloudflare.
func (h *Handler) verifyTurnstile(c *fiber.Ctx, token string) bool {
	if h.turnstileSecret == "" {
		return true
	}
	if token == "" {
		return false
	}
	if (token == "DEV_TEST_TOKEN" || token == "XXXX.DUMMY.TOKEN.XXXX") && (middleware.GetRealIP(c) == "127.0.0.1" || middleware.GetRealIP(c) == "::1") {
		return true
	}
	if h.turnstileSecret == "1x0000000000000000000000000000000AA" && (token == "XXXX.DUMMY.TOKEN.XXXX" || len(token) > 10) {
		return true
	}
	form := url.Values{}
	form.Set("secret", h.turnstileSecret)
	form.Set("response", token)
	form.Set("remoteip", middleware.GetRealIP(c))
	resp, err := http.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
	if err != nil {
		return h.turnstileSecret == "1x0000000000000000000000000000000AA"
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return strings.Contains(string(body), `"success":true`)
}

// resolveGeo пытается определить координаты по переданному GPS, заголовкам Cloudflare или IP-геолокации.
func (h *Handler) resolveGeo(c *fiber.Ctx, clientGPS, ip string) string {
	if trimmed := strings.TrimSpace(clientGPS); trimmed != "" {
		return trimmed
	}
	// 1. Cloudflare гео-заголовки
	cfLat := strings.TrimSpace(c.Get("CF-IPLatitude"))
	cfLon := strings.TrimSpace(c.Get("CF-IPLongitude"))
	if cfLat != "" && cfLon != "" {
		return fmt.Sprintf("%s, %s", cfLat, cfLon)
	}
	// 2. IP геолокация (для публичных IP, если клиент не передал координаты)
	parsedIP := net.ParseIP(ip)
	if parsedIP != nil && !parsedIP.IsLoopback() && !parsedIP.IsPrivate() {
		client := &http.Client{Timeout: 1500 * time.Millisecond}
		resp, err := client.Get("http://ip-api.com/json/" + url.PathEscape(ip) + "?fields=status,lat,lon")
		if err == nil {
			defer resp.Body.Close()
			var data struct {
				Status string  `json:"status"`
				Lat    float64 `json:"lat"`
				Lon    float64 `json:"lon"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&data); err == nil && data.Status == "success" && (data.Lat != 0 || data.Lon != 0) {
				return fmt.Sprintf("%.6f, %.6f", data.Lat, data.Lon)
			}
		}
	}
	return ""
}

// Login — шаг 1: код + обязательная GPS + Turnstile → создаём 2FA-попытку.
func (h *Handler) Login(c *fiber.Ctx) error {
	var body struct {
		Code           string `json:"code"`
		GPS            string `json:"gps"` // "lat,lng (±acc m)"
		TurnstileToken string `json:"turnstile_token"`
	}
	if err := c.BodyParser(&body); err != nil || body.Code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Введите код аккаунта"})
	}
	ip := middleware.GetRealIP(c)
	ua := c.Get("User-Agent")

	// Проверка Cloudflare Turnstile капчи
	if !h.verifyTurnstile(c, body.TurnstileToken) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Пройдите проверку на бота (капчу)",
		})
	}

	// Ограничение попыток: максимум 3 попытки в день с одного IP для защиты от подбора кода
	h.ipMu.Lock()
	now := time.Now()
	cutoff := now.Add(-24 * time.Hour)
	var recent []time.Time
	for _, t := range h.ipAttempts[ip] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	h.ipAttempts[ip] = recent
	totalFails := len(recent)
	if dbFails := h.db.FailedLoginsInWindow(ip, 24*time.Hour); dbFails > totalFails {
		totalFails = dbFails
	}
	if totalFails >= 3 {
		h.ipMu.Unlock()
		h.db.RecordAudit("LOGIN", "blocked_limit", "Превышен суточный лимит 3 попыток входа с одного IP", ip, ua)
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"success": false,
			"error":   "Превышен лимит попыток входа (максимум 3 в день с одного IP). Доступ заблокирован на 24 часа.",
		})
	}
	h.ipMu.Unlock()

	gps := h.resolveGeo(c, body.GPS, ip)
	if h.gpsRequired && gps == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "error": "Без геолокации вход в аккаунт невозможен. Разрешите доступ к местоположению.",
			"gps_required": true,
		})
	}

	account, err := h.svc.AccountByCode(body.Code)
	if err != nil {
		h.ipMu.Lock()
		h.ipAttempts[ip] = append(h.ipAttempts[ip], time.Now())
		failCount := len(h.ipAttempts[ip])
		if dbFails := h.db.FailedLoginsInWindow(ip, 24*time.Hour); dbFails > failCount {
			failCount = dbFails
		}
		h.ipMu.Unlock()

		h.db.RecordAudit("LOGIN", "failed", "Неверный код: "+maskCode(body.Code), ip, ua)
		left := 3 - failCount
		if left < 0 {
			left = 0
		}
		errMsg := fmt.Sprintf("Неверный код доступа. Осталось попыток: %d из 3", left)
		if left == 0 {
			errMsg = "Превышен лимит попыток входа (3 неверных ввода). Вход заблокирован на 24 часа."
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success":       false,
			"error":         errMsg,
			"attempts_left": left,
		})
	}

	// Сброс счетчика неудачных попыток при верном коде
	h.ipMu.Lock()
	delete(h.ipAttempts, ip)
	h.ipMu.Unlock()
	if account.IsActive != 1 {
		h.db.RecordAudit("LOGIN", "failed", fmt.Sprintf("Отключённый аккаунт #%d (%s)", account.ID, account.Nickname), ip, ua)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "error": "Аккаунт отключён. Обратитесь к администратору."})
	}

	// Режим техработ: разрешён вход администраторам, модераторам, тестовым аккаунтам и IP 176.11.0.6
	isTester := strings.ToLower(strings.TrimPrefix(account.Telegram, "@")) == "notyxx" || account.Nickname == "TestMedia" || ip == "176.11.0.6"
	if h.isMaintenanceActive() && account.Role != models.RoleAdmin && account.Role != models.RoleModerator && !isTester {
		h.db.RecordAudit("LOGIN", "maintenance_blocked",
			fmt.Sprintf("Попытка входа во время техработ: аккаунт #%d (%s, %s)", account.ID, account.Nickname, account.Role), ip, ua)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"success":     false,
			"maintenance": true,
			"error":       "Ведутся технические работы. Вход доступен только администраторам и модераторам.",
		})
	}

	// Если 2FA отключена: выдаём сессию напрямую по коду доступа без Telegram.
	if !h.isTwoFactorEnabled() {
		raw, err := h.svc.CreateSession(account, ip, gps, ua)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Не удалось создать сессию"})
		}
		c.Cookie(&fiber.Cookie{
			Name:     CookieName,
			Value:    raw,
			HTTPOnly: true,
			SameSite: "Lax",
			Path:     "/",
		})
		h.db.RecordAudit("LOGIN", "success",
			fmt.Sprintf("Аккаунт #%d (%s, %s) вошёл по коду (2FA временно отключена); IP %s", account.ID, account.Nickname, account.Role, ip),
			ip, ua)
		return c.JSON(fiber.Map{
			"success":      true,
			"direct_login": true,
			"status":       "approved",
			"account": fiber.Map{
				"id": account.ID, "nickname": account.Nickname, "role": account.Role,
				"created_at": account.CreatedAt.Format(time.RFC3339),
			},
		})
	}

	// DEV-режим (локальная отладка без Telegram): подтверждаем попытку сразу.
	if h.devAutoApprove {
		attempt, err := h.svc.StartAttempt(account, ip, gps, ua)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Не удалось создать попытку входа"})
		}
		_ = h.svc.DecideAttempt(attempt.ID, true)
		h.db.RecordAudit("LOGIN_2FA", "success",
			fmt.Sprintf("DEV MODE: попытка #%d аккаунта #%d (%s) авто-подтверждена без Telegram", attempt.ID, account.ID, account.Nickname), ip, ua)
		return c.JSON(fiber.Map{"success": true, "attempt_token": attempt.Token, "expires_in": 300})
	}

	if h.notifier == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Telegram недоступен"})
	}

	// Доставка 2FA возможна только если пользователь уже писал боту.
	if h.svc.ResolveTGChatID(account) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success":     false,
			"error":       "Сначала напишите нашему Telegram-боту (команда /start), затем войдите.",
			"tg_required": true,
		})
	}

	attempt, err := h.svc.StartAttempt(account, ip, gps, ua)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Не удалось создать попытку входа"})
	}

	if err := h.notifier.SendLoginConfirmation(account, attempt); err != nil {
		h.db.RecordAudit("LOGIN_2FA", "failed", fmt.Sprintf("Аккаунт #%d: ошибка доставки TG", account.ID), ip, ua)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false, "error": "Не удалось отправить подтверждение в Telegram. Напишите боту /start и попробуйте снова.",
		})
	}

	h.db.RecordAudit("LOGIN_2FA", "pending",
		fmt.Sprintf("Аккаунт #%d (%s): ожидание подтверждения в TG", account.ID, account.Nickname), ip, ua)
	return c.JSON(fiber.Map{"success": true, "attempt_token": attempt.Token, "expires_in": 300})
}

// AttemptStatus — шаг 2 (поллинг): approved → выдаём сессию в cookie.
func (h *Handler) AttemptStatus(c *fiber.Ctx) error {
	token := c.Params("token")
	attempt, err := h.svc.AttemptByToken(token)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "error": "Попытка входа не найдена"})
	}

	switch attempt.Status {
	case "pending":
		return c.JSON(fiber.Map{"success": true, "status": "pending"})
	case "denied":
		h.db.RecordAudit("LOGIN", "failed", fmt.Sprintf("Попытка #%d отклонена в TG", attempt.ID), attempt.IP, "")
		return c.JSON(fiber.Map{"success": true, "status": "denied",
			"error": "Вход отклонён. Если это были не вы — срочно обратитесь к администратору."})
	case "expired":
		return c.JSON(fiber.Map{"success": true, "status": "expired", "error": "Время подтверждения истекло, войдите заново."})
	}

	account, err := h.svc.AccountByID(attempt.AccountID)
	if err != nil || account.IsActive != 1 {
		return c.JSON(fiber.Map{"success": true, "status": "expired", "error": "Аккаунт недоступен."})
	}

	raw, err := h.svc.CreateSession(account, attempt.IP, attempt.GPS, c.Get("User-Agent"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Не удалось создать сессию"})
	}
	// Сессионная cookie (без MaxAge/Expires): закрыл браузер — вышел из аккаунта.
	c.Cookie(&fiber.Cookie{
		Name:     CookieName,
		Value:    raw,
		HTTPOnly: true,
		SameSite: "Lax",
		Path:     "/",
	})
	h.db.RecordAudit("LOGIN", "success",
		fmt.Sprintf("Аккаунт #%d (%s, %s) вошёл; IP %s GPS %s", account.ID, account.Nickname, account.Role, attempt.IP, attempt.GPS),
		attempt.IP, c.Get("User-Agent"))
	return c.JSON(fiber.Map{
		"success": true, "status": "approved",
		"account": fiber.Map{
			"id": account.ID, "nickname": account.Nickname, "role": account.Role,
			"created_at": account.CreatedAt.Format(time.RFC3339),
		},
	})
}

// Me — текущий аккаунт (для фронтенда).
func (h *Handler) Me(c *fiber.Ctx) error {
	account, ok := AccountOf(c)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "account": fiber.Map{
		"id": account.ID, "nickname": account.Nickname, "role": account.Role,
		"created_at": account.CreatedAt.Format(time.RFC3339),
	}})
}

// Logout — выход.
func (h *Handler) Logout(c *fiber.Ctx) error {
	if raw := c.Cookies(CookieName); raw != "" {
		h.svc.DeleteSession(raw)
	}
	c.ClearCookie(CookieName)
	return c.JSON(fiber.Map{"success": true})
}

// Ping — heartbeat от открытой страницы (поддерживает сессию живой).
func (h *Handler) Ping(c *fiber.Ctx) error {
	if _, ok := AccountOf(c); !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true})
}

func maskCode(code string) string {
	runes := []rune(code)
	if len(runes) <= 4 {
		return "****"
	}
	return string(runes[:4]) + "****"
}

func (h *Handler) isMaintenanceActive() bool {
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
