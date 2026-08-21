package models

import (
	"time"
)

type MediaApplication struct {
	ID             int64     `json:"id"`
	Lang           string    `json:"lang"`
	UID            string    `json:"uid,omitempty"`
	CriteriaAgreed bool      `json:"criteria_agreed"`
	Platform      string     `json:"platform"`
	ChannelURL    string     `json:"channel_url"`
	Servers       string     `json:"servers"`
	VideosPerWeek string     `json:"videos_per_week,omitempty"`
	Collaborations string    `json:"collaborations,omitempty"`
	WhyJoin       string     `json:"why_join"`
	Exclusive     string     `json:"exclusive"`
	Telegram      string     `json:"telegram"`
	IPAddress     string     `json:"ip_address,omitempty"`
	TurnstileToken string   `json:"turnstile_token,omitempty"`
	Status        string     `json:"status"`
	AdminComment  string     `json:"admin_comment,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type HWIDResetRequest struct {
	ID           int64     `json:"id"`
	Lang         string    `json:"lang"`
	ModNickname  string    `json:"mod_nickname"`
	ModKey       string    `json:"mod_key"`
	UUID         string    `json:"uuid"`
	ProofType    string    `json:"proof_type"`
	ProofFile    string    `json:"proof_file,omitempty"`
	ProofLink    string    `json:"proof_link,omitempty"`
	Reason       string    `json:"reason"`
	Status       string    `json:"status"`
	AdminComment string    `json:"admin_comment,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type DiscordBanRequest struct {
	ID           int64     `json:"id"`
	Lang         string    `json:"lang"`
	ModNickname  string    `json:"mod_nickname"`
	ModKey       string    `json:"mod_key"`
	OffenderID   string    `json:"offender_id"`
	ProofType    string    `json:"proof_type"`
	ProofFile    string    `json:"proof_file,omitempty"`
	ProofLink    string    `json:"proof_link,omitempty"`
	Reason       string    `json:"reason"`
	Status       string    `json:"status"`
	AdminComment string    `json:"admin_comment,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type ModeratorKey struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Nickname  string    `json:"nickname"`
	Telegram  string    `json:"telegram,omitempty"`
	IsActive  int       `json:"is_active"` // 1=Active, 2=Frozen, 0=Disabled
	CreatedAt time.Time `json:"created_at"`
}

type AuditLog struct {
	ID        int64     `json:"id"`
	EventType string    `json:"event_type"`
	Status    string    `json:"status"`
	Details   string    `json:"details"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type StatusUpdateRequest struct {
	Status       string `json:"status"`
	AdminComment string `json:"admin_comment"`
}
