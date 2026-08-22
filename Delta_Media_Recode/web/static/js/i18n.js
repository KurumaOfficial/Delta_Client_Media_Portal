/* i18n.js — RU (основной) / EN для публичных частей и форм входа */
"use strict";

const I18N = {
  ru: {
    navApply: "Медиа заявка", navCabinet: "Кабинет",
    navDocs: "Документация", navSupport: "Поддержка",
    heroPill: "delta media · приём заявок открыт",
    heroTitle: ["Стань частью", "delta media"],
    heroDesc: "Заполни заявку — куратор рассмотрит её и ответит в Telegram. Контроль, скорость и поддержка — всё уже внутри.",
    login: "Войти", logout: "Выйти",
    qUid: "UID *", qCriteria: "Соответствуете критериям? *",
    yes: "Да", no: "Нет", here: "здесь",
    criteriaHint: "Ознакомьтесь с критериями",
    qPlatform: "Платформа *", pickPlatform: "Выберите платформу",
    qChannel: "Ссылка на канал *", channelHint: "Прямая ссылка на канал, не на видео",
    qVideos: "Роликов в неделю *", qCollab: "Сотрудничества *",
    qServers: "Серверы *", pickServers: "Выберите серверы", other: "Прочие",
    qWhy: "Почему вы? *", qExclusive: "Эксклюзивный контент? *", pickVariant: "Выберите вариант",
    qTg: "Telegram *",
    tgVerifyDesc: "Перед отправкой напишите нашему сотруднику — это защита от спама:",
    tgVerifyBtn: "Написать сотруднику",
    sendApp: "Отправить заявку",
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
  },
  en: {
    navApply: "Media application", navCabinet: "Dashboard",
    navDocs: "Documentation", navSupport: "Support",
    heroPill: "delta media · applications open",
    heroTitle: ["Become part of", "delta media"],
    heroDesc: "Fill the form — the curator will review it and reply on Telegram. Control, speed and support — all inside.",
    login: "Sign in", logout: "Sign out",
    qUid: "UID *", qCriteria: "Do you meet the criteria? *",
    yes: "Yes", no: "No", here: "here",
    criteriaHint: "Read the criteria",
    qPlatform: "Platform *", pickPlatform: "Choose platform",
    qChannel: "Channel link *", channelHint: "Direct channel link, not a video",
    qVideos: "Videos per week *", qCollab: "Collaborations *",
    qServers: "Servers *", pickServers: "Choose servers", other: "Other",
    qWhy: "Why you? *", qExclusive: "Exclusive content? *", pickVariant: "Choose an option",
    qTg: "Telegram *",
    tgVerifyDesc: "Before submitting, message our staff member — spam protection:",
    tgVerifyBtn: "Message the staff",
    sendApp: "Submit application",
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
  },
};

let LANG = "ru";

function setLanguage(lang) {
  LANG = lang === "en" ? "en" : "ru";
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (I18N[LANG][key] !== undefined) el.textContent = I18N[LANG][key];
  });
  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === LANG));
  document.title = LANG === "en" ? "Delta Media — Application Portal" : "Delta Media — Портал заявок";
  const path = location.pathname.startsWith("/en") ? "/en" : "/ru";
  history.replaceState({}, "", path + location.hash);
}
