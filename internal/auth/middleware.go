package auth

import (
	"strings"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/models"
)

const CookieName = "dmr_session"

// Session middleware: резолвит сессию из cookie и кладёт аккаунт в Locals.
func Session(svc *Service) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if raw := c.Cookies(CookieName); raw != "" {
			if sess, ok := svc.Session(raw); ok {
				c.Locals("session", sess)
				c.Locals("account", sess.Account)
			}
		}
		return c.Next()
	}
}

// AccountOf достаёт аккаунт из контекста (nil, если не авторизован).
func AccountOf(c *fiber.Ctx) (models.Account, bool) {
	a, ok := c.Locals("account").(models.Account)
	return a, ok
}

// Require пропускает только авторизованные запросы с подходящей ролью.
func Require(svc *Service, roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Cookies(CookieName)
		sess, ok := svc.Session(raw)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false, "error": "Требуется вход в аккаунт",
			})
		}
		if len(roles) > 0 {
			allowed := false
			for _, r := range roles {
				if strings.EqualFold(r, sess.Account.Role) {
					allowed = true
					break
				}
			}
			if !allowed {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"success": false, "error": "Недостаточно прав",
				})
			}
		}
		c.Locals("session", sess)
		c.Locals("account", sess.Account)
		return c.Next()
	}
}
