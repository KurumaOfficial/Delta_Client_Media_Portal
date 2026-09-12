package models

import (
	"strconv"
	"strings"
	"time"
)

// Виды кабинетных заявок (единая недельная таблица «медиа выплаты»).
const (
	KindPayout       = "payout"       // заявка на выплату за снятые видео (медиа)
	KindLot          = "lot"          // заявка на лот (медиа)
	KindSubscription = "subscription" // запрос подписки (фримедиа)
	KindGiveaway     = "giveaway"     // заявка на ключ для розыгрыша (медиа)
	KindIdea         = "idea"         // идея / предложение
	KindBug          = "bug"          // сообщение о баге / ошибке
)

const (
	MethodUSDT   = "usdt"
	MethodFunPay = "funpay"
)

// Week — недельный цикл приёма выплат (пн 00:00 → пн 23:00).
type Week struct {
	ID          int64     `json:"id"`
	Label       string    `json:"label"` // «неделя с 17.08.26 до 24.08.26»
	OpensAt     time.Time `json:"opens_at"`
	ClosesAt    time.Time `json:"closes_at"`
	IsCurrent   bool      `json:"is_current"`
	SummaryText string    `json:"summary_text"`
	ReportText  string    `json:"report_text"`
	CreatedAt   time.Time `json:"created_at"`
}

// Request — выплата/лот/подписка внутри недели.
type Request struct {
	ID              int64      `json:"id"`
	WeekID          int64      `json:"week_id"`
	Kind            string     `json:"kind"`
	Source          string     `json:"source"` // cabinet | telegram
	AccountID       int64      `json:"account_id"`
	Nickname        string     `json:"nickname"`
	Telegram        string     `json:"telegram"`
	TGUserID        int64      `json:"tg_user_id"`
	UID             string     `json:"uid"`
	Duration        string     `json:"duration"`
	Want            string     `json:"want"`
	Amount          string     `json:"amount"`
	Method          string     `json:"method"`
	Platform        string     `json:"platform"`
	ChannelURL      string     `json:"channel_url"`
	LotURL          string     `json:"lot_url"`
	Status          string     `json:"status"`
	DecisionComment string     `json:"decision_comment"`
	TXRef           string     `json:"tx_ref"`
	CreatedAt       time.Time  `json:"created_at"`
	DecidedAt       *time.Time `json:"decided_at,omitempty"`
	Title           string     `json:"title,omitempty"`
	ProofFiles      string     `json:"proof_files,omitempty"`
	ProofLink       string     `json:"proof_link,omitempty"`
	PromoCode       string     `json:"promo_code,omitempty"`
}

// Replace подставляет поля заявки (и extra) в шаблон текста.
func (r Request) Replace(template string, extra map[string]string) string {
	repl := map[string]string{
		"{id}": strconv.FormatInt(r.ID, 10), "{uid}": r.UID,
		"{nickname}": r.Nickname, "{telegram}": r.Telegram,
		"{amount}": r.Amount, "{lot_url}": r.LotURL,
		"{want}": r.Want, "{duration}": r.Duration,
	}
	for k, v := range extra {
		repl[k] = v
	}
	return strings.NewReplacer(mapToPairs(repl)...).Replace(template)
}

func mapToPairs(m map[string]string) []string {
	pairs := make([]string, 0, len(m)*2)
	for k, v := range m {
		pairs = append(pairs, k, v)
	}
	return pairs
}

// SubscriptionKey — ключ подписки или розыгрыша в пуле выдачи.
type SubscriptionKey struct {
	ID                int64      `json:"id"`
	Category          string     `json:"category"` // "sub" или "giveaway"
	KeyCode           string     `json:"key_code"`
	IsUsed            bool       `json:"is_used"`
	UsedAt            *time.Time `json:"used_at,omitempty"`
	AssignedRequestID int64      `json:"assigned_request_id"`
	AssignedAccountID int64      `json:"assigned_account_id"`
	AssignedTo        string     `json:"assigned_to"`
	CreatedAt         time.Time  `json:"created_at"`
}

