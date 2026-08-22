package bans

import (
	"fmt"
	"log"
	"net"
	"strings"
	"sync"

	"dmr/internal/database"
	"dmr/internal/models"
)

// Service — банлист с in-memory кэшем. Поддерживает точные IP и CIDR-подсети,
// ссылки каналов YouTube/TikTok, Telegram-юзеры и UID игроков.
type Service struct {
	db     *database.DB
	mu     sync.RWMutex
	exact  map[string]models.Ban // "type:value" -> ban (нормализованные)
	cidrs  []*net.IPNet          // подсети из ip-банов
	banned bool
}

func NewService(db *database.DB) *Service {
	s := &Service{db: db}
	if err := s.Reload(); err != nil {
		log.Printf("[Bans] initial load failed: %v", err)
	}
	return s
}

func normalizeValue(btype, value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch btype {
	case models.BanTelegram:
		return strings.TrimPrefix(v, "@")
	case models.BanYouTube, models.BanTikTok:
		v = strings.TrimPrefix(v, "https://")
		v = strings.TrimPrefix(v, "http://")
		v = strings.TrimPrefix(v, "www.")
		return strings.TrimSuffix(v, "/")
	default:
		return v
	}
}

func (s *Service) Reload() error {
	rows, err := s.db.SQL.Query(`SELECT id, btype, value, reason, banned_by FROM v2_bans`)
	if err != nil {
		return err
	}
	defer rows.Close()

	exact := make(map[string]models.Ban)
	var cidrs []*net.IPNet
	for rows.Next() {
		var b models.Ban
		if err := rows.Scan(&b.ID, &b.BType, &b.Value, &b.Reason, &b.BannedBy); err != nil {
			continue
		}
		if b.BType == models.BanIP {
			if strings.Contains(b.Value, "/") {
				if _, network, err := net.ParseCIDR(b.Value); err == nil {
					cidrs = append(cidrs, network)
					continue
				}
			}
			if net.ParseIP(b.Value) == nil {
				continue // мусорные записи пропускаем
			}
		}
		exact[b.BType+":"+normalizeValue(b.BType, b.Value)] = b
	}

	s.mu.Lock()
	s.exact = exact
	s.cidrs = cidrs
	s.mu.Unlock()
	log.Printf("[Bans] Loaded %d exact + %d CIDR bans", len(exact), len(cidrs))
	return nil
}

// IsIPBanned — проверка IP (точно + подсети).
func (s *Service) IsIPBanned(ip string) bool {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return false
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.exact[models.BanIP+":"+ip]; ok {
		return true
	}
	for _, network := range s.cidrs {
		if network.Contains(parsed) {
			return true
		}
	}
	return false
}

// Banned проверяет значение по типу (youtube|tiktok|telegram|uid).
func (s *Service) Banned(btype, value string) (models.Ban, bool) {
	key := btype + ":" + normalizeValue(btype, value)
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.exact[key]
	return b, ok
}

// BanReasonOfIP возвращает причину, если IP забанен.
func (s *Service) BanReasonOfIP(ip string) string {
	ip = strings.TrimSpace(ip)
	parsed := net.ParseIP(ip)
	s.mu.RLock()
	defer s.mu.RUnlock()
	if b, ok := s.exact[models.BanIP+":"+ip]; ok {
		return b.Reason
	}
	for _, network := range s.cidrs {
		if network.Contains(parsed) {
			for _, b := range s.exact {
				if b.BType == models.BanIP && strings.HasPrefix(b.Value, network.String()) {
					return b.Reason
				}
			}
			return "Заблокированная подсеть"
		}
	}
	return ""
}

func (s *Service) Add(btype, value, reason, bannedBy string) error {
	value = strings.TrimSpace(value)
	if btype == models.BanIP {
		if strings.Contains(value, "/") {
			if _, _, err := net.ParseCIDR(value); err != nil {
				return fmt.Errorf("неверная CIDR-подсеть: %s", value)
			}
		} else if net.ParseIP(value) == nil {
			return fmt.Errorf("неверный IP-адрес: %s", value)
		}
	}
	if value == "" {
		return fmt.Errorf("пустое значение бана")
	}
	_, err := s.db.Exec(
		`INSERT INTO v2_bans (btype, value, reason, banned_by) VALUES (?, ?, ?, ?)`,
		btype, value, reason, bannedBy,
	)
	if err != nil {
		return err
	}
	return s.Reload()
}

func (s *Service) Remove(id int64) error {
	_, err := s.db.Exec(`DELETE FROM v2_bans WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return s.Reload()
}

func (s *Service) List() ([]models.Ban, error) {
	rows, err := s.db.SQL.Query(`SELECT id, btype, value, reason, banned_by, created_at FROM v2_bans ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]models.Ban, 0, 16)
	for rows.Next() {
		var b models.Ban
		if err := rows.Scan(&b.ID, &b.BType, &b.Value, &b.Reason, &b.BannedBy, &b.CreatedAt); err == nil {
			list = append(list, b)
		}
	}
	return list, nil
}
