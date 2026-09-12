# Delta Media Portal

Портал медиа-партнёрства и модерации персонала для [Delta Client](https://deltaclient.xyz).
Продакшн-система сообщества Minecraft на 300к+ пользователей. Собрана как заказ; код открыт для ознакомления.

## Обзор

Один Go-бинарник: HTTP API на Fiber v2 плюс SPA на чистом ванильном JS без зависимостей. Доступ по персональным кодам с подтверждением входа через Telegram. Портал закрывает весь цикл медиа-партнёра — заявки, досье, вердикты, еженедельный цикл USDT-выплат — плюс инструменты персонала: сбросы HWID, Discord-баны, многоуровневый бан-движок. SQLite для локальной разработки, PostgreSQL в продакшене. Интерфейс на четырёх языках (RU / UA / UK / EN).

## Возможности

**Контроль доступа**

- Персональные коды вместо паролей, выпуск, отзыв и ротация администратором. Роли: `admin`, `moderator`, `media`, `freemedia`.
- Обязательный Telegram 2FA: при каждом входе владельцу кода уходят IP, юзер-агент, время и GPS-точка на карте. Нет подтверждения — нет сессии.
- Сессии в cookie (`httpOnly`, `SameSite=Lax`) с настраиваемым TTL. Лимиты частоты на вход и публичные формы.

**Модерация**

- Досье кандидатов (статистика YouTube / TikTok, охваты, доказательства) с вердиктом в один клик в вебе и кнопками в Telegram-боте.
- Реестры сброса HWID и Discord-банов с чанковой загрузкой доказательств (скриншоты, видео, до 2 ГБ на загрузку).
- Многоуровневый банлист — IP с поддержкой CIDR, игровой UID, Telegram username/ID, URL каналов — поверх in-memory кэша.

**Выплаты**

- Недельное расчётное окно (пн 00:00 — пн 23:00 МСК, `Europe/Moscow`), автоматическая агрегация и архивация.
- Выплаты USDT через CryptoBot Pay API по подтверждению администратора, есть поддержка тестнета.
- Шаблоны лотов FunPay, математика промокодов, кастомные косметические награды, еженедельные отчёты владельцам в Telegram.

**Аналитика**

- Метрики администратора с графиком Безье поступления заявок и фильтрами периодов (день / неделя / месяц / год / всё время).
- Переключатели приёма публичных заявок и техрежима в один клик.

**Интеграция Telegram**

- Bot API для 2FA, вердиктов и уведомлений; секретарь Business API с человеческими задержками и обратным отсчётом 24-часового окна диалога.
- HTML5 desktop push-уведомления партнёрам и модераторам о смене статусов.

**Фронтенд**

- Без фреймворков: модульный ванильный JS (`auth`, `admin`, `cabinet`, `public`, `ui`, `api`, `i18n`), glassmorphic CSS в стилистике Delta, Cloudflare Turnstile на публичных формах.

## Архитектура

Конвейер запроса: `recover → compress → проверка IP-бана → аудит-лог → сессия → лимитер → RBAC-группы` (`/api/mod`, `/api/cabinet`, `/api/admin`).

Сервисы: `telegram` (бот, 2FA, секретарь), `payouts` (периоды, выплаты CryptoBot), `uploads` (докачиваемая чанковая загрузка), `bans` (in-memory CIDR-кэш сущностей). Хранилище: SQLite на чистом Go-драйвере (без CGO) либо PostgreSQL.

## Технологический стек

| Слой       | Выбор                                                           |
| ---------- | --------------------------------------------------------------- |
| Язык       | Go 1.25                                                         |
| HTTP       | Fiber v2.52 (fasthttp)                                          |
| База       | SQLite (glebarez/go-sqlite) / PostgreSQL (lib/pq)               |
| Фронтенд   | Ванильный JS на ES-модулях, без фреймворков                     |
| Авторизация| Cookie-сессии, Telegram 2FA с GPS                               |
| Выплаты    | CryptoBot Pay API (USDT)                                        |
| Антибот    | Cloudflare Turnstile                                            |
| Конфиг     | `.env` через godotenv                                           |

## Ветки

- `main` — продакшн V2, описывается этим документом.
- `Legacy` — архивная V1.4 (Supabase + клиентский JS). Только история, не поддерживается.

## Структура проекта

```
├── config/                  парсинг .env и типизированный конфиг
├── internal/
│   ├── auth/                сессии, коды доступа, 2FA-флоу
│   ├── bans/                in-memory бан-движок (IP/CIDR, UID, TG)
│   ├── database/            подключение, схема, миграции, сиды
│   ├── handlers/            public, cabinet, mod, admin (+accounts, bans, payouts)
│   ├── middleware/          real IP, security-заголовки, аудит, лимиты
│   ├── models/              доменные структуры
│   ├── payouts/             недельные периоды, математика сумм, CryptoBot
│   ├── telegram/            бот, секретарь Business API, GPS-проверки
│   ├── uploads/             чанковое хранилище загрузок
│   └── validation/          серверная валидация входных данных
├── tools/
│   ├── e2e/                 сквозные Go-тесты API
│   ├── frontend_test/       браузерные тесты Puppeteer (Node 18+)
│   ├── generate_banner/     инструментарий ассетов
│   └── seedlocal/           генератор демо-данных
├── web/
│   ├── static/css|js|img    стили, модули SPA, текстуры
│   └── views/index.html     единая точка входа SPA (/, /ru, /ua, /uk, /en)
├── main.go                  роуты, DI, graceful shutdown
└── .env.example             полный пример конфигурации
```

## Конфигурация

Все настройки — из `.env` (см. `.env.example`):

| Переменная                | По умолчанию   | Назначение                                               |
| ------------------------- | -------------- | -------------------------------------------------------- |
| `PORT` / `HOST`           | `3000` / `0.0.0.0` | Адрес HTTP-сервера                                   |
| `DB_DRIVER`               | `sqlite`       | `sqlite` или `postgres`                                  |
| `DB_PATH`                 | `./delta_v2.db`| Путь к файлу SQLite                                      |
| `SUPABASE_DB_URL`         | —              | Строка подключения PostgreSQL                            |
| `ADMIN_BOOTSTRAP_CODE`    | `DELTA-ROOT-0001` | Первый код админа, создаётся на пустой БД             |
| `SESSION_TTL_HOURS`       | `168`          | Время жизни cookie-сессии                                |
| `GPS_REQUIRED`            | `true`         | Требовать реальные GPS-координаты при входе через Telegram |
| `DEV_AUTO_APPROVE_2FA`    | `false`        | Только локальная разработка: подтверждать 2FA без Telegram. С postgres запрещён |
| `TELEGRAM_BOT_TOKEN`      | —              | Токен бота от @BotFather                                 |
| `TELEGRAM_ADMIN_CONTACT` / `TELEGRAM_SECRETARY_CONTACT` | — | Контакты, показываемые в интерфейсе          |
| `TELEGRAM_OWNER_IDS`      | —              | ID владельцев для привилегированных уведомлений          |
| `CRYPTOBOT_API_TOKEN` / `CRYPTOBOT_TESTNET` / `CRYPTOBOT_ASSET` | — / `false` / `USDT` | Настройки провайдера выплат |
| `WEEK_TZ`                 | `Europe/Moscow`| Часовой пояс расчётной недели                            |
| `UPLOAD_DIR` / `MAX_UPLOAD_GB` | `./uploads` / `2` | Хранилище доказательств                          |
| `TURNSTILE_SITEKEY` / `TURNSTILE_SECRET` | — | Ключи Cloudflare Turnstile                            |

## Локальный запуск

Требования: Go 1.25+. Node 18+ только для браузерных тестов.

```bash
git clone https://github.com/KurumaOfficial/Delta-Media.git
cd Delta-Media
cp .env.example .env
```

Заполните `.env` (токен бота, секреты, БД). Для локальной работы без Telegram поставьте `DEV_AUTO_APPROVE_2FA=true` с `DB_DRIVER=sqlite`.

```bash
# Windows
run-local.bat

# Linux / macOS
chmod +x run-local.sh
./run-local.sh

# или напрямую
go run main.go
```

Портал слушает `http://localhost:3000` (или `$PORT`). Первый вход: откройте страницу кабинета и введите `ADMIN_BOOTSTRAP_CODE`.

## Справочник API

Авторизация и сессии:

```
POST /api/auth/login                  вход по персональному коду (с лимитером)
GET  /api/auth/attempt/:token         опрос статуса подтверждения 2FA
GET  /api/me                          роль и профиль текущей сессии
POST /api/session/ping                продление сессии
POST /api/logout                      инвалидация сессии
```

Публичный контур:

```
GET  /api/health                      состояние сервиса, техрежим, контакты админов
POST /api/media/submit                заявка на медиа-партнёрство (с лимитером)
POST /api/check-tg-verified           проверка Telegram-верификации
POST /api/upload/init                 старт чанковой загрузки
POST /api/upload/chunk                загрузка чанка
POST /api/log-client-error            клиентская телеметрия ошибок
```

Кабинет (`media`, `admin`), блокируется на техобслуживании:

```
GET  /api/cabinet/requests            свои заявки
POST /api/cabinet/payout              запрос выплаты (USDT / FunPay / косметика)
POST /api/cabinet/lot                 подача лота FunPay
POST /api/cabinet/feedback            идеи и баг-репорты
```

Модерация (`moderator`, `admin`):

```
GET  /api/mod/requests                обработанные заявки
POST /api/mod/hwid                    запрос сброса HWID
POST /api/mod/discord                 жалоба на Discord-бан
```

Админка (`admin`): статистика и графики, переключатели техрежима и приёма заявок, логи, настройки, вердикты по медиа (`/media`, `/media/:id/decide`), решения по HWID, Discord-баны, выплаты и недельные сводки, идеи, аккаунты (создание / блокировка / сброс кода / удаление), полный CRUD банлиста, окна диалогов Telegram.

## Тестирование

- `go run ./tools/e2e` — сквозные тесты API (нужен запущенный инстанс).
- `tools/frontend_test` (`comprehensive_test.js`, `verify_user_5_requirements.js`, `smoke_browser.js`) — браузерные тесты Puppeteer против локального запуска.

## Безопасность

- Сессии — `httpOnly` + `SameSite=Lax` cookie с серверным TTL; на вход и публичные формы стоят лимитеры по IP.
- Подтверждение 2FA привязывает IP, юзер-агент и GPS; `GPS_REQUIRED` режет входы без реальных координат.
- Дев-обход 2FA отказывается работать с драйвером Postgres — только локальный SQLite.
- Весь пользовательский ввод проходит пакет `validation` на сервере (числовой UID, форматы каналов, математика выплат); загрузки проверяются по MIME и режутся по размеру.

## Статус

Продакшен. Заказ Delta Client — код открыт, переиспользование в других проектах только с разрешения. Файл лицензии не поставляется; по умолчанию все права защищены.
