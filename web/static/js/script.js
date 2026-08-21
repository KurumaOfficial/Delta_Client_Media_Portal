/**
 * delta media — Client Logic & Application Engine
 * Unified design system matching gemini-code-1787076208356.html header
 */

// Global Client-side Error Interceptor & Reporter (Sends JS/Console errors to server Audit Log)
(function () {
  function logToServer(type, message, extra) {
    try {
      fetch("/api/log-client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ type: type, message: message }, extra || {}))
      }).catch(function () {});
    } catch (e) {}
  }

  window.addEventListener("error", function (event) {
    logToServer("JS_ERROR", event.message || "Script error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? event.error.stack : null
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    const reason = event.reason;
    const msg = reason ? (reason.message || String(reason)) : "Unhandled Promise Rejection";
    logToServer("UNHANDLED_PROMISE", msg, {
      error: reason ? reason.stack : null
    });
  });

  const origError = console.error;
  console.error = function () {
    origError.apply(console, arguments);
    try {
      const msg = Array.from(arguments).map(arg => {
        if (typeof arg === "object") {
          try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
      }).join(" ");
      logToServer("CONSOLE_ERROR", msg);
    } catch (e) {}
  };
})();

const i18n = {
  ru: {
    siteTitle: "delta media",
    heroBadge: "Официальный портал Delta Client",
    badgeAdminDash: "Admin Dashboard",
    badgeModDash: "Moderator Dashboard",
    navMedia: "Заявка на медиа",
    navHwid: "Сброс HWID",
    navDiscord: "Discord баны",
    navAdmin: "Админ-панель",
    
    // Media Form
    mediaTitle: "Заявка на медиа",
    mediaSubtitle: "Заполните форму ниже для вступления в delta media. Перед отправкой внимательно проверьте все указанные данные.",
    qUidMedia: "Ваш UID пользователя Delta Client",
    mediaUidPlaceholder: "Укажите ваш UID",
    q1Criteria: "Подходите ли вы по критериям?",
    yes: "Да",
    no: "Нет",
    criteriaText: "Актуальные критерии для вступления в медиа можно посмотреть <span class='hint-link' id='openCriteriaBtn'>здесь</span>.",
    q2Platform: "Какая ваша платформа?",
    selectPlatform: "Выберите платформу",
    
    // YouTube
    ytChannelLabel: "Ссылка на YouTube канал",
    ytChannelPlaceholder: "https://youtube.com/@username",
    ytChannelHint: "Укажите прямую ссылку на канал (не на отдельное видео)",
    qServers: "На каком сервере вы снимаете?",
    selectServers: "Выберите серверы",
    srvOther: "Прочие / Other",
    ytVideosLabel: "Сколько роликов готовы выпускать в неделю?",
    ytVideosPlaceholder: "Например: 2-3 ролика",
    qWhyJoin: "Почему хотите вступить в delta media?",
    whyJoinPlaceholder: "Напишите развернутый ответ...",
    charsLabel: "символов",
    qExclusive: "Вы готовы снимать только с Delta Client?",
    selectOption: "Выберите вариант",
    qTelegram: "Укажите свой Telegram username для ответа",
    telegramPlaceholder: "@username",
    qTgBot: "Обязательно: напишите нашему сотруднику",
    tgBotDesc: "Перед отправкой заявки необходимо один раз написать нашему сотруднику в Telegram для подтверждения вашего аккаунта.<br><br>После этого ожидайте ответа и не отправляйте повторные сообщения.",
    tgBotButton: "Написать сотруднику @notyxs",

    // TikTok
    ttChannelLabel: "Ссылка на TikTok канал",
    ttChannelPlaceholder: "https://tiktok.com/@username",
    ttCollabLabel: "С какими клиентами/визуалами сотрудничали?",
    ttCollabPlaceholder: "Укажите клиентов...",

    // HWID Form
    hwidTitle: "Сброс HWID",
    hwidSubtitle: "Заполните форму для подачи запроса на сброс HWID.",
    qUuid: "Укажите UID",
    uuidPlaceholder: "Введите UID пользователя",
    qProof: "Скриншот или видео доказательства (можно несколько файлов)",
    uploadProof: "Загрузить файлы с компьютера",
    uploadSub: "Выбирайте несколько изображений и видео по очереди или сразу",
    orInsertLink: "Или вставьте ссылку на доказательство",
    proofLinkPlaceholder: "https://...",
    qReasonHwid: "Причина сброса",
    qReasonBan: "Причина блокировки",
    reasonPlaceholder: "Укажите подробную причину...",

    // Discord Ban Form
    banTitle: "Discord баны",
    banSubtitle: "Заполните форму для подачи запроса на бан пользователя Discord.",
    qOffender: "Discord ID / Username нарушителя",
    offenderPlaceholder: "например: 1234567890 или @user",
    banReasonPlaceholder: "Укажите причину бана...",

    // Buttons
    submitBtn: "Отправить заявку",
    submitError: "Ошибка! Проверьте данные",
    submitSuccess: "Заявка успешно отправлена!",
    enterBtn: "Войти",
    btnCancel: "Отмена",
    btnConfirm: "Подтвердить",

    // Modals
    adminCommentTitle: "Комментарий администратора",
    adminCommentSubtitle: "Укажите примечание к решению (необязательно):",
    adminCommentPlaceholder: "Напишите комментарий...",
    criteriaModalTitle: "Критерии медиа",
    critYtSub: "От 50 подписчиков.",
    critYtViews: "Стабильные 100+ просмотров на последних роликах.",
    critYtTheme: "Тематика канала — Minecraft (HVH)",
    critYtQuality: "Качественный монтаж и хорошее качество видео.",
    critTtSub: "От 200 подписчиков.",
    critTtViews: "Стабильные 600–700+ просмотров на последних видео.",
    critTtTheme: "Тематика аккаунта — Minecraft (HVH)",
    critTtQuality: "Качественный монтаж и хорошее качество видео.",

    modLoginTitle: "Вход для модератора",
    modKeyPlaceholder: "Введите секретный ключ модератора (DELTA-...)",
    adminLoginTitle: "Панель администратора",
    adminCodePlaceholder: "Введите пароль администратора",
    invalidCode: "Неверный код",
    labelModNick: "Никнейм модератора",
    labelModTg: "Telegram модератора",
    labelCustomKey: "Кастомный ключ (или оставьте пустым для генерации)",

    // Admin Dashboard
    adminDashTitle: "Управление порталом delta media",
    statMedia: "Медиа заявки",
    statHwid: "HWID запросы",
    statBans: "Discord баны",
    statKeys: "Модер-ключи",
    
    // Filters & Sorting
    filterSearchPlaceholder: "Поиск по каналу, Telegram, UID, ID...",
    filterStatusAll: "Статусы: Все",
    filterServerAll: "Серверы: Все",
    stPending: "В ожидании",
    stApproved: "Одобрено",
    stRejected: "Отклонено",
    sortNewest: "Сначала новые",
    sortFavFirst: "★ Избранные вверху",
    sortFavOnly: "★ Только избранные",

    // Table Headers
    tabMediaApps: "Заявки медиа",
    tabHwidReqs: "HWID запросы",
    tabBanReqs: "Discord баны",
    tabModKeys: "Ключи модераторов",
    tabLogsTitle: "Журнал событий и безопасность",
    btnRefreshLogs: "Обновить логи",
    btnCreateKey: "+ Создать ключ модератора",
    modNickPlaceholder: "Никнейм модератора...",
    
    thId: "ID",
    thPlatform: "Платформа",
    thChannel: "Канал",
    thServers: "Серверы",
    thTelegram: "Telegram",
    thCriteria: "Критерии",
    thExclusive: "Эксклюзив",
    thVideosWeek: "Роликов/нед",
    thCollabs: "Сотрудничества",
    thWhyJoin: "Почему вступить",
    thStatus: "Статус",
    thActions: "Действия",
    thMod: "Модератор",
    thUid: "UID",
    thProofs: "Доказательства",
    thReason: "Причина",
    thOffender: "Нарушитель",
    thNick: "Никнейм",
    thKey: "Секретный ключ (DELTA-...)",
    thTime: "Время",
    thEvent: "Событие",
    thDetails: "Детали",
    thIp: "IP-адрес",

    // Dynamic UI strings
    titleFav: "В избранное",
    ytErrorChannel: "Укажите ссылку на КАНАЛ, а не видео!",
    errCaptcha: "Пройдите капчу!",
    errUidLetters: "UID не должен содержать буквы — только цифры",
    errTgNotWritten: "⚠️ Вы ещё не написали сотруднику. Нажмите кнопку выше!",
    uploadProgress: "Загрузка",
    errModAuthRequired: "Авторизуйтесь как модератор (Ctrl+M)!",
    uploadSending: "Загрузка видео/доказательств...",
    errFileUpload: "Ошибка загрузки файла!",
    errServerError: "Ошибка сервера!",
    pagShowingText: "Показано",
    pagRecords: "записей",
    pagBack: "Назад",
    pagPageOf: "Стр.",
    pagOf: "из",
    pagForward: "Вперед",
    completedLabel: "Завершено",
    btnApprove: "Одобрить",
    btnReject: "Отклонить",
    actionApproveMedia: "Одобрение заявки",
    actionRejectMedia: "Отклонение заявки",
    actionApproveHwid: "Одобрение HWID",
    actionRejectHwid: "Отклонение HWID",
    actionApproveBan: "Одобрение бана",
    actionRejectBan: "Отклонение бана",
    btnFreeze: "Заморозить",
    btnUnfreeze: "Разморозить",
    btnActivate: "Активировать",
    btnDelete: "Удалить",
    noLogs: "Нет записей в журнале",
    noBannedIPs: "Нет заблокированных IP-адресов",
    btnUnban: "Разблокировать",
    errEnterIP: "Укажите IP-адрес!",
    errBanIP: "Ошибка при блокировке IP",
    errBanNetwork: "Ошибка сети при блокировке IP",
    confirmUnbanIP: "Разблокировать этот IP-адрес?",
    errUnbanIP: "Ошибка разблокировки IP",
    errUnbanNetwork: "Ошибка сети при разблокировке IP",

    // Banned IPs section
    bannedIPsTitle: "Заблокированные IP-адреса",
    btnBanIP: "+ Заблокировать IP",
    thIPAddress: "IP-адрес",
    thBanReason: "Причина блокировки",
    thBannedBy: "Кем заблокирован",
    thBanDate: "Дата блокировки",
    thActions: "Действия",
    banModalTitle: "Заблокировать IP-адрес",
    labelIPAddress: "IP-адрес",
    placeholderIPAddress: "Например: 192.168.1.1 или 203.0.113.4",
    labelBanReason: "Причина блокировки",
    placeholderBanReason: "Спам, спам запросами, попытка взлома...",
    btnBlockIP: "Заблокировать IP",
    placeholderModKey: "например: ALEX или MY_KEY_123",

    noUserBans: "Нет заблокированных пользователей",
    cellTextModalTitle: "Полный текст",
    userBansTitle: "Заблокированные пользователи",
    btnBanUserAdd: "+ Забанить",
    banUserModalTitle: "Заблокировать пользователя",
    labelBanUserChannel: "Telegram канал",
    labelBanUserUid: "UID",
    labelBanUserTg: "Telegram",
    labelBanUserDiscord: "Discord",
    labelBanUserIp: "IP-адрес",
    confirmUnbanUser: "Разблокировать пользователя?",
    errUnbanUser: "Ошибка разблокировки",
    errUnbanUserNetwork: "Ошибка сети",
    labelBanUserReason: "Причина",
    banUserHint: "Заполните хотя бы одно поле. Если хотя бы одно совпадёт — заявка будет заблокирована.",

    // Misc
    bugBanner: "Нашли ошибки или баги? Пишите в Telegram — <a href='https://t.me/notyxs' target='_blank'>@notyxs</a>"
  },
  en: {
    siteTitle: "delta media",
    heroBadge: "Official Delta Client Portal",
    badgeAdminDash: "Admin Dashboard",
    badgeModDash: "Moderator Dashboard",
    navMedia: "Media Application",
    navHwid: "HWID Reset",
    navDiscord: "Discord Bans",
    navAdmin: "Admin Panel",

    // Media Form
    mediaTitle: "Media Application",
    mediaSubtitle: "Fill out the form below to join delta media. Check all specified details carefully before submitting.",
    qUidMedia: "Your Delta Client UID",
    mediaUidPlaceholder: "Enter your UID",
    q1Criteria: "Do you meet the criteria?",
    yes: "Yes",
    no: "No",
    criteriaText: "Current criteria for joining media can be viewed <span class='hint-link' id='openCriteriaBtn'>here</span>.",
    q2Platform: "What is your platform?",
    selectPlatform: "Select platform",

    // YouTube
    ytChannelLabel: "YouTube channel link",
    ytChannelPlaceholder: "https://youtube.com/@username",
    ytChannelHint: "Specify direct link to channel (not individual video)",
    qServers: "Which server do you record on?",
    selectServers: "Select servers",
    srvOther: "Other",
    ytVideosLabel: "How many videos are you ready to release per week?",
    ytVideosPlaceholder: "e.g.: 2-3 videos",
    qWhyJoin: "Why do you want to join delta media?",
    whyJoinPlaceholder: "Write a detailed answer...",
    charsLabel: "characters",
    qExclusive: "Are you ready to record exclusively with Delta Client?",
    selectOption: "Select an option",
    qTelegram: "Enter your Telegram username for response",
    telegramPlaceholder: "@username",
    qTgBot: "Mandatory: write to our employee",
    tgBotDesc: "Before submitting an application, you must message our employee on Telegram once to verify your account.<br><br>After that, wait for a response and do not send repeated messages.",
    tgBotButton: "Write to employee @notyxs",

    // TikTok
    ttChannelLabel: "TikTok channel link",
    ttChannelPlaceholder: "https://tiktok.com/@username",
    ttCollabLabel: "Which clients/visuals have you collaborated with?",
    ttCollabPlaceholder: "Specify clients...",

    // HWID Form
    hwidTitle: "HWID Reset",
    hwidSubtitle: "Fill out the form to submit a request for HWID reset.",
    qUuid: "Specify UID",
    uuidPlaceholder: "Enter user UID",
    qProof: "Screenshot or video proof (multiple files supported)",
    uploadProof: "Upload files from PC",
    uploadSub: "Select multiple images and videos sequentially or at once",
    orInsertLink: "Or insert link to proof",
    proofLinkPlaceholder: "https://...",
    qReasonHwid: "Reason for reset",
    reasonPlaceholder: "Specify detailed reason...",

    // Discord Ban Form
    banTitle: "Discord Bans",
    banSubtitle: "Fill out the form to submit a Discord user ban request.",
    qReasonBan: "Ban reason",
    qOffender: "Offender Discord ID / Username",
    offenderPlaceholder: "e.g.: 1234567890 or @user",
    banReasonPlaceholder: "Specify ban reason...",

    // Buttons
    submitBtn: "Submit Application",
    submitError: "Error! Check inputs",
    submitSuccess: "Application submitted successfully!",
    enterBtn: "Login",
    btnCancel: "Cancel",
    btnConfirm: "Confirm",

    // Modals
    adminCommentTitle: "Admin Comment",
    adminCommentSubtitle: "Specify decision note (optional):",
    adminCommentPlaceholder: "Write comment...",
    criteriaModalTitle: "Media Criteria",
    critYtSub: "50+ subscribers.",
    critYtViews: "Stable 100+ views on recent videos.",
    critYtTheme: "Channel theme — Minecraft (HVH)",
    critYtQuality: "High quality editing and video rendering.",
    critTtSub: "200+ subscribers.",
    critTtViews: "Stable 600–700+ views on recent videos.",
    critTtTheme: "Account theme — Minecraft (HVH)",
    critTtQuality: "High quality editing and video rendering.",

    modLoginTitle: "Moderator Login",
    modKeyPlaceholder: "Enter secret moderator key (DELTA-...)",
    adminLoginTitle: "Admin Panel",
    adminCodePlaceholder: "Enter admin secret code",
    invalidCode: "Invalid code",
    labelModNick: "Moderator Nickname",
    labelModTg: "Moderator Telegram",
    labelCustomKey: "Custom Key (or leave empty to auto-generate)",

    // Admin Dashboard
    adminDashTitle: "delta media Management Portal",
    statMedia: "Media Apps",
    statHwid: "HWID Requests",
    statBans: "Discord Bans",
    statKeys: "Mod Keys",

    // Filters & Sorting
    filterSearchPlaceholder: "Search by channel, Telegram, UID, ID...",
    filterStatusAll: "Statuses: All",
    filterServerAll: "Servers: All",
    stPending: "Pending",
    stApproved: "Approved",
    stRejected: "Rejected",
    sortNewest: "Newest first",
    sortFavFirst: "★ Favorites top",
    sortFavOnly: "★ Favorites only",

    // Table Headers
    tabMediaApps: "Media Applications",
    tabHwidReqs: "HWID Requests",
    tabBanReqs: "Discord Bans",
    tabModKeys: "Moderator Keys",
    tabLogsTitle: "Audit Logs & Security",
    btnRefreshLogs: "Refresh logs",
    btnCreateKey: "+ Create Moderator Key",
    modNickPlaceholder: "Moderator nickname...",

    thId: "ID",
    thPlatform: "Platform",
    thChannel: "Channel",
    thServers: "Servers",
    thTelegram: "Telegram",
    thCriteria: "Criteria",
    thExclusive: "Exclusive",
    thVideosWeek: "Videos/week",
    thCollabs: "Collaborations",
    thWhyJoin: "Why Join",
    thStatus: "Status",
    thActions: "Actions",
    thMod: "Moderator",
    thUid: "UID",
    thProofs: "Proofs",
    thReason: "Reason",
    thOffender: "Offender",
    thNick: "Nickname",
    thKey: "Secret Key (DELTA-...)",
    thTime: "Time",
    thEvent: "Event",
    thDetails: "Details",
    thIp: "IP Address",

    // Dynamic UI strings
    titleFav: "Add to favorites",
    ytErrorChannel: "Enter a CHANNEL link, not a video!",
    errCaptcha: "Complete the captcha!",
    errUidLetters: "UID must not contain letters — numbers only",
    errTgNotWritten: "⚠️ You haven't messaged our employee yet. Click the button above!",
    uploadProgress: "Uploading",
    errModAuthRequired: "Log in as moderator (Ctrl+M)!",
    uploadSending: "Uploading files...",
    errFileUpload: "File upload error!",
    errServerError: "Server error!",
    pagShowingText: "Showing",
    pagRecords: "records",
    pagBack: "Back",
    pagPageOf: "Page",
    pagOf: "of",
    pagForward: "Forward",
    completedLabel: "Completed",
    btnApprove: "Approve",
    btnReject: "Reject",
    actionApproveMedia: "Approve application",
    actionRejectMedia: "Reject application",
    actionApproveHwid: "Approve HWID reset",
    actionRejectHwid: "Reject HWID reset",
    actionApproveBan: "Approve ban",
    actionRejectBan: "Reject ban",
    btnFreeze: "Freeze",
    btnUnfreeze: "Unfreeze",
    btnActivate: "Activate",
    btnDelete: "Delete",
    noLogs: "No log entries",
    noBannedIPs: "No banned IP addresses",
    btnUnban: "Unblock",
    errEnterIP: "Enter an IP address!",
    errBanIP: "Error blocking IP",
    errBanNetwork: "Network error while blocking IP",
    confirmUnbanIP: "Unblock this IP address?",
    errUnbanIP: "Error unblocking IP",
    errUnbanNetwork: "Network error while unblocking IP",

    // Banned IPs section
    bannedIPsTitle: "Banned IP Addresses",
    btnBanIP: "+ Block IP",
    thIPAddress: "IP Address",
    thBanReason: "Ban Reason",
    thBannedBy: "Banned By",
    thBanDate: "Ban Date",
    thActions: "Actions",
    banModalTitle: "Block IP Address",
    labelIPAddress: "IP Address",
    placeholderIPAddress: "e.g.: 192.168.1.1 or 203.0.113.4",
    labelBanReason: "Ban Reason",
    placeholderBanReason: "Spam, abuse, hacking attempt...",
    btnBlockIP: "Block IP",
    placeholderModKey: "e.g.: ALEX or MY_KEY_123",

    noUserBans: "No banned users",
    cellTextModalTitle: "Full text",
    userBansTitle: "Banned Users",
    btnBanUserAdd: "+ Block User",
    banUserModalTitle: "Block User",
    labelBanUserChannel: "Telegram Channel",
    labelBanUserUid: "UID",
    labelBanUserTg: "Telegram",
    labelBanUserDiscord: "Discord",
    labelBanUserIp: "IP Address",
    confirmUnbanUser: "Unblock this user?",
    errUnbanUser: "Error unblocking user",
    errUnbanUserNetwork: "Network error while unblocking user",
    labelBanUserReason: "Reason",
    banUserHint: "Fill at least one field. If any matches — the submission will be blocked.",

    // Misc
    bugBanner: "Found bugs or issues? Write to Telegram — <a href='https://t.me/notyxs' target='_blank'>@notyxs</a>"
  }
};

const t = (key) => i18n[currentLang][key] || i18n["ru"][key] || key;

let currentLang = "ru";
let activeTab = "media";
let modSession = null;
let adminToken = null;
let pendingActionCallback = null;

// Turnstile token storage — set by callback, read on submit
let turnstileToken = "";

function onTurnstileSuccess(token) {
  turnstileToken = token;
}

function onTurnstileExpire() {
  turnstileToken = "";
}

function initTurnstile() {
  if (!window.turnstile) return;
  const container = document.getElementById("cfTurnstileWidget");
  if (!container) return;
  try {
    turnstileToken = "";
    window.turnstile.render(container, {
      sitekey: container.dataset.sitekey || "0x4AAAAAAEV4veMwRVjALBvF",
      theme: "dark",
      callback: onTurnstileSuccess,
      "expired-callback": onTurnstileExpire
    });
  } catch (e) {
    console.error("[Turnstile] render error:", e);
  }
}

function resetTurnstile() {
  if (!window.turnstile) return;
  const container = document.getElementById("cfTurnstileWidget");
  if (!container) return;
  try {
    turnstileToken = "";
    window.turnstile.reset(container);
  } catch (e) {
    initTurnstile();
  }
}

// Multiple File Accumulator Arrays
let hwidSelectedFiles = [];
let banSelectedFiles = [];

// Favorites Storage Helper
function getFavorites(type) {
  try {
    return JSON.parse(localStorage.getItem(`fav_${type}`) || "[]");
  } catch (e) {
    return [];
  }
}

function toggleFavorite(type, id) {
  const favs = getFavorites(type);
  const idx = favs.indexOf(id);
  if (idx > -1) {
    favs.splice(idx, 1);
  } else {
    favs.push(id);
  }
  localStorage.setItem(`fav_${type}`, JSON.stringify(favs));
  applyAdminFilters();
}

function isFavorite(type, id) {
  return getFavorites(type).includes(id);
}

function renderStarBtn(type, id) {
  const fav = isFavorite(type, id);
  const fill = fav ? "#fbbf24" : "none";
  const stroke = fav ? "#fbbf24" : "rgba(255,255,255,0.4)";
  return `
    <button class="star-btn" onclick="toggleFavorite('${type}', ${id})" title="${i18n[currentLang].titleFav}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    </button>
  `;
}

// Pagination state
let pageState = {
  media: { page: 1, limit: 10, data: [] },
  hwid: { page: 1, limit: 10, data: [] },
  ban: { page: 1, limit: 10, data: [] },
  keys: { page: 1, limit: 10, data: [] },
  bannedIps: { page: 1, limit: 10, data: [] },
  logs: { page: 1, limit: 20, data: [] }
};

document.addEventListener("DOMContentLoaded", () => {
  detectLanguageFromRoute();
  setupEventListeners();
  setupCharacterCounters();
  checkStoredSessions();
  switchTab("media");
  // Init Turnstile after DOM ready
  setTimeout(initTurnstile, 500);
});

function detectLanguageFromRoute() {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/en")) {
    currentLang = "en";
  } else {
    currentLang = "ru";
  }
  updateLanguageUI();
}

