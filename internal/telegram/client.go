package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"time"
)

// Client — минимальный Telegram Bot API клиент (long polling + отправка).
type Client struct {
	Token string
	HTTP  *http.Client
	Me    string // @username бота (резолвится на старте)
	meID  int64
}

func NewClient(token string) *Client {
	return &Client{
		Token: token,
		HTTP:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (cl *Client) apiURL(method string) string {
	return "https://api.telegram.org/bot" + cl.Token + "/" + method
}

func (cl *Client) call(method string, payload any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	resp, err := cl.HTTP.Post(cl.apiURL(method), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return data, fmt.Errorf("%s: HTTP %d: %.300s", method, resp.StatusCode, data)
	}
	return data, nil
}

// ResolveMe заполняет username/id бота через getMe.
func (cl *Client) ResolveMe() error {
	data, err := cl.call("getMe", map[string]any{})
	if err != nil {
		return err
	}
	var res struct {
		OK     bool `json:"ok"`
		Result struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil || !res.OK {
		return fmt.Errorf("getMe: %.200s", data)
	}
	cl.Me = "@" + res.Result.Username
	cl.meID = res.Result.ID
	return nil
}

func (cl *Client) Username() string { return cl.Me }

// ── Типы обновлений ──────────────────────────────────────────

type Update struct {
	UpdateID           int64            `json:"update_id"`
	Message            *Message         `json:"message,omitempty"`
	BusinessMessage    *BusinessMessage `json:"business_message,omitempty"`
	CallbackQuery      *CallbackQuery   `json:"callback_query,omitempty"`
	BusinessConnection *BusinessConn    `json:"business_connection,omitempty"`
}

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}

type Message struct {
	MessageID int64  `json:"message_id"`
	From      User   `json:"from"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
}

type BusinessMessage struct {
	MessageID            int64  `json:"message_id"`
	BusinessConnectionID string `json:"business_connection_id"`
	From                 User   `json:"from"`
	Chat                 Chat   `json:"chat"`
	Text                 string `json:"text"`
}

type Chat struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Type     string `json:"type"`
}

type CallbackQuery struct {
	ID      string `json:"id"`
	From    User   `json:"from"`
	Data    string `json:"data"`
	Message *struct {
		Chat      Chat  `json:"chat"`
		MessageID int64 `json:"message_id"`
	} `json:"message"`
}

type BusinessConn struct {
	ID       string `json:"id"`
	User     User   `json:"user"`
	Enabled  bool   `json:"is_enabled"`
	CanReply bool   `json:"can_reply"`
}

// ── Отправка ─────────────────────────────────────────────────

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

// SendMessage отправляет текст (опционально HTML + inline-кнопки).
func (cl *Client) SendMessage(chatID int64, text string, buttons ...[][2]string) error {
	payload := map[string]any{
		"chat_id": chatID, "text": text, "parse_mode": "HTML",
		"link_preview_options": map[string]any{"is_disabled": true},
	}
	if len(buttons) > 0 {
		var keyboard [][]InlineKeyboardButton
		for _, row := range buttons {
			var r []InlineKeyboardButton
			for _, btn := range row {
				r = append(r, InlineKeyboardButton{Text: btn[0], CallbackData: btn[1]})
			}
			keyboard = append(keyboard, r)
		}
		payload["reply_markup"] = InlineKeyboardMarkup{InlineKeyboard: keyboard}
	}
	_, err := cl.call("sendMessage", payload)
	return err
}

// SendBusiness отправляет сообщение от лица бизнес-аккаунта (секретаря).
func (cl *Client) SendBusiness(businessID string, chatID int64, text string) error {
	_, err := cl.call("sendMessage", map[string]any{
		"business_connection_id": businessID,
		"chat_id":                chatID,
		"text":                   text,
		"parse_mode":             "HTML",
		"link_preview_options":   map[string]any{"is_disabled": true},
	})
	return err
}

// SendBusinessStickerFile шлёт файл (webm/webp) как стикер от секретаря.
func (cl *Client) SendBusinessStickerFile(businessID string, chatID int64, fileBytes []byte, filename string) error {
	return cl.sendMediaFile("sendSticker", businessID, chatID, "sticker", fileBytes, filename)
}

func (cl *Client) sendMediaFile(method, businessID string, chatID int64, field string, fileBytes []byte, filename string) error {
	body := &bytes.Buffer{}
	w := newMultipartWriter(body)
	_ = w.writeField("business_connection_id", businessID)
	_ = w.writeField("chat_id", strconv.FormatInt(chatID, 10))
	if err := w.writeFile(field, filename, fileBytes); err != nil {
		return err
	}
	_ = w.close()
	resp, err := cl.HTTP.Post(cl.apiURL(method), w.contentType(), body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: HTTP %d: %.200s", method, resp.StatusCode, data)
	}
	return nil
}

// ReadBusinessMessage помечает сообщение прочитанным.
func (cl *Client) ReadBusinessMessage(businessID string, chatID, messageID int64) {
	_, _ = cl.call("readBusinessMessage", map[string]any{
		"business_connection_id": businessID, "chat_id": chatID, "message_id": messageID,
	})
}

// SendChatAction — статус «выбирает стикер» и т.п.
func (cl *Client) SendChatAction(businessID string, chatID int64, action string) {
	payload := map[string]any{"chat_id": chatID, "action": action}
	if businessID != "" {
		payload["business_connection_id"] = businessID
	}
	_, _ = cl.call("sendChatAction", payload)
}

// AnswerCallback закрывает всплывашку колбэка.
func (cl *Client) AnswerCallback(callbackID, text string) {
	payload := map[string]any{"callback_query_id": callbackID}
	if text != "" {
		payload["text"] = text
	}
	_, _ = cl.call("answerCallbackQuery", payload)
}

// EditMessageText меняет текст сообщения с кнопками (после решения).
func (cl *Client) EditMessageText(chatID, messageID int64, text string) {
	_, _ = cl.call("editMessageText", map[string]any{
		"chat_id": chatID, "message_id": messageID, "text": text, "parse_mode": "HTML",
		"link_preview_options": map[string]any{"is_disabled": true},
	})
}

// GetUpdates — long polling.
func (cl *Client) GetUpdates(offset int64, timeoutSec int) ([]Update, error) {
	data, err := cl.call("getUpdates", map[string]any{
		"offset": offset, "timeout": timeoutSec,
		"allowed_updates": []string{"message", "business_message", "callback_query", "business_connection"},
	})
	if err != nil {
		return nil, err
	}
	var res struct {
		OK     bool     `json:"ok"`
		Result []Update `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil || !res.OK {
		return nil, fmt.Errorf("getUpdates: %.200s", data)
	}
	return res.Result, nil
}

// RandomDelay — человекоподобная задержка ответа секретаря [15, 180] сек.
func RandomDelay() time.Duration {
	return time.Duration(15+rand.Intn(166)) * time.Second
}
