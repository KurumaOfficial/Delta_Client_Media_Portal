package payouts

import (
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"dmr/internal/database"
	"dmr/internal/models"
)

// Service — недельный цикл выплат: вт 01:00 → пн 22:00 (зона WEEK_TZ).
// Каждая неделя — строка v2_weeks с человекочитаемой меткой, заявки
// привязаны к неделе, поэтому история прошлых недель остаётся в БД.
type Service struct {
	db *database.DB
	tz *time.Location

	// OnWeekClosed вызывается при закрытии недели (уведомление админу).
	OnWeekClosed func(week models.Week, report string)
}

func NewService(db *database.DB, tz *time.Location) *Service {
	return &Service{db: db, tz: tz}
}

// currentWindow: последний вторник 01:00 <= now; закрытие — пн 22:00.
func (s *Service) currentWindow(now time.Time) (time.Time, time.Time, bool) {
	now = now.In(s.tz)
	candidate := time.Date(now.Year(), now.Month(), now.Day(), 1, 0, 0, 0, s.tz)
	for i := 0; i < 9; i++ {
		if candidate.Weekday() == time.Tuesday && !candidate.After(now) {
			closes := candidate.Add(6*24*time.Hour + 21*time.Hour)
			return candidate, closes, now.Before(closes)
		}
		candidate = candidate.AddDate(0, 0, -1)
	}
	return time.Time{}, time.Time{}, false
}

func weekLabel(opens, closes time.Time) string {
	return fmt.Sprintf("неделя с %s до %s", opens.Format("02.01.06"), closes.Format("02.01.06"))
}

func (s *Service) scanWeek(row *sql.Row) (models.Week, error) {
	var w models.Week
	err := row.Scan(&w.ID, &w.Label, &w.OpensAt, &w.ClosesAt, &w.IsCurrent)
	return w, err
}

// EnsureCurrentWeek возвращает строку текущей недели, создавая её при необходимости.
func (s *Service) EnsureCurrentWeek() (models.Week, error) {
	opens, closes, open := s.currentWindow(time.Now())
	if !open {
		s.CloseDue()
		return models.Week{}, sql.ErrNoRows
	}
	w, err := s.scanWeek(s.db.QueryRow(
		`SELECT id, label, opens_at, closes_at, is_current FROM v2_weeks WHERE opens_at = ?`, opens))
	if err == nil {
		if !w.IsCurrent {
			_, _ = s.db.Exec(`UPDATE v2_weeks SET is_current = 1 WHERE id = ?`, w.ID)
			w.IsCurrent = true
		}
		return w, nil
	}

	label := weekLabel(opens, closes)
	id, err := s.db.InsertReturningID(
		`INSERT INTO v2_weeks (label, opens_at, closes_at, is_current) VALUES (?, ?, ?, 1)`,
		label, opens, closes)
	if err != nil {
		return models.Week{}, err
	}
	log.Printf("[Payouts] Открыта новая неделя: %s (id %d)", label, id)
	s.CloseDue()
	return models.Week{ID: id, Label: label, OpensAt: opens, ClosesAt: closes, IsCurrent: true}, nil
}

// WindowOpen — принимает ли бот заявки прямо сейчас.
func (s *Service) WindowOpen() bool {
	_, err := s.EnsureCurrentWeek()
	return err == nil
}

// WeekLabel текущей недели (для сообщений бота).
func (s *Service) WeekLabel() string {
	w, err := s.EnsureCurrentWeek()
	if err != nil {
		return "приём закрыт"
	}
	return w.Label
}

// CloseDue закрывает просроченные недели и генерирует отчёты.
func (s *Service) CloseDue() {
	rows, err := s.db.SQL.Query(
		`SELECT id, label FROM v2_weeks WHERE is_current = 1 AND closes_at <= ?`, time.Now())
	if err != nil {
		return
	}
	type due struct {
		id    int64
		label string
	}
	var list []due
	for rows.Next() {
		var d due
		if rows.Scan(&d.id, &d.label) == nil {
			list = append(list, d)
		}
	}
	rows.Close()

	for _, d := range list {
		report := s.BuildReport(d.id)
		_, _ = s.db.Exec(`UPDATE v2_weeks SET is_current = 0, report_text = ? WHERE id = ?`, report, d.id)
		log.Printf("[Payouts] Неделя закрыта: %s", d.label)
		if s.OnWeekClosed != nil {
			s.OnWeekClosed(models.Week{ID: d.id, Label: d.label}, report)
		}
	}
}

// Stats — агрегаты недели (в Go, чтобы не зависеть от диалекта CAST).
type Stats struct {
	Total     int     `json:"total"`
	Pending   int     `json:"pending"`
	Approved  int     `json:"approved"`
	Rejected  int     `json:"rejected"`
	USDTTotal float64 `json:"usdt_total"`
	FunPay    int     `json:"funpay_count"`
}

func (s *Service) Stats(weekID int64) Stats {
	rows, err := s.db.SQL.Query(
		`SELECT status, method, amount FROM v2_requests WHERE week_id = ?`, weekID)
	if err != nil {
		return Stats{}
	}
	defer rows.Close()

	st := Stats{}
	for rows.Next() {
		var status, method, amount string
		if rows.Scan(&status, &method, &amount) != nil {
			continue
		}
		st.Total++
		switch status {
		case "pending":
			st.Pending++
		case "approved":
			st.Approved++
			if method == models.MethodUSDT {
				if v, err := strconv.ParseFloat(strings.ReplaceAll(amount, ",", "."), 64); err == nil {
					st.USDTTotal += v
				}
			}
		case "rejected":
			st.Rejected++
		}
		if method == models.MethodFunPay {
			st.FunPay++
		}
	}
	return st
}

// BuildReport — полный отчёт недели по редактируемому шаблону.
func (s *Service) BuildReport(weekID int64) string {
	var label string
	_ = s.db.QueryRow(`SELECT label FROM v2_weeks WHERE id = ?`, weekID).Scan(&label)
	st := s.Stats(weekID)
	r := strings.NewReplacer(
		"{week}", label,
		"{total}", strconv.Itoa(st.Total),
		"{pending}", strconv.Itoa(st.Pending),
		"{approved}", strconv.Itoa(st.Approved),
		"{rejected}", strconv.Itoa(st.Rejected),
		"{usdt_total}", fmt.Sprintf("%.2f", st.USDTTotal),
		"{funpay_count}", strconv.Itoa(st.FunPay),
	)
	return r.Replace(s.db.Setting("week_summary_template"))
}
