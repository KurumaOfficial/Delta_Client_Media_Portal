# Delta Media Portal

Media partnership and staff moderation portal for [Delta Client](https://deltaclient.xyz).
Production system serving a 300k+ user Minecraft community. Built as a custom order; the codebase is public for reference.

## Overview

Single Go binary: a Fiber v2 HTTP API serving a dependency-free vanilla JS SPA. Access is key-based with Telegram-confirmed logins. The portal covers the full media-partner lifecycle — applications, dossiers, verdicts, a weekly USDT payout cycle — plus staff tooling: HWID resets, Discord bans, and a multilevel ban engine. SQLite for local development, PostgreSQL in production. UI localized in four languages (RU / UA / UK / EN).

## Features

**Access control**

- Personal access codes instead of passwords, with admin-issued rotation and revocation. Roles: `admin`, `moderator`, `media`, `freemedia`.
- Mandatory Telegram 2FA: each login sends the key owner the IP, user agent, timestamp, and GPS position on a map. No confirmation, no session.
- Cookie sessions (`httpOnly`, `SameSite=Lax`) with configurable TTL. Rate-limited login and submission endpoints.

**Moderation**

- Candidate dossiers (YouTube / TikTok stats, reach, evidence) with one-click verdicts in the web UI and via Telegram bot buttons.
- HWID reset registry and Discord ban registry with chunked evidence uploads (screenshots, video, up to 2 GB per upload).
- Multilevel banlist — IP with CIDR support, game UID, Telegram username/ID, channel URLs — backed by an in-memory cache.

**Payouts**

- Weekly settlement window (Mon 00:00 – Mon 23:00 MSK, `Europe/Moscow`), automatic aggregation and archiving.
- USDT disbursement through the CryptoBot Pay API on admin approval, with testnet support.
- FunPay lot templates, promo-code math, custom cosmetic rewards, weekly Telegram reports to owners.

**Analytics**

- Admin metrics with a Bezier application-intake chart and timeframe filters (day / week / month / year / all time).
- One-click toggles for public applications and maintenance mode.

**Telegram integration**

- Bot API for 2FA, verdicts, and notifications; Business API secretary with human-like delays and a 24-hour dialog-window countdown.
- HTML5 desktop push notifications for partners and moderators on status changes.

**Frontend**

- No framework: modular vanilla JS (`auth`, `admin`, `cabinet`, `public`, `ui`, `api`, `i18n`), glassmorphic Delta-style CSS, Cloudflare Turnstile on public forms.

## Architecture

Request pipeline: `recover → compress → IP ban check → audit log → session → rate limiter → RBAC route groups` (`/api/mod`, `/api/cabinet`, `/api/admin`).

Services: `telegram` (bot, 2FA flow, secretary), `payouts` (period math, CryptoBot disbursement), `uploads` (resumable chunked storage), `bans` (in-memory CIDR/entity cache). Storage: SQLite via a pure-Go driver (no CGO) or PostgreSQL.

## Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Language | Go 1.25                                                       |
| HTTP     | Fiber v2.52 (fasthttp)                                        |
| Database | SQLite (glebarez/go-sqlite) / PostgreSQL (lib/pq)            |
| Frontend | Vanilla JS ES modules, no framework                           |
| Auth     | Cookie sessions, Telegram 2FA with GPS                        |
| Payments | CryptoBot Pay API (USDT)                                      |
| Anti-bot | Cloudflare Turnstile                                          |
| Config   | `.env` via godotenv                                           |

## Branches

- `main` — production V2, described by this document.
- `Legacy` — archived V1.4 (Supabase + client-side JS). Read-only history, not maintained.

## Project structure

```
├── config/                  env parsing and typed configuration
├── internal/
│   ├── auth/                sessions, access codes, 2FA flow
│   ├── bans/                in-memory ban engine (IP/CIDR, UID, TG)
│   ├── database/            connection, schema, migrations, seeds
│   ├── handlers/            public, cabinet, mod, admin (+accounts, bans, payouts)
│   ├── middleware/          real IP, security headers, audit, rate limit
│   ├── models/              domain structs
│   ├── payouts/             weekly periods, amount math, CryptoBot
│   ├── telegram/            bot, Business API secretary, GPS checks
│   ├── uploads/             chunked upload storage
│   └── validation/          server-side input validation
├── tools/
│   ├── e2e/                 Go API end-to-end tests
│   ├── frontend_test/       Puppeteer browser tests (Node 18+)
│   ├── generate_banner/     asset tooling
│   └── seedlocal/           demo data generator
├── web/
│   ├── static/css|js|img    styles, SPA modules, textures
│   └── views/index.html     single SPA entry (/, /ru, /ua, /uk, /en)
├── main.go                  routes, DI, graceful shutdown
└── .env.example             full sample configuration
```

## Configuration

All settings come from `.env` (see `.env.example`):

| Variable                | Default        | Purpose                                              |
| ----------------------- | -------------- | ---------------------------------------------------- |
| `PORT` / `HOST`         | `3000` / `0.0.0.0` | HTTP bind address                                |
| `DB_DRIVER`             | `sqlite`       | `sqlite` or `postgres`                               |
| `DB_PATH`               | `./delta_v2.db`| SQLite file path                                     |
| `SUPABASE_DB_URL`       | —              | PostgreSQL connection string                         |
| `ADMIN_BOOTSTRAP_CODE`  | `DELTA-ROOT-0001` | First admin code, created on empty DB             |
| `SESSION_TTL_HOURS`     | `168`          | Cookie session lifetime                              |
| `GPS_REQUIRED`          | `true`         | Require real GPS coordinates on Telegram login       |
| `DEV_AUTO_APPROVE_2FA`  | `false`        | Local-dev only: approve 2FA without Telegram. Never with Postgres |
| `TELEGRAM_BOT_TOKEN`    | —              | Bot token from @BotFather                            |
| `TELEGRAM_ADMIN_CONTACT` / `TELEGRAM_SECRETARY_CONTACT` | — | Contact usernames shown in the UI           |
| `TELEGRAM_OWNER_IDS`    | —              | Owner IDs for privileged notifications               |
| `CRYPTOBOT_API_TOKEN` / `CRYPTOBOT_TESTNET` / `CRYPTOBOT_ASSET` | — / `false` / `USDT` | Payout provider settings |
| `WEEK_TZ`               | `Europe/Moscow`| Settlement week timezone                             |
| `UPLOAD_DIR` / `MAX_UPLOAD_GB` | `./uploads` / `2` | Evidence storage                          |
| `TURNSTILE_SITEKEY` / `TURNSTILE_SECRET` | — | Cloudflare Turnstile keys                          |

## Running locally

Requirements: Go 1.25+. Node 18+ only for browser tests.

```bash
git clone https://github.com/KurumaOfficial/Delta-Media.git
cd Delta-Media
cp .env.example .env
```

Fill in `.env` (bot token, session secret, DB settings). For local work without Telegram, set `DEV_AUTO_APPROVE_2FA=true` with `DB_DRIVER=sqlite`.

```bash
# Windows
run-local.bat

# Linux / macOS
chmod +x run-local.sh
./run-local.sh

# or directly
go run main.go
```

The portal listens on `http://localhost:3000` (or `$PORT`). First login: open the Cabinet page and enter `ADMIN_BOOTSTRAP_CODE`.

## API reference

Auth and session:

```
POST /api/auth/login                  start login with a personal code (rate-limited)
GET  /api/auth/attempt/:token         poll Telegram 2FA status
GET  /api/me                          current session role and profile
POST /api/session/ping                keep session alive
POST /api/logout                      invalidate session
```

Public:

```
GET  /api/health                      service status, maintenance flag, admin contacts
POST /api/media/submit                media partnership application (rate-limited)
POST /api/check-tg-verified           Telegram verification check
POST /api/upload/init                 start a chunked upload
POST /api/upload/chunk                upload a chunk
POST /api/log-client-error            client error telemetry
```

Cabinet (`media`, `admin`), blocked during maintenance:

```
GET  /api/cabinet/requests            own requests
POST /api/cabinet/payout              payout request (USDT / FunPay / cosmetic)
POST /api/cabinet/lot                 FunPay lot submission
POST /api/cabinet/feedback            ideas and bug reports
```

Moderation (`moderator`, `admin`):

```
GET  /api/mod/requests                own handled requests
POST /api/mod/hwid                    HWID reset request
POST /api/mod/discord                 Discord ban report
```

Admin (`admin`): stats and charts, maintenance/application toggles, logs, settings, media verdicts (`/media`, `/media/:id/decide`), HWID decisions, Discord bans, payouts and week summaries, ideas, accounts (create / toggle / recode / delete), full banlist CRUD, Telegram dialog windows.

## Testing

- `go run ./tools/e2e` — API end-to-end suite (needs a running instance).
- `tools/frontend_test` (`comprehensive_test.js`, `verify_user_5_requirements.js`, `smoke_browser.js`) — Puppeteer browser tests against a local run.

## Security notes

- Sessions are `httpOnly` + `SameSite=Lax` cookies with server-side TTL; login and public submission endpoints are rate-limited per IP.
- 2FA approval binds IP, user agent, and GPS; `GPS_REQUIRED` rejects logins without real coordinates.
- The dev 2FA bypass is refused with the Postgres driver — it only works on local SQLite.
- All user input passes the `validation` package on the server (numeric UID enforcement, channel formats, payout math); uploads are MIME-checked and size-capped.

## Status

Production. Custom order for Delta Client — the code is public, reuse in other projects requires permission. No license file is shipped; all rights reserved by default.
