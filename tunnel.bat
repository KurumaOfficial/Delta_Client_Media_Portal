@echo off
chcp 65001 >nul
echo ================================================================
echo   Delta Media Recode - Доступ для тестирования
echo ================================================================
echo.
echo [1] ДЛЯ ТЕСТИРОВАНИЯ В ОДНОЙ WI-FI СЕТИ:
echo     Друг может просто открыть в браузере:
echo     http://10.233.114.132:3999
echo.
echo [2] ЕСЛИ НУЖЕН ВНЕШНИЙ ТУННЕЛЬ:
echo     Запуск Cloudflare Tunnel...
echo ================================================================
if exist C:\Program Files (x86)\cloudflared\cloudflared.exe (
    C:\Program Files (x86)\cloudflared\cloudflared.exe tunnel --url http://127.0.0.1:3999
) else (
    npx --yes localtunnel --port 3999
)
pause
