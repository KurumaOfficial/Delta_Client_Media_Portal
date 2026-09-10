#!/usr/bin/env bash
# ── Локальный запуск Delta Media Recode (V2) ─────────────────
#  - БД: локальный SQLite (local.db), прод-Supabase НЕ трогается
#  - Telegram-бот ВЫКЛЮЧЕН: не конфликтует с V1 в проде
#  - 2FA подтверждается автоматически (dev-режим), GPS не требуется
cd "$(dirname "$0")"
export DB_DRIVER=sqlite DB_PATH=./local.db HOST=127.0.0.1 PORT=3999
export TELEGRAM_BOT_TOKEN= GPS_REQUIRED=false DEV_AUTO_APPROVE_2FA=true
export TURNSTILE_SITEKEY="1x00000000000000000000AA" TURNSTILE_SECRET="1x0000000000000000000000000000000AA"
[ -x ./delta-media-recode.exe ] || go build -o delta-media-recode.exe .
echo "Локальный запуск V2: http://127.0.0.1:3999  (Ctrl+C для остановки)"
exec ./delta-media-recode.exe
