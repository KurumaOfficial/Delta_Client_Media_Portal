package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type AuditLogger interface {
	RecordAuditLog(action, status, details, ip, userAgent string)
}

type TelegramService struct {
	BotToken          string
	AdminChatID       string
	BusinessID        string
	SecretaryUsername string
	UserChatMap       map[string]string
	ChatToUserMap     map[string]string
	BusinessPeers     map[string]string
	RespondedUsers    map[string]bool
	debounceTimers    map[string]*time.Timer
	Logger            AuditLogger
	Client            *http.Client
	mu                sync.Mutex
}

func (s *TelegramService) SetLogger(logger AuditLogger) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Logger = logger
}

func (s *TelegramService) recordAudit(action, status, details string) {
	if s.Logger != nil {
		s.Logger.RecordAuditLog(action, status, details, "bot", "TelegramService")
	}
}

type tgSessionData struct {
	AdminChatID       string            `json:"admin_chat_id"`
	BusinessID        string            `json:"business_id"`
	SecretaryUsername string            `json:"secretary_username,omitempty"`
	UserChatMap       map[string]string `json:"user_chat_map,omitempty"`
	ChatToUserMap     map[string]string `json:"chat_to_user_map,omitempty"`
	BusinessPeers     map[string]string `json:"business_peers,omitempty"`
}

func (s *TelegramService) loadSession() {
	if s.UserChatMap == nil {
		s.UserChatMap = make(map[string]string)
	}
	if s.ChatToUserMap == nil {
		s.ChatToUserMap = make(map[string]string)
	}
	if s.BusinessPeers == nil {
		s.BusinessPeers = make(map[string]string)
	}
	if s.RespondedUsers == nil {
		s.RespondedUsers = make(map[string]bool)
	}
	if s.debounceTimers == nil {
		s.debounceTimers = make(map[string]*time.Timer)
	}
	data, err := os.ReadFile("./tg_session.json")
	if err == nil {
		var sess tgSessionData
		if err := json.Unmarshal(data, &sess); err == nil {
			if sess.AdminChatID != "" {
				s.AdminChatID = sess.AdminChatID
			}
			if sess.BusinessID != "" {
				s.BusinessID = sess.BusinessID
			}
			if sess.SecretaryUsername != "" {
				s.SecretaryUsername = sess.SecretaryUsername
			}
			if sess.UserChatMap != nil {
				s.UserChatMap = sess.UserChatMap
			}
			if sess.ChatToUserMap != nil {
				s.ChatToUserMap = sess.ChatToUserMap
			} else {
				for u, id := range s.UserChatMap {
					s.ChatToUserMap[id] = u
				}
			}
			if sess.BusinessPeers != nil && len(sess.BusinessPeers) > 0 {
				s.BusinessPeers = sess.BusinessPeers
			} else {
				for u, id := range s.UserChatMap {
					s.BusinessPeers[u] = id
				}
				log.Printf("[Telegram] Migrated %d users from UserChatMap to BusinessPeers (first run)", len(s.BusinessPeers))
			}
			log.Printf("[Telegram] Loaded persisted session: AdminChatID=%s, BusinessID=%s, Secretary=@%s, MappedUsers=%d, BusinessPeers=%d", s.AdminChatID, s.BusinessID, s.SecretaryUsername, len(s.UserChatMap), len(s.BusinessPeers))
		}
	}
}

func (s *TelegramService) saveSession() {
	sess := tgSessionData{
		AdminChatID:       s.AdminChatID,
		BusinessID:        s.BusinessID,
		SecretaryUsername: s.SecretaryUsername,
		UserChatMap:       s.UserChatMap,
		ChatToUserMap:     s.ChatToUserMap,
		BusinessPeers:     s.BusinessPeers,
	}
	data, _ := json.Marshal(sess)
	go os.WriteFile("./tg_session.json", data, 0644)
}