function setLanguage(lang) {
  if (lang !== "ru" && lang !== "en") return;
  currentLang = lang;
  window.history.pushState({}, "", "/" + lang + window.location.hash);
  updateLanguageUI();
}

function updateLanguageUI() {
  document.querySelectorAll(".lang-pill-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  const dict = i18n[currentLang];
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key]) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.placeholder = dict[key];
      } else {
        el.innerHTML = dict[key];
      }
    }
  });

  if (currentLang === "ru") {
    document.title = "Delta Media — Подача заявок";
  } else {
    document.title = "Delta Media — Application Portal";
  }

  const critLink = document.getElementById("openCriteriaBtn");
  if (critLink) {
    critLink.addEventListener("click", openCriteriaModal);
  }
}

function setupCharacterCounters() {
  const pairs = [
    { input: "whyJoinInput", counter: "whyJoinCharCount" },
    { input: "hwidReasonInput", counter: "hwidReasonCharCount" },
    { input: "banReasonInput", counter: "banReasonCharCount" }
  ];

  pairs.forEach(pair => {
    const inputEl = document.getElementById(pair.input);
    const countEl = document.getElementById(pair.counter);
    if (inputEl && countEl) {
      inputEl.addEventListener("input", () => {
        countEl.textContent = inputEl.value.length;
      });
    }
  });
}

