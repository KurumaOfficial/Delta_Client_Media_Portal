package services

import (
	"fmt"
	"log"
	"strings"
	"sync"

	"delta-free-media/internal/database"
)

type IPBanManager struct {
	db        *database.DB
	bannedMap sync.Map
}

func NewIPBanManager(db *database.DB) *IPBanManager {
	m := &IPBanManager{
		db: db,
	}
	m.Reload()
	return m
}

func (m *IPBanManager) Reload() {
	if m.db == nil || m.db.SQL == nil {
		return
	}

	rows, err := m.db.SQL.Query("SELECT ip FROM banned_ips")
	if err != nil {
		log.Printf("[IPBanManager] Error loading banned IPs: %v", err)
		return
	}
	defer rows.Close()

	// Clear existing entries
	m.bannedMap.Range(func(key, value interface{}) bool {
		m.bannedMap.Delete(key)
		return true
	})

	count := 0
	for rows.Next() {
		var ip string
		if err := rows.Scan(&ip); err == nil {
			cleanIP := strings.TrimSpace(ip)
			if cleanIP != "" {
				m.bannedMap.Store(cleanIP, true)
				count++
			}
		}
	}
	log.Printf("[IPBanManager] Loaded %d banned IP address(es) into memory cache", count)
}

func (m *IPBanManager) IsBanned(ip string) bool {
	cleanIP := strings.TrimSpace(ip)
	if cleanIP == "" {
		return false
	}
	_, banned := m.bannedMap.Load(cleanIP)
	return banned
}

func (m *IPBanManager) BanIP(ip, reason, bannedBy string) error {
	cleanIP := strings.TrimSpace(ip)
	if cleanIP == "" {
		return fmt.Errorf("invalid IP address")
	}

	query := m.db.Rebind("INSERT INTO banned_ips (ip, reason, banned_by) VALUES (?, ?, ?)")
	_, err := m.db.SQL.Exec(query, cleanIP, strings.TrimSpace(reason), strings.TrimSpace(bannedBy))
	if err != nil {
		return fmt.Errorf("failed to ban IP: %w", err)
	}

	m.bannedMap.Store(cleanIP, true)
	log.Printf("[IPBanManager] IP %s banned by %s (Reason: %s)", cleanIP, bannedBy, reason)
	return nil
}

func (m *IPBanManager) UnbanIP(id int64) error {
	var ip string
	querySelect := m.db.Rebind("SELECT ip FROM banned_ips WHERE id = ?")
	err := m.db.SQL.QueryRow(querySelect, id).Scan(&ip)
	if err != nil {
		return fmt.Errorf("banned IP record not found: %w", err)
	}

	queryDelete := m.db.Rebind("DELETE FROM banned_ips WHERE id = ?")
	_, err = m.db.SQL.Exec(queryDelete, id)
	if err != nil {
		return fmt.Errorf("failed to unban IP: %w", err)
	}

	m.bannedMap.Delete(strings.TrimSpace(ip))
	log.Printf("[IPBanManager] IP %s (ID %d) unbanned", ip, id)
	return nil
}