func NewTelegramService(botToken, adminChatID, businessID string) *TelegramService {
	s := &TelegramService{
		BotToken:       botToken,
		AdminChatID:    adminChatID,
		BusinessID:     businessID,
		UserChatMap:    make(map[string]string),
		RespondedUsers: make(map[string]bool),
		debounceTimers: make(map[string]*time.Timer),
		Client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
	s.loadSession()
	if botToken != "" {
		go s.StartPolling()
	}
	return s
}

type tgSendMessagePayload struct {
	ChatID               interface{} `json:"chat_id"`
	Text                 string      `json:"text"`
	ParseMode            string      `json:"parse_mode,omitempty"`
	BusinessConnectionID string      `json:"business_connection_id,omitempty"`
}

type tgUpdateResponse struct {
	OK     bool       `json:"ok"`
	Result []tgUpdate `json:"result"`
}

type tgUpdate struct {
	UpdateID           int64              `json:"update_id"`
	Message            *tgMessage         `json:"message,omitempty"`
	BusinessConnection *tgBusinessConn    `json:"business_connection,omitempty"`
	BusinessMessage    *tgBusinessMessage `json:"business_message,omitempty"`
}

type tgBusinessConn struct {
	ID         string `json:"id"`
	User       tgUser `json:"user"`
	UserChatID int64  `json:"user_chat_id"`
	CanReply   bool   `json:"can_reply"`
	IsEnabled  bool   `json:"is_enabled"`
}

type tgBusinessMessage struct {
	MessageID            int64  `json:"message_id"`
	BusinessConnectionID string `json:"business_connection_id"`
	From                 tgUser `json:"from"`
	Chat                 tgChat `json:"chat"`
	Text                 string `json:"text"`
}

type tgMessage struct {
	MessageID int64  `json:"message_id"`
	From      tgUser `json:"from"`
	Chat      tgChat `json:"chat"`
	Text      string `json:"text"`
}

type tgUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type tgChat struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	Type      string `json:"type"`
}

type tgGetUpdatesPayload struct {
	Offset         int64    `json:"offset"`
	Timeout        int      `json:"timeout"`
	AllowedUpdates []string `json:"allowed_updates"`
}