function checkStoredSessions() {
  const savedModKey = sessionStorage.getItem("mod_key");
  const savedModNick = sessionStorage.getItem("mod_nickname");
  if (savedModKey && savedModNick) {
    modSession = { key: savedModKey, nickname: savedModNick };
    unlockModTabs();
  } else {
    document.querySelectorAll(".mod-only").forEach(tab => tab.style.display = "none");
  }

  const savedAdminToken = sessionStorage.getItem("admin_token");
  if (savedAdminToken) {
    adminToken = savedAdminToken;
    unlockAdminTab();
  } else {
    adminToken = null;
    document.querySelectorAll(".admin-only").forEach(tab => tab.style.display = "none");
    const turnstileWidget = document.querySelector(".cf-turnstile");
    if (turnstileWidget) {
      turnstileWidget.style.display = "block";
    }
  }
}

function promptAdminComment(titleText, callback) {
  closeAllModals();
  const modal = document.getElementById("adminCommentModal");
  const textarea = document.getElementById("adminCommentTextarea");
  textarea.value = "";

  if (titleText) {
    document.getElementById("adminCommentModalTitle").textContent = titleText;
  } else {
    document.getElementById("adminCommentModalTitle").textContent = i18n[currentLang].adminCommentTitle;
  }

  pendingActionCallback = callback;
  modal?.classList.add("open");
}

