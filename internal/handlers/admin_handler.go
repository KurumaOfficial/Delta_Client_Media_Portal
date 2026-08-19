package handlers

import (
	"fmt"
	"strings"
	"time"

	"delta-free-media/config"
	"delta-free-media/internal/database"
	"delta-free-media/internal/middleware"
	"delta-free-media/internal/models"
	"delta-free-media/internal/services"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type AdminHandler struct {
	DB    *database.DB
	Cfg   *config.Config
	TG    *services.TelegramService
	IPBan *services.IPBanManager
}

func NewAdminHandler(db *database.DB, cfg *config.Config, tg *services.TelegramService, ipBan *services.IPBanManager) *AdminHandler {
	return &AdminHandler{
		DB:    db,
		Cfg:   cfg,
		TG:    tg,
		IPBan: ipBan,
	}
}

func (h *AdminHandler) GetStats(c *fiber.Ctx) error {
	var mediaTotal, mediaPending, hwidTotal, hwidPending, banTotal, banPending, modKeysTotal int

	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM media_applications").Scan(&mediaTotal)
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM media_applications WHERE status = 'pending'").Scan(&mediaPending)

	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM hwid_reset_requests").Scan(&hwidTotal)
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM hwid_reset_requests WHERE status = 'pending'").Scan(&hwidPending)

	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM discord_ban_requests").Scan(&banTotal)
	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM discord_ban_requests WHERE status = 'pending'").Scan(&banPending)

	_ = h.DB.SQL.QueryRow("SELECT COUNT(*) FROM moderator_keys WHERE is_active = 1").Scan(&modKeysTotal)

	return c.JSON(fiber.Map{
		"success": true,
		"stats": fiber.Map{
			"media_total":    mediaTotal,
			"media_pending":  mediaPending,
			"hwid_total":     hwidTotal,
			"hwid_pending":   hwidPending,
			"ban_total":      banTotal,
			"ban_pending":    banPending,
			"mod_keys_total": modKeysTotal,
		},
	})
}

// Get Audit Logs
func (h *AdminHandler) GetAuditLogs(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query(`
		SELECT id, event_type, status, details, COALESCE(ip_address, ''), COALESCE(user_agent, ''), created_at
		FROM audit_logs ORDER BY id DESC LIMIT 100
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	list := make([]models.AuditLog, 0)
	for rows.Next() {
		var item models.AuditLog
		var created time.Time
		if err := rows.Scan(&item.ID, &item.EventType, &item.Status, &item.Details, &item.IPAddress, &item.UserAgent, &created); err == nil {
			item.CreatedAt = created
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": list})
}

// Media Applications
func (h *AdminHandler) GetMediaApplications(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query(`
		SELECT id, lang, COALESCE(uid, ''), criteria_agreed, platform, channel_url, servers, 
		       COALESCE(videos_per_week, ''), COALESCE(collaborations, ''), 
		       why_join, exclusive, telegram, status, COALESCE(admin_comment, ''), created_at, updated_at
		FROM media_applications ORDER BY id DESC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	list := make([]models.MediaApplication, 0)
	for rows.Next() {
		var item models.MediaApplication
		var critInt int
		var created, updated time.Time
		if err := rows.Scan(&item.ID, &item.Lang, &item.UID, &critInt, &item.Platform, &item.ChannelURL, &item.Servers,
			&item.VideosPerWeek, &item.Collaborations, &item.WhyJoin, &item.Exclusive, &item.Telegram,
			&item.Status, &item.AdminComment, &created, &updated); err == nil {
			item.CriteriaAgreed = critInt == 1
			item.CreatedAt = created
			item.UpdatedAt = updated
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *AdminHandler) UpdateMediaStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.StatusUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid payload"})
	}

	var tg string
	var appID int64
	err := h.DB.SQL.QueryRow(h.DB.Rebind("SELECT id, telegram FROM media_applications WHERE id = ?"), id).Scan(&appID, &tg)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Application not found"})
	}

	_, err = h.DB.SQL.Exec(h.DB.Rebind(`
		UPDATE media_applications 
		SET status = ?, admin_comment = ?, updated_at = CURRENT_TIMESTAMP 
		WHERE id = ?
	`), req.Status, req.AdminComment, id)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Update failed"})
	}

	h.TG.SendVerdict(tg, "media", appID, req.Status, req.AdminComment, "")
	h.DB.RecordAuditLog("STATUS_CHANGE", "success", fmt.Sprintf("Media App #%s status changed to %s", id, req.Status), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "message": "Status updated successfully"})
}

