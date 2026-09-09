package validation

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

var (
	reTelegram = regexp.MustCompile(`^@?[a-zA-Z0-9_]{4,32}$`)
	reYouTube  = regexp.MustCompile(`^https?://(www\.|m\.)?youtube\.com/(@[a-zA-Z0-9_.\-]+|channel/[a-zA-Z0-9_\-]+|c/[a-zA-Z0-9_\-]+|user/[a-zA-Z0-9_\-]+)/?$`)
	reTikTok   = regexp.MustCompile(`^https?://(www\.)?tiktok\.com/@[a-zA-Z0-9_.]+/?$`)
	reFunPay     = regexp.MustCompile(`^https?://(www\.)?funpay\.com/(lots|chat|users|lots/offer)/[a-zA-Z0-9]+`)
	reUID        = regexp.MustCompile(`^[a-zA-Z0-9\-_]{3,64}$`)
	reNumericUID = regexp.MustCompile(`^[0-9]{1,64}$`)
	reDiscord    = regexp.MustCompile(`^[0-9]{5,20}$|^@?[a-zA-Z0-9._]{2,32}$`)
)

// Clean нормализует строку: trim, удаление управляющих символов.
func Clean(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\t' || (r >= 32 && r != 127) {
			b.WriteRune(r)
		}
	}
	runes := []rune(b.String())
	if maxLen > 0 && len(runes) > maxLen {
		runes = runes[:maxLen]
	}
	return string(runes)
}

// MultiLine — как Clean, но сохраняет переводы строк (для паст и причин).
func MultiLine(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\t' || r == '\r' || (r >= 32 && r != 127) {
			b.WriteRune(r)
		}
	}
	runes := []rune(b.String())
	if maxLen > 0 && len(runes) > maxLen {
		runes = runes[:maxLen]
	}
	return string(runes)
}

func NotEmpty(s string) bool { return strings.TrimSpace(s) != "" }

// Telegram нормализует и проверяет @username.
func Telegram(raw string) (string, bool) {
	u := strings.ToLower(strings.TrimPrefix(Clean(raw, 40), "@"))
	if !reTelegram.MatchString("@" + u) {
		return "", false
	}
	return "@" + u, true
}

// YouTubeChannel — ссылка на КАНАЛ (не видео/шортсы).
func YouTubeChannel(raw string) (string, bool) {
	u := Clean(raw, 200)
	if !reYouTube.MatchString(u) {
		return "", false
	}
	return u, true
}

func TikTokChannel(raw string) (string, bool) {
	u := Clean(raw, 200)
	if !reTikTok.MatchString(u) {
		return "", false
	}
	return u, true
}

func FunPayLot(raw string) (string, bool) {
	u := Clean(raw, 300)
	if !reFunPay.MatchString(u) {
		return "", false
	}
	return u, true
}

func AnyURL(raw string) (string, bool) {
	u := Clean(raw, 500)
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", false
	}
	return u, true
}

func UID(raw string) (string, bool) {
	u := Clean(raw, 64)
	if !reUID.MatchString(u) {
		return "", false
	}
	return u, true
}

func NumericUID(raw string) (string, bool) {
	u := Clean(raw, 64)
	if !reNumericUID.MatchString(u) {
		return "", false
	}
	return u, true
}

func DiscordID(raw string) (string, bool) {
	u := Clean(raw, 40)
	return u, reDiscord.MatchString(u)
}

// Amount — десятичная сумма (USDT).
func Amount(raw string) (float64, bool) {
	a := strings.ReplaceAll(Clean(raw, 20), ",", ".")
	v, err := strconv.ParseFloat(a, 64)
	if err != nil || v <= 0 || v > 1_000_000 {
		return 0, false
	}
	return v, true
}

func InList(s string, allowed ...string) bool {
	s = strings.ToLower(Clean(s, 32))
	for _, a := range allowed {
		if s == a {
			return true
		}
	}
	return false
}

// NoControl rejects strings with weird unicode (анти-спам/абуз в текстах).
func NoControl(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Cf, r) || (unicode.IsControl(r) && r != '\n') {
			return false
		}
	}
	return true
}

var AllowedServers = []string{"Funtime", "Spookytime", "Reallyworld", "Holyworld", "Прочие"}

// Servers фильтрует список серверов по разрешённым значениям.
func Servers(raw []string) (string, bool) {
	var picked []string
	for _, s := range raw {
		s = Clean(s, 30)
		for _, a := range AllowedServers {
			if strings.EqualFold(s, a) {
				picked = append(picked, a)
			}
		}
	}
	if len(picked) == 0 {
		return "", false
	}
	// dedupe, keep order
	seen := map[string]bool{}
	var uniq []string
	for _, s := range picked {
		if !seen[s] {
			seen[s] = true
			uniq = append(uniq, s)
		}
	}
	return strings.Join(uniq, ", "), true
}