function setupEventListeners() {
  // Navigation Tabs with smooth transition
  document.querySelectorAll(".nav-link-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Language Buttons
  document.querySelectorAll(".lang-pill-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setLanguage(btn.dataset.lang);
    });
  });

  // Choice Cards (Criteria Yes/No)
  document.querySelectorAll(".choice-btn-card[data-choice]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".choice-btn-card[data-choice]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Platform Dropdown (WITH SVG LOGOS IN HEADER)
  const platformHeader = document.getElementById("platformHeader");
  const platformDropdown = document.getElementById("platformDropdown");
  if (platformHeader && platformDropdown) {
    platformHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      platformDropdown.classList.toggle("open");
    });

    platformDropdown.querySelectorAll(".dropdown-menu-item[data-platform]").forEach(row => {
      row.addEventListener("click", () => {
        const val = row.dataset.platform;
        document.getElementById("selectedPlatformText").innerHTML = row.innerHTML.trim();
        platformDropdown.dataset.value = val;
        platformDropdown.classList.remove("open");

        document.getElementById("ytBlock").style.display = val === "youtube" ? "block" : "none";
        document.getElementById("ttBlock").style.display = val === "tiktok" ? "block" : "none";
        document.getElementById("commonBlock").style.display = val ? "block" : "none";
      });
    });
  }

  // Exclusive Dropdown
  const exclusiveHeader = document.getElementById("exclusiveHeader");
  const exclusiveDropdown = document.getElementById("exclusiveDropdown");
  if (exclusiveHeader && exclusiveDropdown) {
    exclusiveHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      exclusiveDropdown.classList.toggle("open");
    });

    exclusiveDropdown.querySelectorAll(".dropdown-menu-item[data-exclusive]").forEach(row => {
      row.addEventListener("click", () => {
        const val = row.dataset.exclusive;
        document.getElementById("selectedExclusiveText").textContent = row.textContent.trim();
        exclusiveDropdown.dataset.value = val;
        exclusiveDropdown.classList.remove("open");
      });
    });
  }

  // Servers Dropdown
  const serversHeader = document.getElementById("serversHeader");
  const serversDropdown = document.getElementById("serversDropdown");
  if (serversHeader && serversDropdown) {
    serversHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      serversDropdown.classList.toggle("open");
    });

    serversDropdown.querySelectorAll("input[type='checkbox']").forEach(cb => {
      cb.addEventListener("change", updateSelectedServersText);
    });
  }

  // ADMIN DASHBOARD CUSTOM DROPDOWNS & MULTI-SELECT FILTERS
  setupAdminDropdowns();

  // Admin Comment Modal Listeners
  document.getElementById("adminCommentConfirmBtn")?.addEventListener("click", () => {
    const comment = document.getElementById("adminCommentTextarea").value.trim();
    closeAllModals();
    if (pendingActionCallback) {
      pendingActionCallback(comment);
      pendingActionCallback = null;
    }
  });

  document.getElementById("adminCommentCancelBtn")?.addEventListener("click", () => {
    closeAllModals();
    pendingActionCallback = null;
  });

  // Close all custom dropdowns on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#platformDropdown")) document.getElementById("platformDropdown")?.classList.remove("open");
    if (!e.target.closest("#exclusiveDropdown")) document.getElementById("exclusiveDropdown")?.classList.remove("open");
    if (!e.target.closest("#serversDropdown")) document.getElementById("serversDropdown")?.classList.remove("open");
    if (!e.target.closest("#adminStatusDropdown")) document.getElementById("adminStatusDropdown")?.classList.remove("open");
    if (!e.target.closest("#adminServerDropdown")) document.getElementById("adminServerDropdown")?.classList.remove("open");
    if (!e.target.closest("#adminSortDropdown")) document.getElementById("adminSortDropdown")?.classList.remove("open");
  });

  // Multiple File Upload Accumulator Handlers
  setupFileAccumulator("hwidProofFile", "hwidFilesPreview", "hwid");
  setupFileAccumulator("banProofFile", "banFilesPreview", "ban");

  // Modal Closers
  document.querySelectorAll(".modal-close-x, .modal-overlay-bg").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target === el || el.classList.contains("modal-close-x")) {
        closeAllModals();
      }
    });
  });

  // Secret Moderator Key Login via UID Input Field (Zero reaction on invalid key)
  let modUidCheckTimeout = null;
  const mediaUidInput = document.getElementById("mediaUidInput");
  if (mediaUidInput) {
    mediaUidInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (modUidCheckTimeout) clearTimeout(modUidCheckTimeout);
      
      // Zero server load / 0 HTTP requests for empty input.
      // Check any input >= 3 chars — server rejects invalid keys, rate limiter (5/min) prevents abuse
      if (!val || val.length < 3) return;

      modUidCheckTimeout = setTimeout(async () => {
        try {
          const res = await fetch("/api/mod/verify-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: val })
          });
          const data = await res.json();
          if (data.success) {
            modSession = { key: data.key, nickname: data.nickname };
            sessionStorage.setItem("mod_key", data.key);
            sessionStorage.setItem("mod_nickname", data.nickname);
            unlockModTabs();
          }
        } catch (err) {
          // Zero reaction on invalid key
        }
      }, 350);
    });
  }

  // UID realtime: show inline error if letters present
  const uidInput = document.getElementById("mediaUidInput");
  const uidErrorEl = document.getElementById("uidError");
  if (uidInput) {
    uidInput.addEventListener("input", () => {
      const v = uidInput.value.trim();
      if (uidErrorEl) {
        if (v && /[a-zA-Z]/.test(v)) {
          uidErrorEl.textContent = t("errUidLetters");
          uidErrorEl.style.display = "block";
        } else {
          uidErrorEl.style.display = "none";
        }
      }
    });
  }

  // Secret Admin Key Combo: 3x Left -> 3x Up -> 3x Right
  const secretAdminCombo = [
    "ArrowLeft", "ArrowLeft", "ArrowLeft",
    "ArrowUp", "ArrowUp", "ArrowUp",
    "ArrowRight", "ArrowRight", "ArrowRight"
  ];
  let secretKeyBuffer = [];

  window.addEventListener("keydown", (e) => {
    secretKeyBuffer.push(e.code);
    if (secretKeyBuffer.length > secretAdminCombo.length) {
      secretKeyBuffer.shift();
    }

    if (secretKeyBuffer.length === secretAdminCombo.length) {
      const isMatch = secretAdminCombo.every((key, idx) => key === secretKeyBuffer[idx]);
      if (isMatch) {
        secretKeyBuffer = [];
        unlockAdminTab();
        openAdminModal();
      }
    }
  });

  // Forms
  document.getElementById("mediaForm")?.addEventListener("submit", handleMediaSubmit);
  document.getElementById("hwidForm")?.addEventListener("submit", handleHwidSubmit);
  document.getElementById("banForm")?.addEventListener("submit", handleBanSubmit);
  document.getElementById("modAuthForm")?.addEventListener("submit", handleModAuth);
  document.getElementById("adminAuthForm")?.addEventListener("submit", handleAdminAuth);
  document.getElementById("createKeyForm")?.addEventListener("submit", handleCreateKeySubmit);
  document.getElementById("banIpForm")?.addEventListener("submit", (e) => { e.preventDefault(); submitBanIp(); });
}

function setupAdminDropdowns() {
  // Admin Search Input
  document.getElementById("adminSearchInput")?.addEventListener("input", applyAdminFilters);

  // Admin Status Multi-Select Dropdown
  const statusHeader = document.getElementById("adminStatusHeader");
  const statusDropdown = document.getElementById("adminStatusDropdown");
  if (statusHeader && statusDropdown) {
    statusHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      statusDropdown.classList.toggle("open");
    });

    statusDropdown.querySelectorAll("input[type='checkbox']").forEach(cb => {
      cb.addEventListener("change", () => {
        updateAdminStatusText();
        applyAdminFilters();
      });
    });
  }

  // Admin Server Multi-Select Dropdown
  const serverHeader = document.getElementById("adminServerHeader");
  const serverDropdown = document.getElementById("adminServerDropdown");
  if (serverHeader && serverDropdown) {
    serverHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      serverDropdown.classList.toggle("open");
    });

    serverDropdown.querySelectorAll("input[type='checkbox']").forEach(cb => {
      cb.addEventListener("change", () => {
        updateAdminServerText();
        applyAdminFilters();
      });
    });
  }

  // Admin Sort Single Dropdown
  const sortHeader = document.getElementById("adminSortHeader");
  const sortDropdown = document.getElementById("adminSortDropdown");
  if (sortHeader && sortDropdown) {
    sortHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      sortDropdown.classList.toggle("open");
    });

    sortDropdown.querySelectorAll(".dropdown-menu-item[data-sort]").forEach(item => {
      item.addEventListener("click", () => {
        const val = item.dataset.sort;
        document.getElementById("selectedAdminSortText").textContent = item.textContent.trim();
        sortDropdown.dataset.value = val;
        sortDropdown.classList.remove("open");
        applyAdminFilters();
      });
    });
  }
}

function updateAdminStatusText() {
  const selected = [];
  document.querySelectorAll("#adminStatusDropdown input[type='checkbox']:checked").forEach(cb => {
    selected.push(cb.value);
  });
  const textEl = document.getElementById("selectedAdminStatusText");
  if (selected.length > 0) {
    textEl.textContent = `${i18n[currentLang].thStatus}: ${selected.length}`;
  } else {
    textEl.textContent = i18n[currentLang].filterStatusAll;
  }
}

function updateAdminServerText() {
  const selected = [];
  document.querySelectorAll("#adminServerDropdown input[type='checkbox']:checked").forEach(cb => {
    selected.push(cb.value);
  });
  const textEl = document.getElementById("selectedAdminServerText");
  if (selected.length > 0) {
    textEl.textContent = selected.join(", ");
  } else {
    textEl.textContent = i18n[currentLang].filterServerAll;
  }
}

// MULTIPLE FILE ACCUMULATOR & PREVIEW SYSTEM
function setupFileAccumulator(inputId, previewId, type) {
  const fileInput = document.getElementById(inputId);
  if (!fileInput) return;

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const targetArr = type === "hwid" ? hwidSelectedFiles : banSelectedFiles;
      for (let i = 0; i < files.length; i++) {
        targetArr.push(files[i]);
      }
      fileInput.value = ""; // clear input so user can pick again seamlessly
      renderFilePreviewList(previewId, type);
    }
  });
}

function renderFilePreviewList(previewId, type) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  preview.innerHTML = "";

  const files = type === "hwid" ? hwidSelectedFiles : banSelectedFiles;
  files.forEach((file, index) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = file.size > 1024 * 1024 * 1024 ? `${(file.size / (1024*1024*1024)).toFixed(2)} GB` : `${sizeMB} MB`;
    
    const tag = document.createElement("div");
    tag.className = "file-preview-tag";
    tag.innerHTML = `
      <span>[#${index+1}] ${file.name} (${sizeStr})</span>
      <span class="remove-file-btn" onclick="removeSelectedFile('${type}', ${index})">&times;</span>
    `;
    preview.appendChild(tag);
  });
}

function removeSelectedFile(type, index) {
  const targetArr = type === "hwid" ? hwidSelectedFiles : banSelectedFiles;
  targetArr.splice(index, 1);
  const previewId = type === "hwid" ? "hwidFilesPreview" : "banFilesPreview";
  renderFilePreviewList(previewId, type);
}

function updateSelectedServersText() {
  const selected = [];
  document.querySelectorAll("#serversDropdown input[type='checkbox']:checked").forEach(cb => {
    selected.push(cb.value);
  });

  const textEl = document.getElementById("selectedServersText");
  if (selected.length > 0) {
    textEl.textContent = selected.join(", ");
  } else {
    textEl.textContent = i18n[currentLang].selectServers;
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll(".nav-link-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  document.querySelectorAll(".tab-view").forEach(view => {
    if (view.id === tabId + "Tab") {
      view.style.display = "block";
      view.classList.remove("active-tab");
      void view.offsetWidth;
      view.classList.add("active-tab");
    } else {
      view.style.display = "none";
      view.classList.remove("active-tab");
    }
  });

  document.querySelector(".main-content")?.classList.toggle("admin-wide", tabId === "admin");

  if (tabId === "admin" && adminToken) {
    loadAdminDashboard();
  }
}

function openCriteriaModal() {
  closeAllModals();
  document.getElementById("criteriaModal")?.classList.add("open");
}

function openModModal() {
  closeAllModals();
  document.getElementById("modModal")?.classList.add("open");
}

function openAdminModal() {
  closeAllModals();
  document.getElementById("adminModal")?.classList.add("open");
}

function openCreateKeyModal() {
  closeAllModals();
  document.getElementById("createKeyModal")?.classList.add("open");
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay-bg").forEach(m => m.classList.remove("open"));
}

