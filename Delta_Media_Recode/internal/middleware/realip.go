package middleware

import (
	"net"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GetRealIP достаёт настоящий IP клиента за Cloudflare/прокси.
// Порядок доверия: CF-Connecting-IP → True-Client-IP → X-Real-IP → X-Forwarded-For[0] → c.IP().
func GetRealIP(c *fiber.Ctx) string {
	var raw string
	for _, h := range []string{"CF-Connecting-IP", "True-Client-IP", "X-Real-IP"} {
		if v := strings.TrimSpace(c.Get(h)); v != "" {
			raw = v
			break
		}
	}
	if raw == "" {
		if fwd := strings.TrimSpace(c.Get("X-Forwarded-For")); fwd != "" {
			if first := strings.TrimSpace(strings.Split(fwd, ",")[0]); first != "" {
				raw = first
			}
		}
	}
	if raw == "" {
		raw = strings.TrimSpace(c.IP())
	}
	// Убираем порт если передан (напр. 1.2.3.4:5678 или [::1]:5678)
	host := raw
	if h, _, err := net.SplitHostPort(raw); err == nil {
		host = h
	}
	return host
}
