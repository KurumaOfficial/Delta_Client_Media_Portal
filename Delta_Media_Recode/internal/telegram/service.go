package telegram

import (
	"fmt"
	"log"
	"strings"
	"sync"
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
}

// PayoutSink — приём паст выплат из Telegram.
type PayoutSink interface {
	WindowOpen() bool
	WeekLabel() string
	HandlePaste(nickname, telegram string, tgUserID int64, text string) (int64, string, error)
}

// DecideFunc — применение админ-решения по заявке из Telegram-кнопок.
type DecideFunc func(kind string, id int64, approve bool) error

// Service — вся Telegram-логика: polling, секретарь, 2FA, пасты, напоминания.
type Service struct {
	cfg    *config.Config
	db     *database.DB
	cl     *Client
	auth   AuthBackend
	pays   PayoutSink
	decide DecideFunc

	mu         sync.Mutex
	businessID string
	responded  map[int64]bool // секретарь отвечает один раз на юзера
	timers     map[int64]*time.Timer
}

func NewService(cfg *config.Config, db *database.DB, auth AuthBackend) *Service {
	return &Service{
		cfg: cfg, db: db, auth: auth, cl: NewClient(cfg.TGBotToken),
		responded: make(map[int64]bool), timers: make(map[int64]*time.Timer),
	}
}

func (s *Service) Client() *Client            { return s.cl }
func (s *Service) SetPayoutSink(p PayoutSink) { s.pays = p }
func (s *Service) SetDecideFunc(f DecideFunc) { s.decide = f }

// Start запускает фон: резолв бота, polling и наблюдатель 24h-окон.
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
	s.loadBusinessID()
	go s.pollLoop()
	go s.WindowWatcher()
}

func (s *Service) loadBusinessID() {
	var id string
	_ = s.db.QueryRow(`SELECT value FROM v2_settings WHERE key = 'business_connection_id'`).Scan(&id)
	s.mu.Lock()
	s.businessID = id
	s.mu.Unlock()
}

func (s *Service) saveBusinessID(id string) {
	s.mu.Lock()
	s.businessID = id
	s.mu.Unlock()
	_ = s.db.SetSetting("business_connection_id", id)
}

func (s *Service) currentBusinessID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.businessID
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
	case upd.BusinessConnection != nil:
		s.handleBusinessConnection(upd.BusinessConnection)
	case upd.CallbackQuery != nil:
		s.handleCallback(upd.CallbackQuery)
	case upd.Message != nil:
		s.handleDirect(upd.Message)
	case upd.BusinessMessage != nil:
		s.handleBusiness(upd.BusinessMessage)
	}
}

// isOwner — владелец бота (админ/секретарь).
func (s *Service) isOwner(u User) bool {
	for _, id := range s.cfg.TGOwnerIDs {
		if u.ID == id {
			return true
		}
	}
	name := strings.ToLower(u.Username)
	return name == s.cfg.TGAdminContact || name == s.cfg.TGSecretary
}

// handleBusinessConnection привязывает бизнес-подключение секретаря.
func (s *Service) handleBusinessConnection(bc *BusinessConn) {
	if !s.isOwner(bc.User) {
		s.db.RecordAudit("TG_SECURITY", "warning",
			fmt.Sprintf("Посторонний %s (ID %d) подключил бота к Business — проигнорировано", bc.User.Username, bc.User.ID), "", "")
		return
	}
	if bc.Enabled {
		s.saveBusinessID(bc.ID)
		log.Printf("[TG] Business-подключение секретаря привязано: %s (@%s)", bc.ID, bc.User.Username)
	} else {
		log.Printf("[TG] Business-подключение @%s отключено", bc.User.Username)
	}
}

// handleDirect — сообщения боту в лс: /start, /template, пасты выплат.
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
		_ = s.cl.SendMessage(msg.Chat.ID, fmt.Sprintf(
			"🤖 <b>Delta Media Bot</b>\n\nПривет, %s!\nЧерез меня приходит подтверждение входа на сайт и статусы заявок.\n\n"+
				"📋 Шаблон заявки на выплату: /template", escapeHTML(msg.From.FirstName)))
		return
	case strings.HasPrefix(lower, "/template"):
		_ = s.cl.SendMessage(msg.Chat.ID, "<pre>"+escapeHTML(s.db.Setting("payout_paste_template"))+"</pre>")
		return
	}

	// Паста выплаты от медиа-аккаунта (в лс боту)
	s.tryPayoutPaste(msg.From, msg.Chat.ID, text, "")
}

// handleBusiness — сообщения секретарю (@notyxs) через Business API.
func (s *Service) handleBusiness(bm *BusinessMessage) {
	if bm.From.ID == 0 {
		return
	}
	s.mapUser(bm.From, bm.Chat.ID, true)
	s.trackIncoming(bm.From.ID)

	if s.isOwner(bm.From) {
		return // сообщения админа/секретаря не обрабатываем
	}

	// Паста выплаты имеет приоритет; если не паста — автоответ секретаря.
	if s.tryPayoutPaste(bm.From, bm.Chat.ID, strings.TrimSpace(bm.Text), bm.BusinessConnectionID) {
		return
	}
	s.secretaryAutoReply(bm)
}

// tryPayoutPaste пробует распарсить пасту выплаты от активного медиа.
func (s *Service) tryPayoutPaste(from User, chatID int64, text, bizID string) bool {
	if s.pays == nil || len(text) < 10 {
		return false
	}
	account, err := s.auth.AccountByTelegram(from.Username)
	if err != nil || account.Role != models.RoleMedia || account.IsActive != 1 {
		return false // «папка медиа выплаты»: принимаем только действующих медиа
	}
	if !s.pays.WindowOpen() {
		_ = s.reply(chatID, bizID, "⏳ Приём заявок на выплату закрыт. Окно: вторник 01:00 — понедельник 22:00 (МСК).")
		return true
	}
	id, _, err := s.pays.HandlePaste(account.Nickname, account.Telegram, account.TGUserID, text)
	if err != nil {
		_ = s.reply(chatID, bizID, "❌ Паста неверная: "+escapeHTML(err.Error())+"\n\nАктуальный шаблон: /template")
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

// reply шлёт сообщение от секретаря (если бизнес привязан) или от бота.
func (s *Service) reply(chatID int64, bizID, text string) error {
	if biz, err := s.effectiveBizID(bizID); err == nil && biz != "" {
		if err := s.cl.SendBusiness(biz, chatID, text); err == nil {
			return nil
		}
	}
	return s.cl.SendMessage(chatID, text)
}

func (s *Service) effectiveBizID(preferred string) (string, error) {
	biz := preferred
	if biz == "" {
		biz = s.currentBusinessID()
	}
	if biz == "" {
		return "", fmt.Errorf("business not bound")
	}
	return biz, nil
}
