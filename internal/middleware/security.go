package middleware

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/bans"
	"dmr/internal/database"
)

// IPBanCheck — блокирует любой запрос с забаненного IP (исправленный бан по IP:
// работает на всех маршрутах, включая статику и SPA, и полностью блокирует доступ к сайту).
func IPBanCheck(svc *bans.Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ip := GetRealIP(c)
		if svc.IsIPBanned(ip) {
			reason := svc.BanReasonOfIP(ip)
			if reason == "" {
				reason = "Нарушение правил проекта"
			}
			// Для API-запросов отдаём JSON 403
			if strings.HasPrefix(c.Path(), "/api/") {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success": false,
					"error":   "Ваш IP-адрес заблокирован: " + reason,
				})
			}
			// Для браузера отдаём страницу блокировки доступа 403 Forbidden
			c.Set("Content-Type", "text/html; charset=utf-8")
			return c.Status(fiber.StatusForbidden).SendString(fmt.Sprintf(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Доступ заблокирован — Delta Media</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0d12; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1.5rem; }
  .card { background: rgba(22, 24, 32, 0.95); border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 16px; padding: 2.5rem; max-width: 480px; width: 100%%; text-align: center; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7); backdrop-filter: blur(20px); }
  .icon { width: 56px; height: 56px; margin: 0 auto 1.25rem; background: rgba(248, 113, 113, 0.12); border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 50%%; display: flex; align-items: center; justify-content: center; color: #f87171; }
  h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #fff; }
  p { font-size: 0.92rem; color: rgba(255, 255, 255, 0.65); line-height: 1.6; margin-bottom: 1.25rem; }
  .box { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 1rem; text-align: left; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .box-row { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
  .box-row:last-child { margin-bottom: 0; }
  .lbl { color: rgba(255,255,255,0.45); }
  .val { color: #f87171; font-family: monospace; font-weight: 600; }
  .foot { font-size: 0.8rem; color: rgba(255,255,255,0.35); }
</style>
</head>
<body>
<div class="card">
  <div class="icon">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
  </div>
  <h1>Доступ заблокирован</h1>
  <p>Ваш IP-адрес заблокирован администрацией портала Delta Media.</p>
  <div class="box">
    <div class="box-row"><span class="lbl">IP-адрес:</span><span class="val">%s</span></div>
    <div class="box-row"><span class="lbl">Причина:</span><span class="val" style="color:#e2e8f0;font-family:inherit">%s</span></div>
  </div>
  <div class="foot">Сайт недоступен. Если вы считаете, что произошла ошибка, обратитесь к администрации.</div>
</div>
</body>
</html>`, ip, reason))
		}
		return c.Next()
	}
}

// RateLimiter — скользящее окно в памяти, per-IP. Фиксированный буфер вместо
// sync.Map-утечек старой версии: неактивные IP удаляются при следующей очистке.
func RateLimiter(maxReqs int, window time.Duration) fiber.Handler {
	type bucket struct {
		count int
		start time.Time
	}
	var (
		mu      sync.Mutex
		buckets = make(map[string]*bucket)
	)
	return func(c *fiber.Ctx) error {
		ip := GetRealIP(c)
		now := time.Now()

		mu.Lock()
		b := buckets[ip]
		if b == nil || now.Sub(b.start) > window {
			buckets[ip] = &bucket{count: 1, start: now}
			mu.Unlock()
			return c.Next()
		}
		b.count++
		blocked := b.count > maxReqs
		// ленивая очистка, чтобы карта не росла бесконечно
		if len(buckets) > 10000 {
			for k, v := range buckets {
				if now.Sub(v.start) > window {
					delete(buckets, k)
				}
			}
		}
		mu.Unlock()

		if blocked {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error":   "Слишком много запросов. Попробуйте позже.",
			})
		}
		return c.Next()
	}
}

// Audit — журналирование HTTP-запросов API (кроме статики и самого лога).
func Audit(db *database.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		if !strings.HasPrefix(path, "/api/") || path == "/api/log-client-error" {
			return c.Next()
		}
		start := time.Now()
		err := c.Next()
		code := c.Response().StatusCode()
		status := "success"
		if code >= 500 {
			status = "error"
		} else if code >= 400 {
			status = "failed"
		}
		if c.Method() == "GET" && code < 400 {
			return err // GET-поллинг админки не мусорит в логах
		}
		db.RecordAudit("HTTP_"+c.Method(), status,
			path+" → "+itoa(code)+" ("+time.Since(start).Truncate(time.Millisecond).String()+")",
			GetRealIP(c), c.Get("User-Agent"))
		return err
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [8]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
