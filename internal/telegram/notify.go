package telegram

import (
	"fmt"
	"log"
	"strconv"
	"strings"

	"dmr/internal/models"
)

// SendLoginConfirmation — 2FA: IP + GPS + кнопки подтверждения владельцу.
func (s *Service) SendLoginConfirmation(account models.Account, attempt models.LoginAttempt) error {
	chatID := s.auth.ResolveTGChatID(account)
	if chatID == 0 {
		return fmt.Errorf("у аккаунта нет привязанного Telegram")
	}

	gpsLine := "не передана"
	if attempt.GPS != "" {
		coords := strings.Fields(attempt.GPS)
		if len(coords) >= 2 {
			gpsLine = fmt.Sprintf("%s, %s (<a href=\"https://maps.google.com/?q=%s,%s\">карта</a>)",
				coords[0], coords[1], coords[0], coords[1])
		}
	}

	text := fmt.Sprintf(
		"🔐 <b>Подтверждение входа — Delta Media</b>\n\n"+
			"Аккаунт: <b>%s</b> (%s)\n"+
			"IP-адрес: <code>%s</code>\n"+
			"📍 Геолокация: %s\n\n"+
			"⚠️ Если это не вы — <b>срочно обратитесь к администратору: @%s</b>",
		escapeHTML(account.Nickname), models.RoleTitle(account.Role),
		escapeHTML(attempt.IP), gpsLine, s.cfg.TGAdminContact)

	return s.cl.SendMessage(chatID, text,
		[][2]string{{"✅ Подтвердить", fmt.Sprintf("2fa:%d:approve", attempt.ID)}},
		[][2]string{{"🚫 Это не я", fmt.Sprintf("2fa:%d:deny", attempt.ID)}},
	)
}

// NotifyOwnersText — рассылка простого текста владельцам (отчёты недель).
func (s *Service) NotifyOwnersText(text string) {
	s.notifyAdminsFull("", text)
}

// notifyAdminsFull — полное уведомление владельцам с inline-кнопками решения.
func (s *Service) notifyAdminsFull(title, body string, buttons ...[][2]string) {
	text := title + "\n\n" + body
	for _, ownerID := range s.cfg.TGOwnerIDs {
		if err := s.cl.SendMessage(ownerID, text, buttons...); err != nil {
			log.Printf("[TG] admin notify to %d failed: %v", ownerID, err)
		}
	}
}

// ── Уведомления о новых заявках (полный текст + кнопки) ──────

func (s *Service) NotifyMediaApp(app models.MediaApp) {
	yt := ""
	if app.Platform == "youtube" {
		yt = fmt.Sprintf("Роликов в неделю: %s\n", app.VideosPerWeek)
	} else {
		yt = fmt.Sprintf("Сотрудничества: %s\n", app.Collaborations)
	}
	s.notifyAdminsFull(
		fmt.Sprintf("📥 <b>Заявка на вступление в медиа #%d</b>", app.ID),
		fmt.Sprintf("UID: <code>%s</code>\nПлатформа: <b>%s</b>\nКанал: %s\nСерверы: %s\n%sЭксклюзив: %s\nTG: @%s\nМотивация: %s",
			escapeHTML(app.UID), app.Platform, escapeHTML(app.ChannelURL), escapeHTML(app.Servers),
			yt, app.Exclusive, escapeHTML(strings.TrimPrefix(app.Telegram, "@")), escapeHTML(app.WhyJoin)),
		[][2]string{{"✅ Одобрить", fmt.Sprintf("adm:media:%d:approve", app.ID)},
			{"❌ Отклонить", fmt.Sprintf("adm:media:%d:reject", app.ID)}},
	)
}

func (s *Service) NotifyHWID(r models.HWIDRequest) {
	s.notifyAdminsFull(
		fmt.Sprintf("🔄 <b>Запрос сброса HWID #%d</b>", r.ID),
		fmt.Sprintf("Модератор: <b>%s</b>\nUID: <code>%s</code>\nПричина: %s\nДоказательства: %s %s",
			escapeHTML(r.ModNickname), escapeHTML(r.UUID), escapeHTML(r.Reason), r.ProofFile, r.ProofLink),
		[][2]string{{"✅ Одобрить", fmt.Sprintf("adm:hwid:%d:approve", r.ID)},
			{"❌ Отклонить", fmt.Sprintf("adm:hwid:%d:reject", r.ID)}},
	)
}

func (s *Service) NotifyDiscordBan(r models.DiscordBan) {
	s.notifyAdminsFull(
		fmt.Sprintf("🔨 <b>Запрос Discord-бана #%d</b>", r.ID),
		fmt.Sprintf("Модератор: <b>%s</b>\nНарушитель: <code>%s</code>\nПричина: %s\nДоказательства: %s %s",
			escapeHTML(r.ModNickname), escapeHTML(r.OffenderID), escapeHTML(r.Reason), r.ProofFile, r.ProofLink),
		[][2]string{{"✅ Одобрить", fmt.Sprintf("adm:discord:%d:approve", r.ID)},
			{"❌ Отклонить", fmt.Sprintf("adm:discord:%d:reject", r.ID)}},
	)
}

