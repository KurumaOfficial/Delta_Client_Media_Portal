package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"dmr/internal/database"
	"dmr/internal/models"
)

const attemptTTL = 5 * time.Minute

// Service — коды аккаунтов, 2FA-попытки входа и сессии.
type Service struct {
	db      *database.DB
	session time.Duration
}

func NewService(db *database.DB, sessionTTL time.Duration) *Service {
	if sessionTTL <= 0 {
		sessionTTL = 7 * 24 * time.Hour
	}
	return &Service{db: db, session: sessionTTL}
}

// ── Коды и аккаунты ──────────────────────────────────────────

// GenerateCode формирует код вида DLT-XXXXX-XXXXX (криптостойкий).
func GenerateCode() string {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, 0, 14)
	for i, v := range b {
		if i == 5 {
			out = append(out, '-')
		}
		out = append(out, alphabet[int(v)%len(alphabet)])
	}
	return "DLT-" + string(out)
}

func (s *Service) CreateAccount(role, nickname, telegram string) (models.Account, error) {
	code := GenerateCode()
	id, err := s.db.InsertReturningID(
		`INSERT INTO v2_accounts (code, role, nickname, telegram) VALUES (?, ?, ?, ?)`,
		code, role, nickname, telegram,
	)
	if err != nil {
		return models.Account{}, err
	}
	return s.AccountByID(id)
}

func (s *Service) AccountByID(id int64) (models.Account, error) {
	return s.scanAccount(s.db.QueryRow(
		`SELECT id, code, role, nickname, telegram, tg_user_id, is_active FROM v2_accounts WHERE id = ?`, id))
}

func (s *Service) AccountByCode(code string) (models.Account, error) {
	return s.scanAccount(s.db.QueryRow(
		`SELECT id, code, role, nickname, telegram, tg_user_id, is_active FROM v2_accounts
		 WHERE UPPER(code) = ?`, strings.ToUpper(strings.TrimSpace(code))))
}

func (s *Service) scanAccount(row *sql.Row) (models.Account, error) {
	var a models.Account
	err := row.Scan(&a.ID, &a.Code, &a.Role, &a.Nickname, &a.Telegram, &a.TGUserID, &a.IsActive)
	return a, err
}

func (s *Service) ListAccounts() ([]models.Account, error) {
	rows, err := s.db.SQL.Query(
		`SELECT id, code, role, nickname, telegram, tg_user_id, is_active, created_at
		 FROM v2_accounts ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]models.Account, 0, 16)
	for rows.Next() {
		var a models.Account
		if rows.Scan(&a.ID, &a.Code, &a.Role, &a.Nickname, &a.Telegram, &a.TGUserID, &a.IsActive, &a.CreatedAt) == nil {
			list = append(list, a)
		}
	}
	return list, nil
}

// SetAccountState — 1 активен / 0 отключён.
func (s *Service) SetAccountState(id int64, active int) error {
	_, err := s.db.Exec(`UPDATE v2_accounts SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, active, id)
	return err
}

func (s *Service) DeleteAccount(id int64) error {
	_, err := s.db.Exec(`DELETE FROM v2_accounts WHERE id = ?`, id)
	return err
}

// LinkTGUser привязывает числовой TG id к аккаунту по @username (когда юзер пишет боту).
func (s *Service) LinkTGUser(username string, tgUserID int64) error {
	if username == "" || tgUserID == 0 {
		return nil
	}
	_, err := s.db.Exec(
		`UPDATE v2_accounts SET tg_user_id = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE LOWER(LTRIM(telegram, '@')) = ?`,
		tgUserID, strings.ToLower(strings.TrimPrefix(username, "@")))
	return err
}

// ResolveTGChatID возвращает числовой TG id аккаунта (для доставки 2FA/CryptoBot).
func (s *Service) ResolveTGChatID(a models.Account) int64 {
	if a.TGUserID != 0 {
		return a.TGUserID
	}
	var id int64
	clean := strings.ToLower(strings.TrimPrefix(a.Telegram, "@"))
	_ = s.db.QueryRow(`SELECT tg_user_id FROM v2_tg_users WHERE LOWER(username) = ?`, clean).Scan(&id)
	return id
}

// AttemptAccountID — account_id попытки входа (для проверки владельца кнопки).
func (s *Service) AttemptAccountID(attemptID int64) (int64, error) {
	var accID int64
	err := s.db.QueryRow(`SELECT account_id FROM v2_login_attempts WHERE id = ?`, attemptID).Scan(&accID)
	return accID, err
}

// AccountByTelegram ищет аккаунт по @username (нормализованному).
func (s *Service) AccountByTelegram(username string) (models.Account, error) {
	clean := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if clean == "" {
		return models.Account{}, sql.ErrNoRows
	}
	return s.scanAccount(s.db.QueryRow(
		`SELECT id, code, role, nickname, telegram, tg_user_id, is_active FROM v2_accounts
		 WHERE LOWER(LTRIM(telegram, '@')) = ?`, clean))
}

// ── 2FA попытки входа ────────────────────────────────────────

