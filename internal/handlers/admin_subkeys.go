package handlers

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/middleware"
)

// ListSubKeys возвращает статистику и список ключей подписок.
func (h *Admin) ListSubKeys(c *fiber.Ctx) error {
	avail, used, err := h.db.SubscriptionKeysStats()
	if err != nil {
		return serverError(c, "Не удалось получить статистику ключей")
	}
	keys, err := h.db.ListSubscriptionKeys(100, 0)
	if err != nil {
		return serverError(c, "Не удалось загрузить список ключей")
	}
	return c.JSON(fiber.Map{
		"success":   true,
		"available": avail,
		"used":      used,
		"keys":      keys,
	})
}

// AddSubKeys добавляет список ключей из многострочного текста.
func (h *Admin) AddSubKeys(c *fiber.Ctx) error {
	var body struct {
		KeysText string `json:"keys"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	lines := strings.Split(body.KeysText, "\n")
	var validKeys []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			validKeys = append(validKeys, trimmed)
		}
	}
	if len(validKeys) == 0 {
		return badRequest(c, "Введите хотя бы один ключ")
	}

	added, duplicates, err := h.db.AddSubscriptionKeys(validKeys)
	if err != nil {
		return serverError(c, "Ошибка сохранения ключей: "+err.Error())
	}

	avail, used, _ := h.db.SubscriptionKeysStats()

	h.db.RecordAudit("SUB_KEYS_ADD", "success",
		fmt.Sprintf("Добавлено ключей: %d (дубликатов пропущено: %d)", added, duplicates),
		middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success":    true,
		"added":      added,
		"duplicates": duplicates,
		"available":  avail,
		"used":       used,
	})
}

// DeleteSubKey удаляет неиспользованный ключ из пула.
func (h *Admin) DeleteSubKey(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return badRequest(c, "Некорректный ID ключа")
	}
	if err := h.db.DeleteSubscriptionKey(id); err != nil {
		return badRequest(c, err.Error())
	}
	h.db.RecordAudit("KEY_DELETE", "success",
		fmt.Sprintf("Удалён ключ #%d", id),
		middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true})
}

// ListGiveawayKeys возвращает статистику и список ключей для розыгрышей.
func (h *Admin) ListGiveawayKeys(c *fiber.Ctx) error {
	avail, used, err := h.db.GiveawayKeysStats()
	if err != nil {
		return serverError(c, "Не удалось получить статистику ключей розыгрышей")
	}
	keys, err := h.db.ListGiveawayKeys(100, 0)
	if err != nil {
		return serverError(c, "Не удалось загрузить список ключей розыгрышей")
	}
	return c.JSON(fiber.Map{
		"success":   true,
		"available": avail,
		"used":      used,
		"keys":      keys,
	})
}

// AddGiveawayKeys добавляет список ключей для розыгрышей из текста.
func (h *Admin) AddGiveawayKeys(c *fiber.Ctx) error {
	var body struct {
		KeysText string `json:"keys"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	lines := strings.Split(body.KeysText, "\n")
	var validKeys []string
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			validKeys = append(validKeys, trimmed)
		}
	}
	if len(validKeys) == 0 {
		return badRequest(c, "Введите хотя бы один ключ")
	}

	added, duplicates, err := h.db.AddGiveawayKeys(validKeys)
	if err != nil {
		return serverError(c, "Ошибка сохранения ключей для розыгрышей: "+err.Error())
	}

	avail, used, _ := h.db.GiveawayKeysStats()

	h.db.RecordAudit("GIVEAWAY_KEYS_ADD", "success",
		fmt.Sprintf("Добавлено ключей для розыгрышей: %d (дубликатов пропущено: %d)", added, duplicates),
		middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success":    true,
		"added":      added,
		"duplicates": duplicates,
		"available":  avail,
		"used":       used,
	})
}