func (s *TelegramService) StartPolling() {
	log.Printf("[Telegram] Starting long-polling listener for business connections & updates...")
	var offset int64 = 0

	for {
		url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates", s.BotToken)
		payload := tgGetUpdatesPayload{
			Offset:         offset,
			Timeout:        5,
			AllowedUpdates: []string{"message", "edited_message", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"},
		}

		bodyBytes, _ := json.Marshal(payload)
		resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		var updateData tgUpdateResponse
		if err := json.Unmarshal(body, &updateData); err == nil && updateData.OK {
			for _, upd := range updateData.Result {
				offset = upd.UpdateID + 1
				s.handleUpdate(upd)
			}
		} else if !updateData.OK {
			log.Printf("[Telegram Polling Error] getUpdates returned: %s", string(body))
		}

		time.Sleep(1 * time.Second)
	}
}

// Authorized Owner user IDs - ONLY these users can use the bot's Business features
var authorizedOwnerIDs = map[int64]bool{
	5972044002: true, // @notyxx (Admin/Owner)
	8828875384: true, // @notyxs (Secretary)
}

type tgBusinessConnectionResponse struct {
	OK     bool            `json:"ok"`
	Result *tgBusinessConn `json:"result"`
}

func (s *TelegramService) verifyBusinessConnection(connID string) bool {
	if s.BotToken == "" || connID == "" {
		return false
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getBusinessConnection?business_connection_id=%s", s.BotToken, connID)
	resp, err := s.Client.Get(url)
	if err != nil {
		log.Printf("[Telegram Verify Biz Error] Failed to get connection info: %v", err)
		return false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var res tgBusinessConnectionResponse
	if err := json.Unmarshal(body, &res); err != nil || !res.OK || res.Result == nil {
		log.Printf("[Telegram Verify Biz] getBusinessConnection response error: %s", string(body))
		return false
	}

	bc := res.Result
	log.Printf("[Telegram Verify Biz] Connection %s belongs to @%s (ID: %d), Enabled: %v, CanReply: %v, UserChatID: %d",
		connID, bc.User.Username, bc.User.ID, bc.IsEnabled, bc.CanReply, bc.UserChatID)

	if !bc.CanReply {
		log.Printf("[Telegram Secretary WARNING] Bot is NOT allowed to reply in Telegram Business settings for @%s! Please enable 'Allow bot to reply' in Telegram Business settings.", bc.User.Username)
	}

	if authorizedOwnerIDs[bc.User.ID] || strings.ToLower(bc.User.Username) == "notyxs" || strings.ToLower(bc.User.Username) == "notyxx" {
		s.mu.Lock()
		s.BusinessID = bc.ID
		s.AdminChatID = fmt.Sprintf("%d", bc.User.ID)
		s.SecretaryUsername = bc.User.Username
		s.saveSession()
		s.mu.Unlock()
		log.Printf("[Telegram SUCCESS] Verified and bound Secretary BusinessID: %s (@%s)", bc.ID, bc.User.Username)
		return true
	}

	log.Printf("[SECURITY BLOCKED] Connection %s belongs to unauthorized user @%s (ID: %d)", connID, bc.User.Username, bc.User.ID)
	return false
}

func (s *TelegramService) handleUpdate(upd tgUpdate) {
	// Capture username -> ChatID mapping from any incoming update
	var checkUser string
	var checkChatID int64
	if upd.BusinessMessage != nil {
		checkUser = upd.BusinessMessage.From.Username
		if checkUser == "" {
			checkUser = upd.BusinessMessage.Chat.Username
		}
		checkChatID = upd.BusinessMessage.Chat.ID
	} else if upd.Message != nil {
		checkUser = upd.Message.From.Username
		checkChatID = upd.Message.Chat.ID
	}

	if checkUser != "" && checkChatID != 0 {
		cleanUser := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(checkUser), "@"))
		if cleanUser != "" {
			s.mu.Lock()
			if s.UserChatMap == nil {
				s.UserChatMap = make(map[string]string)
			}
			if s.ChatToUserMap == nil {
				s.ChatToUserMap = make(map[string]string)
			}
			chatIDStr := fmt.Sprintf("%d", checkChatID)
			s.UserChatMap[cleanUser] = chatIDStr
			s.ChatToUserMap[chatIDStr] = cleanUser
			s.saveSession()
			s.mu.Unlock()
		}
	}

	// 1. Handle Business Connection Event
	if upd.BusinessConnection != nil {
		bc := upd.BusinessConnection
		connUserID := bc.User.ID
		connUsername := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(bc.User.Username), "@"))

		log.Printf("[Telegram Business Connection] User=@%s (ID=%d), ConnID=%s, Enabled=%v, CanReply=%v",
			connUsername, connUserID, bc.ID, bc.IsEnabled, bc.CanReply)

		if authorizedOwnerIDs[connUserID] || connUsername == "notyxs" || connUsername == "notyxx" {
			// Authorized owner — save connection
			if bc.IsEnabled {
				s.mu.Lock()
				s.BusinessID = bc.ID
				s.AdminChatID = fmt.Sprintf("%d", connUserID)
				s.SecretaryUsername = bc.User.Username
				if connUsername != "" {
					if s.UserChatMap == nil {
						s.UserChatMap = make(map[string]string)
					}
					if s.ChatToUserMap == nil {
						s.ChatToUserMap = make(map[string]string)
					}
					s.UserChatMap[connUsername] = s.AdminChatID
					s.ChatToUserMap[s.AdminChatID] = connUsername
				}
				s.saveSession()
				s.mu.Unlock()
				log.Printf("[Telegram OK] Authorized Business Connection bound: ID=%s (@%s)", bc.ID, connUsername)
			} else {
				log.Printf("[Telegram Info] Authorized Business Connection disabled: ID=%s (@%s)", bc.ID, connUsername)
			}
		} else {
			// UNAUTHORIZED — log and completely ignore, do NOT save their connection_id
			log.Printf("[SECURITY] Unauthorized Business Connection from @%s (ID=%d, ConnID=%s) — IGNORED.",
				connUsername, connUserID, bc.ID)
			s.recordAudit("TG_UNAUTHORIZED_BIZ_CONN", "warning",
				fmt.Sprintf("Unauthorized user @%s (ID %d) added bot to Business Mode (ConnID: %s). Connection ignored.", connUsername, connUserID, bc.ID))
		}
	}

	// 2. Handle Business Message Event
	if upd.BusinessMessage != nil {
		bm := upd.BusinessMessage
		log.Printf("[Telegram Business Message] From @%s (ChatID: %d, BizConnID: %s, MsgID: %d): %s",
			bm.From.Username, bm.Chat.ID, bm.BusinessConnectionID, bm.MessageID, bm.Text)

		s.mu.Lock()
		activeBizID := s.BusinessID
		s.mu.Unlock()

		// If activeBizID is empty or different, dynamically verify connection ownership
		if activeBizID == "" || bm.BusinessConnectionID != activeBizID {
			if s.verifyBusinessConnection(bm.BusinessConnectionID) {
				s.mu.Lock()
				activeBizID = s.BusinessID
				s.mu.Unlock()
			} else {
				log.Printf("[SECURITY] Blocked business message from UNAUTHORIZED ConnID '%s'", bm.BusinessConnectionID)
				s.recordAudit("TG_UNAUTHORIZED_BIZ_MSG", "warning",
					fmt.Sprintf("Blocked business message from unauthorized connection %s", bm.BusinessConnectionID))
				return
			}
		}

		senderUsername := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(bm.From.Username), "@"))
		chatIDStr := fmt.Sprintf("%d", bm.Chat.ID)
		if senderUsername != "" {
			s.mu.Lock()
			if s.UserChatMap == nil {
				s.UserChatMap = make(map[string]string)
			}
			if s.ChatToUserMap == nil {
				s.ChatToUserMap = make(map[string]string)
			}
			if s.BusinessPeers == nil {
				s.BusinessPeers = make(map[string]string)
			}
			s.UserChatMap[senderUsername] = chatIDStr
			s.ChatToUserMap[chatIDStr] = senderUsername
			s.BusinessPeers[senderUsername] = chatIDStr
			s.saveSession()
			s.mu.Unlock()
			s.recordAudit("TG_USER_MAPPED", "success", fmt.Sprintf("User @%s mapped to ChatID %s via Business Secretary message", senderUsername, chatIDStr))
		}

		// Instant Secretary Response: process message from user (read is done AFTER reply)
		if senderUsername != "notyxx" && senderUsername != "notyxs" && senderUsername != "" {
			s.handleDebouncedUserMessage(activeBizID, bm.Chat.ID, senderUsername, bm.MessageID)
		}
	}

	// 3. Handle Regular Direct Bot Message Event (STRICT OWNER CONTROL LOCK)
	if upd.Message != nil {
		msg := upd.Message
		senderUsername := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(msg.From.Username), "@"))
		senderID := fmt.Sprintf("%d", msg.From.ID)
		chatID := fmt.Sprintf("%d", msg.Chat.ID)

		log.Printf("[Telegram Direct Bot] Message from @%s (ID: %s, ChatID: %s): %s", senderUsername, senderID, chatID, msg.Text)

		isOwner := (senderID == "5972044002" || senderUsername == "notyxx")

		if isOwner {
			// Admin: set AdminChatID for notifications
			s.mu.Lock()
			s.AdminChatID = chatID
			if s.ChatToUserMap == nil {
				s.ChatToUserMap = make(map[string]string)
			}
			s.ChatToUserMap[chatID] = senderUsername
			s.saveSession()
			s.mu.Unlock()

			if strings.HasPrefix(msg.Text, "/start") {
				go s.SendDirectBotMessage(chatID, "🤖 <b>Delta Media Bot</b>\n\nПривет, @notyxx! Уведомления о новых заявках успешно привязаны к вашему аккаунту.")
			}
		} else {
			// SECURITY LOCK: Completely block & ignore all direct commands/messages from unauthorized users!
			log.Printf("[SECURITY FILTER] Ignored direct message/command '%s' from unauthorized user @%s (ID: %s)", msg.Text, senderUsername, senderID)
			s.recordAudit("TG_SECURITY_FILTER", "ignored", fmt.Sprintf("Ignored direct message from unauthorized user @%s (ID %s)", senderUsername, senderID))
		}
	}
}

