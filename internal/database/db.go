package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	_ "github.com/glebarez/go-sqlite"
	_ "github.com/lib/pq"
)

type DB struct {
	SQL    *sql.DB
	Driver string

	auditCh   chan auditEntry
	auditOnce sync.Once
}

type auditEntry struct {
	eventType, status, details, ip, userAgent string
}

func InitDB(driver, dbPath, supabaseURL string, maxOpen, maxIdle int) (*DB, error) {
	var sqlDB *sql.DB
	var err error
	activeDriver := strings.ToLower(strings.TrimSpace(driver))

	if activeDriver == "postgres" || activeDriver == "postgresql" || activeDriver == "supabase" {
		activeDriver = "postgres"
		log.Println("[Database] Connecting to Supabase / PostgreSQL database...")
		sqlDB, err = sql.Open("postgres", supabaseURL)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to Postgres: %w", err)
		}
	} else {
		activeDriver = "sqlite"
		log.Printf("[Database] Connecting to local SQLite database (%s)...", dbPath)
		sqlDB, err = sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-2000)")
		if err != nil {
			return nil, fmt.Errorf("failed to connect to SQLite: %w", err)
		}
	}

	sqlDB.SetMaxOpenConns(maxOpen)
	sqlDB.SetMaxIdleConns(maxIdle)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	sqlDB.SetConnMaxIdleTime(1 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		log.Printf("[Database] Warning: DB Ping failed: %v", err)
	}

	db := &DB{
		SQL:    sqlDB,
		Driver: activeDriver,
		auditCh: make(chan auditEntry, 1000),
	}

	db.auditOnce.Do(func() {
		go db.auditFlusher()
	})

	if err := db.createTables(); err != nil {
		return nil, err
	}

	// Seed test data for testing pagination and filters
	if err := db.seedTestData(); err != nil {
		log.Printf("[Database] Warning: Test data seeding error: %v", err)
	}

	return db, nil
}

func (db *DB) createTables() error {
	var pkType string
	if db.Driver == "postgres" {
		pkType = "BIGSERIAL PRIMARY KEY"
	} else {
		pkType = "INTEGER PRIMARY KEY AUTOINCREMENT"
	}

	schema := fmt.Sprintf(`
	CREATE TABLE IF NOT EXISTS media_applications (
		id %s,
		lang TEXT NOT NULL DEFAULT 'ru',
		uid TEXT DEFAULT '',
		criteria_agreed INTEGER NOT NULL,
		platform TEXT NOT NULL,
		channel_url TEXT NOT NULL,
		servers TEXT NOT NULL,
		videos_per_week TEXT,
		collaborations TEXT,
		why_join TEXT NOT NULL,
		exclusive TEXT NOT NULL,
		telegram TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		admin_comment TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS hwid_reset_requests (
		id %s,
		lang TEXT NOT NULL DEFAULT 'ru',
		mod_nickname TEXT NOT NULL,
		mod_key TEXT NOT NULL,
		uuid TEXT NOT NULL,
		proof_type TEXT NOT NULL,
		proof_file TEXT DEFAULT '',
		proof_link TEXT DEFAULT '',
		reason TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		admin_comment TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS discord_ban_requests (
		id %s,
		lang TEXT NOT NULL DEFAULT 'ru',
		mod_nickname TEXT NOT NULL,
		mod_key TEXT NOT NULL,
		offender_id TEXT NOT NULL,
		proof_type TEXT NOT NULL,
		proof_file TEXT DEFAULT '',
		proof_link TEXT DEFAULT '',
		reason TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		admin_comment TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS moderator_keys (
		id %s,
		key TEXT UNIQUE NOT NULL,
		nickname TEXT NOT NULL,
		telegram TEXT DEFAULT '',
		is_active INTEGER NOT NULL DEFAULT 1, -- 1=Active, 2=Frozen, 0=Disabled
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id %s,
		event_type TEXT NOT NULL,
		status TEXT NOT NULL,
		details TEXT NOT NULL,
		ip_address TEXT DEFAULT '',
		user_agent TEXT DEFAULT '',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS banned_ips (
		id %s,
		ip TEXT UNIQUE NOT NULL,
		reason TEXT DEFAULT '',
		banned_by TEXT DEFAULT 'admin',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS user_bans (
		id %s,
		ban_type TEXT NOT NULL,
		ban_value TEXT NOT NULL,
		reason TEXT DEFAULT '',
		banned_by TEXT DEFAULT 'admin',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`, pkType, pkType, pkType, pkType, pkType, pkType, pkType)

	_, err := db.SQL.Exec(schema)
	if err != nil {
		log.Printf("Error creating DB tables: %v", err)
		return err
	}

	// Safe migration for existing SQLite DBs
	_, _ = db.SQL.Exec("ALTER TABLE media_applications ADD COLUMN uid TEXT DEFAULT ''")
	_, _ = db.SQL.Exec("ALTER TABLE moderator_keys ADD COLUMN telegram TEXT DEFAULT ''")
	_, _ = db.SQL.Exec("ALTER TABLE media_applications ADD COLUMN ip_address TEXT DEFAULT ''")
	_, _ = db.SQL.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bans_type_value ON user_bans (ban_type, ban_value)")

	// Performance indexes
	if db.Driver == "postgres" {
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_id_desc ON audit_logs (id DESC)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_media_app_status ON media_applications (status)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_hwid_status ON hwid_reset_requests (status)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_discord_status ON discord_ban_requests (status)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_mod_keys_key ON moderator_keys (key)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_user_bans_type ON user_bans (ban_type)")

		// RLS on user_bans — block anon/authenticated, allow service_role
		db.SQL.Exec("ALTER TABLE user_bans ENABLE ROW LEVEL SECURITY")
		db.SQL.Exec("DROP POLICY IF EXISTS user_bans_service_full_access ON user_bans")
		db.SQL.Exec(`CREATE POLICY user_bans_service_full_access ON user_bans
			USING (true)
			WITH CHECK (true)`)
		db.SQL.Exec("DROP POLICY IF EXISTS user_bans_anon_deny ON user_bans")
		db.SQL.Exec(`CREATE POLICY user_bans_anon_deny ON user_bans
			AS PERMISSIVE FOR ALL
			TO anon
			USING (false)
			WITH CHECK (false)`)
		db.SQL.Exec("DROP POLICY IF EXISTS user_bans_auth_deny ON user_bans")
		db.SQL.Exec(`CREATE POLICY user_bans_auth_deny ON user_bans
			AS PERMISSIVE FOR ALL
			TO authenticated
			USING (false)
			WITH CHECK (false)`)
	} else {
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_id_desc ON audit_logs (id DESC)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_media_app_status ON media_applications (status)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_mod_keys_key ON moderator_keys (key)")
		db.SQL.Exec("CREATE INDEX IF NOT EXISTS idx_user_bans_type ON user_bans (ban_type)")
	}

	return nil
}

