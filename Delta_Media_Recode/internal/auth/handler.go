package auth

import (
	"fmt"

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
	svc            *Service
	db             *database.DB
	notifier       Notifier
	gpsRequired    bool
	devAutoApprove bool
}

func NewHandler(svc *Service, db *database.DB, gpsRequired, devAutoApprove bool) *Handler {
	return &Handler{svc: svc, db: db, gpsRequired: gpsRequired, devAutoApprove: devAutoApprove}
}

func (h *Handler) SetNotifier(n Notifier) { h.notifier = n }

// Login — шаг 1: код + обязательная GPS → создаём 2FA-попытку.
func (h *Handler) Login(c *fiber.Ctx) error {
	var body struct {
		Code string `json:"code"`
		GPS  string `json:"gps"` // "lat,lng (±acc m)"
	}
	if err := c.BodyParser(&body); err != nil || body.Code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Введите код аккаунта"})
	}
	ip := middleware.GetRealIP(c)
	ua := c.Get("User-Agent")

	if h.gpsRequired && body.GPS == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false, "error": "Без геолокации вход в аккаунт невозможен. Разрешите доступ к местоположению.",
			"gps_required": true,
		})
	}

	account, err := h.svc.AccountByCode(body.Code)
	if err != nil {
		h.db.RecordAudit("LOGIN", "failed", "Неверный код: "+maskCode(body.Code), ip, ua)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"success": false, "error": "Неверный код аккаунта"})
	}
	if account.IsActive != 1 {
		h.db.RecordAudit("LOGIN", "failed", fmt.Sprintf("Отключённый аккаунт #%d (%s)", account.ID, account.Nickname), ip, ua)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "error": "Аккаунт отключён. Обратитесь к администратору."})
	}

	// DEV-режим (локальная отладка без Telegram): подтверждаем попытку сразу.
	if h.devAutoApprove {
		attempt, err := h.svc.StartAttempt(account, ip, body.GPS, ua)
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

	attempt, err := h.svc.StartAttempt(account, ip, body.GPS, ua)
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
	c.Cookie(&fiber.Cookie{
		Name:     CookieName,
		Value:    raw,
		HTTPOnly: true,
		SameSite: "Lax",
		Path:     "/",
		MaxAge:   int(h.svc.session.Seconds()),
	})
	h.db.RecordAudit("LOGIN", "success",
		fmt.Sprintf("Аккаунт #%d (%s, %s) вошёл; IP %s GPS %s", account.ID, account.Nickname, account.Role, attempt.IP, attempt.GPS),
		attempt.IP, c.Get("User-Agent"))
	return c.JSON(fiber.Map{
		"success": true, "status": "approved",
		"account": fiber.Map{"id": account.ID, "nickname": account.Nickname, "role": account.Role},
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

func maskCode(code string) string {
	runes := []rune(code)
	if len(runes) <= 4 {
		return "****"
	}
	return string(runes[:4]) + "****"
}
