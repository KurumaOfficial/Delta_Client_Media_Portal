/* app.js — точка входа: язык, вкладки, сессия, инициализация */
"use strict";

(function bootstrap() {
  // язык из маршрута
  setLanguage(location.pathname.startsWith("/en") ? "en" : "ru");
  applyHeroTitle();
  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.addEventListener("click", () => { setLanguage(b.dataset.lang); applyHeroTitle(); }));

  // переключение вкладок (общая функция — используется и кнопкой «Кабинет»)
  window.showView = async (name) => {
    document.querySelectorAll("#navTabs .nav-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll("main.view").forEach((v) => v.classList.remove("active"));
    const view = document.getElementById("view-" + name);
    view.classList.add("active");
    // перезапуск анимации
    view.style.animation = "none";
    void view.offsetWidth;
    view.style.animation = "";
    redrawHeaderLogo();
    if (name === "cabinet") await loadCabinet();
    if (name === "admin") await renderAdminCategory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  document.querySelectorAll("#navTabs .nav-btn").forEach((btn) =>
    btn.addEventListener("click", () => showView(btn.dataset.view)));

  // из админ-панели — обратно в кабинет
  document.getElementById("backToCabinet").addEventListener("click", () => showView("cabinet"));

  initAuthUI();
  initPublicForm();
  initAdminNav();

  // Turnstile грузим асинхронно только если включён на сервере
  loadSiteConfig().then(() => {
    if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = renderTurnstile;
      document.head.appendChild(s);
    }
  });

  // сессия: после входа сразу открываем кабинет
  // (админ-панель — вкладка внутри кабинета)
  loadSession().then(() => {
    if (CURRENT_ACCOUNT) {
      showView("cabinet");
      // heartbeat: пока страница открыта — сессия жива, закрыл — истечёт
      setInterval(() => { POST("/api/session/ping").catch(() => {}); }, 25000);
    }
  });
})();

// Логотип в хедере заново «отрисовывается» при каждом переключении вкладки
function redrawHeaderLogo() {
  const logo = document.querySelector(".brand-logo");
  if (!logo) return;
  const clone = logo.cloneNode(true);
  logo.replaceWith(clone);
}

// Побуквенное появление hero-заголовка (в стиле deltaclient.xyz)
function applyHeroTitle() {
  const el = document.getElementById("heroTitle");
  if (!el) return;
  const [plain, highlight] = I18N[LANG].heroTitle;
  let delay = 0;
  const split = (text) => text.split("").map((ch) => {
    const span = document.createElement("span");
    span.className = "ltr";
    span.style.animationDelay = (delay++ * 0.03) + "s";
    span.innerHTML = ch === " " ? "&nbsp;" : ch;
    return span.outerHTML;
  }).join("");
  // подсвеченное слово — один спан-обёртка со всеми буквами
  el.innerHTML = split(plain + " ") + `<span class="text-highlight">${split(highlight)}</span>`;
}
