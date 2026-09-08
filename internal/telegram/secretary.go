package telegram

import (
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// secretaryAutoReply — «живой» секретарь: читает сообщение за ~10 сек до
// ответа, отвечает GIF/стикером или 👍 со случайной задержкой 15–180 сек.
// Один автоответ на пользователя за время работы процесса (как в V1).
func (s *Service) secretaryAutoReply(bm *BusinessMessage) {
	s.mu.Lock()
	if s.responded[bm.From.ID] {
		s.mu.Unlock()
		return
	}
	s.responded[bm.From.ID] = true
	s.mu.Unlock()

	totalDelay := RandomDelay()
	readDelay := totalDelay - 10*time.Second
	if readDelay < 0 {
		readDelay = 0
	}

	log.Printf("[TG Secretary] @%s: ответ через %v (прочтение через %v)", bm.From.Username, totalDelay, readDelay)

	time.Sleep(readDelay)
	biz := s.currentBusinessID()
	if biz == "" {
		biz = bm.BusinessConnectionID
	}

	// Шаг 1: прочитать сообщение
	s.cl.ReadBusinessMessage(biz, bm.Chat.ID, bm.MessageID)
	// Шаг 2: показать активность
	s.cl.SendChatAction(biz, bm.Chat.ID, "choose_sticker")
	time.Sleep(10 * time.Second)
	// Шаг 3: случайный ответ
	go s.sendSecretaryResponse(biz, bm.Chat.ID)
}

func (s *Service) sendSecretaryResponse(biz string, chatID int64) {
	s.cl.SendChatAction(biz, chatID, "choose_sticker")

	files := collectGIFs("./tgGIF")
	if len(files) > 0 && rand.Intn(len(files)+1) < len(files) {
		path := files[rand.Intn(len(files))]
		data, err := os.ReadFile(path)
		if err == nil {
			if err := s.cl.SendBusinessStickerFile(biz, chatID, data, filepath.Base(path)); err == nil {
				return
			}
			log.Printf("[TG Secretary] стикер не ушёл (%v), шлю 👍", err)
		}
	}
	_ = s.cl.SendBusiness(biz, chatID, "👍")
}

func collectGIFs(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		switch strings.ToLower(filepath.Ext(e.Name())) {
		case ".webm", ".webp", ".gif", ".mp4":
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files
}

// tgUserLabel для логов/панели.
func tgUserLabel(username string, id int64) string {
	if username != "" {
		return "@" + username
	}
	return strconv.FormatInt(id, 10)
}
