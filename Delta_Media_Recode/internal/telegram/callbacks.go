package telegram

import (
	"fmt"
	"strconv"
	"strings"
)

// handleCallback — inline-кнопки: 2FA-подтверждение и админ-решения.
func (s *Service) handleCallback(cb *CallbackQuery) {
	parts := strings.Split(cb.Data, ":")
	if len(parts) != 3 {
		s.cl.AnswerCallback(cb.ID, "")
		return
	}
	action, idStr, verb := parts[0], parts[1], parts[2]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		s.cl.AnswerCallback(cb.ID, "Неверный запрос")
		return
	}

	switch action {
	case "2fa":
		s.callback2FA(cb, id, verb)
	case "adm", "pay":
		s.callbackAdmin(cb, action, id, verb)
	default:
		s.cl.AnswerCallback(cb.ID, "")
	}
}

// callback2FA — подтверждение входа владельцем аккаунта.
func (s *Service) callback2FA(cb *CallbackQuery, attemptID int64, verb string) {
	approve := verb == "approve"

	// нажать кнопку может только владелец аккаунта
	accID, err := s.auth.AttemptAccountID(attemptID)
	if err != nil {
		s.cl.AnswerCallback(cb.ID, "Попытка входа не найдена")
		return
	}
	account, err := s.auth.AccountByID(accID)
	if err != nil {
		s.cl.AnswerCallback(cb.ID, "Аккаунт не найден")
		return
	}
	if cb.From.ID != account.TGUserID {
		s.db.RecordAudit("LOGIN_2FA", "warning",
			fmt.Sprintf("Кнопку 2FA попытка #%d нажал посторонний @%s (ID %d)", attemptID, cb.From.Username, cb.From.ID), "", "")
		s.cl.AnswerCallback(cb.ID, "⚠️ Это не ваш вход")
		return
	}

	if err := s.auth.DecideAttempt(attemptID, approve); err != nil {
		s.cl.AnswerCallback(cb.ID, err.Error())
		return
	}
	if approve {
		s.cl.AnswerCallback(cb.ID, "✅ Вход подтверждён")
	} else {
		s.cl.AnswerCallback(cb.ID, "🚫 Вход отклонён")
	}
	s.db.RecordAudit("LOGIN_2FA", "success",
		fmt.Sprintf("Попытка #%d (%s): решение %s через TG", attemptID, account.Nickname, verb), "", "")
}

// callbackAdmin — кнопки «принять/отклонить» у админа.
func (s *Service) callbackAdmin(cb *CallbackQuery, action string, id int64, verb string) {
	if !s.isOwner(cb.From) {
		s.cl.AnswerCallback(cb.ID, "Недостаточно прав")
		s.db.RecordAudit("TG_SECURITY", "warning",
			fmt.Sprintf("Посторонний @%s нажал админ-кнопку %s", cb.From.Username, cb.Data), "", "")
		return
	}
	if s.decide == nil {
		s.cl.AnswerCallback(cb.ID, "Функция недоступна")
		return
	}
	approve := verb == "approve"
	kind := strings.TrimPrefix(action, "adm")
	if action == "pay" {
		kind = "pay"
	}
	if err := s.decide(kind, id, approve); err != nil {
		s.cl.AnswerCallback(cb.ID, "Ошибка: "+err.Error())
		return
	}
	if approve {
		s.cl.AnswerCallback(cb.ID, "✅ Одобрено")
	} else {
		s.cl.AnswerCallback(cb.ID, "❌ Отклонено")
	}
	if cb.Message != nil {
		verdict := "ОДОБРЕНО ✅"
		if !approve {
			verdict = "ОТКЛОНЕНО ❌"
		}
		s.cl.EditMessageText(cb.Message.Chat.ID, cb.Message.MessageID,
			fmt.Sprintf("Решение применено: <b>%s</b>", verdict))
	}
}
