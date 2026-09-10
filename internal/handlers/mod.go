package handlers

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/auth"
	"dmr/internal/bans"
	"dmr/internal/database"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/telegram"
	"dmr/internal/validation"
)

// Mod — кабинетные формы модераторов: сброс HWID и Discord-баны.
type Mod struct {
	db   *database.DB
	tg   *telegram.Service
	bans *bans.Service
}

func NewMod(db *database.DB, tg *telegram.Service, banSvc *bans.Service) *Mod {
	return &Mod{db: db, tg: tg, bans: banSvc}
}

// parseProof собирает доказательства: путь чанковой загрузки и/или ссылка.
func parseProof(c *fiber.Ctx) (files, link string, err error) {
	link, _ = validation.AnyURL(c.FormValue("proof_link"))
	var list []string
	for _, p := range strings.Split(c.FormValue("proof_file_paths"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			list = append(list, p)
		}
	}
	return strings.Join(list, ","), link, nil
}

// SubmitHWID — заявка на сброс HWID (роль moderator).
func (h *Mod) SubmitHWID(c *fiber.Ctx) error {
	account, _ := auth.AccountOf(c)

	uid, ok := validation.UID(c.FormValue("uuid"))
	if !ok {
		return badRequest(c, "Укажите корректный UID пользователя")
	}
	reason := validation.MultiLine(c.FormValue("reason"), 500)
	if len([]rune(reason)) < 5 {
		return badRequest(c, "Укажите причину (минимум 5 символов)")
	}
	files, link, _ := parseProof(c)
	if files == "" && link == "" {
		return badRequest(c, "Приложите доказательство: файл(ы) или ссылку")
	}
	if b, banned := h.bans.Banned(models.BanUID, uid); banned {
		return banHit(c, b)
	}

	proofType := "both"
	if link == "" {
		proofType = "file"
	} else if files == "" {
		proofType = "link"
	}

	id, err := h.db.InsertReturningID(`
		INSERT INTO v2_hwid_requests (account_id, mod_nickname, uuid, proof_type, proof_file, proof_link, reason)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		account.ID, account.Nickname, uid, proofType, files, link, reason)
	if err != nil {
		return serverError(c, "Не удалось сохранить заявку")
	}

	// Уведомление в Telegram для HWID отключено по требованию
	h.db.RecordAudit("HWID_SUBMIT", "success",
		"HWID #"+itoa64(id)+" от "+account.Nickname+" (UID "+uid+")",
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id})
}

// SubmitDiscord — заявка на Discord-бан (роль moderator).
func (h *Mod) SubmitDiscord(c *fiber.Ctx) error {
	account, _ := auth.AccountOf(c)

	offender, ok := validation.DiscordID(c.FormValue("offender_id"))
	if !ok {
		return badRequest(c, "Укажите ID или @username нарушителя")
	}
	reason := validation.MultiLine(c.FormValue("reason"), 500)
	if len([]rune(reason)) < 5 {
		return badRequest(c, "Укажите причину (минимум 5 символов)")
	}
	files, link, _ := parseProof(c)
	if files == "" && link == "" {
		return badRequest(c, "Приложите доказательство: файл(ы) или ссылку")
	}

	proofType := "both"
	if link == "" {
		proofType = "file"
	} else if files == "" {
		proofType = "link"
	}

	id, err := h.db.InsertReturningID(`
		INSERT INTO v2_discord_bans (account_id, mod_nickname, offender_id, proof_type, proof_file, proof_link, reason)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		account.ID, account.Nickname, offender, proofType, files, link, reason)
	if err != nil {
		return serverError(c, "Не удалось сохранить заявку")
	}

	h.tg.NotifyDiscordBan(models.DiscordBan{ID: id, ModNickname: account.Nickname, OffenderID: offender,
		ProofFile: files, ProofLink: link, Reason: reason})
	h.db.RecordAudit("BAN_SUBMIT", "success",
		"Discord-бан #"+itoa64(id)+" от "+account.Nickname+" ("+offender+")",
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true, "id": id})
}

// MyRequests — история заявок модератора (Discord).
func (h *Mod) MyRequests(c *fiber.Ctx) error {
	account, _ := auth.AccountOf(c)
	rows, err := h.db.Query(`
		SELECT 'discord' as kind, id, offender_id as target, proof_type, proof_file, proof_link, reason, status, admin_comment, created_at
		FROM v2_discord_bans WHERE account_id = ? OR mod_nickname = ?
		ORDER BY created_at DESC LIMIT 100`, account.ID, account.Nickname)
	if err != nil {
		return serverError(c, "Не удалось загрузить заявки")
	}
	defer rows.Close()

	type ModReqItem struct {
		Kind         string `json:"kind"`
		ID           int64  `json:"id"`
		Target       string `json:"target"`
		ProofType    string `json:"proof_type"`
		ProofFile    string `json:"proof_file"`
		ProofLink    string `json:"proof_link"`
		Reason       string `json:"reason"`
		Status       string `json:"status"`
		AdminComment string `json:"admin_comment"`
		CreatedAt    string `json:"created_at"`
	}

	list := make([]ModReqItem, 0, 16)
	for rows.Next() {
		var item ModReqItem
		var t interface{}
		if err := rows.Scan(&item.Kind, &item.ID, &item.Target, &item.ProofType, &item.ProofFile,
			&item.ProofLink, &item.Reason, &item.Status, &item.AdminComment, &t); err == nil {
			switch val := t.(type) {
			case time.Time:
				item.CreatedAt = val.Format(time.RFC3339)
			case string:
				item.CreatedAt = val
			case []byte:
				item.CreatedAt = string(val)
			}
			list = append(list, item)
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": list})
}
