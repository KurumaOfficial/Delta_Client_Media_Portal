@echo off
rem ── Локальный запуск Delta Media Recode (V2) ─────────────────
rem  - БД: локальный SQLite (local.db), прод-Supabase НЕ трогается
rem  - Telegram-бот ВЫКЛЮЧЕН: не конфликтует с V1 в проде (один токен = один поллер)
rem  - 2FA подтверждается автоматически (dev-режим), GPS не требуется
rem Сайт: http://127.0.0.1:3999
cd /d "%~dp0"
set DB_DRIVER=sqlite
set DB_PATH=./local.db
set HOST=0.0.0.0
set PORT=3999
set TELEGRAM_BOT_TOKEN=
set GPS_REQUIRED=false
set DEV_AUTO_APPROVE_2FA=true
set TURNSTILE_SITEKEY=1x00000000000000000000AA
set TURNSTILE_SECRET=1x0000000000000000000000000000000AA
if not exist delta-media-recode.exe go build -o delta-media-recode.exe .
echo Локальный запуск V2: http://127.0.0.1:3999  (Ctrl+C для остановки)
delta-media-recode.exe
