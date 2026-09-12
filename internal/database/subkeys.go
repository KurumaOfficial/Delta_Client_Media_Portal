package database

import (
	"database/sql"
	"fmt"
	"strings"

	"dmr/internal/models"
)

// PopKey атомарно извлекает 1 неиспользованный ключ из пула указанной категории (sub или giveaway) и закрепляет его за заявкой.
func (db *DB) PopKey(category string, requestID, accountID int64, assignedTo string) (string, error) {
	if category == "" {
		category = "sub"
	}
	catName := "подписок"
	if category == "giveaway" {
		catName = "для розыгрышей"
	}

	if db.IsPostgres() {
		q := `
			UPDATE v2_sub_keys
			SET is_used = 1,
			    used_at = CURRENT_TIMESTAMP,
			    assigned_request_id = $1,
			    assigned_account_id = $2,
			    assigned_to = $3
			WHERE id = (
			    SELECT id FROM v2_sub_keys
			    WHERE category = $4 AND is_used = 0
			    ORDER BY id ASC
			    LIMIT 1
			    FOR UPDATE SKIP LOCKED
			)
			RETURNING key_code;
		`
		var keyCode string
		err := db.SQL.QueryRow(q, requestID, accountID, assignedTo, category).Scan(&keyCode)
		if err != nil {
			if err == sql.ErrNoRows {
				return "", fmt.Errorf("в пуле нет свободных ключей %s", catName)
			}
			return "", fmt.Errorf("pop key (%s): %w", category, err)
		}
		return keyCode, nil
	}

	// SQLite транзакционный fallback
	tx, err := db.SQL.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var id int64
	var keyCode string
	err = tx.QueryRow(`SELECT id, key_code FROM v2_sub_keys WHERE category = ? AND is_used = 0 ORDER BY id ASC LIMIT 1`, category).Scan(&id, &keyCode)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("в пуле нет свободных ключей %s", catName)
		}
		return "", err
	}

	_, err = tx.Exec(
		`UPDATE v2_sub_keys SET is_used = 1, used_at = CURRENT_TIMESTAMP, assigned_request_id = ?, assigned_account_id = ?, assigned_to = ? WHERE id = ?`,
		requestID, accountID, assignedTo, id,
	)
	if err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return keyCode, nil
}

// PopSubscriptionKey извлекает ключ из пула подписок.
func (db *DB) PopSubscriptionKey(requestID, accountID int64, assignedTo string) (string, error) {
	return db.PopKey("sub", requestID, accountID, assignedTo)
}

// PopGiveawayKey извлекает ключ из пула для розыгрышей.
func (db *DB) PopGiveawayKey(requestID, accountID int64, assignedTo string) (string, error) {
	return db.PopKey("giveaway", requestID, accountID, assignedTo)
}

// AddKeys добавляет пачку ключей в хранилище указанной категории, игнорируя дубликаты.
func (db *DB) AddKeys(category string, keys []string) (added int, duplicates int, err error) {
	if category == "" {
		category = "sub"
	}
	stmtStr := db.Rebind(`INSERT INTO v2_sub_keys (category, key_code) VALUES (?, ?)`)
	if db.IsPostgres() {
		stmtStr = `INSERT INTO v2_sub_keys (category, key_code) VALUES ($1, $2) ON CONFLICT (key_code) DO NOTHING`
	} else {
		stmtStr = `INSERT OR IGNORE INTO v2_sub_keys (category, key_code) VALUES (?, ?)`
	}

	stmt, err := db.SQL.Prepare(stmtStr)
	if err != nil {
		return 0, 0, fmt.Errorf("prepare insert key: %w", err)
	}
	defer stmt.Close()

	for _, rawKey := range keys {
		k := strings.TrimSpace(rawKey)
		if k == "" {
			continue
		}
		res, err := stmt.Exec(category, k)
		if err != nil {
			duplicates++
			continue
		}
		aff, _ := res.RowsAffected()
		if aff > 0 {
			added++
		} else {
			duplicates++
		}
	}
	return added, duplicates, nil
}

// AddSubscriptionKeys добавляет пачку ключей подписок.
func (db *DB) AddSubscriptionKeys(keys []string) (added int, duplicates int, err error) {
	return db.AddKeys("sub", keys)
}

// AddGiveawayKeys добавляет пачку ключей для розыгрышей.
func (db *DB) AddGiveawayKeys(keys []string) (added int, duplicates int, err error) {
	return db.AddKeys("giveaway", keys)
}

// KeysStats возвращает количество свободных и использованных ключей для указанной категории.
func (db *DB) KeysStats(category string) (available int, used int, err error) {
	if category == "" {
		category = "sub"
	}
	row := db.SQL.QueryRow(db.Rebind(`
		SELECT 
			COALESCE(SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END), 0)
		FROM v2_sub_keys
		WHERE category = ?
	`), category)
	err = row.Scan(&available, &used)
	return available, used, err
}

// SubscriptionKeysStats возвращает количество свободных и использованных ключей сабок.
func (db *DB) SubscriptionKeysStats() (available int, used int, err error) {
	return db.KeysStats("sub")
}

// GiveawayKeysStats возвращает количество свободных и использованных ключей для розыгрышей.
func (db *DB) GiveawayKeysStats() (available int, used int, err error) {
	return db.KeysStats("giveaway")
}

// ListKeys возвращает список ключей указанной категории с пагинацией.
func (db *DB) ListKeys(category string, limit, offset int) ([]models.SubscriptionKey, error) {
	if category == "" {
		category = "sub"
	}
	if limit <= 0 {
		limit = 50
	}
	q := db.Rebind(`
		SELECT id, category, key_code, is_used, used_at, assigned_request_id, assigned_account_id, assigned_to, created_at
		FROM v2_sub_keys
		WHERE category = ?
		ORDER BY id DESC
		LIMIT ? OFFSET ?
	`)
	rows, err := db.SQL.Query(q, category, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.SubscriptionKey
	for rows.Next() {
		var k models.SubscriptionKey
		var isUsedInt int
		var usedAt sql.NullTime
		if err := rows.Scan(&k.ID, &k.Category, &k.KeyCode, &isUsedInt, &usedAt, &k.AssignedRequestID, &k.AssignedAccountID, &k.AssignedTo, &k.CreatedAt); err != nil {
			continue
		}
		k.IsUsed = isUsedInt == 1
		if usedAt.Valid {
			t := usedAt.Time
			k.UsedAt = &t
		}
		list = append(list, k)
	}
	return list, nil
}

// ListSubscriptionKeys возвращает список ключей подписок с пагинацией.
func (db *DB) ListSubscriptionKeys(limit, offset int) ([]models.SubscriptionKey, error) {
	return db.ListKeys("sub", limit, offset)
}

// ListGiveawayKeys возвращает список ключей для розыгрышей с пагинацией.
func (db *DB) ListGiveawayKeys(limit, offset int) ([]models.SubscriptionKey, error) {
	return db.ListKeys("giveaway", limit, offset)
}

// DeleteSubscriptionKey удаляет ключ, если он ещё не был выдан.
func (db *DB) DeleteSubscriptionKey(id int64) error {
	q := db.Rebind(`DELETE FROM v2_sub_keys WHERE id = ? AND is_used = 0`)
	res, err := db.SQL.Exec(q, id)
	if err != nil {
		return err
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		return fmt.Errorf("ключ не найден или уже выдан")
	}
	return nil
}
