package models

import "time"

// MediaApp — публичная заявка на вступление в медиа (сохранённый функционал V1).
type MediaApp struct {
	ID             int64     `json:"id"`
	Lang           string    `json:"lang"`
	UID            string    `json:"uid"`
	CriteriaAgreed bool      `json:"criteria_agreed"`
	Platform       string    `json:"platform"` // youtube | tiktok
	ChannelURL     string    `json:"channel_url"`
	Servers        string    `json:"servers"`
	VideosPerWeek  string    `json:"videos_per_week,omitempty"`
	Collaborations string    `json:"collaborations,omitempty"`
	WhyJoin        string    `json:"why_join"`
	Exclusive      string    `json:"exclusive"`
	Telegram       string    `json:"telegram"`
	Status         string    `json:"status"`
	AdminComment   string    `json:"admin_comment,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// HWIDRequest — заявка модератора на сброс HWID.
type HWIDRequest struct {
	ID           int64     `json:"id"`
	ModNickname  string    `json:"mod_nickname"`
	UUID         string    `json:"uuid"`
	ProofType    string    `json:"proof_type"`
	ProofFile    string    `json:"proof_file,omitempty"`
	ProofLink    string    `json:"proof_link,omitempty"`
	Reason       string    `json:"reason"`
	Status       string    `json:"status"`
	AdminComment string    `json:"admin_comment,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// DiscordBan — заявка модератора на Discord-бан.
type DiscordBan struct {
	ID           int64     `json:"id"`
	ModNickname  string    `json:"mod_nickname"`
	OffenderID   string    `json:"offender_id"`
	ProofType    string    `json:"proof_type"`
	ProofFile    string    `json:"proof_file,omitempty"`
	ProofLink    string    `json:"proof_link,omitempty"`
	Reason       string    `json:"reason"`
	Status       string    `json:"status"`
	AdminComment string    `json:"admin_comment,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// StatusUpdate — тело запроса смены статуса из админки/ТГ.
type StatusUpdate struct {
	Status       string `json:"status"`
	AdminComment string `json:"admin_comment"`
}

// IdeaBug — обращение в разделе «Идеи и баги».
type IdeaBug struct {
	ID           int64     `json:"id"`
	AccountID    int64     `json:"account_id"`
	Nickname     string    `json:"nickname"`
	Role         string    `json:"role"`
	Category     string    `json:"category"` // "idea" | "bug"
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	ProofFiles   string    `json:"proof_files,omitempty"`
	ProofLink    string    `json:"proof_link,omitempty"`
	Status       string    `json:"status"`
	AdminComment string    `json:"admin_comment,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
