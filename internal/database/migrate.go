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
			promo_code TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			decided_at TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_ideas_bugs (
			id %s,
			account_id BIGINT NOT NULL DEFAULT 0,
			nickname TEXT NOT NULL DEFAULT '',
			role TEXT NOT NULL DEFAULT '',
			category TEXT NOT NULL DEFAULT 'idea',
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			proof_files TEXT NOT NULL DEFAULT '',
			proof_link TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			admin_comment TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_bans (
			id %s,
			channel TEXT NOT NULL DEFAULT '',
			uid TEXT NOT NULL DEFAULT '',
			telegram TEXT NOT NULL DEFAULT '',
			discord TEXT NOT NULL DEFAULT '',
			ip TEXT NOT NULL DEFAULT '',
			reason TEXT NOT NULL DEFAULT '',
			banned_by TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS v2_sub_keys (
			id %s,
			category TEXT NOT NULL DEFAULT 'sub',
			key_code TEXT NOT NULL UNIQUE,
			is_used INTEGER NOT NULL DEFAULT 0,
			used_at TIMESTAMP,
			assigned_request_id BIGINT NOT NULL DEFAULT 0,
			assigned_account_id BIGINT NOT NULL DEFAULT 0,
			assigned_to TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`, pk),
	}

	for _, s := range stmts {
		if _, err := db.SQL.Exec(s); err != nil {
			return fmt.Errorf("create table: %w\nQuery: %s", err, s)
		}
	}

	// Миграция колонки category в v2_sub_keys при её отсутствии
	if db.IsPostgres() {
		_, _ = db.SQL.Exec(`ALTER TABLE v2_sub_keys ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sub';`)
		_, _ = db.SQL.Exec(`CREATE INDEX IF NOT EXISTS idx_sub_keys_cat_used ON v2_sub_keys(category, is_used);`)
	} else {
		var hasCategory bool
		if rows, err := db.SQL.Query(`PRAGMA table_info(v2_sub_keys)`); err == nil {
			for rows.Next() {
				var cid int
				var name, ctype string
				var notnull, pkCol int
				var dflt interface{}
				if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pkCol); err == nil && name == "category" {
					hasCategory = true
				}
			}
			rows.Close()
		}
		if !hasCategory {
			_, _ = db.SQL.Exec(`ALTER TABLE v2_sub_keys ADD COLUMN category TEXT NOT NULL DEFAULT 'sub';`)
		}
	}

	// Миграция колонки promo_code в v2_requests при её отсутствии
	if db.IsPostgres() {
		_, _ = db.SQL.Exec(`ALTER TABLE v2_requests ADD COLUMN IF NOT EXISTS promo_code TEXT NOT NULL DEFAULT '';`)
	} else {
		var hasPromo bool
		if rows, err := db.SQL.Query(`PRAGMA table_info(v2_requests)`); err == nil {
			for rows.Next() {
				var cid int
				var name, ctype string
				var notnull, pkCol int
				var dflt interface{}
				if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pkCol); err == nil && name == "promo_code" {
					hasPromo = true
				}
			}
			rows.Close()
		}
		if !hasPromo {
			_, _ = db.SQL.Exec(`ALTER TABLE v2_requests ADD COLUMN promo_code TEXT NOT NULL DEFAULT '';`)
		}
	}

	// Миграция v2_bans со старой схемы (btype, value) на групповую (1 запись = 1 сущность)
	var hasBType bool
	if db.IsPostgres() {
		var cnt int
		_ = db.SQL.QueryRow(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'v2_bans' AND column_name = 'btype'`).Scan(&cnt)
		hasBType = cnt > 0
	} else {
		rows, err := db.SQL.Query(`PRAGMA table_info(v2_bans)`)
		if err == nil {
			for rows.Next() {
				var cid int
				var name, ctype string
				var notnull, pkCol int
				var dflt interface{}
				if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pkCol); err == nil && name == "btype" {
					hasBType = true
				}
			}
			rows.Close()
		}
	}
	if hasBType {
		log.Println("[Migrate] Migrating v2_bans from single-value to grouped entity schema...")
		if db.IsPostgres() {
			_, _ = db.SQL.Exec(`ALTER TABLE v2_bans RENAME TO v2_bans_old;`)
			_, _ = db.SQL.Exec(`CREATE TABLE v2_bans (
				id BIGSERIAL PRIMARY KEY,
				channel TEXT NOT NULL DEFAULT '',
				uid TEXT NOT NULL DEFAULT '',
				telegram TEXT NOT NULL DEFAULT '',
				discord TEXT NOT NULL DEFAULT '',
				ip TEXT NOT NULL DEFAULT '',
				reason TEXT NOT NULL DEFAULT '',
				banned_by TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			);`)
			_, _ = db.SQL.Exec(`INSERT INTO v2_bans (id, channel, uid, telegram, discord, ip, reason, banned_by, created_at, updated_at)
				SELECT id,
					CASE WHEN btype IN ('youtube','tiktok','link','channel') THEN value ELSE '' END,
					CASE WHEN btype = 'uid' THEN value ELSE '' END,
					CASE WHEN btype = 'telegram' THEN value ELSE '' END,
					CASE WHEN btype = 'discord' THEN value ELSE '' END,
					CASE WHEN btype = 'ip' THEN value ELSE '' END,
					reason, banned_by, created_at, created_at
				FROM v2_bans_old;`)
			_, _ = db.SQL.Exec(`DROP TABLE v2_bans_old;`)
		} else {
			_, _ = db.SQL.Exec(`ALTER TABLE v2_bans RENAME TO v2_bans_old;`)
			_, _ = db.SQL.Exec(`CREATE TABLE v2_bans (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				channel TEXT NOT NULL DEFAULT '',
				uid TEXT NOT NULL DEFAULT '',
				telegram TEXT NOT NULL DEFAULT '',
				discord TEXT NOT NULL DEFAULT '',
				ip TEXT NOT NULL DEFAULT '',
				reason TEXT NOT NULL DEFAULT '',
				banned_by TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
			);`)
			_, _ = db.SQL.Exec(`INSERT INTO v2_bans (id, channel, uid, telegram, discord, ip, reason, banned_by, created_at, updated_at)
				SELECT id,
					CASE WHEN btype IN ('youtube','tiktok','link','channel') THEN value ELSE '' END,
					CASE WHEN btype = 'uid' THEN value ELSE '' END,
					CASE WHEN btype = 'telegram' THEN value ELSE '' END,
					CASE WHEN btype = 'discord' THEN value ELSE '' END,
					CASE WHEN btype = 'ip' THEN value ELSE '' END,
					reason, banned_by, created_at, created_at
				FROM v2_bans_old;`)
			_, _ = db.SQL.Exec(`DROP TABLE v2_bans_old;`)
		}
	}

	// Очистка спам-ошибок turnstile и расширений браузера из журнала аудита
	_, _ = db.SQL.Exec(`DELETE FROM v2_audit_logs WHERE event_type = 'CLIENT_ERROR' AND (
		details LIKE '%turnstile%' OR details LIKE '%Turnstile%' OR details LIKE '%300010%' OR
		details LIKE '%chrome-extension%' OR details LIKE '%moz-extension%' OR details LIKE '%safari-extension%' OR
		details LIKE '%ResizeObserver%' OR details LIKE '%Script error%'
	);`)

	// мягкая миграция существующих баз (колонка могла отсутствовать).
	// SQLite не разрешает ADD COLUMN с DEFAULT CURRENT_TIMESTAMP — добавляем
	// без дефолта и заполняем значения отдельным UPDATE.
	_, _ = db.SQL.Exec(`ALTER TABLE v2_sessions ADD COLUMN last_seen TIMESTAMP`)
	_, _ = db.SQL.Exec(`UPDATE v2_sessions SET last_seen = COALESCE(last_seen, CURRENT_TIMESTAMP)`)

	// Сброс всех 24-часовых блокировок входа (попытки очищаются)
	_, _ = db.SQL.Exec(`UPDATE v2_audit_logs SET status = 'failed_cleared' WHERE event_type = 'LOGIN' AND status = 'failed'`)

	// Включение Row Level Security (RLS) для защиты всех таблиц от прямого доступа через Supabase API
	if db.IsPostgres() {
		for _, tbl := range []string{
			"v2_accounts", "v2_sessions", "v2_login_attempts", "v2_tg_users",
			"v2_media_apps", "v2_weeks", "v2_requests", "v2_hwid_requests",
			"v2_discord_bans", "v2_ideas_bugs", "v2_audit_logs", "v2_settings", "v2_bans", "v2_sub_keys",
		} {
			_, _ = db.SQL.Exec(fmt.Sprintf(`ALTER TABLE %s ENABLE ROW LEVEL SECURITY;`, tbl))
		}
	}

	if err := db.seedDefaults(); err != nil {
		return err
	}
	log.Println("[DB] Migration complete (v2 schema ready)")
	return nil
}

// defaultSettings — редактируемые в админке тексты (пасты, шаблоны, вердикты).
func defaultSettings() map[string]string {
	return map[string]string{
		"apps_open":                  "true",
		"two_factor_enabled":         "false",
		"user_notifications_enabled": "false",
		"media_approve_text":         "Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте deltamedia.fun. Я рассмотрел твою заявку № {id} и одобрил её!\n\nСсылка на конфу медиа - {comment}\nОбязательно прочитай все каналы чтобы понять всю суть.",
		"media_reject_text":          "Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте deltamedia.fun. Я рассмотрел твою заявку № {id} и вынужден её отклонить.\n\nПричина: {reason}\nПопробуй больше активничать и чаще выкладывать видео — тогда у тебя всё обязательно получится. Когда улучшишь статистику аккаунта, подавай новую заявку.",
		"payout_paste_template":      "📋 Заявка на выплату Delta Media\nUID: {uid}\nВ медиа: {duration}\nЧто хочу получить: {want}\nСумма (USDT): {amount}\nСпособ выплаты: {method}\nСсылка на лот (FunPay): {lot_url}",
		"payout_funpay_text":         "✅ Твоя заявка на выплату №{id} одобрена!\nОплата через FunPay: {lot_url}\nЕсли появились вопросы — пиши администратору.",
		"payout_reject_text":         "❌ Выплата была отклонена.\nПричина: {reason}",
		"payout_usdt_text":           "💸 Выплата №{id} одобрена: {amount} USDT отправлены через CryptoBot (@crypto_bot).\nПроверь чек в боте. Если что-то не так — пиши администратору.",
		"lot_approve_text":           "✅ <b>Ваша заявка на лот #{id} одобрена!</b>\n\n{comment}",
		"lot_reject_text":            "❌ <b>Ваша заявка на лот #{id} отклонена.</b>\n\nПричина: {reason}",
		"week_summary_template": "📊 Итоги недели {week}:\nЗаявок подано: {total}\nОдобрено: {approved} | Отклонено: {rejected} | В ожидании: {pending}\nВыплачено USDT: {usdt_total}\nFunPay-выплат: {funpay_count}",
		"discord_approve_text":  "Аккаунт в дискорде {comment} успешно заблокирован.",
		"discord_reject_text":   "Блокировка аккаунта {comment} была отклонена.\n\nПричина — {reason}",
		"tg_window_nudge_text":  "⏳ Напоминание: окно для ответов скоро закроется. Напиши любое сообщение, чтобы продлить его на 24 часа.",
		"tg_bot_start_text":     "🤖 <b>Delta Media Bot</b>\n\nПривет, {name}!\nЧерез меня приходит подтверждение входа на сайт и статусы заявок.",
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
