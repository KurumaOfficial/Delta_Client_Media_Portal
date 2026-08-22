package middleware

import (
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/bans"
	"dmr/internal/database"
)

// IPBanCheck — блокирует любой запрос с забаненного IP (исправленный бан по IP:
// работает на всех маршрутах, включая статику, и отдаёт понятную ошибку).
func IPBanCheck(svc *bans.Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ip := GetRealIP(c)
		if svc.IsIPBanned(ip) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Ваш IP-адрес заблокирован на сайте.",
			})
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