// HWID Requests
func (h *AdminHandler) GetHWIDRequests(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query(`
		SELECT id, lang, mod_nickname, mod_key, uuid, proof_type, 
		       COALESCE(proof_file, ''), COALESCE(proof_link, ''), reason, status, COALESCE(admin_comment, ''), created_at
		FROM hwid_reset_requests ORDER BY id DESC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	list := make([]models.HWIDResetRequest, 0)
	for rows.Next() {
		var item models.HWIDResetRequest
		var created time.Time
		if err := rows.Scan(&item.ID, &item.Lang, &item.ModNickname, &item.ModKey, &item.UUID, &item.ProofType,
			&item.ProofFile, &item.ProofLink, &item.Reason, &item.Status, &item.AdminComment, &created); err == nil {
			item.CreatedAt = created
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *AdminHandler) UpdateHWIDStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.StatusUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid payload"})
	}

	var reqID int64
	var targetUUID string
	err := h.DB.SQL.QueryRow(h.DB.Rebind("SELECT id, uuid FROM hwid_reset_requests WHERE id = ?"), id).Scan(&reqID, &targetUUID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "HWID request not found"})
	}

	_, err = h.DB.SQL.Exec(h.DB.Rebind(`
		UPDATE hwid_reset_requests 
		SET status = ?, admin_comment = ? 
		WHERE id = ?
	`), req.Status, req.AdminComment, id)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Update failed"})
	}

	h.TG.SendVerdict("@Kuruma31", "hwid", reqID, req.Status, req.AdminComment, targetUUID)
	h.DB.RecordAuditLog("STATUS_CHANGE", "success", fmt.Sprintf("HWID Request #%s status changed to %s", id, req.Status), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "message": "HWID request updated"})
}

// Discord Ban Requests
func (h *AdminHandler) GetDiscordBans(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query(`
		SELECT id, lang, mod_nickname, mod_key, offender_id, proof_type, 
		       COALESCE(proof_file, ''), COALESCE(proof_link, ''), reason, status, COALESCE(admin_comment, ''), created_at
		FROM discord_ban_requests ORDER BY id DESC
	`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	list := make([]models.DiscordBanRequest, 0)
	for rows.Next() {
		var item models.DiscordBanRequest
		var created time.Time
		if err := rows.Scan(&item.ID, &item.Lang, &item.ModNickname, &item.ModKey, &item.OffenderID, &item.ProofType,
			&item.ProofFile, &item.ProofLink, &item.Reason, &item.Status, &item.AdminComment, &created); err == nil {
			item.CreatedAt = created
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *AdminHandler) UpdateDiscordBanStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	var req models.StatusUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid payload"})
	}

	var reqID int64
	var offenderID string
	err := h.DB.SQL.QueryRow(h.DB.Rebind("SELECT id, offender_id FROM discord_ban_requests WHERE id = ?"), id).Scan(&reqID, &offenderID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"success": false, "error": "Ban request not found"})
	}

	_, err = h.DB.SQL.Exec(h.DB.Rebind(`
		UPDATE discord_ban_requests 
		SET status = ?, admin_comment = ? 
		WHERE id = ?
	`), req.Status, req.AdminComment, id)

	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Update failed"})
	}

	h.TG.SendVerdict("@Kuruma31", "discord", reqID, req.Status, req.AdminComment, offenderID)
	h.DB.RecordAuditLog("STATUS_CHANGE", "success", fmt.Sprintf("Discord Ban #%s status changed to %s", id, req.Status), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "message": "Discord ban request updated"})
}

// Moderator Key Management
func (h *AdminHandler) GetModKeys(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query(`SELECT id, key, nickname, COALESCE(telegram, ''), is_active, created_at FROM moderator_keys ORDER BY id DESC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}
	defer rows.Close()

	list := make([]models.ModeratorKey, 0)
	for rows.Next() {
		var item models.ModeratorKey
		var activeInt int
		var created time.Time
		if err := rows.Scan(&item.ID, &item.Key, &item.Nickname, &item.Telegram, &activeInt, &created); err == nil {
			item.IsActive = activeInt
			item.CreatedAt = created
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": list})
}

func (h *AdminHandler) CreateModKey(c *fiber.Ctx) error {
	type reqStruct struct {
		Nickname string `json:"nickname"`
		Telegram string `json:"telegram"`
		Key      string `json:"key,omitempty"`
	}
	var body reqStruct
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Nickname) == "" || strings.TrimSpace(body.Telegram) == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Nickname and Telegram username are required"})
	}

	cleanNick := strings.TrimSpace(body.Nickname)
	cleanTg := strings.TrimSpace(body.Telegram)
	if !strings.HasPrefix(cleanTg, "@") && !strings.Contains(cleanTg, "t.me/") {
		cleanTg = "@" + cleanTg
	}
	customKey := strings.TrimSpace(body.Key)

	var finalKey string
	if customKey != "" {
		finalKey = customKey
	} else {
		finalKey = fmt.Sprintf("DELTA-%s", strings.ToUpper(uuid.New().String()[:8]))
	}

	id, err := h.DB.InsertAndGetID(`INSERT INTO moderator_keys (key, nickname, telegram, is_active) VALUES (?, ?, ?, 1)`, finalKey, cleanNick, cleanTg)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Failed to save key: " + err.Error()})
	}

	h.DB.RecordAuditLog("KEY_MANAGEMENT", "success", fmt.Sprintf("Created key %s for mod %s (%s)", finalKey, cleanNick, cleanTg), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success":  true,
		"id":       id,
		"key":      finalKey,
		"nickname": cleanNick,
		"telegram": cleanTg,
	})
}

