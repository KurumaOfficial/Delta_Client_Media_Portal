package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// GetRealIP достаёт настоящий IP клиента за Cloudflare/прокси.
// Порядок доверия: CF-Connecting-IP → True-Client-IP → X-Real-IP → X-Forwarded-For[0] → c.IP().
func GetRealIP(c *fiber.Ctx) string {
	for _, h := range []string{"CF-Connecting-IP", "True-Client-IP", "X-Real-IP"} {
		if v := strings.TrimSpace(c.Get(h)); v != "" {
			return v
		}
	}
	if fwd := strings.TrimSpace(c.Get("X-Forwarded-For")); fwd != "" {
		if first := strings.TrimSpace(strings.Split(fwd, ",")[0]); first != "" {
			return first
		}
	}
	return c.IP()
}
