package handlers

import (
	"fmt"
	"html"
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

// Lots — таблица всех заявок на лоты и сабки.
func (h *Admin) Lots(c *fiber.Ctx) error {
	list, err := h.pays.ListLots(300, 0)
	if err != nil {
		return serverError(c, "Ошибка загрузки лотов")
	}
	if list == nil {
		list = []models.Request{}
	}

	var pendingCount, approvedCount, rejectedCount int
	var subsCount, giveawaysCount, cosmeticsCount, otherCount int
	for _, r := range list {
		switch r.Status {
		case "pending":
			pendingCount++
		case "approved":
			approvedCount++
		case "rejected":
			rejectedCount++
		}

		wantLower := strings.ToLower(r.Want)
		isGiveaway := r.Kind == models.KindGiveaway || strings.Contains(wantLower, "розыгрыш")
		isSub := r.Kind == models.KindSubscription || strings.Contains(wantLower, "сабк") || strings.Contains(wantLower, "подписк")
		isCosmetics := strings.Contains(wantLower, "космет")
		if isGiveaway {
			giveawaysCount++
		} else if isSub {
			subsCount++
		} else if isCosmetics {
			cosmeticsCount++
		} else {
			otherCount++
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    list,
		"stats": fiber.Map{
			"total":     len(list),
			"pending":   pendingCount,
			"approved":  approvedCount,
			"rejected":  rejectedCount,
			"subs":      subsCount,
			"giveaways": giveawaysCount,
			"cosmetics": cosmeticsCount,
			"other":     otherCount,
		},
	})
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
		w, err := h.pays.GetOrCreateWeek()
		if err != nil {
			return models.Week{}, fmt.Errorf("нет активной недели")
		}
		return w, nil
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
		Key    string `json:"key"`
	}
	if err := c.BodyParser(&body); err != nil {
		return badRequest(c, "Некорректное решение")
	}
	id, _ := paramID(c)
	approve := body.Action == "approve"
	comment := strings.TrimSpace(body.Reason)
	if comment == "" {
		comment = strings.TrimSpace(body.Key)
	}
	assignedKey, err := h.DecidePayoutInternal(id, approve, comment, actorInfo(c))
	if err != nil {
		return badRequest(c, err.Error())
	}
	return c.JSON(fiber.Map{"success": true, "assigned_key": assignedKey})
}

// DecidePayoutInternal — общий флоу решения по выплате (сайт и Telegram).
func (h *Admin) DecidePayoutInternal(id int64, approve bool, reason, actor string) (string, error) {
	r, err := h.pays.Get(id)
	if err != nil {
		return "", simpleErr("Заявка не найдена")
	}
	if r.Status != "pending" {
		return "", simpleErr("Заявка уже рассмотрена")
	}

	var txRef string
	if approve {
		wantLower := strings.ToLower(r.Want)
		isGiveaway := r.Kind == models.KindGiveaway || strings.Contains(wantLower, "розыгрыш")
		isSub := r.Kind == models.KindSubscription ||
			(r.Kind == models.KindLot && (strings.Contains(wantLower, "сабк") || strings.Contains(wantLower, "подписк")))

		if isGiveaway {
			key := strings.TrimSpace(reason)
			if key == "" {
				// Извлекаем 1 ключ из хранилища ключей для розыгрышей
				poppedKey, err := h.db.PopGiveawayKey(r.ID, r.AccountID, r.Nickname)
				if err != nil {
					return "", simpleErr("В пуле ключей для розыгрышей закончились ключи! Пополните пул во вкладке «Ключи розыгрышей» или введите ключ вручную.")
				}
				key = poppedKey
				reason = poppedKey
			}
			txRef = key
		} else if isSub {
			key := strings.TrimSpace(reason)
			if key == "" {
				// Извлекаем 1 ключ из хранилища ключей подписок
				poppedKey, err := h.db.PopSubscriptionKey(r.ID, r.AccountID, r.Nickname)
				if err != nil {
					return "", simpleErr("В хранилище закончились ключи! Пополните пул ключей в панели администратора или введите ключ вручную.")
				}
				key = poppedKey
				reason = poppedKey
			}
			txRef = key
		} else {
			switch r.Method {
			case models.MethodUSDT:
				txRef = strings.TrimSpace(reason)
			case models.MethodFunPay:
				// оплата фанпеем
			default:
				txRef = strings.TrimSpace(reason)
			}
		}
	}

	if err := h.pays.Decide(id, approve, reason, txRef); err != nil {
		return "", err
	}
	updated, _ := h.pays.Get(id)
	_ = h.tgNotifyPayout(updated, approve, reason)
	h.db.RecordAudit("PAYOUT_DECIDE", "success",
		fmt.Sprintf("Выплата/лот #%d (%s, %s) → %s (%s)", id, r.Nickname, r.Want,
			map[bool]string{true: "approved", false: "rejected"}[approve], actor), "", "")
	return txRef, nil
}

