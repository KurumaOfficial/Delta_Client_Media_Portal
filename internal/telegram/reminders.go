package telegram

import (
	"log"
	"time"
)

// Окно ответов Telegram Business: бот может писать юзеру 24 часа после
// его последнего сообщения. За 5 минут до закрытия шлём напоминание.
const (
	businessWindow   = 24 * time.Hour
	nudgeLead        = 5 * time.Minute
	nudgeCheckPeriod = time.Minute
)

// WindowWatcher — фоновый цикл напоминаний о 24h-окне.
func (s *Service) WindowWatcher() {
	for range time.Tick(nudgeCheckPeriod) {
		s.checkWindows()
	}
}

func (s *Service) checkWindows() {
	rows, err := s.db.Query(`
		SELECT tg_user_id, username, business_chat_id, last_incoming_at, last_nudge_at
		FROM v2_tg_users
		WHERE business_chat_id != 0 AND last_incoming_at IS NOT NULL`)
	if err != nil {
		return
	}
	type row struct {
		tgUserID   int64
		username   string
		chatID     int64
		lastIncome time.Time
		lastNudge  *time.Time
	}
	var rowsData []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.tgUserID, &r.username, &r.chatID, &r.lastIncome, &r.lastNudge) == nil {
			rowsData = append(rowsData, r)
		}
	}
	rows.Close()

	biz := s.currentBusinessID()
	if biz == "" {
		return
	}
	now := time.Now()
	for _, r := range rowsData {
		deadline := r.lastIncome.Add(businessWindow - nudgeLead)
		if now.Before(deadline) {
			continue
		}
		if r.lastNudge != nil && !r.lastNudge.Before(r.lastIncome) {
			continue // уже напоминали после последнего сообщения
		}
		log.Printf("[TG Window] напоминание @%s: 24h-окно истекает", r.username)
		nudgeText := s.db.Setting("tg_window_nudge_text")
		if nudgeText == "" {
			nudgeText = "⏳ Напоминание: окно для ответов скоро закроется. Напиши любое сообщение, чтобы продлить его на 24 часа."
		}
		if err := s.cl.SendBusiness(biz, r.chatID, nudgeText); err == nil {
			_, _ = s.db.Exec(`UPDATE v2_tg_users SET last_nudge_at = ? WHERE tg_user_id = ?`, now, r.tgUserID)
		}
	}
}

// WindowState — состояние 24h-окна юзера для админ-панели.
type WindowState struct {
	Username   string     `json:"username"`
	TGUserID   int64      `json:"tg_user_id"`
	LastIncome *time.Time `json:"last_incoming_at"`
	LastNudge  *time.Time `json:"last_nudge_at"`
	Remaining  int        `json:"remaining_sec"` // <0 = истекло
}

// WindowStates — список состояний окон (админка подстраивается под таймеры).
func (s *Service) WindowStates() []WindowState {
	rows, err := s.db.Query(`
		SELECT username, tg_user_id, last_incoming_at, last_nudge_at
		FROM v2_tg_users WHERE business_chat_id != 0 AND last_incoming_at IS NOT NULL
		ORDER BY last_incoming_at DESC LIMIT 100`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	now := time.Now()
	list := make([]WindowState, 0, 8)
	for rows.Next() {
		var w WindowState
		if rows.Scan(&w.Username, &w.TGUserID, &w.LastIncome, &w.LastNudge) == nil && w.LastIncome != nil {
			w.Remaining = int(w.LastIncome.Add(businessWindow).Sub(now).Seconds())
			list = append(list, w)
		}
	}
	return list
}
