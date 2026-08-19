package middleware

import (
	"strings"

	"delta-free-media/config"
	"delta-free-media/internal/database"
	"github.com/gofiber/fiber/v2"
)

// GetRealIP extracts real client IP behind Cloudflare, Nginx, or Reverse Proxies
func GetRealIP(c *fiber.Ctx) string {
	if cfIP := strings.TrimSpace(c.Get("CF-Connecting-IP")); cfIP != "" {
		return cfIP
	}
	if realIP := strings.TrimSpace(c.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	if fwd := strings.TrimSpace(c.Get("X-Forwarded-For")); fwd != "" {
		parts := strings.Split(fwd, ",")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	if fastly := strings.TrimSpace(c.Get("Fastly-Client-IP")); fastly != "" {
		return fastly
	}
	if trueClient := strings.TrimSpace(c.Get("True-Client-IP")); trueClient != "" {
		return trueClient
	}
	return c.IP()
}

func AdminAuth(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("X-Admin-Secret")
		if authHeader == "" {
			authHeader = c.Cookies("admin_secret")
		}

		if authHeader != cfg.AdminSecret {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Unauthorized: Invalid admin secret",
			})
		}
		return c.Next()
	}
}

func ModAuth(db *database.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		modKey := c.Get("X-Mod-Key")
		if modKey == "" {
			modKey = c.Cookies("mod_key")
		}

		cleanKey := strings.TrimSpace(modKey)
		if cleanKey == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Unauthorized: Moderator key required",
			})
		}

		var nickname string
		var isActive int
		query := db.Rebind(`
			SELECT nickname, is_active FROM moderator_keys 
			WHERE LOWER(TRIM(key)) = LOWER(TRIM(?))
			   OR LOWER(TRIM(REPLACE(key, 'DELTA-', ''))) = LOWER(TRIM(REPLACE(?, 'DELTA-', '')))
			LIMIT 1
		`)
		err := db.SQL.QueryRow(query, cleanKey, cleanKey).Scan(&nickname, &isActive)
		if err != nil || isActive != 1 {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Forbidden: Invalid or inactive moderator key",
			})
		}

		c.Locals("mod_nickname", nickname)
		c.Locals("mod_key", cleanKey)
		return c.Next()
	}
}