func (s *TelegramService) getSecretaryUsername() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.SecretaryUsername != "" {
		return strings.TrimPrefix(s.SecretaryUsername, "@")
	}
	return "notyxs"
}

func (s *TelegramService) IsUserMapped(username string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.UserChatMap == nil {
		return false
	}
	clean := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	_, found := s.UserChatMap[clean]
	return found
}

func (s *TelegramService) getUsernameForChatID(chatID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	cleanID := strings.TrimSpace(chatID)
	if cleanID == s.AdminChatID || cleanID == "5972044002" {
		return "@notyxx"
	}
	if s.ChatToUserMap != nil {
		if username, ok := s.ChatToUserMap[cleanID]; ok {
			return "@" + username
		}
	}
	return ""
}

func (s *TelegramService) SendDirectBotMessage(chatID, text string) error {
	if s.BotToken == "" || chatID == "" {
		return nil
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.BotToken)
	payload := tgSendMessagePayload{
		ChatID:    chatID,
		Text:      text,
		ParseMode: "HTML",
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		errText := fmt.Sprintf("Direct Bot HTTP Error for chat %s: %v", chatID, err)
		log.Printf("[Telegram Direct Bot Error] %s", errText)
		s.recordAudit("TG_BOT_SEND", "failed", errText)
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	userLabel := s.getUsernameForChatID(chatID)
	if userLabel != "" {
		log.Printf("[Telegram Direct Bot] Sent to %s (%s): status %d", chatID, userLabel, resp.StatusCode)
	} else {
		log.Printf("[Telegram Direct Bot] Sent to %s: status %d", chatID, resp.StatusCode)
	}

	if resp.StatusCode != http.StatusOK {
		errText := fmt.Sprintf("Direct Bot API returned status %d for chat %s (%s): %s", resp.StatusCode, chatID, userLabel, string(respBody))
		log.Printf("[Telegram Direct Bot Error] %s", errText)
		s.recordAudit("TG_BOT_SEND", "failed", errText)
	} else {
		s.recordAudit("TG_BOT_SEND", "success", fmt.Sprintf("Direct Bot message delivered to chat %s (%s)", chatID, userLabel))
	}
	return nil
}

func (s *TelegramService) SendBusinessMessage(bizID, chatID, text string) error {
	if s.BotToken == "" || chatID == "" || bizID == "" {
		errText := fmt.Sprintf("Cannot send business message: BotToken, ChatID (%s), or BusinessID (%s) empty", chatID, bizID)
		log.Printf("[Telegram Secretary Error] %s", errText)
		s.recordAudit("TG_BUSINESS_SEND", "failed", errText)
		return fmt.Errorf(errText)
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.BotToken)

	var chatIDVal interface{} = chatID
	if numID, err := strconv.ParseInt(strings.TrimSpace(chatID), 10, 64); err == nil {
		chatIDVal = numID
	}

	payload := tgSendMessagePayload{
		ChatID:               chatIDVal,
		Text:                 text,
		ParseMode:            "HTML",
		BusinessConnectionID: bizID,
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		errText := fmt.Sprintf("Business HTTP Error for chat %v: %v", chatIDVal, err)
		log.Printf("[Telegram Business Error] %s", errText)
		s.recordAudit("TG_BUSINESS_SEND", "failed", errText)
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	userLabel := s.getUsernameForChatID(fmt.Sprintf("%v", chatIDVal))
	if userLabel != "" {
		log.Printf("[Telegram Business Send] Status %d for chat %v (%s) (bizID=%s): %s", resp.StatusCode, chatIDVal, userLabel, bizID, string(respBody))
	} else {
		log.Printf("[Telegram Business Send] Status %d for chat %v (bizID=%s): %s", resp.StatusCode, chatIDVal, bizID, string(respBody))
	}

	if resp.StatusCode != http.StatusOK {
		errText := fmt.Sprintf("Business API returned status %d for chat %v (%s): %s", resp.StatusCode, chatIDVal, userLabel, string(respBody))
		s.recordAudit("TG_BUSINESS_SEND", "failed", errText)
		return fmt.Errorf(errText)
	}

	s.recordAudit("TG_BUSINESS_SEND", "success", fmt.Sprintf("Business message delivered from Secretary to chat %v (%s)", chatIDVal, userLabel))
	return nil
}

func (s *TelegramService) SendMessage(chatID, text string) error {
	s.mu.Lock()
	bizID := s.BusinessID
	s.mu.Unlock()

	if chatID == "" {
		return nil
	}

	if bizID != "" {
		err := s.SendBusinessMessage(bizID, chatID, text)
		if err == nil {
			return nil
		}
		log.Printf("[Telegram SendMessage Warning] Business send failed (%v), falling back to Direct Bot Message", err)
	}

	return s.SendDirectBotMessage(chatID, text)
}

func (s *TelegramService) getAdminNotificationChat() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.UserChatMap != nil {
		if chatID, ok := s.UserChatMap["notyxx"]; ok && chatID != "" {
			return chatID
		}
	}
	if s.AdminChatID != "" {
		return s.AdminChatID
	}
	return "5972044002"
}

func (s *TelegramService) NotifyNewMediaApplication(appID int64, platform, channel, telegram string) {
	target := s.getAdminNotificationChat()
	msg := fmt.Sprintf("<b>📥 Новая заявка на Медиа (#%d)</b>\n\n"+
		"<b>Платформа:</b> %s\n"+
		"<b>Канал:</b> %s\n"+
		"<b>Telegram заявителя:</b> %s\n\n"+
		"<i>Проверьте заявку в админ-панели.</i>",
		appID, platform, channel, telegram)
	go func() {
		err := s.SendDirectBotMessage(target, msg)
		if err != nil {
			log.Printf("[Telegram Admin Notify Error] Direct bot notify to %s failed: %v", target, err)
		}
	}()
}

func (s *TelegramService) NotifyNewHWIDReset(reqID int64, modNick, uuid string) {
	target := s.getAdminNotificationChat()
	msg := fmt.Sprintf("<b>🔄 Новый запрос на сброс HWID (#%d)</b>\n\n"+
		"<b>Модератор:</b> %s\n"+
		"<b>UID пользователя:</b> <code>%s</code>\n\n"+
		"<i>Проверьте запрос в админ-панели.</i>",
		reqID, modNick, uuid)
	go s.SendDirectBotMessage(target, msg)
}

func (s *TelegramService) NotifyNewDiscordBan(reqID int64, modNick, offender string) {
	target := s.getAdminNotificationChat()
	msg := fmt.Sprintf("<b>🔨 Новый запрос на Discord Бан (#%d)</b>\n\n"+
		"<b>Модератор:</b> %s\n"+
		"<b>Нарушитель:</b> %s\n\n"+
		"<i>Проверьте запрос в админ-панели.</i>",
		reqID, modNick, offender)
	go s.SendDirectBotMessage(target, msg)
}

func (s *TelegramService) SendVerdict(targetTG, requestType string, reqID int64, status, comment, itemTarget string) {
	cleanTarget := strings.TrimSpace(targetTG)
	if cleanTarget == "" {
		return
	}

	cleanUser := strings.ToLower(strings.TrimPrefix(cleanTarget, "@"))

	s.mu.Lock()
	if s.BusinessPeers == nil {
		s.BusinessPeers = make(map[string]string)
	}
	resolvedChatID, found := s.BusinessPeers[cleanUser]
	s.mu.Unlock()

	targetChatID := cleanTarget
	if found && resolvedChatID != "" {
		targetChatID = resolvedChatID
	} else {
		s.recordAudit("TG_VERDICT_WARN", "warning", fmt.Sprintf("Sending verdict for %s #%d to @%s FAILED: user has not messaged Secretary via Business (BUSINESS_PEER_USAGE_MISSING would occur)", requestType, reqID, cleanUser))
		return
	}

	var msg string

	switch strings.ToLower(requestType) {
	case "media":
		if status == "approved" {
			msg = fmt.Sprintf("Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте <a href=\"https://deltamedia.fun\">deltamedia.fun</a>. Я рассмотрел твою заявку № %d и одобрил её!\n\n"+
				"Ссылка на конфу медиа - %s\n"+
				"Обязательно прочитай все каналы чтобы понять всю суть.",
				reqID, comment)
		} else {
			msg = fmt.Sprintf("Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте <a href=\"https://deltamedia.fun\">deltamedia.fun</a>. Я рассмотрел твою заявку № %d и вынужден её отклонить.\n\n"+
				"Причина: %s\n"+
				"Попробуй больше активничать и чаще выкладывать видео — тогда у тебя всё обязательно получится. Когда улучшишь статистику аккаунта, подавай новую заявку.",
				reqID, comment)
		}

	case "hwid":
		if status == "approved" {
			commentPart := ""
			if comment != "" {
				commentPart = fmt.Sprintf("\n\nДоп коментарий от нотикса — %s", comment)
			}
			msg = fmt.Sprintf("Хвид пользователя %s успешно сброшен.%s", itemTarget, commentPart)
		} else {
			msg = fmt.Sprintf("Заявка на сброс HWID пользователя %s была отклонена.\n\nПричина — %s", itemTarget, comment)
		}

	case "discord":
		if status == "approved" {
			commentPart := ""
			if comment != "" {
				commentPart = fmt.Sprintf("\n\nДоп коментарий от нотикса - %s", comment)
			}
			msg = fmt.Sprintf("Аккаунт в дискорде %s успешно заблокирован.%s", itemTarget, commentPart)
		} else {
			msg = fmt.Sprintf("Блокировка аккаунта %s была отклонена.\n\nПричина — %s", itemTarget, comment)
		}

	default:
		statusText := "ОДОБРЕНО ✅"
		if status == "rejected" {
			statusText = "ОТКЛОНЕНО ❌"
		}
		msg = fmt.Sprintf("📢 Вердикт по вашей заявке [%s #%d]: %s\n%s", requestType, reqID, statusText, comment)
	}

	log.Printf("[Telegram Secretary] Sending verdict for %s #%d to targetChatID: %s using BusinessID: %s", requestType, reqID, targetChatID, s.BusinessID)
	go s.SendBusinessMessage(s.BusinessID, targetChatID, msg)
}

type tgReactionType struct {
	Type  string `json:"type"`
	Emoji string `json:"emoji"`
}

type tgSetReactionPayload struct {
	BusinessConnectionID string           `json:"business_connection_id,omitempty"`
	ChatID               interface{}      `json:"chat_id"`
	MessageID            int64            `json:"message_id"`
	Reaction             []tgReactionType `json:"reaction"`
}

func (s *TelegramService) handleDebouncedUserMessage(bizID string, chatID int64, username string, messageID int64) {
	cleanUser := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if cleanUser == "" || cleanUser == "notyxx" || cleanUser == "notyxs" {
		return
	}

	s.mu.Lock()
	if s.RespondedUsers == nil {
		s.RespondedUsers = make(map[string]bool)
	}
	if s.debounceTimers == nil {
		s.debounceTimers = make(map[string]*time.Timer)
	}

	// If this user already got their thumbs-up auto response, skip
	if s.RespondedUsers[cleanUser] {
		s.mu.Unlock()
		return
	}

	// Reset timer if user sends another message in rapid sequence
	if timer, exists := s.debounceTimers[cleanUser]; exists && timer != nil {
		timer.Stop()
	}

	// Short 1-second sequence debounce, then random delay 15-180s before replying
	s.debounceTimers[cleanUser] = time.AfterFunc(1*time.Second, func() {
		s.mu.Lock()
		s.RespondedUsers[cleanUser] = true
		delete(s.debounceTimers, cleanUser)
		activeBizID := s.BusinessID
		s.mu.Unlock()

		if activeBizID == "" {
			activeBizID = bizID
		}

		chatIDStr := fmt.Sprintf("%d", chatID)

		// Random human-like delay between 15 and 180 seconds
		delaySeconds := 15 + rand.Intn(166)
		log.Printf("[Telegram Secretary] Waiting %ds before replying to @%s (chatID %s)...", delaySeconds, cleanUser, chatIDStr)
		time.Sleep(time.Duration(delaySeconds) * time.Second)

		// Mark message as read RIGHT BEFORE replying (not on arrival)
		s.ReadBusinessMessage(activeBizID, chatID, messageID)

		log.Printf("[Telegram Secretary] Sending response to @%s (chatID %s, bizID %s)...", cleanUser, chatIDStr, activeBizID)
		go s.SendRandomSecretaryResponse(activeBizID, chatIDStr)
	})

	s.mu.Unlock()
}

func (s *TelegramService) ReadBusinessMessage(bizID string, chatID int64, messageID int64) {
	if s.BotToken == "" || chatID == 0 || bizID == "" || messageID == 0 {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/readBusinessMessage", s.BotToken)
	payload := map[string]interface{}{
		"business_connection_id": bizID,
		"chat_id":                chatID,
		"message_id":             messageID,
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err == nil {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[Telegram ReadBusinessMessage] Message %d in chat %d marked read (status %d): %s", messageID, chatID, resp.StatusCode, string(respBody))
	} else {
		log.Printf("[Telegram ReadBusinessMessage Error] %v", err)
	}
}

func (s *TelegramService) SendChatAction(bizID, chatID, action string) {
	if s.BotToken == "" || chatID == "" || bizID == "" {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendChatAction", s.BotToken)
	var chatIDVal interface{} = chatID
	if numID, err := strconv.ParseInt(strings.TrimSpace(chatID), 10, 64); err == nil {
		chatIDVal = numID
	}

	payload := map[string]interface{}{
		"business_connection_id": bizID,
		"chat_id":                chatIDVal,
		"action":                 action,
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err == nil {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[Telegram ChatAction] Action %s for chat %s (status %d): %s", action, chatID, resp.StatusCode, string(respBody))
	}
}

func (s *TelegramService) SendRandomSecretaryResponse(bizID, chatID string) {
	// Step 1: Send typing / sticker action to mark message read & show activity
	s.SendChatAction(bizID, chatID, "choose_sticker")
	time.Sleep(time.Duration(1500+rand.Intn(1000)) * time.Millisecond)

	// Step 2: Discover GIF / sticker files in tgGIF folder
	gifDir := "./tgGIF"
	entries, err := os.ReadDir(gifDir)
	var gifFiles []string
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				ext := strings.ToLower(filepath.Ext(entry.Name()))
				if ext == ".webm" || ext == ".webp" || ext == ".gif" || ext == ".mp4" {
					gifFiles = append(gifFiles, filepath.Join(gifDir, entry.Name()))
				}
			}
		}
	}

	// Step 3: Random selection between thumbs up 👍 and one of the sticker files
	totalChoices := len(gifFiles) + 1
	choice := rand.Intn(totalChoices)

	if len(gifFiles) > 0 && choice < len(gifFiles) {
		selectedFile := gifFiles[choice]
		log.Printf("[Telegram Secretary] Sending random sticker/GIF response (%s) to chat %s", filepath.Base(selectedFile), chatID)
		errSticker := s.SendBusinessSticker(bizID, chatID, selectedFile)
		if errSticker != nil {
			log.Printf("[Telegram Secretary Warning] Sticker failed (%v), sending 👍 text fallback", errSticker)
			_ = s.SendBusinessMessage(bizID, chatID, "👍")
		}
	} else {
		log.Printf("[Telegram Secretary] Sending 👍 text response to chat %s", chatID)
		_ = s.SendBusinessMessage(bizID, chatID, "👍")
	}
}

func (s *TelegramService) SendBusinessSticker(bizID, chatID, filePath string) error {
	if s.BotToken == "" || chatID == "" || bizID == "" {
		return fmt.Errorf("empty params")
	}

	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("[Telegram Sticker Error] Cannot open file %s: %v", filePath, err)
		return err
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	_ = writer.WriteField("business_connection_id", bizID)

	var chatIDVal string = chatID
	if numID, err := strconv.ParseInt(strings.TrimSpace(chatID), 10, 64); err == nil {
		chatIDVal = fmt.Sprintf("%d", numID)
	}
	_ = writer.WriteField("chat_id", chatIDVal)

	filename := filepath.Base(filePath)
	part, err := writer.CreateFormFile("sticker", filename)
	if err != nil {
		return err
	}
	_, _ = io.Copy(part, file)
	_ = writer.Close()

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendSticker", s.BotToken)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := s.Client.Do(req)
	if err != nil {
		log.Printf("[Telegram Sticker Error] HTTP POST failed: %v", err)
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("[Telegram Sticker Send] Status %d for chat %s (%s): %s", resp.StatusCode, chatID, filename, string(respBody))

	if resp.StatusCode != http.StatusOK {
		// Fallback to sendDocument or sendAnimation if sendSticker rejected format
		return s.SendBusinessDocument(bizID, chatID, filePath)
	}

	s.recordAudit("TG_STICKER_SEND", "success", fmt.Sprintf("Sticker %s sent to chat %s", filename, chatID))
	return nil
}

func (s *TelegramService) SendBusinessDocument(bizID, chatID, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	_ = writer.WriteField("business_connection_id", bizID)
	_ = writer.WriteField("chat_id", chatID)

	filename := filepath.Base(filePath)
	fieldName := "document"
	if strings.HasSuffix(filename, ".webm") || strings.HasSuffix(filename, ".mp4") {
		fieldName = "animation"
	}

	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		return err
	}
	_, _ = io.Copy(part, file)
	_ = writer.Close()

	endpoint := "sendDocument"
	if fieldName == "animation" {
		endpoint = "sendAnimation"
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", s.BotToken, endpoint)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := s.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("[Telegram %s Send] Status %d for chat %s (%s): %s", endpoint, resp.StatusCode, chatID, filename, string(respBody))
	if resp.StatusCode == http.StatusOK {
		s.recordAudit("TG_GIF_SEND", "success", fmt.Sprintf("GIF/Document %s sent to chat %s", filename, chatID))
		return nil
	}
	return fmt.Errorf("Document API returned status %d: %s", resp.StatusCode, string(respBody))
}

func (s *TelegramService) AddMessageReaction(bizID string, chatID int64, messageID int64, emoji string) {
	if s.BotToken == "" || chatID == 0 || messageID == 0 {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/setMessageReaction", s.BotToken)
	payload := tgSetReactionPayload{
		BusinessConnectionID: bizID,
		ChatID:               chatID,
		MessageID:            messageID,
		Reaction: []tgReactionType{
			{Type: "emoji", Emoji: emoji},
		},
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := s.Client.Post(url, "application/json", bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Printf("[Telegram Reaction Error] HTTP error for chat %d: %v", chatID, err)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("[Telegram Reaction] Status %d for chat %d (msgID %d): %s", resp.StatusCode, chatID, messageID, string(respBody))
	if resp.StatusCode == http.StatusOK {
		s.recordAudit("TG_REACTION", "success", fmt.Sprintf("Reacted with %s to chat %d msg %d", emoji, chatID, messageID))
	}
}
