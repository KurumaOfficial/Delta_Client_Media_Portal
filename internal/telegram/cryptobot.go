package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// CryptoBot — клиент Crypto Pay API (автовыплаты USDT через @crypto_bot).
// Документация: https://help.crypt.bot/crypto-pay-api
type CryptoBot struct {
	Token   string
	BaseURL string
	HTTP    *http.Client
}

func NewCryptoBot(token string, testnet bool) *CryptoBot {
	base := "https://pay.crypt.bot/api/v1"
	if testnet {
		base = "https://testnet-pay.crypt.bot/api/v1"
	}
	return &CryptoBot{Token: token, BaseURL: base, HTTP: &http.Client{Timeout: 20 * time.Second}}
}

func (cb *CryptoBot) Enabled() bool { return cb != nil && cb.Token != "" }

func (cb *CryptoBot) call(method string, params map[string]any) (json.RawMessage, error) {
	if !cb.Enabled() {
		return nil, fmt.Errorf("CRYPTOBOT_API_TOKEN не настроен")
	}
	body, _ := json.Marshal(params)
	req, err := http.NewRequest(http.MethodPost, cb.BaseURL+"/"+method, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Crypto-Pay-API-Token", cb.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := cb.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var env struct {
		OK    bool `json:"ok"`
		Error *struct {
			Name string `json:"name"`
		} `json:"error"`
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("cryptobot %s: некорректный ответ %.200s", method, data)
	}
	if !env.OK {
		name := "UNKNOWN"
		if env.Error != nil {
			name = env.Error.Name
		}
		return nil, fmt.Errorf("cryptobot %s: %s", method, name)
	}
	return env.Result, nil
}

// Balance возвращает доступный баланс актива.
func (cb *CryptoBot) Balance(asset string) (float64, error) {
	raw, err := cb.call("getBalance", map[string]any{})
	if err != nil {
		return 0, err
	}
	var balances []struct {
		Asset     string  `json:"asset"`
		Available float64 `json:"available"`
	}
	if err := json.Unmarshal(raw, &balances); err != nil {
		return 0, err
	}
	for _, b := range balances {
		if b.Asset == asset {
			return b.Available, nil
		}
	}
	return 0, fmt.Errorf("актив %s не найден", asset)
}

// Transfer переводит USDT пользователю (должен быть юзером @crypto_bot).
// spendID — идемпотентный ключ (id выплаты), защита от двойного перевода.
func (cb *CryptoBot) Transfer(userID int64, asset string, amount float64, spendID, note string) error {
	raw, err := cb.call("transfer", map[string]any{
		"user_id":  userID,
		"asset":    asset,
		"amount":   strconv.FormatFloat(amount, 'f', 2, 64),
		"spend_id": spendID,
		"note":     note,
	})
	if err != nil {
		return err
	}
	var res struct {
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return err
	}
	if !res.Success {
		return fmt.Errorf("перевод не выполнен")
	}
	return nil
}
