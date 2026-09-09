package bans

import (
	"database/sql"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"

	"dmr/internal/database"
	"dmr/internal/models"
)

type cidrBan struct {
	network *net.IPNet
	ban     models.Ban
}

// Service — банлист с in-memory кэшем для всех типов идентификаторов:
// YouTube/TikTok каналы, Telegram юзернеймы, UID пользователей, Discord аккаунты,
// IP-адреса и CIDR-подсети.
type Service struct {
	db          *database.DB
	mu          sync.RWMutex
	list        []models.Ban
	byChan      map[string]models.Ban // normalized channel -> ban
	byUID       map[string]models.Ban // normalized uid -> ban
	byTG        map[string]models.Ban // normalized tg -> ban
	byDC        map[string]models.Ban // normalized discord -> ban
	byIP        map[string]models.Ban // normalized ip -> ban
	cidrs       []cidrBan             // подсети
	hasLoopback bool                  // флаг блокировки локального адреса (127.0.0.1 / ::1)
}

func NewService(db *database.DB) *Service {
	s := &Service{db: db}
	if err := s.Reload(); err != nil {
		log.Printf("[Bans] initial load failed: %v", err)
	}
	return s
}

func normalizeChannel(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = strings.TrimPrefix(v, "https://")
	v = strings.TrimPrefix(v, "http://")
	v = strings.TrimPrefix(v, "www.")
	return strings.TrimSuffix(v, "/")
}

func normalizeTelegram(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	return strings.TrimPrefix(v, "@")
}

func normalizeIP(raw string) string {
	raw = strings.TrimSpace(raw)
	if h, _, err := net.SplitHostPort(raw); err == nil {
		raw = h
	}
	parsed := net.ParseIP(raw)
	if parsed == nil {
		return raw
	}
	if ipv4 := parsed.To4(); ipv4 != nil {
		return ipv4.String()
	}
	return parsed.String()
}

