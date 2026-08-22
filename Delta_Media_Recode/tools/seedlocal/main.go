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
	if payoutsCount == 0 {
		_, err := pays.Create(models.Request{Kind: models.KindPayout, Source: "cabinet", AccountID: mediaID,
			Nickname: "DemoMedia", Telegram: "@demo_media", UID: "UID-DEMO-0001",
			Duration: "5 месяцев", Want: "выплата за 2 ролика", Amount: "42", Method: models.MethodUSDT})
		if err != nil {
			fmt.Println("  (выплата не создана:", err, ")")
		}
		_, _ = pays.Create(models.Request{Kind: models.KindLot, Source: "cabinet", AccountID: mediaID,
			Nickname: "DemoMedia", Telegram: "@demo_media", UID: "UID-DEMO-0001",
			Want: "реклама лота", Platform: "funpay", LotURL: "https://funpay.com/lots/123abc"})
		_, _ = pays.Create(models.Request{Kind: models.KindSubscription, Source: "cabinet", AccountID: freeID,
			Nickname: "DemoFree", Telegram: "@demo_free", UID: "UID-DEMO-0002", Want: "подписка Delta на 1 месяц"})
		fmt.Println("  + демо-заявки недели: выплата USDT, лот FunPay, подписка")
	}

	// Демо-заявка на вступление в медиа + HWID (для таблиц админки)
	var mediaApps int
	_ = db.QueryRow(`SELECT COUNT(*) FROM v2_media_apps`).Scan(&mediaApps)
	if mediaApps == 0 {
		_, _ = db.InsertReturningID(`INSERT INTO v2_media_apps
			(lang, uid, criteria_agreed, platform, channel_url, servers, videos_per_week, why_join, exclusive, telegram)
			VALUES ('ru', 'UID-DEMO-0003', 1, 'youtube', 'https://youtube.com/@demochannel', 'Funtime, Holyworld',
			'2-3 ролика', 'Снимаю HVH клипы давно, хочу в команду', 'yes', '@demo_media')`)
		var modNick string
		_ = db.QueryRow(`SELECT nickname FROM v2_accounts WHERE id = ?`, modID).Scan(&modNick)
		if modNick == "" {
			modNick = "DemoMod"
		}
		_, _ = db.InsertReturningID(`INSERT INTO v2_hwid_requests
			(account_id, mod_nickname, uuid, proof_type, proof_link, reason)
			VALUES (?, ?, 'UID-DEMO-0004', 'link', 'https://imgur.com/demo', 'Смена железа после ремонта')`,
			modID, modNick)
		fmt.Println("  + демо-заявка на вступление в медиа и HWID-запрос")
	}

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