// tgNotifyPayout сообщает заявителю результат по шаблонам из настроек.
func (h *Admin) tgNotifyPayout(r models.Request, approve bool, reason string) error {
	wantLower := strings.ToLower(r.Want)
	isGiveaway := r.Kind == models.KindGiveaway || strings.Contains(wantLower, "розыгрыш")
	isSub := strings.Contains(wantLower, "сабк") || strings.Contains(wantLower, "подписк") || r.Kind == models.KindSubscription

	// Уведомление о выдаче сабки и розыгрыша в TG отключено по требованию
	if (isSub || isGiveaway) && approve {
		return nil
	}

	// Временно отключены все уведомления пользователям/заявителям (кроме административных)
	if h.db.Setting("user_notifications_enabled") != "true" {
		return nil
	}

	tgUserID := r.TGUserID
	if tgUserID == 0 && r.AccountID != 0 && h.auth != nil {
		if acc, err := h.auth.AccountByID(r.AccountID); err == nil {
			tgUserID = h.auth.ResolveTGChatID(acc)
		}
	}
	if tgUserID == 0 && r.Telegram != "" && h.auth != nil {
		tgUserID = h.auth.ResolveTGChatID(models.Account{Telegram: r.Telegram})
	}
	if tgUserID == 0 {
		return fmt.Errorf("нет tg_user_id")
	}

	var text string
	switch {
	case !approve:
		if r.Kind == models.KindLot || r.Kind == models.KindSubscription {
			tpl := h.db.Setting("lot_reject_text")
			if tpl == "" {
				tpl = "❌ <b>Ваша заявка на лот #{id} отклонена.</b>\n\nПричина: {reason}"
			}
			text = r.Replace(tpl, map[string]string{
				"{reason}":  html.EscapeString(reason),
				"{comment}": html.EscapeString(reason),
			})
		} else {
			text = r.Replace(h.db.Setting("payout_reject_text"), map[string]string{"{reason}": reason})
		}
	case r.Kind == models.KindLot || r.Kind == models.KindSubscription:
		tpl := h.db.Setting("lot_approve_text")
		if tpl == "" {
			tpl = "✅ <b>Ваша заявка на лот #{id} одобрена!</b>\n\n{comment}"
		}
		text = r.Replace(tpl, map[string]string{
			"{comment}": html.EscapeString(reason),
		})
	case r.Method == models.MethodUSDT:
		ref := r.TXRef
		if ref == "" {
			ref = reason
		}
		text = r.Replace(h.db.Setting("payout_usdt_text"), map[string]string{
			"{tx}":     ref,
			"{check}":  ref,
			"{cheque}": ref,
		})
	case r.Method == models.MethodFunPay:
		text = r.Replace(h.db.Setting("payout_funpay_text"), nil)
	default:
		verdict := "одобрена ✅"
		if !approve {
			verdict = "отклонена ❌"
		}
		text = fmt.Sprintf("Заявка #%d %s.", r.ID, verdict)
	}
	return h.tg.Client().SendMessage(tgUserID, text)
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
