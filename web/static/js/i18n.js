/* i18n.js — RU / UA / EN локализация */
"use strict";

const I18N = {
  ru: {
    navApply: "Медиа заявка", navCabinet: "Кабинет",
    navDocs: "Документация", navSupport: "Поддержка",
    heroPill: "delta media · приём заявок открыт",
    heroPillClosed: "delta media · приём заявок закрыт",
    heroTitle: ["Стань частью", "delta media"],
    heroDesc: "Заполните форму ниже для вступления в delta media. Перед отправкой внимательно проверьте все указанные данные.",
    login: "Войти", logout: "Выйти из аккаунта",
    qUid: "UID *", qCriteria: "Соответствуете критериям? *",
    yes: "Да", no: "Нет", here: "здесь",
    criteriaHint: "Ознакомьтесь с критериями",
    uidDigitsOnly: "В поле UID разрешены только цифры",
    qPlatform: "Платформа *", pickPlatform: "Выберите платформу",
    qChannel: "Ссылка на канал *", channelHint: "Прямая ссылка на канал, не на видео",
    ytInvalidFormat: "Укажите прямую ссылку на канал (например, https://youtube.com/@username)",
    ytVideoLinkErr: "Укажите ссылку на сам канал, а не на видео или Shorts",
    ytFakeLinkErr: "Укажите настоящую ссылку на ваш канал",
    ttInvalidFormat: "Укажите прямую ссылку на TikTok-аккаунт (например, https://tiktok.com/@username)",
    ttVideoLinkErr: "Укажите ссылку на профиль TikTok, а не на видео",
    ttFakeLinkErr: "Укажите настоящую ссылку на ваш TikTok-аккаунт",
    qVideos: "Роликов в неделю *", qCollab: "Сотрудничества *",
    qServers: "Серверы *", pickServers: "Выберите серверы", other: "Прочие",
    qWhy: "Почему вы? *", qExclusive: "Вы готовы снимать только с Delta Client?", pickVariant: "Выберите вариант",
    qTg: "Telegram *",
    tgVerifyBadge: "Защита от спама",
    tgVerifyTitle: "Обязательная верификация Telegram",
    tgVerifyDesc: "Перед отправкой напишите нашему сотруднику. Не нужно ждать ответа или одобрения, просто отправьте любое сообщение и подавайте заявку:",
    tgVerifyBtn: "Написать сотруднику",
    tgVerifyStep1: "Нажмите кнопку и отправьте любое сообщение",
    tgVerifyStep2: "Подавайте заполненную заявку на медиа",
    tgStatusIdle: "Ожидание ввода Telegram...",
    tgStatusChecking: "Проверка диалога в системе...",
    tgStatusOk: "Telegram подтверждён — можно отправлять заявку",
    tgStatusErr: "Диалог не найден — сначала напишите сотруднику!",
    sendApp: "Отправить заявку",
    sendAppClosed: "Приём заявок закрыт",
    bugTitle: "Нашли ошибку или баг?", bugDesc: "Сообщите нам в Telegram — быстро всё исправим",
    criteriaTitle: "Критерии медиа",
    yt1: "От 50 подписчиков", yt2: "Стабильные 100+ просмотров на последних роликах",
    yt3: "Тематика — Minecraft (HVH)", yt4: "Качественный монтаж",
    tt1: "От 200 подписчиков", tt2: "Стабильные 600–700+ просмотров",
    tt3: "Тематика — Minecraft (HVH)", tt4: "Качественный монтаж",
    loginTitle: "Вход по коду аккаунта", loginHint: "Введите код, выданный администратором",
    loginBtn: "Войти", gpsHint: "Потребуется подтвердить геолокацию — без неё вход невозможен",
    tfaTitle: "Подтвердите вход",
    tfaDesc: "Мы отправили запрос в Telegram. Нажмите «✅ Подтвердить» в сообщении от бота.",
    cancel: "Отмена", confirm: "Подтвердить",

    // Плейсхолдеры
    phUid: "Ваш UID в Delta Client",
    phVideos: "Например: 2-3 ролика",
    phCollab: "С какими клиентами/визуалами сотрудничали?",
    phWhy: "Расскажите о себе, планах, опыте...",

    // Модальное окно
    authTitle: "Вход",
    authSub: "Личный кабинет медиа-портала",
    authCodeLabel: "код доступа",
    authForgot: "Забыли код?",
    authRemember: "Запомнить меня",
    authSubmit: "Войти",
    authSubmitLoading: "Вход...",
    authTagline: "Контроль, данные и точность — в одном инструменте.",
    authPending: "Ожидание подтверждения в Telegram...",
    authEnterCode: "Введите код доступа",
    authSuccess: "Успешный вход в аккаунт!",
    authLoggedOut: "Вы вышли из аккаунта",
    authErrorConnection: "Ошибка соединения с сервером",
    authAttemptDenied: "Вход отклонён в Telegram",

    // Кабинет
    cabinetTitle: "Кабинет",
    cabinetModerator: "Кабинет модератора",
    cabinetMedia: "Кабинет медиа",
    cabinetFreemedia: "Кабинет фримедиа",
    cabinetAdmin: "Кабинет администратора",
    tabHwid: "Сброс HWID",
    tabDiscord: "Discord бан",
    tabPayout: "Заявка на выплату",
    tabLot: "Заявка на лот",
    tabSub: "Запрос подписки",
    tabMy: "Мои заявки",
    tabAdmin: "Админ-панель",

    // Футер 1:1 с deltaclient.xyz
    footerTagline: "Клиент, который делает тебя непобедимым.",
    footerColPlatform: "Платформа",
    footerMainSite: "Основной сайт",
    footerLogin: "Войти в аккаунт",
    footerCabinet: "Кабинет",
    footerColNav: "Навигация",
    footerActivity: "Активность игроков",
    footerStore: "Продукты",
    footerDocs: "Документация",
    footerSupport: "Поддержка",
    footerColDocs: "Документы",
    footerPrivacy: "Политика конфиденциальности",
    footerTerms: "Условия пользования",
    footerRefund: "Возврат средств",
    footerData: "Обработка данных",
    footerCopy: "© 2026 delta media portal. Все права защищены.",

    // Техработы
    maintenancePill: "delta media · технические работы",
    maintenanceTitle: "Технические",
    maintenanceHighlight: "работы",
    maintenanceDesc: "Мы проводим плановое обновление портала delta media. Скоро вернемся к работе.",
    timerHours: "часов",
    timerMinutes: "минут",
    timerSeconds: "секунд",
    maintenanceStaffHint: "Вход в профиль во время техработ разрешён только администраторам и модераторам.",
  },
  ua: {
    navApply: "Медіа заявка", navCabinet: "Кабінет",
    navDocs: "Документація", navSupport: "Підтримка",
    heroPill: "delta media · прийом заявок відкрито",
    heroPillClosed: "delta media · прийом заявок закрито",
    heroTitle: ["Стань частиною", "delta media"],
    heroDesc: "Заповніть форму нижче для вступу до delta media. Перед відправкою уважно перевірте всі вказані дані.",
    login: "Увійти", logout: "Вийти з акаунту",
    qUid: "UID *", qCriteria: "Відповідаєте критеріям? *",
    yes: "Так", no: "Ні", here: "тут",
    criteriaHint: "Ознайомтеся з критеріями",
    uidDigitsOnly: "У полі UID дозволені лише цифри",
    qPlatform: "Платформа *", pickPlatform: "Оберіть платформу",
    qChannel: "Посилання на канал *", channelHint: "Пряме посилання на канал, не на відео",
    ytInvalidFormat: "Вкажіть пряме посилання на канал (наприклад, https://youtube.com/@username)",
    ytVideoLinkErr: "Вкажіть посилання на сам канал, а не на відео чи Shorts",
    ytFakeLinkErr: "Вкажіть справжнє посилання на ваш канал",
    ttInvalidFormat: "Вкажіть пряме посилання на TikTok-акаунт (наприклад, https://tiktok.com/@username)",
    ttVideoLinkErr: "Вкажіть посилання на профіль TikTok, а не на відео",
    ttFakeLinkErr: "Вкажіть справжнє посилання на ваш TikTok-акаунт",
    qVideos: "Відео на тиждень *", qCollab: "Співпраці *",
    qServers: "Сервери *", pickServers: "Оберіть сервери", other: "Інші",
    qWhy: "Чому ви? *", qExclusive: "Ви готові знімати тільки з Delta Client?", pickVariant: "Оберіть варіант",
    qTg: "Telegram *",
    tgVerifyBadge: "Захист від спаму",
    tgVerifyTitle: "Обов'язкова верифікація Telegram",
    tgVerifyDesc: "Перед відправкою напишіть нашому співробітнику. Не потрібно чекати на відповідь або схвалення, просто надішліть будь-яке повідомлення та подавайте заявку:",
    tgVerifyBtn: "Написати співробітнику",
    tgVerifyStep1: "Натисніть кнопку та надішліть будь-яке повідомлення",
    tgVerifyStep2: "Подавайте заповнену заявку на медіа",
    tgStatusIdle: "Очікування введення Telegram...",
    tgStatusChecking: "Перевірка діалогу в системі...",
    tgStatusOk: "Telegram підтверджено — можна надсилати заявку",
    tgStatusErr: "Діалог не знайдено — спочатку напишіть співробітнику!",
    sendApp: "Надіслати заявку",
    sendAppClosed: "Прийом заявок закрито",
    bugTitle: "Знайшли помилку чи баг?", bugDesc: "Повідомте нам у Telegram — швидко все виправимо",
    criteriaTitle: "Критерії медіа",
    yt1: "Від 50 підписників", yt2: "Стабільні 100+ переглядів на останніх роликах",
    yt3: "Тематика — Minecraft (HVH)", yt4: "Якісний монтаж",
    tt1: "Від 200 підписників", tt2: "Стабільні 600–700+ переглядів",
    tt3: "Тематика — Minecraft (HVH)", tt4: "Якісний монтаж",
    loginTitle: "Вхід за кодом акаунту", loginHint: "Введіть код, виданий адміністратором",
    loginBtn: "Увійти", gpsHint: "Потрібно підтвердити геолокацію — без неї вхід неможливий",
    tfaTitle: "Підтвердіть вхід",
    tfaDesc: "Ми надіслали запит у Telegram. Натисніть «✅ Підтвердити» у повідомленні від бота.",
    cancel: "Скасувати", confirm: "Підтвердити",

    // Плейсхолдери
    phUid: "Ваш UID у Delta Client",
    phVideos: "Наприклад: 2-3 ролики",
    phCollab: "З якими клієнтами/візуалами співпрацювали?",
    phWhy: "Розкажіть про себе, плани, досвід...",

    // Модальне вікно
    authTitle: "Вхід",
    authSub: "Особистий кабінет медіа-порталу",
    authCodeLabel: "код доступу",
    authForgot: "Забули код?",
    authRemember: "Запам'ятати мене",
    authSubmit: "Увійти",
    authSubmitLoading: "Вхід...",
    authTagline: "Контроль, дані та точність — в одному інструменті.",
    authPending: "Очікування підтвердження в Telegram...",
    authEnterCode: "Введіть код доступу",
    authSuccess: "Успішний вхід в акаунт!",
    authLoggedOut: "Ви вийшли з акаунту",
    authErrorConnection: "Помилка з'єднання із сервером",
    authAttemptDenied: "Вхід відхилено в Telegram",

    // Кабінет
    cabinetTitle: "Кабінет",
    cabinetModerator: "Кабінет модератора",
    cabinetMedia: "Кабінет медіа",
    cabinetFreemedia: "Кабінет фрімедіа",
    cabinetAdmin: "Кабінет адміністратора",
    tabHwid: "Скидання HWID",
    tabDiscord: "Discord бан",
    tabPayout: "Заявка на виплату",
    tabLot: "Заявка на лот",
    tabSub: "Запит підписки",
    tabMy: "Мої заявки",
    tabAdmin: "Адмін-панель",

    // Футер 1:1 з deltaclient.xyz
    footerTagline: "Клієнт, який робить тебе непереможним.",
    footerColPlatform: "Платформа",
    footerMainSite: "Головний сайт",
    footerLogin: "Увійти в акаунт",
    footerCabinet: "Кабінет",
    footerColNav: "Навігація",
    footerActivity: "Активність гравців",
    footerStore: "Продукти",
    footerDocs: "Документація",
    footerSupport: "Підтримка",
    footerColDocs: "Документи",
    footerPrivacy: "Політика конфіденційності",
    footerTerms: "Умови використання",
    footerRefund: "Повернення коштів",
    footerData: "Обробка даних",
    footerCopy: "© 2026 delta media portal. Усі права захищені.",

    // Техроботи
    maintenancePill: "delta media · технічні роботи",
    maintenanceTitle: "Технічні",
    maintenanceHighlight: "роботи",
    maintenanceDesc: "Ми проводимо планове оновлення порталу delta media. Незабаром повернемося до роботи.",
    timerHours: "годин",
    timerMinutes: "хвилин",
    timerSeconds: "секунд",
    maintenanceStaffHint: "Вхід у профіль під час техробіт дозволено лише адміністраторам та модераторам.",
  },
  en: {
    navApply: "Media application", navCabinet: "Dashboard",
    navDocs: "Documentation", navSupport: "Support",
    heroPill: "delta media · applications open",
    heroPillClosed: "delta media · applications closed",
    heroTitle: ["Become part of", "delta media"],
    heroDesc: "Fill out the form below to join delta media. Please double-check all entered information before submitting.",
    login: "Sign in", logout: "Sign out",
    qUid: "UID *", qCriteria: "Do you meet the criteria? *",
    yes: "Yes", no: "No", here: "here",
    criteriaHint: "Read the criteria",
    uidDigitsOnly: "Only digits are allowed in UID",
    qPlatform: "Platform *", pickPlatform: "Choose platform",
    qChannel: "Channel link *", channelHint: "Direct channel link, not a video",
    ytInvalidFormat: "Enter a direct channel link (e.g. https://youtube.com/@username)",
    ytVideoLinkErr: "Enter a link to the channel itself, not to a video or Shorts",
    ytFakeLinkErr: "Enter a real link to your channel",
    ttInvalidFormat: "Enter a direct TikTok account link (e.g. https://tiktok.com/@username)",
    ttVideoLinkErr: "Enter a link to your TikTok profile, not a video",
    ttFakeLinkErr: "Enter a real link to your TikTok account",
    qVideos: "Videos per week *", qCollab: "Collaborations *",
    qServers: "Servers *", pickServers: "Choose servers", other: "Other",
    qWhy: "Why you? *", qExclusive: "Are you ready to record only with Delta Client?", pickVariant: "Choose an option",
    qTg: "Telegram *",
    tgVerifyBadge: "Anti-Spam Shield",
    tgVerifyTitle: "Required Telegram Verification",
    tgVerifyDesc: "Before submitting, message our staff member. No need to wait for a reply or approval, just send any message and submit your application:",
    tgVerifyBtn: "Message Staff",
    tgVerifyStep1: "Tap the button and send any message",
    tgVerifyStep2: "Submit your completed media application",
    tgStatusIdle: "Waiting for Telegram handle...",
    tgStatusChecking: "Verifying dialogue in system...",
    tgStatusOk: "Telegram verified — ready to submit application",
    tgStatusErr: "Dialogue not found — please message our staff first!",
    sendApp: "Submit application",
    sendAppClosed: "Applications closed",
    bugTitle: "Found a bug?", bugDesc: "Tell us on Telegram — we fix things fast",
    criteriaTitle: "Media criteria",
    yt1: "50+ subscribers", yt2: "Stable 100+ views on recent videos",
    yt3: "Minecraft (HVH) content", yt4: "Quality editing",
    tt1: "200+ subscribers", tt2: "Stable 600–700+ views",
    tt3: "Minecraft (HVH) content", tt4: "Quality editing",
    loginTitle: "Sign in with account code", loginHint: "Enter the code given by the administrator",
    loginBtn: "Sign in", gpsHint: "Geolocation confirmation is required to sign in",
    tfaTitle: "Confirm sign-in",
    tfaDesc: "We sent a request to Telegram. Tap “✅ Подтвердить” in the bot message.",
    cancel: "Cancel", confirm: "Confirm",

    // Placeholders
    phUid: "Your UID in Delta Client",
    phVideos: "For example: 2-3 videos",
    phCollab: "Previous projects or servers?",
    phWhy: "Tell us about yourself, plans, experience...",

    // Modal window
    authTitle: "Sign In",
    authSub: "Media portal dashboard",
    authCodeLabel: "access code",
    authForgot: "Forgot code?",
    authRemember: "Remember me",
    authSubmit: "Sign in",
    authSubmitLoading: "Signing in...",
    authTagline: "Control, intel and precision — in one tool.",
    authPending: "Waiting for confirmation in Telegram...",
    authEnterCode: "Enter access code",
    authSuccess: "Successfully signed in!",
    authLoggedOut: "You have logged out",
    authErrorConnection: "Server connection error",
    authAttemptDenied: "Sign-in request denied in Telegram",

    // Cabinet
    cabinetTitle: "Dashboard",
    cabinetModerator: "Moderator Dashboard",
    cabinetMedia: "Media Dashboard",
    cabinetFreemedia: "Free-Media Dashboard",
    cabinetAdmin: "Admin Dashboard",
    tabHwid: "Reset HWID",
    tabDiscord: "Discord Ban",
    tabPayout: "Payout Request",
    tabLot: "Lot Request",
    tabSub: "Subscription Request",
    tabMy: "My Requests",
    tabAdmin: "Admin Panel",

    // Footer 1:1 with deltaclient.xyz
    footerTagline: "The client that makes you unstoppable.",
    footerColPlatform: "Platform",
    footerMainSite: "Main website",
    footerLogin: "Sign in",
    footerCabinet: "Account",
    footerColNav: "Navigation",
    footerActivity: "Player activity",
    footerStore: "Products",
    footerDocs: "Documentation",
    footerSupport: "Support",
    footerColDocs: "Documents",
    footerPrivacy: "Privacy Policy",
    footerTerms: "Terms of Service",
    footerRefund: "Refund Policy",
    footerData: "Data Processing",
    footerCopy: "© 2026 delta media portal. All rights reserved.",

    // Maintenance
    maintenancePill: "delta media · maintenance",
    maintenanceTitle: "Technical",
    maintenanceHighlight: "Maintenance",
    maintenanceDesc: "We are performing scheduled maintenance on the delta media portal. We will be back soon.",
    timerHours: "hours",
    timerMinutes: "minutes",
    timerSeconds: "seconds",
    maintenanceStaffHint: "Login during maintenance is only permitted for administrators and moderators.",
  },
};