func (db *DB) seedTestData() error {
	var mediaCount int
	_ = db.SQL.QueryRow("SELECT COUNT(*) FROM media_applications").Scan(&mediaCount)
	if mediaCount > 0 {
		return nil // Already seeded
	}

	log.Println("[Database] Seeding test data for pagination & filter testing...")

	// 1. Seed Media Applications (25 records)
	serversList := []string{"Funtime", "Spookytime", "Reallyworld", "Holyworld", "Прочие"}
	platforms := []string{"youtube", "tiktok"}
	statuses := []string{"pending", "approved", "rejected"}

	for i := 1; i <= 25; i++ {
		plat := platforms[i%2]
		srv := serversList[i%len(serversList)]
		st := statuses[i%len(statuses)]
		chanURL := fmt.Sprintf("https://youtube.com/@media_creator_%d", i)
		if plat == "tiktok" {
			chanURL = fmt.Sprintf("https://tiktok.com/@tiktok_creator_%d", i)
		}
		tg := fmt.Sprintf("@creator_%d", i)

		_, _ = db.SQL.Exec(`
			INSERT INTO media_applications 
			(lang, criteria_agreed, platform, channel_url, servers, videos_per_week, collaborations, why_join, exclusive, telegram, status)
			VALUES ('ru', 1, ?, ?, ?, '2-3 ролика в неделю', 'Сотрудничал с визуалами Delta', 'Хочу развивать медиа проект delta media', 'yes', ?, ?)
		`, plat, chanURL, srv, tg, st)
	}

	// 2. Seed HWID Reset Requests (25 records)
	mods := []string{"HeadModerator", "AlexMod", "DmitryMod", "SergeyMod", "ElenaMod"}
	for i := 1; i <= 25; i++ {
		mod := mods[i%len(mods)]
		uid := fmt.Sprintf("UID-%05d-DELTA", 1000+i)
		st := statuses[i%len(statuses)]
		reason := fmt.Sprintf("Смена видеокарты и материнской платы #%d", i)

		_, _ = db.SQL.Exec(`
			INSERT INTO hwid_reset_requests 
			(lang, mod_nickname, mod_key, uuid, proof_type, proof_link, reason, status)
			VALUES ('ru', ?, 'DELTA-TESTKEY', ?, 'link', 'https://imgur.com/proof_test', ?, ?)
		`, mod, uid, reason, st)
	}

	// 3. Seed Discord Ban Requests (25 records)
	for i := 1; i <= 25; i++ {
		mod := mods[i%len(mods)]
		offender := fmt.Sprintf("User_%d#1337", 5000+i)
		st := statuses[i%len(statuses)]
		reason := fmt.Sprintf("Нарушение правил дискорд сервера #%d", i)

		_, _ = db.SQL.Exec(`
			INSERT INTO discord_ban_requests 
			(lang, mod_nickname, mod_key, offender_id, proof_type, proof_link, reason, status)
			VALUES ('ru', ?, 'DELTA-TESTKEY', ?, 'link', 'https://imgur.com/proof_ban', ?, ?)
		`, mod, offender, reason, st)
	}

	// 4. Seed Moderator Keys (20 records)
	for i := 1; i <= 20; i++ {
		key := fmt.Sprintf("DELTA-MODKEY%02d", i)
		nick := fmt.Sprintf("Moderator_%d", i)
		active := 1
		if i%4 == 0 {
			active = 2 // Frozen
		} else if i%7 == 0 {
			active = 0 // Disabled
		}
		if db.Driver == "postgres" {
			_, _ = db.SQL.Exec(`INSERT INTO moderator_keys (key, nickname, is_active) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, key, nick, active)
		} else {
			_, _ = db.SQL.Exec(`INSERT OR IGNORE INTO moderator_keys (key, nickname, is_active) VALUES (?, ?, ?)`, key, nick, active)
		}
	}

	// 5. Seed Audit Logs (45 records)
	eventTypes := []string{"MOD_LOGIN", "ADMIN_LOGIN", "APP_SUBMIT", "HWID_SUBMIT", "BAN_SUBMIT", "STATUS_CHANGE", "KEY_MANAGEMENT"}
	statusesAudit := []string{"success", "failed", "warning"}

	for i := 1; i <= 45; i++ {
		evt := eventTypes[i%len(eventTypes)]
		st := statusesAudit[i%len(statusesAudit)]
		details := fmt.Sprintf("Тестовое событие безопасности #%d (%s)", i, evt)
		ip := fmt.Sprintf("192.168.1.%d", 10+i)

		_, _ = db.SQL.Exec(`
			INSERT INTO audit_logs (event_type, status, details, ip_address, user_agent)
			VALUES (?, ?, ?, ?, 'Mozilla/5.0 DeltaMediaTestEngine')
		`, evt, st, details, ip)
	}

	log.Println("[Database] Test data successfully seeded!")
	return nil
}

func (db *DB) Rebind(query string) string {
	if db.Driver != "postgres" {
		return query
	}
	var b strings.Builder
	paramIdx := 1
	inString := false
	var quoteChar byte
	for i := 0; i < len(query); i++ {
		ch := query[i]
		if inString {
			b.WriteByte(ch)
			if ch == quoteChar && (i == 0 || query[i-1] != '\\') {
				inString = false
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			inString = true
			quoteChar = ch
			b.WriteByte(ch)
		} else if ch == '?' {
			b.WriteString(fmt.Sprintf("$%d", paramIdx))
			paramIdx++
		} else {
			b.WriteByte(ch)
		}
	}
	return b.String()
}

func (db *DB) InsertAndGetID(query string, args ...interface{}) (int64, error) {
	if db.Driver == "postgres" {
		fullQuery := db.Rebind(query + " RETURNING id")
		var id int64
		err := db.SQL.QueryRow(fullQuery, args...).Scan(&id)
		return id, err
	}
	res, err := db.SQL.Exec(db.Rebind(query), args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) RecordAuditLog(eventType, status, details, ip, userAgent string) {
	select {
	case db.auditCh <- auditEntry{eventType, status, details, ip, userAgent}:
	default:
		log.Printf("[Audit] Buffer full, dropping log: %s %s", eventType, status)
	}
}

func (db *DB) auditFlusher() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	batch := make([]auditEntry, 0, 50)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		tx, err := db.SQL.Begin()
		if err != nil {
			log.Printf("[Audit] Failed to begin tx: %v", err)
			return
		}
		stmt, err := tx.Prepare(db.Rebind(`INSERT INTO audit_logs (event_type, status, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)`))
		if err != nil {
			tx.Rollback()
			log.Printf("[Audit] Failed to prepare: %v", err)
			return
		}
		for _, e := range batch {
			stmt.Exec(e.eventType, e.status, e.details, e.ip, e.userAgent)
		}
		stmt.Close()
		if err := tx.Commit(); err != nil {
			log.Printf("[Audit] Failed to commit batch of %d: %v", len(batch), err)
		}
		batch = batch[:0]
	}

	for {
		select {
		case entry := <-db.auditCh:
			batch = append(batch, entry)
			if len(batch) >= 50 {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}
