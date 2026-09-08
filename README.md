<div align="center">

# ⚡ Delta Media Portal (V2)

**Высокопроизводительный портал медиа-партнёрства и модерации [Delta Client](https://deltaclient.xyz)**  
*Построен на Go (Fiber v2), SPA-интерфейсе с эстетикой Delta 1:1, автоматизацией Telegram и крипто-выплатами.*

<br/>

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://golang.org)
[![Fiber Framework](https://img.shields.io/badge/Fiber-v2.52-00ACD7?style=for-the-badge&logo=fiber&logoColor=white)](https://gofiber.io)
[![Database](https://img.shields.io/badge/Database-SQLite%20%7C%20PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot%20%26%20Business%20API-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org)
[![License](https://img.shields.io/badge/License-Proprietary-7928CA?style=for-the-badge)](LICENSE)

</div>

<br/>

---

## 🌟 Ключевые возможности

### 🔐 1. Авторизация и безопасность (Delta 2FA)
- **Вход по персональным ключам**: Ролевая модель доступа (`admin`, `moderator`, `media`, `freemedia`) без устаревших паролей. Ключи выпускаются и отзываются администраторами в панели управления.
- **Обязательная двухфакторная аутентификация (2FA + GPS)**: При попытке входа бот отправляет запрос владельцу в Telegram с IP-адресом, картой и точными GPS-координатами устройства.
- **Защищённые сессии**: `httpOnly`, `SameSite=Lax` Cookie-сессии с валидацией отпечатков клиента.

### 📊 2. Модернизированный раздел «Обзор» (Админ-панель)
- **Динамика подачи заявок**: Плавный векторный график кривой Безье с градиентным свечением и переключателями периодов (*День, Неделя, Месяц, Год, Всё время*).
- **Компактный блок управления**: Быстрое включение/отключение техработ и приёма заявок на главной без загромождения экрана.
- **Сетка показателей 1:1**: 4 акцентных моноширинных счётчика с неоновым свечением и мгновенным переходом к таблицам:
  - *Медиа заявки (в ожидании)*
  - *Выплаты (неделя)*
  - *Discord баны*
  - *Активные аккаунты*
- **Недельный расчёт выплат**: Отображение расчетных дат недели и статуса окна подачи (`окно: пн 00:00 — вт 22:00 МСК`).

### 💸 3. Недельный цикл выплат & CryptoBot
- **Гибкий приём заявок**: Подача через личный кабинет или автоматические Telegram-пасты от медиа-партнёров.
- **Автовыплаты USDT**: Интеграция с CryptoBot Pay API — мгновенная отправка USDT по подтверждению администратора.
- **Шаблоны FunPay**: Формирование готовых ответов и ссылок на лоты.
- **Недельные архивы**: Автоматическое архивирование выплат, генерация итогового отчёта недели и экспорт владельцам в Telegram.

### 🛡️ 4. Кабинеты сотрудников и модерация
- **Медиа-заявки**: Полноценное досье кандидата (каналы YouTube/TikTok, статистика, доказательства) с удобными кнопками вердикта в админке и Telegram.
- **Сброс HWID и Discord-баны**: Специализированные формы с чанковой загрузкой больших доказательств (скриншоты, видео) до нескольких гигабайт.
- **Многоуровневый банлист**: Блокировка по IP (включая CIDR-подсети), каналам YouTube/TikTok, Telegram Username/ID и игровым UID.

### 🤖 5. Telegram-секретарь и Business API
- **Умный автоответчик**: Отправка стикеров и GIF с реалистичной задержкой (15–180 сек) и статусом предварительного прочтения.
- **Контроль 24-часовых окон**: Мониторинг времени до закрытия диалога с напоминанием пользователю за 5 минут.

---

## 🛠 Технологический стек

- **Backend**: [Go 1.22+](https://golang.org)
- **Web-фреймворк**: [Fiber v2](https://github.com/gofiber/fiber) (FastHTTP core)
- **Базы данных**: [SQLite 3](https://sqlite.org) (для локальной разработки) / [PostgreSQL](https://www.postgresql.org) (production / Supabase)
- **Frontend**: Чистый Vanilla JS (модульная SPA архитектура), кастомная CSS-система в эстетике Delta Client 1:1 (Glassmorphism, blur-эффекты, плавные CSS-переходы).
- **Внешние API**: Telegram Bot API, Telegram Business API, CryptoBot API, Cloudflare Turnstile.

---

## 📁 Структура проекта

```
.
├── config/                  # Загрузка и парсинг конфигурации окружения (.env)
├── internal/
│   ├── auth/                # Аутентификация по кодам, Telegram 2FA, сессии
│   ├── bans/                # Высокопроизводительный банлист (in-memory кэш + CIDR)
│   ├── database/            # Подключение к БД, миграции v2_*, хелперы
│   ├── handlers/            # HTTP-обработчики (public, cabinet, admin, mod)
│   ├── middleware/          # Real IP, аудит-логи, rate limit, фильтрация
│   ├── models/              # Структуры данных и доменные модели
│   ├── payouts/             # Расчётный цикл выплат, генерация отчётов, CryptoBot
│   ├── telegram/            # Бот, секретарь, 2FA-подтверждения, уведомления
│   ├── uploads/             # Чанковая потоковая загрузка файлов доказательств
│   └── validation/          # Серверная валидация входных данных
├── tools/
│   ├── e2e/                 # Сквозные интеграционные тесты
│   └── seedlocal/           # Генератор демонстрационных данных для локальных тестов
├── web/
│   ├── static/
│   │   ├── css/style.css    # Стилистика портала (Glassmorphism 1:1 Delta Client)
│   │   ├── img/             # Изображения, фоны и текстуры
│   │   └── js/              # SPA-логика (admin, auth, cabinet, public, ui)
│   └── views/index.html     # Единая точка входа SPA
├── main.go                  # Инициализация роутов, DI и запуск HTTP-сервера
├── go.mod                   # Зависимости Go
└── .env.example             # Пример конфигурационного файла
```

---

## 🚀 Быстрый старт

### 1. Клонирование репозитория
```bash
git clone https://github.com/KurumaOfficial/Delta_Client_Media_Portal.git
cd Delta_Client_Media_Portal
```

### 2. Настройка переменных окружения
Скопируйте пример файла конфигурации:
```bash
cp .env.example .env
```
Заполните обязательные поля в `.env`:
```ini
PORT=3999
DB_DRIVER=sqlite
DB_PATH=./local.db

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
ADMIN_BOOTSTRAP_CODE=DELTA-ROOT-0001
DEV_AUTO_APPROVE_2FA=true # Для локальной разработки без Telegram GPS
```

### 3. Запуск в режиме разработки
```bash
# Windows
run-local.bat

# Linux / macOS
chmod +x run-local.sh
./run-local.sh
```

Или сборка вручную:
```bash
go run main.go
```
Портал будет доступен по адресу: `http://localhost:3999`.

---

## 🔐 Доступ по умолчанию

Для первого входа в админ-панель:
1. Нажмите кнопку **«Личный кабинет»** в верхнем правом углу.
2. Введите ключ администратора: `DELTA-ROOT-0001` (или значение из `ADMIN_BOOTSTRAP_CODE`).
3. При активном `DEV_AUTO_APPROVE_2FA=true` двухфакторная проверка подтверждается автоматически.

---

<div align="center">
  <sub>Разработано для сообщества <b>Delta Client</b>. Все права защищены.</sub>
</div>