let LANG = "ru";

function t(key) {
  if (I18N[LANG] && I18N[LANG][key] !== undefined) return I18N[LANG][key];
  if (I18N.ru && I18N.ru[key] !== undefined) return I18N.ru[key];
  return key;
}

function setLanguage(lang) {
  LANG = (lang === "en" || lang === "ua") ? lang : "ru";
  try { localStorage.setItem("delta_lang", LANG); } catch { /* ignore */ }
  document.documentElement.lang = LANG;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (I18N[LANG] && I18N[LANG][key] !== undefined) el.textContent = I18N[LANG][key];
  });

  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const key = el.getAttribute("data-i18n-ph");
    if (I18N[LANG] && I18N[LANG][key] !== undefined) el.placeholder = I18N[LANG][key];
  });

  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === LANG));

  const titles = {
    ru: "Delta Media — Портал заявок",
    ua: "Delta Media — Портал заявок",
    en: "Delta Media — Application Portal",
  };
  document.title = titles[LANG] || titles.ru;

  const path = "/" + LANG;
  if (location.pathname !== path && (location.pathname === "/" || location.pathname === "/ru" || location.pathname === "/ua" || location.pathname === "/uk" || location.pathname === "/en")) {
    history.replaceState({}, "", path + location.hash);
  }

  try {
    if (typeof applyHeroTitle === "function") applyHeroTitle();
  } catch (e) { /* ignore */ }
  try {
    if (typeof applyMaintenanceAnimations === "function") applyMaintenanceAnimations();
  } catch (e) { /* ignore */ }
  try {
    if (typeof updateCabinetBtn === "function") updateCabinetBtn();
  } catch (e) { /* ignore */ }
  
  // Если открыта модалка — обновляем печатающийся слоган
  const modal = document.getElementById("authModal");
  if (modal && modal.classList.contains("open") && typeof startTaglineTypewriter === "function") {
    try { startTaglineTypewriter(); } catch (e) { /* ignore */ }
  }

  // Обновляем статус набора заявок (открыт/закрыт)
  if (typeof updateAppsOpenUI === "function" && typeof SITE_CONFIG !== "undefined" && SITE_CONFIG && SITE_CONFIG.apps_open !== undefined) {
    updateAppsOpenUI(SITE_CONFIG.apps_open);
  }

  // Обновляем статус верификации Telegram
  try {
    if (typeof refreshTgVerifyUI === "function") refreshTgVerifyUI();
  } catch (e) { /* ignore */ }
}

