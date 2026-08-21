package services

import (
	"fmt"
	"log"
	"strings"
	"sync"

	"delta-free-media/internal/database"
)

type UserBanManager struct {
	db        *database.DB
	bannedMap sync.Map
}

type UserBan struct {
	ID        int64  `json:"id"`
	BanType   string `json:"ban_type"`
	BanValue  string `json:"ban_value"`
	Reason    string `json:"reason"`
	BannedBy  string `json:"banned_by"`
	CreatedAt string `json:"created_at"`
}

type BanCheckResult struct {
	IsBanned bool   `json:"is_banned"`
	BanType  string `json:"ban_type,omitempty"`
	BanValue string `json:"ban_value,omitempty"`
	Reason   string `json:"reason,omitempty"`
}

var ValidBanTypes = map[string]bool{
	"channel":   true,
	"uid":       true,
	"telegram":  true,
	"discord":   true,
	"ip":        true,
}

func NewUserBanManager(db *database.DB) *UserBanManager {
	m := &UserBanManager{
		db: db,
	}
	m.Reload()
	return m
}

func (m *UserBanManager) Reload() {
	if m.db == nil || m.db.SQL == nil {
		return
	}

	rows, err := m.db.SQL.Query("SELECT id, ban_type, ban_value, reason, banned_by, created_at FROM user_bans ORDER BY id DESC")
	if err != nil {
		log.Printf("[UserBanManager] Error loading user bans: %v", err)
		return
	}
	defer rows.Close()

	m.bannedMap.Range(func(key, value interface{}) bool {
		m.bannedMap.Delete(key)
		return true
	})

	count := 0
	for rows.Next() {
		var b UserBan
		if err := rows.Scan(&b.ID, &b.BanType, &b.BanValue, &b.Reason, &b.BannedBy, &b.CreatedAt); err == nil {
			cleanVal := strings.ToLower(strings.TrimSpace(b.BanValue))
			if cleanVal != "" {
				cacheKey := b.BanType + ":" + cleanVal
				m.bannedMap.Store(cacheKey, &b)
				count++
			}
		}
	}
	log.Printf("[UserBanManager] Loaded %d user ban(s) into memory cache", count)
}

func (m *UserBanManager) CheckFields(channel, uid, telegram, discord, ip string) BanCheckResult {
	fields := map[string]string{
		"channel":  strings.ToLower(strings.TrimSpace(channel)),
		"uid":      strings.ToLower(strings.TrimSpace(uid)),
		"telegram": strings.ToLower(strings.ReplaceAll(strings.TrimSpace(telegram), "@", "")),
		"discord":  strings.ToLower(strings.TrimSpace(discord)),
		"ip":       strings.TrimSpace(ip),
	}

	for banType, value := range fields {
		if value == "" {
			continue
		}
		cacheKey := banType + ":" + value
		if v, ok := m.bannedMap.Load(cacheKey); ok {
			ban := v.(*UserBan)
			return BanCheckResult{
				IsBanned: true,
				BanType:  ban.BanType,
				BanValue: ban.BanValue,
				Reason:   ban.Reason,
			}
		}
	}

	return BanCheckResult{IsBanned: false}
}

func (m *UserBanManager) BanUser(banType, banValue, reason, bannedBy string) error {
	banType = strings.ToLower(strings.TrimSpace(banType))
	banValue = strings.TrimSpace(banValue)
	reason = strings.TrimSpace(reason)
	bannedBy = strings.TrimSpace(bannedBy)

	if banType == "" || banValue == "" {
		return fmt.Errorf("ban_type and ban_value are required")
	}
	if !ValidBanTypes[banType] {
		return fmt.Errorf("invalid ban_type: %s (valid: channel, uid, telegram, discord, ip)", banType)
	}
	if bannedBy == "" {
		bannedBy = "admin"
	}
	if reason == "" {
		reason = "Заблокирован администратором"
	}

	query := m.db.Rebind("INSERT INTO user_bans (ban_type, ban_value, reason, banned_by) VALUES (?, ?, ?, ?)")
	_, err := m.db.SQL.Exec(query, banType, banValue, reason, bannedBy)
	if err != nil {
		return fmt.Errorf("failed to ban user: %w", err)
	}

	cacheKey := banType + ":" + strings.ToLower(banValue)
	m.bannedMap.Store(cacheKey, &UserBan{
		BanType:  banType,
		BanValue: banValue,
		Reason:   reason,
		BannedBy: bannedBy,
	})
	log.Printf("[UserBanManager] Banned %s=%s by %s (Reason: %s)", banType, banValue, bannedBy, reason)
	return nil
}

func (m *UserBanManager) UnbanUser(id int64) error {
	var banType, banValue string
	err := m.db.SQL.QueryRow(m.db.Rebind("SELECT ban_type, ban_value FROM user_bans WHERE id = ?"), id).Scan(&banType, &banValue)
	if err != nil {
		return fmt.Errorf("user ban record not found: %w", err)
	}

	_, err = m.db.SQL.Exec(m.db.Rebind("DELETE FROM user_bans WHERE id = ?"), id)
	if err != nil {
		return fmt.Errorf("failed to unban user: %w", err)
	}

	cacheKey := banType + ":" + strings.ToLower(banValue)
	m.bannedMap.Delete(cacheKey)
	log.Printf("[UserBanManager] Unbanned %s=%s (ID %d)", banType, banValue, id)
	return nil
}

func (m *UserBanManager) GetAll() []UserBan {
	rows, err := m.db.SQL.Query("SELECT id, ban_type, ban_value, reason, banned_by, created_at FROM user_bans ORDER BY id DESC")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var list []UserBan
	for rows.Next() {
		var b UserBan
		if err := rows.Scan(&b.ID, &b.BanType, &b.BanValue, &b.Reason, &b.BannedBy, &b.CreatedAt); err == nil {
			list = append(list, b)
		}
	}
	return list
}