async function handleModAuth(e) {
  e.preventDefault();
  const keyInput = document.getElementById("modKeyInput").value.trim();
  const errEl = document.getElementById("modAuthError");
  errEl.style.display = "none";

  try {
    const res = await fetch("/api/mod/verify-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keyInput })
    });
    const data = await res.json();
    if (data.success) {
      modSession = { key: data.key, nickname: data.nickname };
      sessionStorage.setItem("mod_key", data.key);
      sessionStorage.setItem("mod_nickname", data.nickname);
      unlockModTabs();
      closeAllModals();
      document.getElementById("modKeyInput").value = "";
    } else {
      errEl.textContent = data.error || i18n[currentLang].invalidCode;
      errEl.style.display = "block";
    }
  } catch (err) {
    errEl.textContent = "Server connection error";
    errEl.style.display = "block";
  }
}

function unlockModTabs() {
  document.querySelectorAll(".mod-only").forEach(tab => tab.style.display = "inline-flex");
}

async function handleAdminAuth(e) {
  e.preventDefault();
  const codeInput = document.getElementById("adminCodeInput").value.trim();
  const errEl = document.getElementById("adminAuthError");
  errEl.style.display = "none";

  try {
    const res = await fetch("/api/admin/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeInput })
    });
    const data = await res.json();
    if (data.success) {
      adminToken = data.token;
      sessionStorage.setItem("admin_token", data.token);
      unlockAdminTab();
      closeAllModals();
      document.getElementById("adminCodeInput").value = "";
      switchTab("admin");
    } else {
      errEl.textContent = data.error || i18n[currentLang].invalidCode;
      errEl.style.display = "block";
    }
  } catch (err) {
    errEl.textContent = "Server connection error";
    errEl.style.display = "block";
  }
}

function unlockAdminTab() {
  document.querySelectorAll(".admin-only").forEach(tab => tab.style.display = "inline-flex");
  const turnstileWidget = document.querySelector(".cf-turnstile");
  if (turnstileWidget) {
    turnstileWidget.style.display = "none";
  }
}

function triggerButtonState(btn, state, defaultTextKey, customMessage) {
  if (!btn) return;
  const dict = i18n[currentLang];

  btn.classList.remove("state-error", "state-success");
  if (btn._stateTimeout) clearTimeout(btn._stateTimeout);

  if (state === "error") {
    btn.classList.add("state-error");
    btn.textContent = customMessage || dict.submitError;
    btn._stateTimeout = setTimeout(() => {
      btn.classList.remove("state-error");
      btn.textContent = dict[defaultTextKey];
    }, 3500);
  } else if (state === "success") {
    btn.classList.add("state-success");
    btn.textContent = customMessage || dict.submitSuccess;
    btn._stateTimeout = setTimeout(() => {
      btn.classList.remove("state-success");
      btn.textContent = dict[defaultTextKey];
    }, 3500);
  }
}

// Media Submit with Client-side Smart YouTube Validation
async function handleMediaSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("mediaSubmitBtn");
  
  const uid = document.getElementById("mediaUidInput").value.trim();
  const criteriaChoice = document.querySelector(".choice-btn-card[data-choice].active");
  const platform = document.getElementById("platformDropdown").dataset.value;

  // UID must be numeric only (no letters allowed)
  const uidError = document.getElementById("uidError");
  if (uid && /[a-zA-Z]/.test(uid)) {
    if (uidError) {
      uidError.textContent = t("errUidLetters");
      uidError.style.display = "block";
    }
    triggerButtonState(submitBtn, "error", "submitBtn", t("errUidLetters"));
    return;
  }
  if (uidError) uidError.style.display = "none";
  const channelUrl = (platform === "youtube" ? document.getElementById("ytChannelInput") : document.getElementById("ttChannelInput")).value.trim();
  
  const servers = [];
  document.querySelectorAll("#serversDropdown input[type='checkbox']:checked").forEach(cb => {
    servers.push(cb.value);
  });

  const videosPerWeek = document.getElementById("ytVideosInput").value.trim();
  const collaborations = document.getElementById("ttCollabInput").value.trim();
  const whyJoin = document.getElementById("whyJoinInput").value.trim();
  const exclusive = document.getElementById("exclusiveDropdown").dataset.value;
  const telegram = document.getElementById("telegramInput").value.trim();

  // Smart YouTube Channel validation
  if (platform === "youtube") {
    const lowerURL = channelUrl.toLowerCase();
    if (lowerURL.includes("watch?v=") || lowerURL.includes("youtu.be/") || lowerURL.includes("/shorts/")) {
      triggerButtonState(submitBtn, "error", "submitBtn", t("ytErrorChannel"));
      return;
    }
  }

  // Basic validation
  if (!uid || !criteriaChoice || !platform || !channelUrl || 
      servers.length === 0 || !whyJoin || !exclusive || !telegram) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    return;
  }

  if (platform === "youtube" && !videosPerWeek) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    return;
  }
  if (platform === "tiktok" && !collaborations) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    return;
  }

  // Require Turnstile CAPTCHA ONLY for non-admin users
  if (!adminToken && window.turnstile) {
    if (!turnstileToken) {
      triggerButtonState(submitBtn, "error", "submitBtn", t("errCaptcha"));
      return;
    }
  }

  const payload = {
    lang: currentLang,
    uid: uid,
    criteria_agreed: criteriaChoice.dataset.choice === "yes",
    platform: platform,
    channel_url: channelUrl,
    servers: servers.join(", "),
    videos_per_week: videosPerWeek,
    collaborations: collaborations,
    why_join: whyJoin,
    exclusive: exclusive,
    telegram: telegram,
    turnstile_token: turnstileToken
  };

  try {
    const headers = { "Content-Type": "application/json" };
    if (adminToken) headers["X-Admin-Secret"] = adminToken;

    const res = await fetch("/api/media/submit", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      triggerButtonState(submitBtn, "success", "submitBtn");
      setTimeout(() => {
        if (e.target) e.target.reset();
        document.getElementById("platformDropdown").dataset.value = "";
        document.getElementById("selectedPlatformText").textContent = i18n[currentLang].selectPlatform;
        document.getElementById("exclusiveDropdown").dataset.value = "";
        document.getElementById("selectedExclusiveText").textContent = i18n[currentLang].selectOption;
        document.querySelectorAll("#serversDropdown input[type='checkbox']").forEach(cb => cb.checked = false);
        updateSelectedServersText();
        document.getElementById("ytBlock").style.display = "none";
        document.getElementById("ttBlock").style.display = "none";
        document.getElementById("commonBlock").style.display = "none";
        document.querySelectorAll(".choice-btn-card[data-choice]").forEach(b => b.classList.remove("active"));
        resetTurnstile();
      }, 100);
    } else {
      if (data.tg_required) {
        // Highlight the bot verification block and scroll to it
        const botBlock = document.getElementById("tgBotVerifyBlock");
        if (botBlock) {
          botBlock.style.borderColor = "rgba(239, 68, 68, 0.8)";
          botBlock.style.background = "rgba(239, 68, 68, 0.08)";
          botBlock.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => {
            botBlock.style.borderColor = "rgba(139, 92, 246, 0.3)";
            botBlock.style.background = "rgba(139, 92, 246, 0.05)";
          }, 4000);
        }
        const statusEl = document.getElementById("tgVerifyStatus");
        if (statusEl) {
          statusEl.textContent = t("errTgNotWritten");
          statusEl.style.color = "#ef4444";
        }
      }
      triggerButtonState(submitBtn, "error", "submitBtn", data.error);
      resetTurnstile();
    }
  } catch (err) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    resetTurnstile();
  }
}

// ULTRA-EFFICIENT CHUNKED STREAMING FILE UPLOADER (Supports 15GB+ files)
async function uploadFilesChunked(files, progressContainerId) {
  const uploadedPaths = [];
  const progressBox = document.getElementById(progressContainerId);

  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    
    // 1. Initialize upload session
    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: file.name, file_size: file.size })
    });
    const initData = await initRes.json();
    if (!initData.success) throw new Error("Failed to initialize chunk upload");

    const { upload_id, chunk_size, total_chunks } = initData;

    // Show Progress Bar
    if (progressBox) {
      progressBox.innerHTML = `
        <div class="upload-progress-box">
          <div class="upload-progress-header">
            <span>${t("uploadProgress")} [${f+1}/${files.length}]: ${file.name}</span>
            <span id="uploadPercentText">0%</span>
          </div>
          <div class="upload-progress-track">
            <div class="upload-progress-fill" id="uploadProgressFill"></div>
          </div>
        </div>
      `;
    }

    // 2. Stream 5MB chunks sequentially
    for (let i = 0; i < total_chunks; i++) {
      const start = i * chunk_size;
      const end = Math.min(start + chunk_size, file.size);
      const chunkBlob = file.slice(start, end);

      const chunkForm = new FormData();
      chunkForm.append("upload_id", upload_id);
      chunkForm.append("chunk_index", i);
      chunkForm.append("total_chunks", total_chunks);
      chunkForm.append("file_name", file.name);
      chunkForm.append("chunk", chunkBlob, file.name);

      const chunkRes = await fetch("/api/upload/chunk", {
        method: "POST",
        body: chunkForm
      });
      const chunkData = await chunkRes.json();
      if (!chunkData.success) throw new Error("Chunk upload failed");

      // Update progress bar UI
      const percent = Math.round(((i + 1) / total_chunks) * 100);
      const fillEl = document.getElementById("uploadProgressFill");
      const textEl = document.getElementById("uploadPercentText");
      if (fillEl) fillEl.style.width = percent + "%";
      if (textEl) textEl.textContent = `${percent}% (${((end)/(1024*1024*1024)).toFixed(2)} GB / ${((file.size)/(1024*1024*1024)).toFixed(2)} GB)`;

      if (chunkData.completed) {
        uploadedPaths.push(chunkData.file_path);
      }
    }
  }

  if (progressBox) progressBox.innerHTML = "";
  return uploadedPaths.join(",");
}

