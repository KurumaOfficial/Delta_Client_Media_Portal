package models

import "time"

// Типы банов: IP, ссылки на каналы YT/TT, телеграм юзера и UID игрока.
const (
	BanIP       = "ip"
	BanYouTube  = "youtube"
	BanTikTok   = "tiktok"
	BanTelegram = "telegram"
	BanUID      = "uid"
	BanDiscord  = "discord"
)

func BanTypeTitle(t string) string {
	switch t {
	case BanIP:
		return "IP-адрес"
	case BanYouTube:
		return "YouTube"
	case BanTikTok:
		return "TikTok"
	case BanTelegram:
		return "Telegram"
	case BanUID:
		return "UID"
	case BanDiscord:
		return "Discord"
	}
	return t
}

type Ban struct {
	ID        int64     `json:"id"`
	Channel   string    `json:"channel"`
	UID       string    `json:"uid"`
	Telegram  string    `json:"telegram"`
	Discord   string    `json:"discord"`
	IP        string    `json:"ip"`
	Reason    string    `json:"reason"`
	BannedBy  string    `json:"banned_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AuditLog struct {
	ID        int64     `json:"id"`
	EventType string    `json:"event_type"`
	Status    string    `json:"status"`
	Details   string    `json:"details"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}
