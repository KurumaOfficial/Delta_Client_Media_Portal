// Command seedlocal наполняет ЛОКАЛЬНУЮ sqlite-базу демо-данными,
// чтобы можно было потыкать все кабинеты и админку без Telegram.
// Запуск (сервер должен быть поднят и создать схему):
//
//	go run ./tools/seedlocal ./local.db
package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"dmr/internal/auth"
	"dmr/internal/database"
	"dmr/internal/models"
	"dmr/internal/payouts"
)

func main() {
	dbPath := "./local.db"
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}
	db, err := database.Connect("sqlite", dbPath, "")
	if err != nil {
		log.Fatal("не открыть локальную БД: ", err)
	}
	// таймзона должна совпадать с серверной (WEEK_TZ), иначе недели разъедутся
	weekTZ, err := time.LoadLocation(envOr("WEEK_TZ", "Europe/Moscow"))
	if err != nil {
		weekTZ = time.UTC
	}
	authSvc := auth.NewService(db, 0)
	pays := payouts.NewService(db, weekTZ)

	// Демо-аккаунты всех ролей (idempotent: пересоздаём только если нет)
	demo := []struct{ role, nick, tg string }{
		{models.RoleMedia, "DemoMedia", "@demo_media"},
		{models.RoleFreeMedia, "DemoFree", "@demo_free"},
		{models.RoleModerator, "DemoMod", "@demo_mod"},
	}
	fmt.Println("═══ Демо-аккаунты (вход по коду, 2FA авто-подтверждается в dev-режиме) ═══")
	for _, d := range demo {
		var id int64
		if err := db.QueryRow(`SELECT id FROM v2_accounts WHERE nickname = ?`, d.nick).Scan(&id); err == nil {
			var code string
			_ = db.QueryRow(`SELECT code FROM v2_accounts WHERE id = ?`, id).Scan(&code)
			fmt.Printf("  %-10s %-12s код: %s (уже существует)\n", d.role, d.nick, code)
			continue
		}
		acc, err := authSvc.CreateAccount(d.role, d.nick, d.tg)
		if err != nil {
			log.Fatalf("аккаунт %s: %v", d.nick, err)
		}
		// маппинг «пользователь писал боту» — чтобы проходила проверка TG на публичной форме
		_, _ = db.Exec(`INSERT OR IGNORE INTO v2_tg_users (tg_user_id, username, chat_id) VALUES (?, ?, ?)`,
			900000000+acc.ID, trimAt(d.tg), acc.ID)
		fmt.Printf("  %-10s %-12s код: %s\n", d.role, d.nick, acc.Code)
	}

	// Демо-заявки текущей недели (выплата, лот, подписка)
	var mediaID int64
	_ = db.QueryRow(`SELECT id FROM v2_accounts WHERE nickname = 'DemoMedia'`).Scan(&mediaID)
	var freeID int64
	_ = db.QueryRow(`SELECT id FROM v2_accounts WHERE nickname = 'DemoFree'`).Scan(&freeID)
	var modID int64
	_ = db.QueryRow(`SELECT id FROM v2_accounts WHERE nickname = 'DemoMod'`).Scan(&modID)

	var payoutsCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_requests`).Scan(&payoutsCount)
	if payoutsCount < 3 {
		_, _ = pays.Create(models.Request{Kind: models.KindPayout, Source: "cabinet", AccountID: mediaID,
			Nickname: "DemoMedia", Telegram: "@demo_media", UID: "UID-DEMO-0001",
			Duration: "5 месяцев", Want: "выплата за 2 ролика на Funtime", Amount: "45", Method: models.MethodUSDT})
		_, _ = pays.Create(models.Request{Kind: models.KindLot, Source: "cabinet", AccountID: mediaID,
			Nickname: "DemoMedia", Telegram: "@demo_media", UID: "UID-DEMO-0001",
			Want: "реклама лота под видео", Platform: "funpay", LotURL: "https://funpay.com/lots/123abc456"})
		_, _ = pays.Create(models.Request{Kind: models.KindSubscription, Source: "cabinet", AccountID: freeID,
			Nickname: "DemoFree", Telegram: "@demo_free", UID: "UID-DEMO-0002", Want: "подписка Delta Client на 1 месяц"})
		fmt.Println("  + демо-заявки недели: выплата USDT, лот FunPay, подписка")
	}

	// Демо-заявки на вступление в медиа (для админки)
	var mediaApps int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_media_apps`).Scan(&mediaApps)
	if mediaApps < 3 {
		_, _ = db.InsertReturningID(`INSERT INTO v2_media_apps
			(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week, why_join, exclusive, telegram, status)
			VALUES ('ru', 'UID-DEMO-0003', 1, 'youtube', 'https://youtube.com/@demochannel', 'Funtime, Holyworld',
			'2-3 ролика', 'Снимаю качественный HVH контент, стабильный онлайн', 'yes', '@demo_media', 'pending')`)
		_, _ = db.InsertReturningID(`INSERT INTO v2_media_apps
			(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week, collaborations, why_join, exclusive, telegram, status)
			VALUES ('ru', 'UID-DEMO-1002', 1, 'tiktok', 'https://tiktok.com/@delta_hvh_clips', 'Spookytime, Reallyworld',
			'4-5 клипов', 'Сотрудничал с мелкими проектами', 'Хочу развиваться вместе с Delta', 'no', '@tiktok_star', 'pending')`)
		_, _ = db.InsertReturningID(`INSERT INTO v2_media_apps
			(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week, why_join, exclusive, telegram, status, admin_comment)
			VALUES ('ru', 'UID-DEMO-1003', 1, 'youtube', 'https://youtube.com/@approved_streamer', 'Funtime',
			'1-2 стрима', 'Постоянные стримы по 100+ зрителей', 'yes', '@pro_streamer', 'approved', 'Принят в основной состав')`)
		fmt.Println("  + демо-заявки на вступление в медиа (pending, approved)")
	}

	// HWID запросы (для модераторов/админки)
	var hwidCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_hwid_requests`).Scan(&hwidCount)
	if hwidCount < 2 {
		var modNick string
		_ = db.QueryRow(`SELECT nickname FROM v2_accounts WHERE id = ?`, modID).Scan(&modNick)
		if modNick == "" {
			modNick = "DemoMod"
		}
		_, _ = db.InsertReturningID(`INSERT INTO v2_hwid_requests
			(account_id, mod_nickname, uuid, proof_type, proof_link, reason, status)
			VALUES (?, ?, 'UUID-HWID-001', 'link', 'https://imgur.com/demo_hwid1', 'Смена материнской платы и процессора после апгрейда', 'pending')`,
			modID, modNick)
		_, _ = db.InsertReturningID(`INSERT INTO v2_hwid_requests
			(account_id, mod_nickname, uuid, proof_type, proof_link, reason, status, admin_comment)
			VALUES (?, ?, 'UUID-HWID-002', 'link', 'https://imgur.com/demo_hwid2', 'Переустановка чистой Windows', 'approved', 'Сброшено')`,
			modID, modNick)
		fmt.Println("  + HWID запросы (pending, approved)")
	}

	// Discord баны
	var discordCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_discord_bans`).Scan(&discordCount)
	if discordCount < 2 {
		var modNick string
		_ = db.QueryRow(`SELECT nickname FROM v2_accounts WHERE id = ?`, modID).Scan(&modNick)
		if modNick == "" {
			modNick = "DemoMod"
		}
		_, _ = db.InsertReturningID(`INSERT INTO v2_discord_bans
			(account_id, mod_nickname, offender_id, proof_type, proof_link, reason, status)
			VALUES (?, ?, '789123456789012345', 'link', 'https://imgur.com/proof_discord1', 'Массовый спам вредоносными ссылками в чате', 'pending')`,
			modID, modNick)
		_, _ = db.InsertReturningID(`INSERT INTO v2_discord_bans
			(account_id, mod_nickname, offender_id, proof_type, proof_link, reason, status, admin_comment)
			VALUES (?, ?, '456123789012345678', 'link', 'https://imgur.com/proof_discord2', 'Оскорбление администрации сервера', 'approved', 'Забанен бессрочно')`,
			modID, modNick)
		fmt.Println("  + Discord баны (pending, approved)")
	}

	// Банлист (IP, UID, Telegram, Channel)
	var bansCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_bans`).Scan(&bansCount)
	if bansCount < 3 {
		_, _ = db.Exec(`INSERT OR IGNORE INTO v2_bans (btype, value, reason, banned_by) VALUES
			('ip', '185.220.101.5', 'Спам-бот / Tor exit node', 'admin'),
			('telegram', '@scammer_hvh', 'Попытка скама на аккаунты', 'admin'),
			('uid', 'UID-CHEATER-999', 'Использование сливов и декомпиляция', 'admin'),
			('link', 'https://youtube.com/@fake_delta', 'Фейковый канал с малварью', 'admin')`)
		fmt.Println("  + записи в банлисте (IP, TG, UID, Ссылка)")
	}

	// Журнал аудита
	_, _ = db.Exec(`INSERT INTO v2_audit_logs (event_type, status, details, ip) VALUES
		('SEED', 'success', 'Инициализация тестовых данных для локальной разработки', '127.0.0.1'),
		('LOGIN', 'success', 'Авторизован аккаунт DemoMedia (роль media)', '127.0.0.1')`)

	fmt.Println("═══ Готово. Админ-код смотрите в ADMIN_BOOTSTRAP_CODE (.env) ═══")
}

func trimAt(s string) string {
	if len(s) > 0 && s[0] == '@' {
		return s[1:]
	}
	return s
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