// HWID Submit with Verified Moderator Key Header
async function handleHwidSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("hwidSubmitBtn");

  const activeModKey = modSession?.key || sessionStorage.getItem("mod_key");
  if (!activeModKey) {
    openModModal();
    triggerButtonState(submitBtn, "error", "submitBtn", t("errModAuthRequired"));
    return;
  }

  const uuid = document.getElementById("hwidUuidInput").value.trim();
  const proofLink = document.getElementById("hwidProofLinkInput").value.trim();
  const reason = document.getElementById("hwidReasonInput").value.trim();

  const files = hwidSelectedFiles;
  const hasFiles = files && files.length > 0;

  if (!uuid || !reason || (!hasFiles && !proofLink)) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    return;
  }

  let uploadedFilePaths = "";
  if (hasFiles) {
    try {
      submitBtn.textContent = t("uploadSending");
      uploadedFilePaths = await uploadFilesChunked(files, "hwidFilesPreview");
    } catch (err) {
      triggerButtonState(submitBtn, "error", "submitBtn", t("errFileUpload"));
      return;
    }
  }

  const formData = new FormData();
  formData.append("uuid", uuid);
  formData.append("reason", reason);
  formData.append("proof_link", proofLink);
  formData.append("proof_file_paths", uploadedFilePaths);
  formData.append("lang", currentLang);

  try {
    const res = await fetch("/api/mod/hwid/submit", {
      method: "POST",
      headers: { "X-Mod-Key": activeModKey },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      e.target.reset();
      hwidSelectedFiles = [];
      document.getElementById("hwidFilesPreview").innerHTML = "";
      triggerButtonState(submitBtn, "success", "submitBtn");
    } else {
      triggerButtonState(submitBtn, "error", "submitBtn", data.error || t("errServerError"));
    }
  } catch (err) {
    triggerButtonState(submitBtn, "error", "submitBtn");
  }
}

// Discord Ban Submit with Verified Moderator Key Header
async function handleBanSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("banSubmitBtn");

  const activeModKey = modSession?.key || sessionStorage.getItem("mod_key");
  if (!activeModKey) {
    openModModal();
    triggerButtonState(submitBtn, "error", "submitBtn", t("errModAuthRequired"));
    return;
  }

  const offender = document.getElementById("banOffenderInput").value.trim();
  const proofLink = document.getElementById("banProofLinkInput").value.trim();
  const reason = document.getElementById("banReasonInput").value.trim();

  const files = banSelectedFiles;
  const hasFiles = files && files.length > 0;

  if (!offender || !reason || (!hasFiles && !proofLink)) {
    triggerButtonState(submitBtn, "error", "submitBtn");
    return;
  }

  let uploadedFilePaths = "";
  if (hasFiles) {
    try {
      submitBtn.textContent = t("uploadSending");
      uploadedFilePaths = await uploadFilesChunked(files, "banFilesPreview");
    } catch (err) {
      triggerButtonState(submitBtn, "error", "submitBtn", t("errFileUpload"));
      return;
    }
  }

  const formData = new FormData();
  formData.append("offender_id", offender);
  formData.append("reason", reason);
  formData.append("proof_link", proofLink);
  formData.append("proof_file_paths", uploadedFilePaths);
  formData.append("lang", currentLang);

  try {
    const res = await fetch("/api/mod/discord/submit", {
      method: "POST",
      headers: { "X-Mod-Key": activeModKey },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      e.target.reset();
      banSelectedFiles = [];
      document.getElementById("banFilesPreview").innerHTML = "";
      triggerButtonState(submitBtn, "success", "submitBtn");
    } else {
      triggerButtonState(submitBtn, "error", "submitBtn", data.error || t("errServerError"));
    }
  } catch (err) {
    triggerButtonState(submitBtn, "error", "submitBtn");
  }
}

// Admin Dashboard Functions
async function loadAdminDashboard() {
  if (!adminToken) return;
  const headers = { "X-Admin-Secret": adminToken };

  try {
    const statsRes = await fetch("/api/admin/stats", { headers });
    const statsData = await statsRes.json();
    if (statsData.success) {
      document.getElementById("statMediaVal").textContent = statsData.stats.media_pending;
      document.getElementById("statHwidVal").textContent = statsData.stats.hwid_pending;
      document.getElementById("statBanVal").textContent = statsData.stats.ban_pending;
      document.getElementById("statKeysVal").textContent = statsData.stats.mod_keys_total;
    }

    loadAdminMediaApps();
    loadAdminHwidReqs();
    loadAdminBanReqs();
    loadAdminModKeys();
    loadAdminBannedIPs();
    loadAdminUserBans();
    loadAdminLogs();
    startAdminLogsPolling();
  } catch (err) {
    console.error("Failed to load admin dashboard", err);
  }
}

function applyAdminFilters() {
  pageState.media.page = 1;
  pageState.hwid.page = 1;
  pageState.ban.page = 1;
  pageState.keys.page = 1;
  if (pageState.bannedIps) pageState.bannedIps.page = 1;
  pageState.logs.page = 1;

  renderMediaTable();
  renderHwidTable();
  renderBanTable();
  renderKeysTable();
  renderBannedIpsTable();
  renderLogsTable();
}

function getFilterCriteria() {
  const query = (document.getElementById("adminSearchInput")?.value || "").toLowerCase().trim();
  
  // Selected statuses checkboxes array
  const selectedStatuses = [];
  document.querySelectorAll("#adminStatusDropdown input[type='checkbox']:checked").forEach(cb => {
    selectedStatuses.push(cb.value);
  });

  // Selected servers checkboxes array
  const selectedServers = [];
  document.querySelectorAll("#adminServerDropdown input[type='checkbox']:checked").forEach(cb => {
    selectedServers.push(cb.value);
  });

  const sort = document.getElementById("adminSortDropdown")?.dataset.value || "newest";
  return { query, selectedStatuses, selectedServers, sort };
}

// Helper to filter and sort list with Favorites & Multi-select Checkboxes
function processDataList(list, type) {
  const { query, selectedStatuses, selectedServers, sort } = getFilterCriteria();

  let result = list.filter(item => {
    // Multi-select status check
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status)) {
      return false;
    }

    // Multi-select server check
    if (selectedServers.length > 0) {
      if (!item.servers) return false;
      const hasMatch = selectedServers.some(srv => item.servers.includes(srv));
      if (!hasMatch) return false;
    }

    if (query) {
      const text = `${item.id} ${item.channel_url||''} ${item.telegram||''} ${item.uuid||''} ${item.offender_id||''} ${item.reason||''} ${item.nickname||''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }

    if (sort === "fav_only" && !isFavorite(type, item.id)) {
      return false;
    }
    return true;
  });

  if (sort === "fav_first") {
    result.sort((a, b) => {
      const aFav = isFavorite(type, a.id) ? 1 : 0;
      const bFav = isFavorite(type, b.id) ? 1 : 0;
      return bFav - aFav;
    });
  }

  return result;
}

// Helper to render pagination controls
function renderPagination(containerId, stateKey, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const st = pageState[stateKey];
  const totalPages = Math.ceil(st.filteredData.length / st.limit) || 1;
  if (st.page > totalPages) st.page = totalPages;

  container.innerHTML = `
    <div>${t("pagShowingText")} ${st.filteredData.length} ${t("pagRecords")}</div>
    <div style="display:flex; align-items:center; gap:0.5rem;">
      <button class="page-btn" ${st.page <= 1 ? 'disabled' : ''} onclick="${onPageChange}(${st.page - 1})">${t("pagBack")}</button>
      <span>${t("pagPageOf")} ${st.page} ${t("pagOf")} ${totalPages}</span>
      <button class="page-btn" ${st.page >= totalPages ? 'disabled' : ''} onclick="${onPageChange}(${st.page + 1})">${t("pagForward")}</button>
    </div>
  `;
}

function paginateArray(arr, page, limit) {
  const start = (page - 1) * limit;
  return arr.slice(start, start + limit);
}

// Media Applications Table
async function loadAdminMediaApps() {
  const res = await fetch("/api/admin/media", { headers: { "X-Admin-Secret": adminToken } });
  const data = await res.json();
  if (!data.success) return;
  pageState.media.data = data.data;
  renderMediaTable();
}

function renderMediaTable() {
  const tbody = document.getElementById("adminMediaTbody");
  if (!tbody) return;

  const filtered = processDataList(pageState.media.data, "media");
  pageState.media.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.media.page, pageState.media.limit);

  tbody.innerHTML = pageItems.map(item => {
    let actionButtons = `<span class="completed-label">${t("completedLabel")}</span>`;
    if (item.status === "pending") {
      actionButtons = `
        <div class="action-btn-group">
          <button class="table-act-btn ok" title="${t("btnApprove")}" onclick="updateMediaStatus(${item.id}, 'approved')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button class="table-act-btn no" title="${t("btnReject")}" onclick="updateMediaStatus(${item.id}, 'rejected')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td>#${item.id}</td>
        <td><code>${item.uid || '-'}</code></td>
        <td><b>${item.platform.toUpperCase()}</b></td>
        <td><a href="${item.channel_url}" target="_blank" style="color:var(--color-primary-400); text-decoration:underline;">${item.channel_url}</a></td>
        <td>${item.servers}</td>
        <td>${item.telegram}</td>
        <td><span class="tag-badge" style="background:${item.criteria_agreed ? 'rgba(34,197,94,0.15); color:#4ade80' : 'rgba(239,68,68,0.15); color:#f87171'}">${item.criteria_agreed ? t("yes") : t("no")}</span></td>
        <td><span class="tag-badge" style="background:${item.exclusive === 'yes' ? 'rgba(34,197,94,0.15); color:#4ade80' : 'rgba(239,68,68,0.15); color:#f87171'}">${item.exclusive === 'yes' ? t("yes") : t("no")}</span></td>
        <td>${item.videos_per_week || '-'}</td>
        <td class="cell-expandable" onclick="openCellTextModal('${item.collaborations ? item.collaborations.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : ''}')">${item.collaborations ? (item.collaborations.length > 40 ? item.collaborations.substring(0, 40) + '…' : item.collaborations) : '-'}</td>
        <td class="cell-expandable" onclick="openCellTextModal('${item.why_join ? item.why_join.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') : ''}')">${item.why_join ? (item.why_join.length > 40 ? item.why_join.substring(0, 40) + '…' : item.why_join) : '-'}</td>
        <td><span class="tag-badge tag-${item.status}">${item.status}</span></td>
        <td>
          ${actionButtons}
        </td>
        <td style="text-align:center;">${renderStarBtn('media', item.id)}</td>
      </tr>
    `;
  }).join("");

  renderPagination("mediaPagination", "media", "setMediaPage");
}

function setMediaPage(page) {
  pageState.media.page = page;
  renderMediaTable();
}

function updateMediaStatus(id, status) {
  const actionName = status === "approved" ? t("actionApproveMedia") : t("actionRejectMedia");
  promptAdminComment(`${actionName} #${id}`, async (comment) => {
    const res = await fetch(`/api/admin/media/${id}/status`, {
      method: "POST",
      headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_comment: comment })
    });
    const data = await res.json();
    loadAdminDashboard();
    if (data.tg_warning) {
      alert(data.tg_warning);
    }
  });
}

