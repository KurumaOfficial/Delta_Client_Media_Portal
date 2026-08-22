package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config — единственная точка чтения окружения. Всё, что нужно
// остальным пакетам, попадает сюда один раз при старте.
type Config struct {
	Port string
	Host string

	DBDriver    string
	DBPath      string
	SupabaseURL string

	AdminBootstrapCode string
	SessionTTL         time.Duration
	GPSRequired        bool

	TGBotToken     string
	TGAdminContact string  // @username администратора для 2FA-сообщений
	TGOwnerIDs     []int64 // получатели админ-уведомлений с inline-кнопками
	TGSecretary    string  // @username бизнес-секретаря
	TGAdminChatID  int64   // chat_id владельца (резолвится автоматически)

	CryptoBotToken   string
	CryptoBotTestnet bool
	CryptoBotAsset   string

	WeekTZ *time.Location

	UploadDir   string
	MaxUploadGB int64

	TurnstileSiteKey string
	TurnstileSecret  string
}

func Load() *Config {
	_ = godotenv.Load()

	maxUploadGB, _ := strconv.ParseInt(getEnv("MAX_UPLOAD_GB", "2"), 10, 64)
	if maxUploadGB <= 0 {
		maxUploadGB = 2
	}

	ttlHours, _ := strconv.Atoi(getEnv("SESSION_TTL_HOURS", "168"))
	if ttlHours <= 0 {
		ttlHours = 168
	}

	weekTZ, err := time.LoadLocation(getEnv("WEEK_TZ", "Europe/Moscow"))
	if err != nil {
		weekTZ = time.UTC
	}

	cfg := &Config{
		Port:               getEnv("PORT", "3000"),
		Host:               getEnv("HOST", "0.0.0.0"),
		DBDriver:           strings.ToLower(getEnv("DB_DRIVER", "sqlite")),
		DBPath:             getEnv("DB_PATH", "./delta_v2.db"),
		SupabaseURL:        getEnv("SUPABASE_DB_URL", ""),
		AdminBootstrapCode: getEnv("ADMIN_BOOTSTRAP_CODE", "DELTA-ROOT-0001"),
		SessionTTL:         time.Duration(ttlHours) * time.Hour,
		GPSRequired:        getEnv("GPS_REQUIRED", "true") == "true",
		TGBotToken:         getEnv("TELEGRAM_BOT_TOKEN", ""),
		TGAdminContact:     stripAt(getEnv("TELEGRAM_ADMIN_CONTACT", "notyxx")),
		TGSecretary:        stripAt(getEnv("TELEGRAM_SECRETARY_CONTACT", "notyxs")),
		CryptoBotToken:     getEnv("CRYPTOBOT_API_TOKEN", ""),
		CryptoBotTestnet:   getEnv("CRYPTOBOT_TESTNET", "false") == "true",
		CryptoBotAsset:     getEnv("CRYPTOBOT_ASSET", "USDT"),
		WeekTZ:             weekTZ,
		UploadDir:          getEnv("UPLOAD_DIR", "./uploads"),
		MaxUploadGB:        maxUploadGB,
		TurnstileSiteKey:   getEnv("TURNSTILE_SITEKEY", "1x00000000000000000000AA"),
		TurnstileSecret:    getEnv("TURNSTILE_SECRET", ""),
	}
	cfg.TGOwnerIDs = parseIDList(getEnv("TELEGRAM_OWNER_IDS", ""))
	if len(cfg.TGOwnerIDs) == 0 {
		log.Println("[Config] WARNING: TELEGRAM_OWNER_IDS is empty — admin Telegram notifications disabled")
	}
	return cfg
}

func getEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func stripAt(s string) string {
	return strings.TrimPrefix(strings.TrimSpace(s), "@")
}

func parseIDList(raw string) []int64 {
	var ids []int64
	for _, part := range strings.Split(raw, ",") {
		if id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil && id != 0 {
			ids = append(ids, id)
		}
	}
	return ids
}
