package database

import (
	"log"
	"time"
)

// RecordAudit — неблокирующая запись в журнал событий (ошибки не роняют запрос).
func (db *DB) RecordAudit(eventType, status, details, ip, userAgent string) {
	_, err := db.Exec(
		`INSERT INTO v2_audit_logs (event_type, status, details, ip, user_agent) VALUES (?, ?, ?, ?, ?)`,
		eventType, status, details, ip, userAgent,
	)
	if err != nil {
		log.Printf("[Audit] write failed: %v", err)
	}
}

// FailedLoginsInWindow возвращает количество неудачных попыток входа с указанного IP за заданный период.
func (db *DB) FailedLoginsInWindow(ip string, window time.Duration) int {
	var count int
	since := time.Now().Add(-window)
	_ = db.QueryRow(
		`SELECT COUNT(*) FROM v2_audit_logs WHERE event_type = 'LOGIN' AND status = 'failed' AND ip = ? AND created_at >= ?`,
		ip, since,
	).Scan(&count)
	return count
}

// Setting читает значение из v2_settings (пусто, если нет ключа).
func (db *DB) Setting(key string) string {
	var value string
	_ = db.QueryRow(`SELECT value FROM v2_settings WHERE key = ?`, key).Scan(&value)
	return value
}

// SetSetting обновляет/создаёт настройку.
func (db *DB) SetSetting(key, value string) error {
	if db.IsPostgres() {
		_, err := db.SQL.Exec(
			`INSERT INTO v2_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
			 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
			key, value)
		return err
	}
	_, err := db.SQL.Exec(
		`INSERT INTO v2_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
		key, value)
	return err
}

// AllSettings — все настройки ключ→значение.
func (db *DB) AllSettings() map[string]string {
	rows, err := db.SQL.Query(`SELECT key, value FROM v2_settings`)
	if err != nil {
		return map[string]string{}
	}
	defer rows.Close()
	out := make(map[string]string, 16)
	for rows.Next() {
		var k, v string
		if rows.Scan(&k, &v) == nil {
			out[k] = v
		}
	}
	return out
}
