package telegram

import (
	"strings"
	"time"
)

// mapUser — upsert пользователя в v2_tg_users и привязка к аккаунту по @username.
func (s *Service) mapUser(u User, chatID int64, business bool) {
	if u.ID == 0 {
		return
	}
	username := strings.ToLower(strings.TrimPrefix(u.Username, "@"))

	var existing int64
	err := s.db.QueryRow(`SELECT id FROM v2_tg_users WHERE tg_user_id = ?`, u.ID).Scan(&existing)
	if err != nil {
		_, _ = s.db.Exec(
			`INSERT INTO v2_tg_users (tg_user_id, username, chat_id, business_chat_id, last_incoming_at)
			 VALUES (?, ?, ?, ?, ?)`,
			u.ID, username, chatID, boolToInt64(business)*chatID, time.Now())
	} else {
		if business {
			_, _ = s.db.Exec(`UPDATE v2_tg_users SET username = ?, business_chat_id = ?, chat_id = ? WHERE tg_user_id = ?`,
				username, chatID, chatID, u.ID)
		} else {
			_, _ = s.db.Exec(`UPDATE v2_tg_users SET username = ?, chat_id = ? WHERE tg_user_id = ?`,
				username, chatID, u.ID)
		}
	}
	if username != "" {
		_ = s.authLink(username, u.ID)
	}
}

func (s *Service) authLink(username string, tgUserID int64) error {
	// привязка tg_user_id к аккаунту с этим @telegram
	_, err := s.db.Exec(
		`UPDATE v2_accounts SET tg_user_id = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE LOWER(LTRIM(telegram, '@')) = ?`,
		tgUserID, username)
	return err
}

// trackIncoming обновляет время последнего сообщения (для 24h-окна бизнес-чата).
func (s *Service) trackIncoming(tgUserID int64) {
	_, _ = s.db.Exec(`UPDATE v2_tg_users SET last_incoming_at = ? WHERE tg_user_id = ?`, time.Now(), tgUserID)
}

func boolToInt64(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// escapeHTML экранирует пользовательский текст для parse_mode=HTML.
func escapeHTML(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}