func randomToken() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// StartAttempt создаёт ожидание подтверждения через Telegram.
func (s *Service) StartAttempt(a models.Account, ip, gps, ua string) (models.LoginAttempt, error) {
	// одиночная активная попытка на аккаунт: старые гасим
	_, _ = s.db.Exec(`UPDATE v2_login_attempts SET status = 'expired'
		WHERE account_id = ? AND status = 'pending'`, a.ID)

	att := models.LoginAttempt{Token: randomToken(), AccountID: a.ID, IP: ip, GPS: gps, Status: "pending"}
	id, err := s.db.InsertReturningID(
		`INSERT INTO v2_login_attempts (token, account_id, ip, gps, user_agent, status)
		 VALUES (?, ?, ?, ?, ?, 'pending')`,
		att.Token, att.AccountID, ip, gps, ua)
	if err != nil {
		return att, err
	}
	att.ID = id
	return att, nil
}

func (s *Service) AttemptByToken(token string) (models.LoginAttempt, error) {
	var att models.LoginAttempt
	err := s.db.QueryRow(
		`SELECT id, token, account_id, ip, gps, status, created_at
		 FROM v2_login_attempts WHERE token = ?`, token,
	).Scan(&att.ID, &att.Token, &att.AccountID, &att.IP, &att.GPS, &att.Status, &att.CreatedAt)
	if err != nil {
		return att, err
	}
	if att.Status == "pending" && time.Since(att.CreatedAt) > attemptTTL {
		att.Status = "expired"
		_, _ = s.db.Exec(`UPDATE v2_login_attempts SET status = 'expired', decided_at = CURRENT_TIMESTAMP WHERE id = ?`, att.ID)
	}
	return att, nil
}

// DecideAttempt подтверждает/отклоняет попытку (вызов из TG-колбэка).
func (s *Service) DecideAttempt(id int64, approve bool) error {
	status := "denied"
	if approve {
		status = "approved"
	}
	res, err := s.db.Exec(
		`UPDATE v2_login_attempts SET status = ?, decided_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND status = 'pending'`, status, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("попытка входа уже не активна")
	}
	return nil
}

// ── Сессии ───────────────────────────────────────────────────

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// CreateSession выпускает сессию; сырое значение отдаётся один раз, в БД только хэш.
func (s *Service) CreateSession(a models.Account, ip, gps, ua string) (string, error) {
	raw := randomToken()
	_, err := s.db.Exec(
		`INSERT INTO v2_sessions (token_hash, account_id, ip, user_agent, gps, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		hashToken(raw), a.ID, ip, ua, gps, time.Now().Add(s.session))
	if err != nil {
		return "", err
	}
	return raw, nil
}

// idleTTL — сессия живёт, пока открыта страница (фронт шлёт heartbeat).
// При отсутствии активности истекает через 15 минут.
const idleTTL = 15 * time.Minute

// Session возвращает валидную сессию по сырому токену; попутно
// обновляет last_seen (не чаще раза в 15 с, чтобы не писать на каждый запрос).
func (s *Service) Session(raw string) (models.Session, bool) {
	if strings.TrimSpace(raw) == "" {
		return models.Session{}, false
	}
	h := hashToken(raw)
	now := time.Now()
	var (
		sess     models.Session
		exp      time.Time
		created  time.Time
		lastSeen sql.NullTime
		accID    int64
	)
	err := s.db.QueryRow(
		`SELECT s.token_hash, s.account_id, s.ip, s.gps, s.expires_at, s.created_at, s.last_seen
		 FROM v2_sessions s WHERE s.token_hash = ?`, h,
	).Scan(&sess.TokenHash, &accID, &sess.IP, &sess.GPS, &exp, &created, &lastSeen)
	if err != nil || now.After(exp) {
		if err == nil {
			_, _ = s.db.Exec(`DELETE FROM v2_sessions WHERE token_hash = ?`, h)
		}
		return models.Session{}, false
	}
	seen := created
	if lastSeen.Valid {
		seen = lastSeen.Time
	}
	if now.Sub(seen) > idleTTL {
		_, _ = s.db.Exec(`DELETE FROM v2_sessions WHERE token_hash = ?`, h)
		return models.Session{}, false
	}
	if now.Sub(seen) > 15*time.Second {
		_, _ = s.db.Exec(`UPDATE v2_sessions SET last_seen = ? WHERE token_hash = ?`, now, h)
	}
	acc, err := s.AccountByID(accID)
	if err != nil || acc.IsActive != 1 {
		return models.Session{}, false
	}
	sess.Account = acc
	return sess, true
}

// ConstantTimeCompare обёртка для сравнения токенов при необходимости.
func ConstantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func (s *Service) DeleteSession(raw string) {
	_, _ = s.db.Exec(`DELETE FROM v2_sessions WHERE token_hash = ?`, hashToken(raw))
}

// Cleanup удаляет истёкшие сессии и попытки (вызывается по расписанию).
func (s *Service) Cleanup() {
	_, _ = s.db.Exec(`DELETE FROM v2_sessions WHERE expires_at < ?`, time.Now())
	_, _ = s.db.Exec(`UPDATE v2_login_attempts SET status = 'expired'
		WHERE status = 'pending' AND created_at < ?`, time.Now().Add(-attemptTTL))
}
