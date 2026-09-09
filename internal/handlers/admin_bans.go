package handlers

import (
	"strings"

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
		Channel  string `json:"channel"`
		UID      string `json:"uid"`
		Telegram string `json:"telegram"`
		Discord  string `json:"discord"`
		IP       string `json:"ip"`
		Reason   string `json:"reason"`
		BType    string `json:"btype"`
		Value    string `json:"value"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	if body.BType != "" && body.Value != "" {
		switch strings.ToLower(body.BType) {
		case "channel", "youtube", "tiktok":
			if body.Channel == "" {
				body.Channel = body.Value
			}
		case "uid":
			if body.UID == "" {
				body.UID = body.Value
			}
		case "telegram", "tg":
			if body.Telegram == "" {
				body.Telegram = body.Value
			}
		case "discord", "ds":
			if body.Discord == "" {
				body.Discord = body.Value
			}
		case "ip":
			if body.IP == "" {
				body.IP = body.Value
			}
		}
	}
	ban := models.Ban{
		Channel:  validation.Clean(body.Channel, 300),
		UID:      validation.Clean(body.UID, 100),
		Telegram: validation.Clean(body.Telegram, 100),
		Discord:  validation.Clean(body.Discord, 100),
		IP:       validation.Clean(body.IP, 100),
		Reason:   validation.Clean(body.Reason, 300),
		BannedBy: actorInfo(c),
	}
	if err := h.bans.Add(ban); err != nil {
		return badRequest(c, err.Error())
	}
	h.db.RecordAudit("BAN_ADD", "success",
		"Блокировка: chan="+ban.Channel+" uid="+ban.UID+" tg="+ban.Telegram+" dc="+ban.Discord+" ip="+ban.IP+" ("+ban.Reason+")",
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

func (h *Admin) UpdateBan(c *fiber.Ctx) error {
	id, err := paramID(c)
	if err != nil {
		return badRequest(c, "Неверный ID блокировки")
	}
	var body struct {
		Channel  string `json:"channel"`
		UID      string `json:"uid"`
		Telegram string `json:"telegram"`
		Discord  string `json:"discord"`
		IP       string `json:"ip"`
		Reason   string `json:"reason"`
		BType    string `json:"btype"`
		Value    string `json:"value"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	if body.BType != "" && body.Value != "" {
		switch strings.ToLower(body.BType) {
		case "channel", "youtube", "tiktok":
			if body.Channel == "" {
				body.Channel = body.Value
			}
		case "uid":
			if body.UID == "" {
				body.UID = body.Value
			}
		case "telegram", "tg":
			if body.Telegram == "" {
				body.Telegram = body.Value
			}
		case "discord", "ds":
			if body.Discord == "" {
				body.Discord = body.Value
			}
		case "ip":
			if body.IP == "" {
				body.IP = body.Value
			}
		}
	}
	ban := models.Ban{
		ID:       id,
		Channel:  validation.Clean(body.Channel, 300),
		UID:      validation.Clean(body.UID, 100),
		Telegram: validation.Clean(body.Telegram, 100),
		Discord:  validation.Clean(body.Discord, 100),
		IP:       validation.Clean(body.IP, 100),
		Reason:   validation.Clean(body.Reason, 300),
	}
	if err := h.bans.Update(ban); err != nil {
		return badRequest(c, err.Error())
	}
	h.db.RecordAudit("BAN_UPDATE", "success",
		"Обновление бана #"+itoa64(id)+": chan="+ban.Channel+" uid="+ban.UID+" tg="+ban.Telegram+" dc="+ban.Discord+" ip="+ban.IP+" ("+ban.Reason+")",
		middleware.GetRealIP(c), c.Get("User-Agent"))
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
