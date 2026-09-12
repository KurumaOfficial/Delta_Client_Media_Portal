package payouts

import (
	"log"
	"time"
)

// Run — фоновый цикл недельного расписания: открывает новую неделю
// в понедельник 00:00 и закрывает старую в понедельник 23:00 с отчётом.
func (s *Service) Run() {
	s.tick() // сразу при старте
	for range time.Tick(time.Minute) {
		s.tick()
	}
}

func (s *Service) tick() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Payouts] scheduler panic: %v", r)
		}
	}()
	if s.WindowOpen() {
		if _, err := s.EnsureCurrentWeek(); err != nil {
			log.Printf("[Payouts] ensure week: %v", err)
		}
	}
	s.CloseDue()
}
