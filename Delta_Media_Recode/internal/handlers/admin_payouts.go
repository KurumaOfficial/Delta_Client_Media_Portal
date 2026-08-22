package handlers

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"dmr/internal/middleware"
	"dmr/internal/models"
)

// ── Категория «Медиа выплаты» ────────────────────────────────

// Payouts — таблица текущей недели + архивы.
func (h *Admin) Payouts(c *fiber.Ctx) error {
	weekIDStr := strings.TrimSpace(c.Query("week"))
	week, err := h.currentOrRequestedWeek(weekIDStr)
	if err != nil {
		return badRequest(c, "Неделя не найдена")
	}
	list, err := h.pays.ListByWeek(week.ID)
	if err != nil {
		return serverError(c, "Ошибка загрузки выплат")
	}
	if list == nil {
		list = []models.Request{}
	}
	history, _ := h.pays.HistoryWeeks()
	if history == nil {
		history = []models.Week{}
	}
	return c.JSON(fiber.Map{"success": true, "data": list, "week": week,
		"stats": h.pays.Stats(week.ID), "history": history})
}

func (h *Admin) currentOrRequestedWeek(weekIDStr string) (models.Week, error) {
	if weekIDStr != "" {
		id, err := strconv.ParseInt(weekIDStr, 10, 64)
		if err != nil {
			return models.Week{}, err
		}
		return h.pays.WeekByID(id)
	}
	week, ok := h.pays.CurrentWeek()
	if !ok {
		return models.Week{}, fmt.Errorf("нет активной недели")
	}
	return week, nil
}

// DecidePayout — принять/отклонить выплату с сайта.
// Принять + USDT → автовыплата CryptoBot; принять + FunPay → текст с лотом;
// отклонить → паста с причиной.
func (h *Admin) DecidePayout(c *fiber.Ctx) error {
	var body struct {
		Action string `json:"action"` // approve | reject
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректное решение")
	}
	id, _ := paramID(c)
	approve := body.Action == "approve"
	if err := h.DecidePayoutInternal(id, approve, body.Reason, actorInfo(c)); err != nil {
		return badRequest(c, err.Error())
	}
	return c.JSON(fiber.Map{"success": true})
}

// DecidePayoutInternal — общий флоу решения по выплате (сайт и Telegram).
func (h *Admin) DecidePayoutInternal(id int64, approve bool, reason, actor string) error {
	r, err := h.pays.Get(id)
	if err != nil {
		return simpleErr("Заявка не найдена")
	}
	if r.Status != "pending" {
		return simpleErr("Заявка уже рассмотрена")
	}

	var txRef string
	if approve {
		switch r.Method {
		case models.MethodUSDT:
			txRef, err = h.executeUSDTTransfer(r)
			if err != nil {
				// перевод не прошёл: помечаем и шумим админу, юзера не обманываем
				h.db.RecordAudit("PAYOUT_TRANSFER", "failed",
					fmt.Sprintf("Выплата #%d: ошибка CryptoBot: %v", id, err), "", "")
				_ = h.tgNotifyPayout(r, false, "Ошибка автовыплаты: "+err.Error())
				return simpleErr("Ошибка CryptoBot: " + err.Error() +
					". Заявка оставлена в ожидании — проверьте баланс/токен и повторите.")
			}
		case models.MethodFunPay:
			// оплата фанпеем — просто текст
		default:
			// подписки/лоты без метода — без перевода
		}
	}

	if err := h.pays.Decide(id, approve, reason, txRef); err != nil {
		return err
	}
	updated, _ := h.pays.Get(id)
	_ = h.tgNotifyPayout(updated, approve, reason)
	h.db.RecordAudit("PAYOUT_DECIDE", "success",
		fmt.Sprintf("Выплата #%d (%s, %s) → %s (%s)", id, r.Nickname, r.Method,
			map[bool]string{true: "approved", false: "rejected"}[approve], actor), "", "")
	return nil
}

// executeUSDTTransfer делает автовыплату и возвращает ссылку-чек.
func (h *Admin) executeUSDTTransfer(r models.Request) (string, error) {
	if h.crypto == nil || !h.crypto.Enabled() {
		return "", fmt.Errorf("CRYPTOBOT_API_TOKEN не настроен")
	}
	amount, err := strconv.ParseFloat(strings.ReplaceAll(r.Amount, ",", "."), 64)
	if err != nil || amount <= 0 {
		return "", fmt.Errorf("некорректная сумма %q", r.Amount)
	}
	if r.TGUserID == 0 {
		return "", fmt.Errorf("у %s нет привязанного Telegram ID (юзер должен написать боту /start)", r.Telegram)
	}
	spendID := fmt.Sprintf("dmr-payout-%d", r.ID)
	if err := h.crypto.Transfer(r.TGUserID, h.cfg.CryptoBotAsset, amount, spendID,
		fmt.Sprintf("Delta Media выплата #%d", r.ID)); err != nil {
		return "", err
	}
	return fmt.Sprintf("cryptobot:%s:%.2f", spendID, amount), nil
}

// tgNotifyPayout сообщает заявителю результат по шаблонам из настроек.
func (h *Admin) tgNotifyPayout(r models.Request, approve bool, reason string) error {
	if r.TGUserID == 0 {
		return fmt.Errorf("нет tg_user_id")
	}
	var text string
	switch {
	case !approve:
		text = r.Replace(h.db.Setting("payout_reject_text"), map[string]string{"{reason}": reason})
	case r.Method == models.MethodUSDT:
		text = r.Replace(h.db.Setting("payout_usdt_text"), map[string]string{"{tx}": r.TXRef})
	case r.Method == models.MethodFunPay:
		text = r.Replace(h.db.Setting("payout_funpay_text"), nil)
	default:
		verdict := "одобрена ✅"
		if !approve {
			verdict = "отклонена ❌"
		}
		text = fmt.Sprintf("Заявка #%d %s.", r.ID, verdict)
	}
	return h.tg.Client().SendMessage(r.TGUserID, text)
}

// UpdateWeekSummary — редактирование итогового текста недели (как чат с ИИ).
func (h *Admin) UpdateWeekSummary(c *fiber.Ctx) error {
	var body struct {
		WeekID int64  `json:"week_id"`
		Text   string `json:"text"`
	}
	if err := c.BodyParser(&body); err != nil || body.WeekID <= 0 {
		return badRequest(c, "Некорректный запрос")
	}
	if len(body.Text) > 8000 {
		return badRequest(c, "Текст слишком длинный")
	}
	if err := h.pays.SetSummary(body.WeekID, body.Text); err != nil {
		return serverError(c, "Не удалось сохранить")
	}
	h.db.RecordAudit("WEEK_SUMMARY", "success",
		fmt.Sprintf("Итоговый текст недели #%d обновён", body.WeekID),
		middleware.GetRealIP(c), c.Get("User-Agent"))
	return c.JSON(fiber.Map{"success": true})
}