func (s *Service) NotifyCabinetRequest(r models.Request) {
	kindTitle := map[string]string{
		models.KindPayout: "💸 Заявка на выплату", models.KindLot: "🏷️ Заявка на лот",
		models.KindSubscription: "📺 Запрос подписки (фримедиа)",
	}[r.Kind]
	body := fmt.Sprintf("Заявитель: <b>%s</b> @%s\nUID: <code>%s</code>", escapeHTML(r.Nickname), escapeHTML(strings.TrimPrefix(r.Telegram, "@")), escapeHTML(r.UID))
	if r.Duration != "" {
		body += fmt.Sprintf("\nВ медиа: %s", escapeHTML(r.Duration))
	}
	if r.Want != "" {
		body += fmt.Sprintf("\nХочет получить: %s", escapeHTML(r.Want))
	}
	if r.Amount != "" {
		body += fmt.Sprintf("\nСумма: %s USDT", escapeHTML(r.Amount))
	}
	if r.Method != "" {
		body += fmt.Sprintf("\nСпособ: %s", r.Method)
	}
	if r.Platform != "" {
		body += fmt.Sprintf("\nПлатформа: %s", escapeHTML(r.Platform))
	}
	if r.ChannelURL != "" {
		body += fmt.Sprintf("\nКанал: %s", escapeHTML(r.ChannelURL))
	}
	if r.LotURL != "" {
		body += fmt.Sprintf("\nЛот FunPay: %s", escapeHTML(r.LotURL))
	}
	s.notifyAdminsFull(fmt.Sprintf("%s #%d (%s)", kindTitle, r.ID, r.Source), body,
		[][2]string{{"✅ Принять", fmt.Sprintf("pay:%d:approve", r.ID)},
			{"❌ Отклонить", fmt.Sprintf("pay:%d:reject", r.ID)}},
	)
}

// ── Вердикты заявителям ──────────────────────────────────────

func (s *Service) chatIDByUsername(username string) int64 {
	var id int64
	clean := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if clean == "" {
		return 0
	}
	_ = s.db.QueryRow(`SELECT tg_user_id FROM v2_tg_users WHERE LOWER(username) = ?`, clean).Scan(&id)
	return id
}

func renderTemplate(tpl string, vars map[string]string) string {
	pairs := make([]string, 0, len(vars)*2)
	for k, v := range vars {
		pairs = append(pairs, k, v)
	}
	return strings.NewReplacer(pairs...).Replace(tpl)
}

// SendVerdict — вердикт по заявке (тексты настраиваются через админ-панель).
func (s *Service) SendVerdict(telegram, kind string, id int64, approve bool, comment string) {
	chatID := s.chatIDByUsername(telegram)
	if chatID == 0 {
		return
	}
	idStr := strconv.FormatInt(id, 10)
	var text string
	switch kind {
	case "media":
		vars := map[string]string{
			"{id}":      idStr,
			"{comment}": comment,
			"{reason}":  comment,
		}
		if approve {
			tpl := s.db.Setting("media_approve_text")
			if tpl == "" {
				tpl = "Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте deltamedia.fun. Я рассмотрел твою заявку № {id} и одобрил её!\n\nСсылка на конфу медиа - {comment}\nОбязательно прочитай все каналы чтобы понять всю суть."
			}
			text = renderTemplate(tpl, vars)
		} else {
			tpl := s.db.Setting("media_reject_text")
			if tpl == "" {
				tpl = "Привет! Я notyx — куратор Delta Client. Ты недавно оставлял медиа-заявку на сайте deltamedia.fun. Я рассмотрел твою заявку № {id} и вынужден её отклонить.\n\nПричина: {reason}\nПопробуй больше активничать и чаще выкладывать видео — тогда у тебя всё обязательно получится. Когда улучшишь статистику аккаунта, подавай новую заявку."
			}
			text = renderTemplate(tpl, vars)
		}
	case "hwid":
		vars := map[string]string{
			"{id}":      idStr,
			"{comment}": comment,
			"{reason}":  comment,
			"{uid}":     comment,
		}
		if approve {
			tpl := s.db.Setting("hwid_approve_text")
			if tpl == "" {
				tpl = "Хвид пользователя {comment} успешно сброшен."
			}
			text = renderTemplate(tpl, vars)
		} else {
			tpl := s.db.Setting("hwid_reject_text")
			if tpl == "" {
				tpl = "Заявка на сброс HWID была отклонена.\n\nПричина — {reason}"
			}
			text = renderTemplate(tpl, vars)
		}
	case "discord":
		vars := map[string]string{
			"{id}":       idStr,
			"{comment}":  comment,
			"{reason}":   comment,
			"{offender}": comment,
		}
		if approve {
			tpl := s.db.Setting("discord_approve_text")
			if tpl == "" {
				tpl = "Аккаунт в дискорде {comment} успешно заблокирован."
			}
			text = renderTemplate(tpl, vars)
		} else {
			tpl := s.db.Setting("discord_reject_text")
			if tpl == "" {
				tpl = "Блокировка аккаунта {comment} была отклонена.\n\nПричина — {reason}"
			}
			text = renderTemplate(tpl, vars)
		}
	default:
		return
	}
	go func() { _ = s.reply(chatID, "", text) }()
}