function renderProofLinks(proofFile, proofLink) {
  const links = [];
  if (proofFile) {
    const files = proofFile.split(",");
    files.forEach((f, idx) => {
      links.push(`<a href="${f}" target="_blank" style="color:var(--color-primary-400); text-decoration:underline; margin-right:4px;">File #${idx + 1}</a>`);
    });
  }
  if (proofLink) {
    links.push(`<a href="${proofLink}" target="_blank" style="color:var(--color-primary-400); text-decoration:underline;">Link</a>`);
  }
  return links.join(" ");
}

// HWID Requests Table
async function loadAdminHwidReqs() {
  const res = await fetch("/api/admin/hwid", { headers: { "X-Admin-Secret": adminToken } });
  const data = await res.json();
  if (!data.success) return;
  pageState.hwid.data = data.data;
  renderHwidTable();
}

function renderHwidTable() {
  const tbody = document.getElementById("adminHwidTbody");
  if (!tbody) return;

  const filtered = processDataList(pageState.hwid.data, "hwid");
  pageState.hwid.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.hwid.page, pageState.hwid.limit);

  tbody.innerHTML = pageItems.map(item => {
    let actionButtons = `<span class="completed-label">${t("completedLabel")}</span>`;
    if (item.status === "pending") {
      actionButtons = `
        <div class="action-btn-group">
          <button class="table-act-btn ok" title="${t("btnApprove")}" onclick="updateHwidStatus(${item.id}, 'approved')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button class="table-act-btn no" title="${t("btnReject")}" onclick="updateHwidStatus(${item.id}, 'rejected')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td>#${item.id}</td>
        <td><b>${item.mod_nickname}</b></td>
        <td><code style="font-family:var(--font-mono); color:var(--color-primary-400)">${item.uuid}</code></td>
        <td>${renderProofLinks(item.proof_file, item.proof_link)}</td>
        <td>${item.reason}</td>
        <td><span class="tag-badge tag-${item.status}">${item.status}</span></td>
        <td>${actionButtons}</td>
        <td style="text-align:center;">${renderStarBtn('hwid', item.id)}</td>
      </tr>
    `;
  }).join("");

  renderPagination("hwidPagination", "hwid", "setHwidPage");
}

function setHwidPage(page) {
  pageState.hwid.page = page;
  renderHwidTable();
}

function updateHwidStatus(id, status) {
  const actionName = status === "approved" ? t("actionApproveHwid") : t("actionRejectHwid");
  promptAdminComment(`${actionName} #${id}`, async (comment) => {
    const res = await fetch(`/api/admin/hwid/${id}/status`, {
      method: "POST",
      headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_comment: comment })
    });
    const data = await res.json();
    loadAdminDashboard();
    if (data.tg_warning) {
      alert(data.tg_warning);
    }
  });
}

// Discord Ban Requests Table
async function loadAdminBanReqs() {
  const res = await fetch("/api/admin/discord", { headers: { "X-Admin-Secret": adminToken } });
  const data = await res.json();
  if (!data.success) return;
  pageState.ban.data = data.data;
  renderBanTable();
}

function renderBanTable() {
  const tbody = document.getElementById("adminBanTbody");
  if (!tbody) return;

  const filtered = processDataList(pageState.ban.data, "ban");
  pageState.ban.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.ban.page, pageState.ban.limit);

  tbody.innerHTML = pageItems.map(item => {
    let actionButtons = `<span class="completed-label">${t("completedLabel")}</span>`;
    if (item.status === "pending") {
      actionButtons = `
        <div class="action-btn-group">
          <button class="table-act-btn ok" title="${t("btnApprove")}" onclick="updateBanStatus(${item.id}, 'approved')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
          <button class="table-act-btn no" title="${t("btnReject")}" onclick="updateBanStatus(${item.id}, 'rejected')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
    }

    return `
      <tr>
        <td>#${item.id}</td>
        <td><b>${item.mod_nickname}</b></td>
        <td><code style="font-family:var(--font-mono); color:var(--color-primary-400)">${item.offender_id}</code></td>
        <td>${renderProofLinks(item.proof_file, item.proof_link)}</td>
        <td>${item.reason}</td>
        <td><span class="tag-badge tag-${item.status}">${item.status}</span></td>
        <td>${actionButtons}</td>
        <td style="text-align:center;">${renderStarBtn('ban', item.id)}</td>
      </tr>
    `;
  }).join("");

  renderPagination("banPagination", "ban", "setBanPage");
}

function setBanPage(page) {
  pageState.ban.page = page;
  renderBanTable();
}

function updateBanStatus(id, status) {
  const actionName = status === "approved" ? t("actionApproveBan") : t("actionRejectBan");
  promptAdminComment(`${actionName} #${id}`, async (comment) => {
    const res = await fetch(`/api/admin/discord/${id}/status`, {
      method: "POST",
      headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_comment: comment })
    });
    const data = await res.json();
    loadAdminDashboard();
    if (data.tg_warning) {
      alert(data.tg_warning);
    }
  });
}

// Moderator Keys Table
async function loadAdminModKeys() {
  const res = await fetch("/api/admin/mod-keys", { headers: { "X-Admin-Secret": adminToken } });
  const data = await res.json();
  if (!data.success) return;
  pageState.keys.data = data.data;
  renderKeysTable();
}

function renderKeysTable() {
  const tbody = document.getElementById("adminKeysTbody");
  if (!tbody) return;

  const filtered = processDataList(pageState.keys.data, "keys");
  pageState.keys.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.keys.page, pageState.keys.limit);

  tbody.innerHTML = pageItems.map(item => {
    let statusBadge = `<span class="tag-badge tag-approved">Active</span>`;
    let freezeBtnText = t("btnFreeze");
    let freezeAction = "freeze";

    if (item.is_active === 2) {
      statusBadge = `<span class="tag-badge tag-frozen">Frozen</span>`;
      freezeBtnText = t("btnUnfreeze");
      freezeAction = "unfreeze";
    } else if (item.is_active === 0) {
      statusBadge = `<span class="tag-badge tag-rejected">Disabled</span>`;
      freezeBtnText = t("btnActivate");
      freezeAction = "unfreeze";
    }

    return `
      <tr>
        <td>#${item.id}</td>
        <td><b>${item.nickname}</b></td>
        <td>${item.telegram || '-'}</td>
        <td><code style="font-family:var(--font-mono); color:var(--color-primary-400)">${item.key}</code></td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-btn-group">
            <button class="table-act-btn warn" onclick="toggleModKey(${item.id}, '${freezeAction}')">${freezeBtnText}</button>
            <button class="table-act-btn no" onclick="toggleModKey(${item.id}, 'delete')">${t("btnDelete")}</button>
          </div>
        </td>
        <td style="text-align:center;">${renderStarBtn('keys', item.id)}</td>
      </tr>
    `;
  }).join("");

  renderPagination("keysPagination", "keys", "setKeysPage");
}

function setKeysPage(page) {
  pageState.keys.page = page;
  renderKeysTable();
}

async function handleCreateKeySubmit(e) {
  e.preventDefault();
  const nick = document.getElementById("newModNickInput").value.trim();
  const tg = document.getElementById("newModTgInput").value.trim();
  const customKey = document.getElementById("newModCustomKeyInput").value.trim();

  if (!nick || !tg) return;

  await fetch("/api/admin/mod-keys", {
    method: "POST",
    headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: nick, telegram: tg, key: customKey })
  });

  closeAllModals();
  document.getElementById("newModNickInput").value = "";
  document.getElementById("newModTgInput").value = "";
  document.getElementById("newModCustomKeyInput").value = "";
  loadAdminDashboard();
}

async function toggleModKey(id, action) {
  await fetch(`/api/admin/mod-keys/${id}?action=${action}`, {
    method: "POST",
    headers: { "X-Admin-Secret": adminToken }
  });
  loadAdminDashboard();
}

// Audit Logs Table with Live Auto-Updates & Animations
let knownLogIds = new Set();
let adminLogsInterval = null;

async function loadAdminLogs(silent = false) {
  if (!adminToken) return;
  try {
    const res = await fetch("/api/admin/logs", { headers: { "X-Admin-Secret": adminToken } });
    const data = await res.json();
    if (!data.success) return;

    const newLogs = data.data || [];
    
    // Sort newest first by ID/created_at
    newLogs.sort((a, b) => b.id - a.id);

    const prevKnown = new Set(knownLogIds);
    const updatedKnown = new Set(newLogs.map(l => l.id));

    pageState.logs.data = newLogs;
    renderLogsTable(prevKnown.size > 0 ? prevKnown : null);
    knownLogIds = updatedKnown;
  } catch (err) {
    if (!silent) console.error("Failed to load logs", err);
  }
}

