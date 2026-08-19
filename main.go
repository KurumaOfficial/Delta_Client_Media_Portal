package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"delta-free-media/config"
	"delta-free-media/internal/database"
	"delta-free-media/internal/handlers"
	"delta-free-media/internal/middleware"
	"delta-free-media/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.LoadConfig()

	dbDriver := os.Getenv("DB_DRIVER")
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./delta.db"
	}
	supabaseURL := cfg.SupabaseURL
	if supabaseURL == "" {
		supabaseURL = os.Getenv("SUPABASE_DB_URL")
	}
	adminCode := cfg.AdminSecret
	if adminCode == "" {
		adminCode = "dima9953"
	}

	// MultiWriter for stdout and persistent app.log file
	logFile, errLog := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if errLog == nil {
		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
	}

	db, err := database.InitDB(dbDriver, dbPath, supabaseURL)
	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	tgService := services.NewTelegramService(cfg.TGBotToken, cfg.TGAdminChat, cfg.TGBusinessID)
	tgService.SetLogger(db)
	ipBanService := services.NewIPBanManager(db)
	appHandler := handlers.NewAppHandler(db, cfg, tgService)
	adminHandler := handlers.NewAdminHandler(db, cfg, tgService, ipBanService)

	handlers.InitUploadDirs()

	app := fiber.New(fiber.Config{
		AppName:       "delta media Portal v2.0",
		BodyLimit:     25 * 1024 * 1024 * 1024, // 25GB Body Limit for streaming chunk uploads
		StrictRouting: false,
		CaseSensitive: false,
	})

	app.Use(recover.New())
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))
	app.Use(cors.New())

	// IP Ban Check Middleware
	app.Use(func(c *fiber.Ctx) error {
		realIP := middleware.GetRealIP(c)
		if ipBanService.IsBanned(realIP) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Ваш IP-адрес заблокирован на сайте.",
			})
		}
		return c.Next()
	})

	// Universal Audit Logging Middleware (Logs ALL HTTP actions/errors into audit_logs EXCEPT log fetching itself)
	app.Use(func(c *fiber.Ctx) error {
		path := c.Path()
		// Exclude static files, favicons, and log endpoints to avoid infinite recursion loops
		if strings.HasPrefix(path, "/css") || strings.HasPrefix(path, "/js") || strings.HasPrefix(path, "/uploads") ||
			path == "/api/log-client-error" || path == "/favicon.ico" || strings.HasSuffix(path, ".ico") {
			return c.Next()
		}

		start := time.Now()
		err := c.Next()
		duration := time.Since(start)

		statusCode := c.Response().StatusCode()

		// Skip logging routine GET requests for admin table polling to prevent log noise
		if c.Method() == "GET" && strings.Contains(path, "/admin/") {
			return err
		}

		statusType := "success"
		if statusCode >= 400 {
			statusType = "error"
		} else if statusCode >= 300 {
			statusType = "warning"
		}

		details := fmt.Sprintf("[%s %s] HTTP %d in %v", c.Method(), path, statusCode, duration)
		if err != nil {
			details += fmt.Sprintf(" | Error: %v", err)
		}

		db.RecordAuditLog("HTTP_"+c.Method(), statusType, details, middleware.GetRealIP(c), c.Get("User-Agent"))
		return err
	})

	// Static Web Assets & Uploads
	app.Static("/css", "./web/static/css")
	app.Static("/js", "./web/static/js")
	app.Static("/uploads", "./uploads")

	// Render Main SPA View
	renderApp := func(c *fiber.Ctx) error {
		return c.SendFile("./web/views/index.html")
	}

	app.Get("/", renderApp)
	app.Get("/ru", renderApp)
	app.Get("/en", renderApp)

	// API Routes
	api := app.Group("/api")

	// Client-side Error Logger to backend audit log & app.log
	api.Post("/log-client-error", appHandler.LogClientError)

	// Check if Telegram username has written to our bot (ChatID mapping exists)
	api.Post("/check-tg-verified", func(c *fiber.Ctx) error {
		var body struct {
			Telegram string `json:"telegram"`
		}
		if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Telegram) == "" {
			return c.JSON(fiber.Map{"verified": false})
		}
		return c.JSON(fiber.Map{"verified": tgService.IsUserMapped(body.Telegram)})
	})

	// Chunked Streaming Upload Endpoints (supports 15GB+ files)
	api.Post("/upload/init", handlers.InitUpload)
	api.Post("/upload/chunk", handlers.UploadChunk)

	// Public Application Submit
	api.Post("/media/submit", appHandler.SubmitMediaApplication)

	// Moderator Authentication & Verification (Rate Limited: max 5 requests per 1 min per IP for DDoS protection)
	modVerifyLimiter := rateLimitMiddleware(db, 5, 1*time.Minute)
	api.Post("/mod/verify-key", modVerifyLimiter, appHandler.VerifyModKey)

	// Moderator Protected Endpoints
	modGroup := api.Group("/mod", modMiddleware(db))
	modGroup.Post("/hwid/submit", appHandler.SubmitHWIDReset)
	modGroup.Post("/discord/submit", appHandler.SubmitDiscordBan)

	// Admin Secret Verification
	api.Post("/admin/verify-code", func(c *fiber.Ctx) error {
		var body struct {
			Code string `json:"code"`
		}
		clientIP := middleware.GetRealIP(c)
		if err := c.BodyParser(&body); err != nil || body.Code != adminCode {
			db.RecordAuditLog("ADMIN_LOGIN", "failed", "Invalid admin code attempted", clientIP, c.Get("User-Agent"))
			return c.Status(401).JSON(fiber.Map{"error": "Неверный пароль администратора"})
		}
		db.RecordAuditLog("ADMIN_LOGIN", "success", "Admin logged in successfully", clientIP, c.Get("User-Agent"))
		return c.JSON(fiber.Map{"success": true, "token": adminCode})
	})

	// Admin Dashboard Protected Endpoints
	adminGroup := api.Group("/admin", adminMiddleware(adminCode))
	adminGroup.Get("/stats", adminHandler.GetStats)
	adminGroup.Get("/media", adminHandler.GetMediaApplications)
	adminGroup.Post("/media/:id/status", adminHandler.UpdateMediaStatus)
	adminGroup.Get("/hwid", adminHandler.GetHWIDRequests)
	adminGroup.Post("/hwid/:id/status", adminHandler.UpdateHWIDStatus)
	adminGroup.Get("/discord", adminHandler.GetDiscordBans)
	adminGroup.Post("/discord/:id/status", adminHandler.UpdateDiscordBanStatus)
	adminGroup.Get("/mod-keys", adminHandler.GetModKeys)
	adminGroup.Post("/mod-keys", adminHandler.CreateModKey)
	adminGroup.Post("/mod-keys/:id", adminHandler.ToggleModKey)
	adminGroup.Get("/banned-ips", adminHandler.GetBannedIPs)
	adminGroup.Post("/banned-ips", adminHandler.AddBannedIP)
	adminGroup.Delete("/banned-ips/:id", adminHandler.RemoveBannedIP)
	adminGroup.Get("/logs", adminHandler.GetAuditLogs)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	log.Printf("delta media portal server listening on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func modMiddleware(db *database.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		key := c.Get("X-Mod-Key")
		if key == "" {
			return c.Status(401).JSON(fiber.Map{"error": "Секретный ключ модератора не указан"})
		}
		var isNum int
		var isAct int
		var nickname string
		err := db.SQL.QueryRow(db.Rebind("SELECT id, nickname, is_active FROM moderator_keys WHERE key = ?"), key).Scan(&isNum, &nickname, &isAct)
		if err != nil || isAct == 0 {
			return c.Status(403).JSON(fiber.Map{"error": "Неверный или неактивный ключ модератора"})
		}
		if isAct == 2 {
			return c.Status(403).JSON(fiber.Map{"error": "Ваш ключ заморожен. Для разблокировки обратитесь к Куратору."})
		}
		c.Locals("mod_nickname", nickname)
		c.Locals("mod_key", key)
		return c.Next()
	}
}

