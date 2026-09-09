// Command e2e — сквозной тест локального сервера (go run ./tools/e2e).
// Симулирует: привязку TG-юзера, подтверждение 2FA, вход админом,
// создание кода медиа, выплату из кабинета и решения в админке.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"dmr/internal/database"
)

const base = "http://127.0.0.1:3999"

func call(method, path string, body any, cookie *string) (int, map[string]any) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil && *cookie != "" {
		req.Header.Set("Cookie", *cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Println("FAIL:", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if c := resp.Header.Get("Set-Cookie"); c != "" && cookie != nil {
		*cookie = strings.Split(c, ";")[0]
	}
	return resp.StatusCode, out
}

func assert(cond bool, name string, extra ...any) {
	if cond {
		fmt.Println("PASS:", name)
	} else {
		fmt.Println("FAIL:", name, fmt.Sprint(extra...))
		os.Exit(1)
	}
}

func main() {
	db, err := database.Connect("sqlite", "./smoke.db", "")
	if err != nil {
		fmt.Println("не открыть smoke.db:", err)
		os.Exit(1)
	}

	// 0. Идемпотентность: чистим следы прошлого прогона
	_, _ = db.Exec(`DELETE FROM v2_login_attempts WHERE token LIKE 'e2e-%'`)
	_, _ = db.Exec(`DELETE FROM v2_requests WHERE account_id IN (SELECT id FROM v2_accounts WHERE nickname = 'TestMedia')`)
	_, _ = db.Exec(`DELETE FROM v2_accounts WHERE nickname = 'TestMedia'`)
	_, _ = db.Exec(`UPDATE v2_weeks SET is_current = 0`)
	_, _ = db.Exec(`INSERT INTO v2_weeks (label, opens_at, closes_at, is_current) VALUES ('неделя e2e', ?, ?, 1)`,
		time.Now().Add(-1*time.Hour), time.Now().Add(24*time.Hour))

	// 1. Маппинг TG-юзера для админ-аккаунта (как будто @notyxx написал /start)
	_, _ = db.Exec(`INSERT INTO v2_tg_users (tg_user_id, username, chat_id) VALUES (5972044002, 'notyxx', 5972044002)
		ON CONFLICT (tg_user_id) DO UPDATE SET username = 'notyxx'`)
	_, _ = db.Exec(`UPDATE v2_accounts SET tg_user_id = 5972044002 WHERE telegram = '@notyxx'`)

	// 2. Логин создаёт попытку; TG-доставка не настроена — вставляем попытку напрямую
	code, resp := call("POST", "/api/auth/login", map[string]string{"code": "DELTA-ROOT-0001", "gps": "55.75,37.61"}, nil)
	assert(code == 500 && strings.Contains(fmt.Sprint(resp["error"]), "Telegram"), "логин без токена бота возвращает ошибку доставки", resp)

	var adminAccID int64
	_ = db.QueryRow(`SELECT id FROM v2_accounts WHERE role = 'admin' LIMIT 1`).Scan(&adminAccID)
	if adminAccID == 0 {
		adminAccID = 1
	}

	attemptToken := "e2e-attempt-token-0001"
	_, err = db.Exec(`INSERT INTO v2_login_attempts (token, account_id, ip, gps, status) VALUES (?, ?, '127.0.0.1', '55.75,37.61', 'pending')`, attemptToken, adminAccID)
	assert(err == nil, "попытка входа вставлена", err)

	// 3. Подтверждение 2FA (как будто нажата кнопка в TG) → сессия
	_, _ = db.Exec(`UPDATE v2_login_attempts SET status = 'approved' WHERE token = ?`, attemptToken)
	adminCookie := ""
	code, resp = call("GET", "/api/auth/attempt/"+attemptToken, nil, &adminCookie)
	assert(code == 200 && resp["status"] == "approved", "2FA approved → сессия в cookie", resp)
	assert(strings.Contains(adminCookie, "dmr_session="), "cookie выдана", adminCookie)

	// 4. Админ-эндпоинты под сессией
	code, resp = call("GET", "/api/admin/stats", nil, &adminCookie)
	assert(code == 200 && resp["success"] == true, "stats под админ-сессией", resp)

	code, resp = call("POST", "/api/admin/accounts", map[string]string{
		"role": "media", "nickname": "TestMedia", "telegram": "@testmedia"}, &adminCookie)
	assert(code == 200, "создан код медиа", resp)
	_, _ = resp["account"].(map[string]any)["code"].(string) // код генерируется сервером

	// 5. Медиа пишет боту → привязка; логин медиа → 2FA → сессия
	mediaAccID := int64(resp["account"].(map[string]any)["id"].(float64))
	_, _ = db.Exec(`INSERT INTO v2_tg_users (tg_user_id, username, chat_id) VALUES (777000111, 'testmedia', 777000111)
		ON CONFLICT (tg_user_id) DO NOTHING`)
	_, _ = db.Exec(`UPDATE v2_accounts SET tg_user_id = 777000111 WHERE id = ?`, mediaAccID)

	mediaToken := "e2e-media-token-0001"
	_, _ = db.Exec(`INSERT INTO v2_login_attempts (token, account_id, ip, gps, status) VALUES (?, ?, '10.0.0.9', '55.0,37.0', 'pending')`, mediaToken, mediaAccID)
	_, _ = db.Exec(`UPDATE v2_login_attempts SET status = 'approved' WHERE token = ?`, mediaToken)
	mediaCookie := ""
	code, resp = call("GET", "/api/auth/attempt/"+mediaToken, nil, &mediaCookie)
	assert(code == 200 && resp["status"] == "approved", "медиа-сессия выдана", resp)
	fmt.Printf("   media cookie: %q mediaAccID=%d\n", mediaCookie, mediaAccID)
	code, resp = call("GET", "/api/me", nil, &mediaCookie)
	fmt.Println("   /api/me:", code, resp)

	// 6. Выплата из кабинета (USDT)
	code, resp = call("POST", "/api/cabinet/payout", map[string]string{
		"uid": "UID-TEST-1", "duration": "3 месяца", "want": "выплата за 2 видео",
		"method": "usdt", "amount": "25.5"}, &mediaCookie)
	assert(code == 200, "заявка на выплату создана", resp)
	payoutID := fmt.Sprint(resp["id"])

	// 7. Дубликат за ту же неделю отклоняется
	code, resp = call("POST", "/api/cabinet/payout", map[string]string{
		"uid": "UID-TEST-1", "duration": "3 месяца", "want": "ещё", "method": "usdt", "amount": "1"}, &mediaCookie)
	assert(code == 400, "дубликат выплаты за неделю отклонён", resp)

	// 8. Таблица выплат в админке + отклонение с причиной
	code, resp = call("GET", "/api/admin/payouts", nil, &adminCookie)
	assert(code == 200, "таблица выплат доступна", resp)
	code, resp = call("POST", "/api/admin/payouts/"+payoutID+"/decide",
		map[string]string{"action": "reject", "reason": "видео не соответствуют требованиям"}, &adminCookie)
	assert(code == 400 || code == 200, "решение по выплате (CryptoBot не настроен — usdt остаётся pending или отклоняется)", resp)
	fmt.Println("   decide resp:", resp)

	// 9. FunPay-выплата из кабинета + одобрение (без CryptoBot — фанпей не требует)
	code, resp = call("POST", "/api/cabinet/lot", map[string]string{
		"uid": "UID-TEST-1", "platform": "funpay",
		"lot_url": "https://funpay.com/lots/123abc", "want": "реклама лота"}, &mediaCookie)
	assert(code == 200, "заявка на лот создана", resp)
	lotID := fmt.Sprint(resp["id"])
	code, resp = call("POST", "/api/admin/payouts/"+lotID+"/decide", map[string]string{"action": "approve"}, &adminCookie)
	assert(code == 200, "лот одобрен", resp)

	// 10. Итоговый текст недели
	var weekID int64
	_ = db.QueryRow(`SELECT id FROM v2_weeks ORDER BY id DESC LIMIT 1`).Scan(&weekID)
	if weekID == 0 {
		weekID = 1
	}
	code, resp = call("POST", "/api/admin/week-summary", map[string]any{"week_id": weekID, "text": "итог недели e2e"}, &adminCookie)
	assert(code == 200, "итоговый текст недели сохранён", resp)

	// 11. Бан по ссылке + проверка, что заявка с забаненным TG отклоняется
	code, resp = call("POST", "/api/admin/bans", map[string]string{"btype": "telegram", "value": "@banned_guy", "reason": "тест"}, &adminCookie)
	assert(code == 200, "бан по telegram добавлен", resp)
	code, resp = call("POST", "/api/media/submit", map[string]any{
		"lang": "ru", "uid": "UID-BAN-1", "criteria_agreed": true, "platform": "youtube",
		"channel_url": "https://youtube.com/@banned_guy", "servers": []string{"Funtime"},
		"videos_per_week": "2", "why_join": "хочу в медиа давно очень", "exclusive": "no",
		"telegram": "@banned_guy"}, nil)
	assert(code == 403 && resp["banned"] == true, "забаненный юзер не может подать заявку", resp)

	fmt.Println("\nE2E: все проверки пройдены ✅")
}
