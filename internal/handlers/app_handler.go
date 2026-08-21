package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"delta-free-media/config"
	"delta-free-media/internal/database"
	"delta-free-media/internal/models"
	"delta-free-media/internal/services"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type adminLoginAttempt struct {
	Count     int
	FirstFail time.Time
}

type AppHandler struct {
	DB              *database.DB
	Cfg             *config.Config
	TG              *services.TelegramService
	UserBan         *services.UserBanManager
	HTTPClient      *http.Client
	adminLoginFails map[string]*adminLoginAttempt
	adminMu         sync.Mutex
}

const maxAdminFailsPerDay = 3
const adminFailWindow = 24 * time.Hour

func (h *AppHandler) checkAdminRateLimit(ip string) bool {
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	attempt, exists := h.adminLoginFails[ip]
	if !exists || time.Since(attempt.FirstFail) > adminFailWindow {
		h.adminLoginFails[ip] = &adminLoginAttempt{Count: 1, FirstFail: time.Now()}
		return true
	}
	if attempt.Count >= maxAdminFailsPerDay {
		return false
	}
	attempt.Count++
	return true
}

func NewAppHandler(db *database.DB, cfg *config.Config, tg *services.TelegramService, userBan *services.UserBanManager) *AppHandler {
	h := &AppHandler{
		DB:  db,
		Cfg: cfg,
		TG:  tg,
		UserBan: userBan,
		HTTPClient: &http.Client{
			Timeout: 4 * time.Second,
		},
		adminLoginFails: make(map[string]*adminLoginAttempt),
	}

	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			h.adminMu.Lock()
			now := time.Now()
			for ip, attempt := range h.adminLoginFails {
				if now.Sub(attempt.FirstFail) > adminFailWindow {
					delete(h.adminLoginFails, ip)
				}
			}
			h.adminMu.Unlock()
		}
	}()

	return h
}

func isValidYouTubeChannelURL(rawURL string) bool {
	u := strings.ToLower(strings.TrimSpace(rawURL))
	
	// Must contain youtube.com
	if !strings.Contains(u, "youtube.com/") {
		return false
	}

	// Must NOT be a video or shorts link
	if strings.Contains(u, "watch?v=") || strings.Contains(u, "youtu.be/") || 
	   strings.Contains(u, "/shorts/") || strings.Contains(u, "/watch") {
		return false
	}

	// Channel URL patterns: /@username, /channel/UC..., /c/name, /user/name
	matched, _ := regexp.MatchString(`youtube\.com/(@[a-zA-Z0-9_\.\-]+|channel/[a-zA-Z0-9_\-]+|c/[a-zA-Z0-9_\-]+|user/[a-zA-Z0-9_\-]+)`, u)
	return matched
}

