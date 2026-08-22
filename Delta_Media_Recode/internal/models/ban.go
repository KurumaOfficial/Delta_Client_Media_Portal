package models

import "time"

// Типы банов: IP, ссылки на каналы YT/TT, телеграм юзера и UID игрока.
const (
	BanIP       = "ip"
	BanYouTube  = "youtube"
	BanTikTok   = "tiktok"
	BanTelegram = "telegram"
	BanUID      = "uid"
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
	}
	return t
}

type Ban struct {
	ID        int64     `json:"id"`
	BType     string    `json:"btype"`
	Value     string    `json:"value"`
	Reason    string    `json:"reason"`
	BannedBy  string    `json:"banned_by"`
	CreatedAt time.Time `json:"created_at"`
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
