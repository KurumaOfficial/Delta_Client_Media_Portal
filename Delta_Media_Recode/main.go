package main

import (
	"io"
	"log"
	"os"
	"time"
	_ "time/tzdata" // независимость часовых поясов от ОС

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"dmr/config"
	"dmr/internal/auth"
	"dmr/internal/bans"
	"dmr/internal/database"
	"dmr/internal/handlers"
	"dmr/internal/middleware"
	"dmr/internal/models"
	"dmr/internal/payouts"
	"dmr/internal/telegram"
	"dmr/internal/uploads"
)

func main() {
	cfg := config.Load()

	// Логи: stdout + файл
	if logFile, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o666); err == nil {
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	}

	db, err := database.Connect(cfg.DBDriver, cfg.DBPath, cfg.SupabaseURL)
	if err != nil {
		log.Fatalf("БД недоступна: %v", err)
	}
	if err := db.BootstrapAdmin(cfg.AdminBootstrapCode, "@"+cfg.TGAdminContact); err != nil {
		log.Printf("Bootstrap admin: %v", err)
	}
	if err := uploads.Init(cfg); err != nil {
		log.Fatalf("Каталоги загрузок: %v", err)
	}

	// Сервисы
	banSvc := bans.NewService(db)
	authSvc := auth.NewService(db, cfg.SessionTTL)
	if cfg.DevAutoApprove2FA && db.IsPostgres() {
		log.Fatal("DEV_AUTO_APPROVE_2FA=true запрещён с postgres (прод-БД). Используй только с локальным sqlite.")
	}
	if cfg.DevAutoApprove2FA {
		log.Println("⚠️  DEV MODE: 2FA подтверждается автоматически без Telegram (только для локальной разработки)")
	}
	authHandler := auth.NewHandler(authSvc, db, cfg.GPSRequired, cfg.DevAutoApprove2FA)

	tgSvc := telegram.NewService(cfg, db, authSvc)
	crypto := telegram.NewCryptoBot(cfg.CryptoBotToken, cfg.CryptoBotTestnet)

	paysSvc := payouts.NewService(db, cfg.WeekTZ)
	paysSvc.OnWeekClosed = func(w models.Week, report string) {
		tgSvc.NotifyOwnersText("📅 Неделя выплат закрыта: " + w.Label + "\n\n" + report)
	}

	publicH := handlers.NewPublic(db, cfg, tgSvc, banSvc)
	modH := handlers.NewMod(db, tgSvc, banSvc)
	cabinetH := handlers.NewCabinet(db, tgSvc, banSvc, paysSvc)
	adminH := handlers.NewAdmin(db, cfg, authSvc, tgSvc, banSvc, paysSvc, crypto)

	// Связки (без циклов импортов)
	authHandler.SetNotifier(tgSvc)
	tgSvc.SetPayoutSink(paysSvc)
	tgSvc.SetDecideFunc(adminH.DecideFromTelegram)

	// Фоновые процессы
	tgSvc.Start()
	go paysSvc.Run()
	go sessionCleanupLoop(authSvc)

	app := fiber.New(fiber.Config{
		AppName:   "Delta Media Recode",
		BodyLimit: 64 * 1024 * 1024, // чанки приходят по 5 МБ, всё большое — стримингом
	})

	app.Use(recover.New())
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))
	app.Use(middleware.IPBanCheck(banSvc))
	app.Use(middleware.Audit(db))
	app.Use(auth.Session(authSvc))

	// Статика и SPA
	app.Static("/css", "./web/static/css")
	app.Static("/js", "./web/static/js")
	app.Static("/static", "./web/static")
	app.Static("/uploads", cfg.UploadDir)
	renderIndex := func(c *fiber.Ctx) error { return c.SendFile("./web/views/index.html") }
	app.Get("/", renderIndex)
	app.Get("/ru", renderIndex)
	app.Get("/en", renderIndex)

	api := app.Group("/api")

	// ── Авторизация ──
	api.Post("/auth/login", middleware.RateLimiter(5, time.Minute), authHandler.Login)
	api.Get("/auth/attempt/:token", authHandler.AttemptStatus)
	api.Get("/me", authHandler.Me)
	api.Post("/logout", authHandler.Logout)

	// ── Публичное ──
	api.Get("/health", publicH.Health)
	api.Post("/log-client-error", publicH.LogClientError)
	api.Post("/check-tg-verified", publicH.CheckTGVerified)
	api.Post("/media/submit", middleware.RateLimiter(5, time.Minute), publicH.SubmitMediaApp)

	// ── Чанковые загрузки доказательств (модераторы/админы) ──
	uploadGuard := auth.Require(authSvc, models.RoleModerator, models.RoleAdmin)
	api.Post("/upload/init", uploadGuard, uploads.InitUpload)
	api.Post("/upload/chunk", uploadGuard, uploads.UploadChunk)

	// ── Кабинет модератора ──
	modGroup := api.Group("/mod", auth.Require(authSvc, models.RoleModerator, models.RoleAdmin))
	modGroup.Post("/hwid", modH.SubmitHWID)
	modGroup.Post("/discord", modH.SubmitDiscord)

	// ── Кабинет медиа/фримедиа ──
	mediaGroup := api.Group("/cabinet", auth.Require(authSvc, models.RoleMedia, models.RoleFreeMedia, models.RoleAdmin))
	mediaGroup.Get("/requests", cabinetH.MyRequests)
	mediaRole := api.Group("/cabinet", auth.Require(authSvc, models.RoleMedia, models.RoleAdmin))
	mediaRole.Post("/payout", cabinetH.SubmitPayout)
	mediaRole.Post("/lot", cabinetH.SubmitLot)
	freeGroup := api.Group("/cabinet", auth.Require(authSvc, models.RoleFreeMedia, models.RoleAdmin))
	freeGroup.Post("/subscription", cabinetH.SubmitSubscription)

	// ── Админ-панель ──
	adminGroup := api.Group("/admin", auth.Require(authSvc, models.RoleAdmin))
	adminGroup.Get("/stats", adminH.Stats)
	adminGroup.Get("/logs", adminH.Logs)
	adminGroup.Get("/settings", adminH.Settings)
	adminGroup.Post("/settings", adminH.UpdateSetting)

	adminGroup.Get("/media", adminH.MediaApps)
	adminGroup.Post("/media/:id/decide", adminH.DecideMedia)
	adminGroup.Get("/hwid", adminH.HWIDRequests)
	adminGroup.Post("/hwid/:id/decide", adminH.DecideHWID)
	adminGroup.Get("/discord", adminH.DiscordBans)
	adminGroup.Post("/discord/:id/decide", adminH.DecideDiscord)

	adminGroup.Get("/payouts", adminH.Payouts)
	adminGroup.Post("/payouts/:id/decide", adminH.DecidePayout)
	adminGroup.Post("/week-summary", adminH.UpdateWeekSummary)

	adminGroup.Get("/accounts", adminH.Accounts)
	adminGroup.Post("/accounts", adminH.CreateAccount)
	adminGroup.Post("/accounts/:id/toggle", adminH.ToggleAccount)
	adminGroup.Post("/accounts/:id/recode", adminH.ResetCode)
	adminGroup.Delete("/accounts/:id", adminH.DeleteAccount)

	adminGroup.Get("/bans", adminH.Bans)
	adminGroup.Post("/bans", adminH.AddBan)
	adminGroup.Delete("/bans/:id", adminH.RemoveBan)
	adminGroup.Get("/tg-windows", adminH.TGWindows)

	addr := cfg.Host + ":" + cfg.Port
	log.Printf("Delta Media Recode слушает %s (БД: %s)", addr, db.Driver)
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Сервер: %v", err)
	}
}

func sessionCleanupLoop(svc *auth.Service) {
	for range time.Tick(time.Hour) {
		svc.Cleanup()
	}
}