func (h *AdminHandler) ToggleModKey(c *fiber.Ctx) error {
	id := c.Params("id")
	action := strings.ToLower(c.Query("action")) // "freeze", "unfreeze", "delete", "toggle"

	var modKey string
	_ = h.DB.SQL.QueryRow(h.DB.Rebind("SELECT key FROM moderator_keys WHERE id = ?"), id).Scan(&modKey)

	if action == "delete" {
		_, err := h.DB.SQL.Exec(h.DB.Rebind("DELETE FROM moderator_keys WHERE id = ?"), id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "error": "Delete failed"})
		}
		h.DB.RecordAuditLog("KEY_MANAGEMENT", "success", fmt.Sprintf("Deleted key #%s (%s)", id, modKey), middleware.GetRealIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"success": true, "message": "Key deleted"})
	}

	if action == "freeze" {
		_, err := h.DB.SQL.Exec(h.DB.Rebind("UPDATE moderator_keys SET is_active = 2 WHERE id = ?"), id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "error": "Freeze failed"})
		}
		h.DB.RecordAuditLog("KEY_MANAGEMENT", "success", fmt.Sprintf("Frozen key #%s (%s)", id, modKey), middleware.GetRealIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"success": true, "message": "Key frozen"})
	}

	if action == "unfreeze" {
		_, err := h.DB.SQL.Exec(h.DB.Rebind("UPDATE moderator_keys SET is_active = 1 WHERE id = ?"), id)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"success": false, "error": "Unfreeze failed"})
		}
		h.DB.RecordAuditLog("KEY_MANAGEMENT", "success", fmt.Sprintf("Unfrozen key #%s (%s)", id, modKey), middleware.GetRealIP(c), c.Get("User-Agent"))
		return c.JSON(fiber.Map{"success": true, "message": "Key unfrozen"})
	}

	// Default toggle: 1 -> 2 (freeze) or 2/0 -> 1 (unfreeze)
	_, err := h.DB.SQL.Exec(h.DB.Rebind("UPDATE moderator_keys SET is_active = CASE WHEN is_active = 1 THEN 2 ELSE 1 END WHERE id = ?"), id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Toggle failed"})
	}
	h.DB.RecordAuditLog("KEY_MANAGEMENT", "success", fmt.Sprintf("Toggled status for key #%s (%s)", id, modKey), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true, "message": "Key status toggled"})
}

func (h *AdminHandler) GetBannedIPs(c *fiber.Ctx) error {
	rows, err := h.DB.SQL.Query("SELECT id, ip, reason, banned_by, created_at FROM banned_ips ORDER BY id DESC")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": "Failed to fetch banned IPs"})
	}
	defer rows.Close()

	type BannedIPItem struct {
		ID        int64     `json:"id"`
		IP        string    `json:"ip"`
		Reason    string    `json:"reason"`
		BannedBy  string    `json:"banned_by"`
		CreatedAt time.Time `json:"created_at"`
	}

	var list []BannedIPItem
	for rows.Next() {
		var item BannedIPItem
		if err := rows.Scan(&item.ID, &item.IP, &item.Reason, &item.BannedBy, &item.CreatedAt); err == nil {
			list = append(list, item)
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    list,
	})
}

func (h *AdminHandler) AddBannedIP(c *fiber.Ctx) error {
	var body struct {
		IP     string `json:"ip"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.IP) == "" {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid IP address"})
	}

	cleanIP := strings.TrimSpace(body.IP)
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		reason = "Заблокирован администратором"
	}

	err := h.IPBan.BanIP(cleanIP, reason, "admin")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	h.DB.RecordAuditLog("IP_BAN", "success", fmt.Sprintf("Banned IP %s (Reason: %s)", cleanIP, reason), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success": true,
		"message": fmt.Sprintf("IP %s заблокирован", cleanIP),
	})
}

func (h *AdminHandler) RemoveBannedIP(c *fiber.Ctx) error {
	id, err := c.ParamsInt("id")
	if err != nil || id <= 0 {
		return c.Status(400).JSON(fiber.Map{"success": false, "error": "Invalid ID"})
	}

	err = h.IPBan.UnbanIP(int64(id))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"success": false, "error": err.Error()})
	}

	h.DB.RecordAuditLog("IP_UNBAN", "success", fmt.Sprintf("Unbanned IP record #%d", id), middleware.GetRealIP(c), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success": true,
		"message": "IP разблокирован",
	})
}
