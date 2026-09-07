/* app.js — точка входа: язык, вкладки, сессия, инициализация */
"use strict";

(function bootstrap() {
  // язык из маршрута или сохранённый
  let initLang = "ru";
  if (location.pathname.startsWith("/en")) initLang = "en";
  else if (location.pathname.startsWith("/ua") || location.pathname.startsWith("/uk")) initLang = "ua";
  else {
    try {
      const saved = localStorage.getItem("delta_lang");
      if (saved && (saved === "ru" || saved === "ua" || saved === "en")) initLang = saved;
    } catch { /* ignore */ }
  }
  setLanguage(initLang);
  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.addEventListener("click", () => setLanguage(b.dataset.lang)));

  // переключение вкладок (общая функция — используется и кнопкой «Кабинет»)
  window.showView = async (name) => {
    document.querySelectorAll("main.view").forEach((v) => v.classList.remove("active"));
    const view = document.getElementById("view-" + name);
    if (!view) return;
    view.classList.add("active");

    // Затемняющий блюр 1:1 deltaclient.xyz/docs в кабинете всех ролей и в админке
    document.body.classList.toggle("page-cabinet", name === "cabinet");
    document.body.classList.toggle("page-admin", name === "admin");

    // Футер отображается только на главной странице
    const footer = document.querySelector(".site-footer");
    if (footer) {
      footer.style.display = (name === "public") ? "block" : "none";
    }

    redrawHeaderLogo();
    if (name === "cabinet") await loadCabinet();
    if (name === "admin") await renderAdminCategory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  document.querySelectorAll("#navTabs .nav-btn[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => showView(btn.dataset.view)));

  // Клик по логотипу и "delta media" в шапке — возврат на главную
  const brandLogo = document.getElementById("brandLogo");
  if (brandLogo) {
    brandLogo.addEventListener("click", (e) => {
      e.preventDefault();
      showView("public");
      window.scrollTo({ top: 0, behavior: "smooth" });
      const targetPath = "/" + (LANG === "ru" ? "" : LANG);
      if (location.pathname !== targetPath) {
        history.pushState({}, "", targetPath || "/");
      }
    });
  }

  // Анимация цветного логотипа в футере при прокрутке к нему
  const footerLogo = document.querySelector(".footer-logo");
  if (footerLogo && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const clone = entry.target.cloneNode(true);
          entry.target.replaceWith(clone);
          obs.unobserve(clone);
        }
      });
    }, { threshold: 0.1 });
    obs.observe(footerLogo);
  }

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
