package handlers

import (
	"github.com/gofiber/fiber/v2"

	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/validation"
)

// ── Банлист: IP, YouTube/TikTok/Telegram ссылки, UID ─────────

func (h *Admin) Bans(c *fiber.Ctx) error {
	list, err := h.bans.List()
	if err != nil {
		return serverError(c, "Ошибка загрузки банлиста")
	}
	if list == nil {
		list = []models.Ban{}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *Admin) AddBan(c *fiber.Ctx) error {
	var body struct {
		BType  string `json:"btype"`
		Value  string `json:"value"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	if !validation.InList(body.BType, models.BanIP, models.BanYouTube, models.BanTikTok,
		models.BanTelegram, models.BanUID) {
		return badRequest(c, "Тип бана: ip, youtube, tiktok, telegram или uid")
	}
	value := validation.Clean(body.Value, 300)
	reason := validation.Clean(body.Reason, 300)
	if value == "" {
		return badRequest(c, "Укажите значение бана")
	}
	// валидация значения по типу (кроме ip — его проверит сервис с CIDR)
	switch body.BType {
	case models.BanYouTube:
		if _, ok := validation.YouTubeChannel(value); !ok {
			return badRequest(c, "Некорректная ссылка на YouTube-канал")
		}
	case models.BanTikTok:
		if _, ok := validation.TikTokChannel(value); !ok {
			return badRequest(c, "Некорректная ссылка на TikTok")
		}
	case models.BanTelegram:
		if _, ok := validation.Telegram(value); !ok {
			return badRequest(c, "Некорректный @username")
		}
		value = value[1:] // храним без @
	case models.BanUID:
		if _, ok := validation.UID(value); !ok {
			return badRequest(c, "Некорректный UID")
		}
	}

	actor := actorInfo(c)
	if err := h.bans.Add(body.BType, value, reason, actor); err != nil {
		return badRequest(c, err.Error())
	}
	h.db.RecordAudit("BAN_ADD", "success",
		"Бан "+body.BType+": "+value+" ("+reason+")", middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) RemoveBan(c *fiber.Ctx) error {
	id, _ := paramID(c)
	if err := h.bans.Remove(id); err != nil {
		return badRequest(c, "Запись не найдена")
	}
	h.db.RecordAudit("BAN_REMOVE", "success", "Снят бан #"+itoa64(id),
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// TGWindows — состояния 24h-окон ответов (админка подстраивается под таймеры).
func (h *Admin) TGWindows(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "data": h.tg.WindowStates()})
}