func adminMiddleware(secret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := c.Get("X-Admin-Secret")
		if token == "" || token != secret {
			return c.Status(403).JSON(fiber.Map{"error": "Доступ запрещен. Требуются права администратора."})
		}
		return c.Next()
	}
}

func rateLimitMiddleware(db *database.DB, maxReqs int, window time.Duration) fiber.Handler {
	type clientLog struct {
		count     int
		startTime time.Time
	}
	var clients sync.Map

	return func(c *fiber.Ctx) error {
		ip := middleware.GetRealIP(c)
		now := time.Now()

		v, _ := clients.Load(ip)
		if v != nil {
			cl := v.(*clientLog)
			if now.Sub(cl.startTime) < window {
				if cl.count >= maxReqs {
					db.RecordAuditLog("RATE_LIMIT_EXCEEDED", "warning", fmt.Sprintf("IP %s exceeded rate limit on %s", ip, c.Path()), ip, c.Get("User-Agent"))
					return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
						"success": false,
						"error":   "Слишком много попыток. Попробуйте через минуту.",
					})
				}
				cl.count++
			} else {
				clients.Store(ip, &clientLog{count: 1, startTime: now})
			}
		} else {
			clients.Store(ip, &clientLog{count: 1, startTime: now})
		}
		return c.Next()
	}
}