async function manualRefreshLogs() {
  const icon = document.getElementById("refreshLogsIcon");
  if (icon) icon.classList.add("spin-icon");
  await loadAdminLogs();
  setTimeout(() => {
    if (icon) icon.classList.remove("spin-icon");
  }, 600);
}

function startAdminLogsPolling() {
  if (adminLogsInterval) clearInterval(adminLogsInterval);
  adminLogsInterval = setInterval(() => {
    if (adminToken && document.getElementById("adminViewSection")?.classList.contains("active")) {
      loadAdminLogs(true);
    }
  }, 3000);
}

function renderLogsTable(prevKnownSet = null) {
  const tbody = document.getElementById("adminLogsTbody");
  if (!tbody) return;
  const { query } = getFilterCriteria();

  const filtered = pageState.logs.data.filter(item => {
    if (query) {
      const text = `${item.id} ${item.event_type} ${item.details} ${item.ip_address}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  pageState.logs.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.logs.page, pageState.logs.limit);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:rgba(255,255,255,0.4); padding: 1.5rem;">${t("noLogs")}</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(item => {
    let statusClass = "tag-approved";
    if (item.status === "failed") statusClass = "tag-rejected";
    if (item.status === "warning") statusClass = "tag-frozen";

    const isNew = prevKnownSet && !prevKnownSet.has(item.id);
    const rowClass = isNew ? "log-row-new" : "";

    const dateStr = new Date(item.created_at).toLocaleString();

    return `
      <tr class="${rowClass}">
        <td>#${item.id}</td>
        <td style="font-size:0.8rem; color:rgba(255,255,255,0.5)">${dateStr}</td>
        <td><code style="font-family:var(--font-mono); color:var(--color-primary-400)">${item.event_type}</code></td>
        <td><span class="tag-badge ${statusClass}">${item.status.toUpperCase()}</span></td>
        <td>${item.details}</td>
        <td style="font-family:var(--font-mono); font-size:0.8rem">${item.ip_address}</td>
      </tr>
    `;
  }).join("");

  renderPagination("logsPagination", "logs", "setLogsPage");
}

function setLogsPage(page) {
  pageState.logs.page = page;
  renderLogsTable();
}

// Banned IPs Management Functions
async function loadAdminBannedIPs() {
  if (!adminToken) return;
  try {
    const res = await fetch("/api/admin/banned-ips", { headers: { "X-Admin-Secret": adminToken } });
    const data = await res.json();
    if (!data.success) return;
    if (!pageState.bannedIps) pageState.bannedIps = { page: 1, limit: 10, data: [] };
    pageState.bannedIps.data = data.data || [];
    renderBannedIpsTable();
  } catch (err) {
    console.error("Failed to load banned IPs", err);
  }
}

function renderBannedIpsTable() {
  const tbody = document.getElementById("adminBannedIpsTbody");
  if (!tbody) return;
  const { query } = getFilterCriteria();

  const filtered = (pageState.bannedIps?.data || []).filter(item => {
    if (query) {
      const text = `${item.id} ${item.ip} ${item.reason} ${item.banned_by}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (!pageState.bannedIps) pageState.bannedIps = { page: 1, limit: 10, data: [] };
  pageState.bannedIps.filteredData = filtered;
  const pageItems = paginateArray(filtered, pageState.bannedIps.page || 1, pageState.bannedIps.limit || 10);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:rgba(255,255,255,0.4); padding: 1.5rem;">${t("noBannedIPs")}</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(item => {
    const dateStr = new Date(item.created_at).toLocaleString();
    return `
      <tr>
        <td>#${item.id}</td>
        <td><code style="font-family:var(--font-mono); color:#ef4444; font-weight:600">${item.ip}</code></td>
        <td>${item.reason || "-"}</td>
        <td>${item.banned_by || "admin"}</td>
        <td style="font-size:0.8rem; color:rgba(255,255,255,0.5)">${dateStr}</td>
        <td>
          <button class="table-act-btn ok" onclick="unbanIp(${item.id})">${t("btnUnban")}</button>
        </td>
      </tr>
    `;
  }).join("");

  renderPagination("bannedIpsPagination", "bannedIps", "setBannedIpsPage");
}

function setBannedIpsPage(page) {
  if (!pageState.bannedIps) pageState.bannedIps = { page: 1, limit: 10, data: [] };
  pageState.bannedIps.page = page;
  renderBannedIpsTable();
}

function openBanIpModal() {
  closeAllModals();
  const modal = document.getElementById("banIpModal");
  if (modal) modal.classList.add("open");
}

async function submitBanIp() {
  const ipInput = document.getElementById("banIpInput");
  const reasonInput = document.getElementById("banIpReasonInput");
  if (!ipInput) return;

  const ip = ipInput.value.trim();
  const reason = reasonInput ? reasonInput.value.trim() : "";

  if (!ip) {
    alert(t("errEnterIP"));
    return;
  }

  try {
    const res = await fetch("/api/admin/banned-ips", {
      method: "POST",
      headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
      body: JSON.stringify({ ip, reason })
    });
    const data = await res.json();
    if (data.success) {
      ipInput.value = "";
      if (reasonInput) reasonInput.value = "";
      closeAllModals();
      loadAdminDashboard();
    } else {
      alert(data.error || t("errBanIP"));
    }
  } catch (err) {
    alert(t("errBanNetwork"));
  }
}

async function unbanIp(id) {
  if (!confirm(t("confirmUnbanIP"))) return;
  try {
    const res = await fetch(`/api/admin/banned-ips/${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Secret": adminToken }
    });
    const data = await res.json();
    if (data.success) {
      loadAdminDashboard();
    } else {
      alert(data.error || t("errUnbanIP"));
    }
  } catch (err) {
    alert(t("errUnbanNetwork"));
  }
}

// User Bans Management
async function loadAdminUserBans() {
  if (!adminToken) return;
  try {
    const res = await fetch("/api/admin/user-bans", { headers: { "X-Admin-Secret": adminToken } });
    const data = await res.json();
    if (!data.success) return;
    renderUserBansTable(data.data || []);
  } catch (err) {
    console.error("Failed to load user bans", err);
  }
}

function renderUserBansTable(bans) {
  const tbody = document.getElementById("adminUserBansTbody");
  if (!tbody) return;

  if (!bans.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:rgba(255,255,255,0.4); padding:1.5rem;">' + t("noUserBans") + '</td></tr>';
    return;
  }

  const typeLabels = { channel: "Channel", uid: "UID", telegram: "Telegram", discord: "Discord", ip: "IP" };

  tbody.innerHTML = bans.map(function(item) {
    var dateStr = new Date(item.created_at).toLocaleString();
    return '<tr>' +
      '<td>#' + item.id + '</td>' +
      '<td><span class="tag-badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">' + (typeLabels[item.ban_type] || item.ban_type) + '</span></td>' +
      '<td><code style="font-family:var(--font-mono); color:#f87171; font-weight:600">' + item.ban_value + '</code></td>' +
      '<td>' + (item.reason || '-') + '</td>' +
      '<td>' + (item.banned_by || 'admin') + '</td>' +
      '<td style="font-size:0.8rem; color:rgba(255,255,255,0.5)">' + dateStr + '</td>' +
      '<td><button class="table-act-btn ok" onclick="unbanUser(' + item.id + ')">' + t("btnUnban") + '</button></td>' +
      '</tr>';
  }).join("");
}

function openCellTextModal(text) {
  if (!text) return;
  closeAllModals();
  document.getElementById("cellTextContent").textContent = text;
  document.getElementById("cellTextModal").classList.add("open");
}

function openBanUserModal(prefill) {
  closeAllModals();
  document.getElementById("banUserChannelInput").value = (prefill && prefill.channel_url) ? prefill.channel_url : "";
  document.getElementById("banUserUidInput").value = (prefill && prefill.uid) ? prefill.uid : "";
  document.getElementById("banUserTgInput").value = (prefill && prefill.telegram) ? prefill.telegram : "";
  document.getElementById("banUserDiscordInput").value = "";
  document.getElementById("banUserIpInput").value = (prefill && prefill.ip_address) ? prefill.ip_address : "";
  document.getElementById("banUserReasonInput").value = "";
  var modal = document.getElementById("banUserModal");
  if (modal) modal.classList.add("open");
}

document.getElementById("banUserForm") && document.getElementById("banUserForm").addEventListener("submit", async function(e) {
  e.preventDefault();
  var fields = [
    { type: "channel", el: "banUserChannelInput" },
    { type: "uid", el: "banUserUidInput" },
    { type: "telegram", el: "banUserTgInput" },
    { type: "discord", el: "banUserDiscordInput" },
    { type: "ip", el: "banUserIpInput" }
  ];
  var reason = document.getElementById("banUserReasonInput").value.trim();

  var banned = 0;
  for (var i = 0; i < fields.length; i++) {
    var val = document.getElementById(fields[i].el).value.trim();
    if (!val) continue;
    try {
      var res = await fetch("/api/admin/user-bans", {
        method: "POST",
        headers: { "X-Admin-Secret": adminToken, "Content-Type": "application/json" },
        body: JSON.stringify({ ban_type: fields[i].type, ban_value: val, reason: reason })
      });
      var data = await res.json();
      if (data.success) banned++;
    } catch (_) {}
  }

  closeAllModals();
  if (banned > 0) {
    loadAdminUserBans();
  } else {
    alert(t("errEnterIP"));
  }
});

async function unbanUser(id) {
  if (!confirm(t("confirmUnbanUser"))) return;
  try {
    var res = await fetch("/api/admin/user-bans/" + id, {
      method: "DELETE",
      headers: { "X-Admin-Secret": adminToken }
    });
    var data = await res.json();
    if (data.success) {
      loadAdminUserBans();
    } else {
      alert(data.error || t("errUnbanUser"));
    }
  } catch (_) {
    alert(t("errUnbanUserNetwork"));
  }
}
