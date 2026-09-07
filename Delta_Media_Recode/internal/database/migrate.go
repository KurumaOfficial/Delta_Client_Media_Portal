package database

import (
	"fmt"
	"log"
)

// Migrate создаёт схему v2_* (не конфликтует с таблицами старого проекта
// в той же Supabase-базе) и наполняет дефолты при первом запуске.
func (db *DB) Migrate() error {
	pk := "INTEGER PRIMARY KEY AUTOINCREMENT"
	if db.IsPostgres() {
		pk = "BIGSERIAL PRIMARY KEY"
	}

	stmts := []string{
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_accounts (
			id %s,
			code TEXT UNIQUE NOT NULL,
			role TEXT NOT NULL,
			nickname TEXT NOT NULL,
			telegram TEXT NOT NULL DEFAULT '',
			tg_user_id BIGINT NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_sessions (
			id %s,
			token_hash TEXT UNIQUE NOT NULL,
			account_id BIGINT NOT NULL,
			ip TEXT NOT NULL DEFAULT '',
			user_agent TEXT NOT NULL DEFAULT '',
			gps TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMP NOT NULL
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_login_attempts (
			id %s,
			token TEXT UNIQUE NOT NULL,
			account_id BIGINT NOT NULL,
			ip TEXT NOT NULL DEFAULT '',
			gps TEXT NOT NULL DEFAULT '',
			user_agent TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			decided_at TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_tg_users (
			id %s,
			tg_user_id BIGINT UNIQUE NOT NULL,
			username TEXT NOT NULL DEFAULT '',
			chat_id BIGINT NOT NULL DEFAULT 0,
			business_chat_id BIGINT NOT NULL DEFAULT 0,
			last_incoming_at TIMESTAMP,
			last_nudge_at TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_media_apps (
			id %s,
			lang TEXT NOT NULL DEFAULT 'ru',
			uid TEXT NOT NULL DEFAULT '',
			criteria_agreed INTEGER NOT NULL DEFAULT 0,
			platform TEXT NOT NULL,
			channel_url TEXT NOT NULL,
			servers TEXT NOT NULL,
			videos_per_week TEXT NOT NULL DEFAULT '',
			collaborations TEXT NOT NULL DEFAULT '',
			why_join TEXT NOT NULL,
			exclusive TEXT NOT NULL,
			telegram TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			admin_comment TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_hwid_requests (
			id %s,
			account_id BIGINT NOT NULL DEFAULT 0,
			mod_nickname TEXT NOT NULL,
			uuid TEXT NOT NULL,
			proof_type TEXT NOT NULL,
			proof_file TEXT NOT NULL DEFAULT '',
			proof_link TEXT NOT NULL DEFAULT '',
			reason TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			admin_comment TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_discord_bans (
			id %s,
			account_id BIGINT NOT NULL DEFAULT 0,
			mod_nickname TEXT NOT NULL,
			offender_id TEXT NOT NULL,
			proof_type TEXT NOT NULL,
			proof_file TEXT NOT NULL DEFAULT '',
			proof_link TEXT NOT NULL DEFAULT '',
			reason TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			admin_comment TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_weeks (
			id %s,
			label TEXT NOT NULL,
			opens_at TIMESTAMP NOT NULL,
			closes_at TIMESTAMP NOT NULL,
			is_current INTEGER NOT NULL DEFAULT 0,
			summary_text TEXT NOT NULL DEFAULT '',
			report_text TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_requests (
			id %s,
			week_id BIGINT NOT NULL DEFAULT 0,
			kind TEXT NOT NULL,
			source TEXT NOT NULL DEFAULT 'cabinet',
			account_id BIGINT NOT NULL DEFAULT 0,
			nickname TEXT NOT NULL DEFAULT '',
			telegram TEXT NOT NULL DEFAULT '',
			tg_user_id BIGINT NOT NULL DEFAULT 0,
			uid TEXT NOT NULL DEFAULT '',
			duration TEXT NOT NULL DEFAULT '',
			want TEXT NOT NULL DEFAULT '',
			amount TEXT NOT NULL DEFAULT '',
			method TEXT NOT NULL DEFAULT '',
			platform TEXT NOT NULL DEFAULT '',
			channel_url TEXT NOT NULL DEFAULT '',
			lot_url TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			decision_comment TEXT NOT NULL DEFAULT '',
			tx_ref TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			decided_at TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_bans (
			id %s,
			btype TEXT NOT NULL,
			value TEXT NOT NULL,
			reason TEXT NOT NULL DEFAULT '',
			banned_by TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (btype, value)
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_audit_logs (
			id %s,
			event_type TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'success',
			details TEXT NOT NULL DEFAULT '',
			ip TEXT NOT NULL DEFAULT '',
			user_agent TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		`CREATE TABLE IF NOT EXISTS v2_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT '',
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for _, s := range stmts {
		if _, err := db.SQL.Exec(s); err != nil {
			return fmt.Errorf("create table: %w\nQuery: %s", err, s)
		}
	}

	// мягкая миграция существующих баз (колонка могла отсутствовать).
	// SQLite не разрешает ADD COLUMN с DEFAULT CURRENT_TIMESTAMP — добавляем
	// без дефолта и заполняем значения отдельным UPDATE.
	_, _ = db.SQL.Exec(`ALTER TABLE v2_sessions ADD COLUMN last_seen TIMESTAMP`)
	_, _ = db.SQL.Exec(`UPDATE v2_sessions SET last_seen = COALESCE(last_seen, CURRENT_TIMESTAMP)`)

	if err := db.seedDefaults(); err != nil {
		return err
	}
	log.Println("[DB] Migration complete (v2 schema ready)")
	return nil
}

// defaultSettings — редактируемые в админке тексты (пасты, шаблоны).
func defaultSettings() map[string]string {
	return map[string]string{
		"apps_open":             "true",
		"payout_paste_template": "📋 Заявка на выплату Delta Media\nUID: {uid}\nВ медиа: {duration}\nЧто хочу получить: {want}\nСумма (USDT): {amount}\nСпособ выплаты: {method}\nСсылка на лот (FunPay): {lot_url}",
		"payout_funpay_text":    "✅ Твоя заявка на выплату №{id} одобрена!\nОплата через FunPay: {lot_url}\nЕсли появились вопросы — пиши администратору.",
		"payout_reject_text":    "❌ Выплата была отклонена.\nПричина: {reason}",
		"payout_usdt_text":      "💸 Выплата №{id} одобрена: {amount} USDT отправлены через CryptoBot (@crypto_bot).\nПроверь чек в боте. Если что-то не так — пиши администратору.",
		"week_summary_template": "📊 Итоги недели {week}:\nЗаявок подано: {total}\nОдобрено: {approved} | Отклонено: {rejected} | В ожидании: {pending}\nВыплачено USDT: {usdt_total}\nFunPay-выплат: {funpay_count}",
	}
}

func (db *DB) seedDefaults() error {
	for key, value := range defaultSettings() {
		q := db.Rebind(`INSERT INTO v2_settings (key, value) VALUES (?, ?)`)
		if db.IsPostgres() {
			q = `INSERT INTO v2_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`
		} else {
			q = `INSERT OR IGNORE INTO v2_settings (key, value) VALUES (?, ?)`
		}
		if _, err := db.SQL.Exec(q, key, value); err != nil {
			return fmt.Errorf("seed setting %s: %w", key, err)
		}
	}
	return nil
}

// BootstrapAdmin создаёт корневой аккаунт администратора, если аккаунтов нет.
func (db *DB) BootstrapAdmin(code, telegram string) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM v2_accounts WHERE role = 'admin'`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err := db.InsertReturningID(
		`INSERT INTO v2_accounts (code, role, nickname, telegram) VALUES (?, 'admin', 'root', ?)`,
		code, telegram,
	)
	if err != nil {
		return err
	}
	log.Printf("[DB] Bootstrap admin account created (code from ADMIN_BOOTSTRAP_CODE)")
	return nil
}