func (s *Service) Reload() error {
	rows, err := s.db.Query(`
		SELECT id, channel, uid, telegram, discord, ip, reason, banned_by, created_at, updated_at
		FROM v2_bans ORDER BY id DESC
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	byChan := make(map[string]models.Ban)
	byUID := make(map[string]models.Ban)
	byTG := make(map[string]models.Ban)
	byDC := make(map[string]models.Ban)
	byIP := make(map[string]models.Ban)
	var cidrs []cidrBan
	var list []models.Ban
	hasLoopback := false

	for rows.Next() {
		var b models.Ban
		var updatedAt sql.NullTime
		if err := rows.Scan(&b.ID, &b.Channel, &b.UID, &b.Telegram, &b.Discord, &b.IP, &b.Reason, &b.BannedBy, &b.CreatedAt, &updatedAt); err != nil {
			continue
		}
		if updatedAt.Valid {
			b.UpdatedAt = updatedAt.Time
		} else {
			b.UpdatedAt = b.CreatedAt
		}

		if b.Channel != "" {
			byChan[normalizeChannel(b.Channel)] = b
		}
		if b.UID != "" {
			byUID[strings.ToLower(strings.TrimSpace(b.UID))] = b
		}
		if b.Telegram != "" {
			byTG[normalizeTelegram(b.Telegram)] = b
		}
		if b.Discord != "" {
			byDC[strings.ToLower(strings.TrimSpace(b.Discord))] = b
		}
		if b.IP != "" {
			cleanIP := strings.TrimSpace(b.IP)
			if strings.Contains(cleanIP, "/") {
				if _, network, err := net.ParseCIDR(cleanIP); err == nil {
					cidrs = append(cidrs, cidrBan{network: network, ban: b})
				}
			} else {
				host := cleanIP
				if h, _, err := net.SplitHostPort(cleanIP); err == nil {
					host = h
				}
				if parsed := net.ParseIP(host); parsed != nil {
					if parsed.IsLoopback() {
						hasLoopback = true
						byIP["127.0.0.1"] = b
						byIP["::1"] = b
					} else {
						byIP[normalizeIP(host)] = b
					}
				}
			}
		}
		list = append(list, b)
	}

	s.mu.Lock()
	s.list = list
	s.byChan = byChan
	s.byUID = byUID
	s.byTG = byTG
	s.byDC = byDC
	s.byIP = byIP
	s.cidrs = cidrs
	s.hasLoopback = hasLoopback
	s.mu.Unlock()

	log.Printf("[Bans] Loaded %d grouped bans (IPs: %d, CIDRs: %d, Channels: %d, TG: %d, UIDs: %d)",
		len(list), len(byIP), len(cidrs), len(byChan), len(byTG), len(byUID))
	return nil
}

// IsIPBanned — проверка IP (точно + подсети + loopback).
func (s *Service) IsIPBanned(rawIP string) bool {
	rawIP = strings.TrimSpace(rawIP)
	if rawIP == "" {
		return false
	}
	host := rawIP
	if h, _, err := net.SplitHostPort(rawIP); err == nil {
		host = h
	}
	parsed := net.ParseIP(host)
	if parsed == nil {
		return false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if parsed.IsLoopback() && s.hasLoopback {
		return true
	}
	norm := normalizeIP(host)
	if _, ok := s.byIP[norm]; ok {
		return true
	}
	for _, c := range s.cidrs {
		if c.network.Contains(parsed) {
			return true
		}
	}
	return false
}

// BanReasonOfIP возвращает причину блокировки IP-адреса.
func (s *Service) BanReasonOfIP(rawIP string) string {
	rawIP = strings.TrimSpace(rawIP)
	if rawIP == "" {
		return ""
	}
	host := rawIP
	if h, _, err := net.SplitHostPort(rawIP); err == nil {
		host = h
	}
	parsed := net.ParseIP(host)
	if parsed == nil {
		return ""
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	norm := normalizeIP(host)
	if b, ok := s.byIP[norm]; ok {
		return b.Reason
	}
	for _, c := range s.cidrs {
		if c.network.Contains(parsed) {
			if c.ban.Reason != "" {
				return c.ban.Reason
			}
			return "Заблокированная подсеть"
		}
	}
	if parsed.IsLoopback() && s.hasLoopback {
		if b, ok := s.byIP["127.0.0.1"]; ok {
			return b.Reason
		}
		if b, ok := s.byIP["::1"]; ok {
			return b.Reason
		}
	}
	return ""
}

// Banned проверяет значение по типу (youtube|tiktok|telegram|uid|discord|ip).
func (s *Service) Banned(btype, value string) (models.Ban, bool) {
	val := strings.TrimSpace(value)
	if val == "" {
		return models.Ban{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	switch btype {
	case models.BanYouTube, models.BanTikTok, "channel":
		b, ok := s.byChan[normalizeChannel(val)]
		return b, ok
	case models.BanTelegram:
		b, ok := s.byTG[normalizeTelegram(val)]
		return b, ok
	case models.BanUID:
		b, ok := s.byUID[strings.ToLower(val)]
		return b, ok
	case models.BanDiscord:
		b, ok := s.byDC[strings.ToLower(val)]
		return b, ok
	case models.BanIP:
		host := val
		if h, _, err := net.SplitHostPort(val); err == nil {
			host = h
		}
		parsed := net.ParseIP(host)
		if parsed != nil {
			if parsed.IsLoopback() && s.hasLoopback {
				if b, ok := s.byIP["127.0.0.1"]; ok {
					return b, true
				}
				if b, ok := s.byIP["::1"]; ok {
					return b, true
				}
			}
			norm := normalizeIP(host)
			if b, ok := s.byIP[norm]; ok {
				return b, true
			}
			for _, c := range s.cidrs {
				if c.network.Contains(parsed) {
					return c.ban, true
				}
			}
		}
	}
	return models.Ban{}, false
}

// CheckFields проверяет совпадение по всем переданным полям.
func (s *Service) CheckFields(channel, uid, tg, dc, ip string) (models.Ban, bool) {
	if channel != "" {
		if b, ok := s.Banned(models.BanYouTube, channel); ok {
			return b, true
		}
	}
	if uid != "" {
		if b, ok := s.Banned(models.BanUID, uid); ok {
			return b, true
		}
	}
	if tg != "" {
		if b, ok := s.Banned(models.BanTelegram, tg); ok {
			return b, true
		}
	}
	if dc != "" {
		if b, ok := s.Banned(models.BanDiscord, dc); ok {
			return b, true
		}
	}
	if ip != "" && s.IsIPBanned(ip) {
		return models.Ban{IP: ip, Reason: s.BanReasonOfIP(ip)}, true
	}
	return models.Ban{}, false
}

// Add добавляет единую запись бана.
func (s *Service) Add(b models.Ban) error {
	b.Channel = strings.TrimSpace(b.Channel)
	b.UID = strings.TrimSpace(b.UID)
	b.Telegram = strings.TrimPrefix(strings.TrimSpace(b.Telegram), "@")
	b.Discord = strings.TrimSpace(b.Discord)
	b.IP = strings.TrimSpace(b.IP)
	b.Reason = strings.TrimSpace(b.Reason)
	b.BannedBy = strings.TrimSpace(b.BannedBy)

	if b.Channel == "" && b.UID == "" && b.Telegram == "" && b.Discord == "" && b.IP == "" {
		return fmt.Errorf("заполните хотя бы одно поле (аккаунт, UID, Telegram, Discord или IP)")
	}
	if b.IP != "" {
		if strings.Contains(b.IP, "/") {
			if _, _, err := net.ParseCIDR(b.IP); err != nil {
				return fmt.Errorf("неверная CIDR-подсеть: %s", b.IP)
			}
		} else {
			host := b.IP
			if h, _, err := net.SplitHostPort(b.IP); err == nil {
				host = h
			}
			if net.ParseIP(host) == nil {
				return fmt.Errorf("неверный IP-адрес: %s", b.IP)
			}
		}
	}
	if b.Reason == "" {
		b.Reason = "Заблокирован администратором"
	}
	if b.BannedBy == "" {
		b.BannedBy = "admin"
	}

	_, err := s.db.Exec(`
		INSERT INTO v2_bans (channel, uid, telegram, discord, ip, reason, banned_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, b.Channel, b.UID, b.Telegram, b.Discord, b.IP, b.Reason, b.BannedBy)
	if err != nil {
		return err
	}
	return s.Reload()
}

// Update обновляет поля существующей записи бана (дозаполнение/редактирование).
func (s *Service) Update(b models.Ban) error {
	b.Channel = strings.TrimSpace(b.Channel)
	b.UID = strings.TrimSpace(b.UID)
	b.Telegram = strings.TrimPrefix(strings.TrimSpace(b.Telegram), "@")
	b.Discord = strings.TrimSpace(b.Discord)
	b.IP = strings.TrimSpace(b.IP)
	b.Reason = strings.TrimSpace(b.Reason)

	if b.Channel == "" && b.UID == "" && b.Telegram == "" && b.Discord == "" && b.IP == "" {
		return fmt.Errorf("в блокировке должно оставаться хотя бы одно поле")
	}
	if b.IP != "" {
		if strings.Contains(b.IP, "/") {
			if _, _, err := net.ParseCIDR(b.IP); err != nil {
				return fmt.Errorf("неверная CIDR-подсеть: %s", b.IP)
			}
		} else {
			host := b.IP
			if h, _, err := net.SplitHostPort(b.IP); err == nil {
				host = h
			}
			if net.ParseIP(host) == nil {
				return fmt.Errorf("неверный IP-адрес: %s", b.IP)
			}
		}
	}

	_, err := s.db.Exec(`
		UPDATE v2_bans
		SET channel = ?, uid = ?, telegram = ?, discord = ?, ip = ?, reason = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, b.Channel, b.UID, b.Telegram, b.Discord, b.IP, b.Reason, b.ID)
	if err != nil {
		return err
	}
	return s.Reload()
}

// Remove удаляет запись бана.
func (s *Service) Remove(id int64) error {
	_, err := s.db.Exec(`DELETE FROM v2_bans WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return s.Reload()
}

// List возвращает список всех записей банов.
func (s *Service) List() ([]models.Ban, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]models.Ban, len(s.list))
	copy(res, s.list)
	return res, nil
}
