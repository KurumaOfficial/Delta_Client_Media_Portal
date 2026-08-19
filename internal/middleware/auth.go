package middleware

import (
	"delta-free-media/config"
	"delta-free-media/internal/database"
	"github.com/gofiber/fiber/v2"
)

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

		if modKey == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Unauthorized: Moderator key required",
			})
		}

		var nickname string
		var isActive int
		err := db.SQL.QueryRow("SELECT nickname, is_active FROM moderator_keys WHERE key = ?", modKey).Scan(&nickname, &isActive)
		if err != nil || isActive == 0 {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Forbidden: Invalid or inactive moderator key",
			})
		}

		c.Locals("mod_nickname", nickname)
		c.Locals("mod_key", modKey)
		return c.Next()
	}
}