func (h *AppHandler) checkURLAlive(targetURL string) bool {
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	
	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func (h *AppHandler) verifyTurnstile(token, ip string) bool {
	if h.Cfg.TurnstileSecretKey == "" {
		return true
	}
	if token == "" {
		return false
	}

	form := strings.NewReader(
		"secret=" + h.Cfg.TurnstileSecretKey +
			"&response=" + token +
			"&remoteip=" + ip,
	)
	req, err := http.NewRequest("POST", "https://challenges.cloudflare.com/turnstile/v0/siteverify", form)
	if err != nil {
		log.Printf("[Turnstile] request error: %v", err)
		return false
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		log.Printf("[Turnstile] verify error: %v", err)
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Success    bool     `json:"success"`
		ErrorCodes []string `json:"error-codes,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("[Turnstile] parse error: %v", err)
		return false
	}

	if !result.Success {
		log.Printf("[Turnstile] failed: %v", result.ErrorCodes)
	}
	return result.Success
}

func (h *AppHandler) VerifyModKey(c *fiber.Ctx) error {
	type reqStruct struct {
		Key string `json:"key"`
	}
	var body reqStruct
	ip := c.IP()
	ua := c.Get("User-Agent")

	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Key) == "" {
		h.DB.RecordAuditLog("MOD_LOGIN", "failed", "Empty moderator key submitted", ip, ua)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid key input",
		})
	}

	trimmedKey := strings.TrimSpace(body.Key)
	var nickname string
	var isActive int
	err := h.DB.SQL.QueryRow(h.DB.Rebind("SELECT nickname, is_active FROM moderator_keys WHERE key = ?"), trimmedKey).Scan(&nickname, &isActive)
	if err != nil {
		if regexp.MustCompile(`[a-zA-Z]`).MatchString(trimmedKey) && len(trimmedKey) >= 4 {
			h.DB.RecordAuditLog("MOD_LOGIN", "failed", fmt.Sprintf("Invalid key attempt: %s", trimmedKey), ip, ua)
		}
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid moderator key",
		})
	}

	if isActive == 2 {
		h.DB.RecordAuditLog("MOD_LOGIN", "warning", fmt.Sprintf("Attempted login with FROZEN key: %s (Mod: %s)", trimmedKey, nickname), ip, ua)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Ваш ключ заморожен. Для разблокировки обратитесь к Куратору.",
		})
	}

	if isActive == 0 {
		h.DB.RecordAuditLog("MOD_LOGIN", "failed", fmt.Sprintf("Attempted login with DISABLED key: %s (Mod: %s)", trimmedKey, nickname), ip, ua)
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Moderator key is deactivated",
		})
	}

	h.DB.RecordAuditLog("MOD_LOGIN", "success", fmt.Sprintf("Moderator %s logged in with key %s", nickname, trimmedKey), ip, ua)

	return c.JSON(fiber.Map{
		"success":  true,
		"nickname": nickname,
		"key":      trimmedKey,
	})
}

func (h *AppHandler) VerifyAdminCode(c *fiber.Ctx) error {
	type reqStruct struct {
		Code string `json:"code"`
	}
	var body reqStruct
	ip := c.IP()
	ua := c.Get("User-Agent")

	if err := c.BodyParser(&body); err != nil {
		h.DB.RecordAuditLog("ADMIN_LOGIN", "failed", "Empty admin code input", ip, ua)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid input",
		})
	}

	if !h.checkAdminRateLimit(ip) {
		h.DB.RecordAuditLog("ADMIN_LOGIN", "rate_limited", "Rate limit exceeded for admin login", ip, ua)
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"success": false,
			"error":   "Too many failed attempts. Try again in 24 hours.",
		})
	}

	if strings.TrimSpace(body.Code) == h.Cfg.AdminSecret {
		h.DB.RecordAuditLog("ADMIN_LOGIN", "success", "Admin authentication successful", ip, ua)
		return c.JSON(fiber.Map{
			"success": true,
			"token":   h.Cfg.AdminSecret,
		})
	}

	h.DB.RecordAuditLog("ADMIN_LOGIN", "failed", "Incorrect admin password attempt", ip, ua)
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"success": false,
		"error":   "Invalid admin code",
	})
}

func (h *AppHandler) SubmitMediaApplication(c *fiber.Ctx) error {
	var app models.MediaApplication
	if err := c.BodyParser(&app); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid request data",
		})
	}

	if strings.TrimSpace(app.UID) == "" || (app.Platform != "youtube" && app.Platform != "tiktok") ||
		strings.TrimSpace(app.ChannelURL) == "" || strings.TrimSpace(app.Servers) == "" ||
		strings.TrimSpace(app.WhyJoin) == "" || strings.TrimSpace(app.Exclusive) == "" ||
		strings.TrimSpace(app.Telegram) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "All required fields must be filled"})
	}

	// UID must be numeric only
	if matched, _ := regexp.MatchString(`[a-zA-Z]`, app.UID); matched {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "UID не должен содержать буквы"})
	}

	// Skip Turnstile for admin-authenticated requests
	adminSecret := c.Get("X-Admin-Secret")
	isAdmin := adminSecret != "" && adminSecret == h.Cfg.AdminSecret

	if !isAdmin {
		if !h.verifyTurnstile(app.TurnstileToken, c.IP()) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Проверка капчи не пройдена. Попробуйте ещё раз.",
			})
		}
	}

	// Smart YouTube Channel Validation
	if app.Platform == "youtube" {
		if !isValidYouTubeChannelURL(app.ChannelURL) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"success": false,
				"error":   "Укажите прямую ссылку на YouTube КАНАЛ (например: https://youtube.com/@username), а не на видео",
			})
		}
	}

	if app.Platform == "youtube" && strings.TrimSpace(app.VideosPerWeek) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Videos per week is required for YouTube"})
	}
	if app.Platform == "tiktok" && strings.TrimSpace(app.Collaborations) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Collaborations field is required for TikTok"})
	}

	if app.Lang == "" {
		app.Lang = "ru"
	}

	// Verify that the user has written to the Telegram Secretary employee first (ChatID mapping must exist)
	if !h.TG.IsUserMapped(app.Telegram) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success":     false,
			"error":       "Сначала напишите нашему сотруднику, затем отправьте заявку",
			"tg_required": true,
		})
	}

	// Check if user is banned by any field
	banResult := h.UserBan.CheckFields(app.ChannelURL, app.UID, app.Telegram, "", c.IP())
	if banResult.IsBanned {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   fmt.Sprintf("Ваша заявка заблокирована. Причина: %s", banResult.Reason),
		})
	}

	// Check for Duplicate Applications — only block if there is an active pending (unreviewed) application
	cleanTg := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(app.Telegram), "@", ""))
	cleanChannel := strings.ToLower(strings.TrimSpace(app.ChannelURL))

	var dupPending int
	errDup := h.DB.SQL.QueryRow(h.DB.Rebind(`
		SELECT COUNT(*) FROM media_applications 
		WHERE status = 'pending' 
		  AND (LOWER(REPLACE(telegram, '@', '')) = ? OR LOWER(channel_url) = ?)
	`), cleanTg, cleanChannel).Scan(&dupPending)

	if errDup == nil && dupPending > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "У вас уже есть нерассмотренная заявка в ожидании! Дождитесь ответа по текущей заявке.",
		})
	}

	id, err := h.DB.InsertAndGetID(`
		INSERT INTO media_applications 
		(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week, collaborations, why_join, exclusive, telegram, ip_address, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
	`, app.Lang, app.UID, 1, app.Platform, app.ChannelURL, app.Servers, app.VideosPerWeek, app.Collaborations, app.WhyJoin, app.Exclusive, app.Telegram, c.IP())

	if err != nil {
		log.Printf("[MediaSubmit] Error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to save application"})
	}

	h.TG.NotifyNewMediaApplication(id, app.Platform, app.ChannelURL, app.Telegram)
	h.DB.RecordAuditLog("APP_SUBMIT", "success", fmt.Sprintf("Media Application #%d submitted (%s)", id, app.Platform), c.IP(), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success": true,
		"id":      id,
		"message": "Media application submitted successfully",
	})
}

func (h *AppHandler) SubmitHWIDReset(c *fiber.Ctx) error {
	modNick, _ := c.Locals("mod_nickname").(string)
	modKey, _ := c.Locals("mod_key").(string)

	targetUUID := c.FormValue("uuid")
	proofLink := c.FormValue("proof_link")
	reason := c.FormValue("reason")
	lang := c.FormValue("lang", "ru")

	if strings.TrimSpace(targetUUID) == "" || strings.TrimSpace(reason) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "UUID and Reason are required"})
	}

	var proofFiles []string
	if paths := c.FormValue("proof_file_paths"); strings.TrimSpace(paths) != "" {
		for _, p := range strings.Split(paths, ",") {
			if strings.TrimSpace(p) != "" {
				proofFiles = append(proofFiles, strings.TrimSpace(p))
			}
		}
	}

	form, err := c.MultipartForm()
	if err == nil && form != nil {
		files := form.File["proof_files"]
		if len(files) == 0 {
			files = form.File["proof_file"]
		}
		_ = os.MkdirAll(h.Cfg.UploadDir, 0755)
		for _, fileHeader := range files {
			ext := filepath.Ext(fileHeader.Filename)
			newFileName := fmt.Sprintf("hwid_%s%s", uuid.New().String()[:8], ext)
			savePath := filepath.Join(h.Cfg.UploadDir, newFileName)
			if err := c.SaveFile(fileHeader, savePath); err == nil {
				proofFiles = append(proofFiles, "/uploads/"+newFileName)
			}
		}
	}

	proofFileStr := strings.Join(proofFiles, ",")

	if strings.TrimSpace(proofFileStr) == "" && strings.TrimSpace(proofLink) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Proof file(s) or Proof link is required"})
	}

	proofType := "both"
	if proofFileStr != "" && proofLink == "" {
		proofType = "file"
	} else if proofFileStr == "" && proofLink != "" {
		proofType = "link"
	}

	id, err := h.DB.InsertAndGetID(`
		INSERT INTO hwid_reset_requests
		(lang, mod_nickname, mod_key, uuid, proof_type, proof_file, proof_link, reason, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
	`, lang, modNick, modKey, targetUUID, proofType, proofFileStr, proofLink, reason)

	if err != nil {
		log.Printf("[HWIDSubmit] Error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to save request"})
	}

	h.TG.NotifyNewHWIDReset(id, modNick, targetUUID)
	h.DB.RecordAuditLog("HWID_SUBMIT", "success", fmt.Sprintf("HWID Reset #%d by Mod %s for UUID %s", id, modNick, targetUUID), c.IP(), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success": true,
		"id":      id,
		"message": "HWID reset request submitted successfully",
	})
}

func (h *AppHandler) SubmitDiscordBan(c *fiber.Ctx) error {
	modNick, _ := c.Locals("mod_nickname").(string)
	modKey, _ := c.Locals("mod_key").(string)

	offenderID := c.FormValue("offender_id")
	proofLink := c.FormValue("proof_link")
	reason := c.FormValue("reason")
	lang := c.FormValue("lang", "ru")

	if strings.TrimSpace(offenderID) == "" || strings.TrimSpace(reason) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Offender ID and Reason are required"})
	}

	var proofFiles []string
	if paths := c.FormValue("proof_file_paths"); strings.TrimSpace(paths) != "" {
		for _, p := range strings.Split(paths, ",") {
			if strings.TrimSpace(p) != "" {
				proofFiles = append(proofFiles, strings.TrimSpace(p))
			}
		}
	}

	form, err := c.MultipartForm()
	if err == nil && form != nil {
		files := form.File["proof_files"]
		if len(files) == 0 {
			files = form.File["proof_file"]
		}
		_ = os.MkdirAll(h.Cfg.UploadDir, 0755)
		for _, fileHeader := range files {
			ext := filepath.Ext(fileHeader.Filename)
			newFileName := fmt.Sprintf("dc_%s%s", uuid.New().String()[:8], ext)
			savePath := filepath.Join(h.Cfg.UploadDir, newFileName)
			if err := c.SaveFile(fileHeader, savePath); err == nil {
				proofFiles = append(proofFiles, "/uploads/"+newFileName)
			}
		}
	}

	proofFileStr := strings.Join(proofFiles, ",")

	if strings.TrimSpace(proofFileStr) == "" && strings.TrimSpace(proofLink) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false, "error": "Proof file(s) or Proof link is required"})
	}

	proofType := "both"
	if proofFileStr != "" && proofLink == "" {
		proofType = "file"
	} else if proofFileStr == "" && proofLink != "" {
		proofType = "link"
	}

	id, err := h.DB.InsertAndGetID(`
		INSERT INTO discord_ban_requests
		(lang, mod_nickname, mod_key, offender_id, proof_type, proof_file, proof_link, reason, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
	`, lang, modNick, modKey, offenderID, proofType, proofFileStr, proofLink, reason)

	if err != nil {
		log.Printf("[BanSubmit] Error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false, "error": "Failed to save ban request"})
	}

	h.TG.NotifyNewDiscordBan(id, modNick, offenderID)
	h.DB.RecordAuditLog("BAN_SUBMIT", "success", fmt.Sprintf("Discord Ban #%d by Mod %s against %s", id, modNick, offenderID), c.IP(), c.Get("User-Agent"))

	return c.JSON(fiber.Map{
		"success": true,
		"id":      id,
		"message": "Discord ban request submitted successfully",
	})
}

type ClientErrorRequest struct {
	Type     string `json:"type"`
	Message  string `json:"message"`
	Filename string `json:"filename,omitempty"`
	LineNo   int    `json:"lineno,omitempty"`
	ColNo    int    `json:"colno,omitempty"`
	Error    string `json:"error,omitempty"`
}

func (h *AppHandler) LogClientError(c *fiber.Ctx) error {
	var req ClientErrorRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"success": false})
	}

	details := fmt.Sprintf("[%s] %s", req.Type, req.Message)
	if req.Filename != "" {
		details += fmt.Sprintf(" at %s:%d:%d", req.Filename, req.LineNo, req.ColNo)
	}
	if req.Error != "" {
		details += fmt.Sprintf(" | Stack: %s", req.Error)
	}

	log.Printf("[Client Log] %s", details)
	h.DB.RecordAuditLog("CLIENT_ERROR", "error", details, c.IP(), c.Get("User-Agent"))

	return c.JSON(fiber.Map{"success": true})
}
