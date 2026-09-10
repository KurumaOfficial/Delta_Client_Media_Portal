package models

import "time"

// Роли аккаунтов. Код создаётся только в админ-панели.
const (
	RoleAdmin     = "admin"
	RoleModerator = "moderator"
	RoleMedia     = "media"
)

func RoleTitle(role string) string {
	switch role {
	case RoleAdmin:
		return "Администратор"
	case RoleModerator:
		return "Модератор"
	case RoleMedia:
		return "Медиа"
	}
	return role
}

type Account struct {
	ID        int64     `json:"id"`
	Code      string    `json:"code"`
	Role      string    `json:"role"`
	Nickname  string    `json:"nickname"`
	Telegram  string    `json:"telegram"`
	TGUserID  int64     `json:"tg_user_id"`
	IsActive  int       `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type Session struct {
	Account   Account `json:"account"`
	TokenHash string  `json:"-"`
	IP        string  `json:"ip"`
	GPS       string  `json:"gps"`
}

type LoginAttempt struct {
	ID        int64      `json:"id"`
	Token     string     `json:"token"`
	AccountID int64      `json:"account_id"`
	IP        string     `json:"ip"`
	GPS       string     `json:"gps"`
	Status    string     `json:"status"` // pending | approved | denied | expired
	CreatedAt time.Time  `json:"created_at"`
	DecidedAt *time.Time `json:"decided_at,omitempty"`
}
