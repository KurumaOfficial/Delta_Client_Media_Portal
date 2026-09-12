package handlers

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/auth"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/validation"
)

// ── Управление кодами аккаунтов ──────────────────────────────

// Accounts — список всех кодов.
func (h *Admin) Accounts(c *fiber.Ctx) error {
	list, err := h.auth.ListAccounts()
	if err != nil {
		return serverError(c, "Ошибка загрузки аккаунтов")
	}
	if list == nil {
		list = []models.Account{}
	}
	// код показываем полностью только админу — он их и раздаёт
	return c.JSON(fiber.Map{"success": true, "data": list})
}

// CreateAccount — выпуск нового кода с выбором роли.
func (h *Admin) CreateAccount(c *fiber.Ctx) error {
	var body struct {
		Role     string `json:"role"`
		Nickname string `json:"nickname"`
		Telegram string `json:"telegram"`
		Code     string `json:"code"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректный запрос")
	}
	if !validation.InList(body.Role, models.RoleAdmin, models.RoleModerator, models.RoleMedia) {
		return badRequest(c, "Роль: admin, moderator или media")
	}
	nickname := validation.Clean(body.Nickname, 40)
	if len([]rune(nickname)) < 2 {
		return badRequest(c, "Укажите никнейм (минимум 2 символа)")
	}
	tg, ok := validation.Telegram(body.Telegram)
	if !ok {
		return badRequest(c, "Укажите Telegram @username владельца (нужен для 2FA)")
	}

	customCode := strings.TrimSpace(body.Code)
	if customCode != "" {
		if len(customCode) < 4 || len(customCode) > 64 {
			return badRequest(c, "Код должен содержать от 4 до 64 символов")
		}
		var exists int
		_ = h.db.QueryRow(`SELECT COUNT(*) FROM v2_accounts WHERE UPPER(code) = UPPER(?)`, customCode).Scan(&exists)
		if exists > 0 {
			return badRequest(c, "Аккаунт с таким кодом уже существует")
		}
	}

	account, err := h.auth.CreateAccount(body.Role, nickname, tg, customCode)
	if err != nil {
		return serverError(c, "Не удалось создать код: "+err.Error())
	}
	h.db.RecordAudit("ACCOUNT_CREATE", "success",
		"Код "+account.Code+" ("+account.Role+") для "+nickname+" "+tg,
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "account": account})
}

// ToggleAccount — вкл/откл кода.
func (h *Admin) ToggleAccount(c *fiber.Ctx) error {
	id, _ := paramID(c)
	var active int
	if err := h.db.QueryRow(`SELECT is_active FROM v2_accounts WHERE id = ?`, id).Scan(&active); err != nil {
		return badRequest(c, "Аккаунт не найден")
	}
	newState := 1
	if active == 1 {
		newState = 0
	}
	if err := h.auth.SetAccountState(id, newState); err != nil {
		return serverError(c, "Не удалось изменить статус")
	}
	h.db.RecordAudit("ACCOUNT_TOGGLE", "success",
		"Аккаунт #"+itoa64(id)+" → "+map[bool]string{true: "активен", false: "отключён"}[newState == 1],
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "is_active": newState})
}

// DeleteAccount — удаление кода.
func (h *Admin) DeleteAccount(c *fiber.Ctx) error {
	id, _ := paramID(c)
	account, err := h.auth.AccountByID(id)
	if err != nil {
		return badRequest(c, "Аккаунт не найден")
	}
	if account.Role == models.RoleAdmin {
		var admins int
		_ = h.db.QueryRow(`SELECT COUNT(*) FROM v2_accounts WHERE role = 'admin' AND is_active = 1`).Scan(&admins)
		if admins <= 1 {
			return badRequest(c, "Нельзя удалить последнего администратора")
		}
	}
	if err := h.auth.DeleteAccount(id); err != nil {
		return serverError(c, "Не удалось удалить")
	}
	h.db.RecordAudit("ACCOUNT_DELETE", "success", "Аккаунт #"+itoa64(id)+" ("+account.Nickname+") удалён",
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}

// ResetCode — перевыпуск кода для существующего аккаунта.
func (h *Admin) ResetCode(c *fiber.Ctx) error {
	id, _ := paramID(c)
	account, err := h.auth.AccountByID(id)
	if err != nil {
		return badRequest(c, "Аккаунт не найден")
	}
	newCode := auth.GenerateCode()
	if _, err := h.db.Exec(`UPDATE v2_accounts SET code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, newCode, id); err != nil {
		return serverError(c, "Не удалось перевыпустить код")
	}
	h.db.RecordAudit("ACCOUNT_RECODE", "success",
		"Аккаунту #"+itoa64(id)+" ("+account.Nickname+") выдан новый код",
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "code": newCode})
}

func paramID(c *fiber.Ctx) (int64, error) {
	idStr := strings.TrimSpace(c.Params("id"))
	if idStr == "" {
		return 0, simpleErr("Некорректный id")
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		return 0, simpleErr("Некорректный id")
	}
	return id, nil
}
