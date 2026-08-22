package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/glebarez/go-sqlite"
	_ "github.com/lib/pq"
)

// DB — тонкая обёртка над database/sql с dual-driver (postgres | sqlite)
// и минимальным набором хелперов, чтобы хендлеры не знали о диалекте.
type DB struct {
	SQL    *sql.DB
	Driver string // "postgres" | "sqlite"
}

func Connect(driver, dbPath, supabaseURL string) (*DB, error) {
	driver = strings.ToLower(strings.TrimSpace(driver))
	var sqlDB *sql.DB
	var err error

	if driver == "postgres" || driver == "postgresql" || driver == "supabase" {
		driver = "postgres"
		log.Println("[DB] Connecting to PostgreSQL...")
		sqlDB, err = sql.Open("postgres", supabaseURL)
	} else {
		driver = "sqlite"
		log.Printf("[DB] Connecting to SQLite (%s)...", dbPath)
		sqlDB, err = sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)")
	}
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", driver, err)
	}

	sqlDB.SetMaxOpenConns(5)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping %s: %w", driver, err)
	}

	db := &DB{SQL: sqlDB, Driver: driver}
	if err := db.Migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

// Rebind переводит ?-плейсхолдеры в $N для postgres.
func (db *DB) Rebind(query string) string {
	if db.Driver != "postgres" {
		return query
	}
	var b strings.Builder
	n := 1
	for i := 0; i < len(query); i++ {
		switch query[i] {
		case '?':
			b.WriteString(fmt.Sprintf("$%d", n))
			n++
		default:
			b.WriteByte(query[i])
		}
	}
	return b.String()
}

// InsertReturningID выполняет INSERT и возвращает id записи на обоих драйверах.
func (db *DB) InsertReturningID(query string, args ...any) (int64, error) {
	if db.Driver == "postgres" {
		var id int64
		err := db.SQL.QueryRow(db.Rebind(query)+" RETURNING id", args...).Scan(&id)
		return id, err
	}
	res, err := db.SQL.Exec(db.Rebind(query), args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// Exec — Rebind-обёртка для простых запросов.
func (db *DB) Exec(query string, args ...any) (sql.Result, error) {
	return db.SQL.Exec(db.Rebind(query), args...)
}

// QueryRow — Rebind-обёртка.
func (db *DB) QueryRow(query string, args ...any) *sql.Row {
	return db.SQL.QueryRow(db.Rebind(query), args...)
}

// IsPostgres — истинно для прод-режима.
func (db *DB) IsPostgres() bool { return db.Driver == "postgres" }
