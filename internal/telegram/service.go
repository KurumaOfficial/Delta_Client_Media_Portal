package telegram

import (
	"fmt"
	"log"
	"strings"
	"time"

	"dmr/config"
	"dmr/internal/database"
	"dmr/internal/models"
)

// AuthBackend — минимальный интерфейс к auth-сервису (без цикла импортов).
type AuthBackend interface {
	DecideAttempt(id int64, approve bool) error
	AttemptAccountID(attemptID int64) (int64, error)
	ResolveTGChatID(a models.Account) int64
	AccountByID(id int64) (models.Account, error)
	AccountByTelegram(username string) (models.Account, error)
	AccountByCode(code string) (models.Account, error)
}

// PayoutSink — приём паст выплат из Telegram.
type PayoutSink interface {
	WindowOpen() bool
	WeekLabel() string
	HandlePaste(nickname, telegram string, tgUserID int64, text string) (int64, string, error)
}

// DecideFunc — применение админ-решения по заявке из Telegram-кнопок.
type DecideFunc func(kind string, id int64, approve bool) error

// Service — логика работы Telegram бота (прямые сообщения, 2FA, пасты).
type Service struct {
	cfg    *config.Config
	db     *database.DB
	cl     *Client
	auth   AuthBackend
	pays   PayoutSink
	decide DecideFunc
}

func NewService(cfg *config.Config, db *database.DB, auth AuthBackend) *Service {
	return &Service{
		cfg: cfg, db: db, auth: auth, cl: NewClient(cfg.TGBotToken),
	}
}

func (s *Service) Client() *Client            { return s.cl }
func (s *Service) SetPayoutSink(p PayoutSink) { s.pays = p }
func (s *Service) SetDecideFunc(f DecideFunc) { s.decide = f }

// Start запускает резолв имени бота и цикл поллинга обновлений.
func (s *Service) Start() {
	if s.cfg.TGBotToken == "" {
		log.Println("[TG] TELEGRAM_BOT_TOKEN пуст — Telegram отключён")
		return
	}
	if err := s.cl.ResolveMe(); err != nil {
		log.Printf("[TG] getMe failed: %v (продолжаю без username)", err)
	} else {
		log.Printf("[TG] Бот %s запущен", s.cl.Me)
	}
	go s.pollLoop()
}

func (s *Service) pollLoop() {
	var offset int64
	for {
		updates, err := s.cl.GetUpdates(offset, 25)
		if err != nil {
			log.Printf("[TG] polling error: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for _, upd := range updates {
			offset = upd.UpdateID + 1
			s.route(upd)
		}
	}
}

func (s *Service) route(upd Update) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[TG] panic in update handler: %v", r)
		}
	}()

	switch {
	case upd.CallbackQuery != nil:
		s.handleCallback(upd.CallbackQuery)
	case upd.Message != nil:
		s.handleDirect(upd.Message)
	}
}

// isOwner — владелец бота (админ).
func (s *Service) isOwner(u User) bool {
	for _, id := range s.cfg.TGOwnerIDs {
		if u.ID == id {
			return true
		}
	}
	name := strings.ToLower(u.Username)
	return name == s.cfg.TGAdminContact
}

// handleDirect — обработка входящих сообщений боту: /start, пасты выплат.
func (s *Service) handleDirect(msg *Message) {
	if msg.From.ID == 0 {
		return
	}
	s.mapUser(msg.From, msg.Chat.ID, false)
	s.trackIncoming(msg.From.ID)

	text := strings.TrimSpace(msg.Text)
	lower := strings.ToLower(text)

	switch {
	case strings.HasPrefix(lower, "/start"):
		arg := strings.TrimSpace(strings.TrimPrefix(text, "/start"))
		if arg != "" && arg != "verify" {
			// Привязка по коду доступа
			acc, err := s.auth.AccountByCode(arg)
			if err == nil && acc.ID != 0 {
				_ = s.authLinkByID(acc.ID, msg.From.ID, msg.From.Username)
				msgText := fmt.Sprintf(
					"✅ <b>Telegram успешно привязан!</b>\n\nАккаунт: <b>%s</b> (%s)\nТеперь сюда будут приходить подтверждения входа (2FA) и статусы ваших заявок.",
					escapeHTML(acc.Nickname), escapeHTML(acc.Role),
				)
				_ = s.cl.SendMessage(msg.Chat.ID, msgText)
				return
			}
		}

		startTpl := s.db.Setting("tg_bot_start_text")
		if startTpl == "" {
			startTpl = "🤖 <b>Delta Media Bot</b>\n\nПривет, {name}!\nЧерез меня приходит подтверждение входа на сайт (2FA) и статусы ваших заявок."
		}
		replyText := strings.ReplaceAll(startTpl, "{name}", escapeHTML(msg.From.FirstName))
		_ = s.cl.SendMessage(msg.Chat.ID, replyText)
		return
	}

	// Паста выплаты от медиа-аккаунта (в лс боту)
	s.tryPayoutPaste(msg.From, msg.Chat.ID, text, "")
}

// tryPayoutPaste пробует распарсить пасту выплаты от активного медиа.
func (s *Service) tryPayoutPaste(from User, chatID int64, text, bizID string) bool {
	if s.pays == nil || len(text) < 10 {
		return false
	}
	account, err := s.auth.AccountByTelegram(from.Username)
	if err != nil || account.Role != models.RoleMedia || account.IsActive != 1 {
		return false // принимаем только действующих медиа
	}
	if !s.pays.WindowOpen() {
		_ = s.reply(chatID, bizID, "Приём заявок на выплату закрыт. Окно: пн 00:00 — пн 23:00 (МСК).")
		return true
	}
	id, _, err := s.pays.HandlePaste(account.Nickname, account.Telegram, account.TGUserID, text)
	if err != nil {
		_ = s.reply(chatID, bizID, "❌ Паста неверная: "+escapeHTML(err.Error()))
		s.db.RecordAudit("PAYOUT_PASTE", "failed",
			fmt.Sprintf("@%s: %v", from.Username, err), "", "")
		return true
	}
	_ = s.reply(chatID, bizID, fmt.Sprintf("✅ Заявка на выплату <b>№%d</b> принята (неделя «%s»).", id, escapeHTML(s.pays.WeekLabel())))
	s.notifyAdminsFull(fmt.Sprintf("💸 <b>Новая заявка на выплату №%d</b> (из Telegram, @%s)", id, escapeHTML(from.Username)),
		fmt.Sprintf("Заявитель: %s (@%s)\nUID: смотреть в панели\nСтатус: ожидает решения.", account.Nickname, from.Username),
		[][2]string{{"✅ Принять", "pay:" + fmt.Sprint(id) + ":approve"}, {"❌ Отклонить", "pay:" + fmt.Sprint(id) + ":reject"}})
	return true
}

// reply отправляет сообщение пользователю через бота.
func (s *Service) reply(chatID int64, bizID, text string) error {
	return s.cl.SendMessage(chatID, text)
}
