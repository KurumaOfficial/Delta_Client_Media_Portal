package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port               string
	Host               string
	DBDriver           string
	DBPath             string
	SupabaseURL        string
	AdminSecret        string
	ModSecret          string
	UploadDir          string
	TGBotToken         string
	TGAdminChat        string
	TGBusinessID       string
	GCTuning           bool
	GOGCVal            int
	TurnstileSecretKey string
	DBMaxOpenConns     int
	DBMaxIdleConns     int
}

func LoadConfig() *Config {
	// Automatically load .env file if present
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] Notice: .env file not found or couldn't be loaded, reading from environment variables")
	}

	port := getEnv("PORT", "3000")
	host := getEnv("HOST", "0.0.0.0")
	dbDriver := getEnv("DB_DRIVER", "sqlite")
	dbPath := getEnv("DB_PATH", "./delta.db")
	supabaseURL := getEnv("SUPABASE_DB_URL", "")

	adminSecret := getEnv("ADMIN_SECRET", "dima9953")
	modSecret := getEnv("MOD_SECRET", "mod123")
	uploadDir := getEnv("UPLOAD_DIR", "./web/uploads")

	tgBotToken := getEnv("TELEGRAM_BOT_TOKEN", "")
	tgAdminChat := getEnv("TELEGRAM_ADMIN_CHAT_ID", "")
	tgBusinessID := getEnv("TELEGRAM_BUSINESS_CONNECTION_ID", "")

	gcTuningStr := getEnv("GC_TUNING", "true")
	gcTuning := gcTuningStr == "true" || gcTuningStr == "1"

	gogcValStr := getEnv("GOGC_VAL", "20")
	gogcVal, err := strconv.Atoi(gogcValStr)
	if err != nil {
		gogcVal = 20
	}

	turnstileSecret := getEnv("TURNSTILE_SECRET_KEY", "")

	dbMaxOpen := 25
	if v, err := strconv.Atoi(getEnv("DB_MAX_OPEN_CONNS", "25")); err == nil && v > 0 {
		dbMaxOpen = v
	}
	dbMaxIdle := 10
	if v, err := strconv.Atoi(getEnv("DB_MAX_IDLE_CONNS", "10")); err == nil && v > 0 {
		dbMaxIdle = v
	}

	return &Config{
		Port:               port,
		Host:               host,
		DBDriver:           dbDriver,
		DBPath:             dbPath,
		SupabaseURL:        supabaseURL,
		AdminSecret:        adminSecret,
		ModSecret:          modSecret,
		UploadDir:          uploadDir,
		TGBotToken:         tgBotToken,
		TGAdminChat:        tgAdminChat,
		TGBusinessID:       tgBusinessID,
		GCTuning:           gcTuning,
		GOGCVal:            gogcVal,
		TurnstileSecretKey: turnstileSecret,
		DBMaxOpenConns:     dbMaxOpen,
		DBMaxIdleConns:     dbMaxIdle,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
