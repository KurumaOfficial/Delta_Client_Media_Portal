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
  window.showView = async (name, pushUrl = true) => {
    const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
    const staff = typeof isStaff === "function" && isStaff();
    if (isMaint && !staff && name !== "maintenance") {
      name = "maintenance";
    }

    document.querySelectorAll("main.view").forEach((v) => v.classList.remove("active"));
    const view = document.getElementById("view-" + name);
    if (!view) return;
    view.classList.add("active");

    // Затемняющий блюр 1:1 deltaclient.xyz/docs в кабинете всех ролей и в админке
    document.body.classList.toggle("page-cabinet", name === "cabinet");
    document.body.classList.toggle("page-admin", name === "admin");
    document.body.classList.toggle("page-maintenance", name === "maintenance");

    // Футер отображается только на главной странице
    const footer = document.querySelector(".site-footer");
    if (footer) {
      footer.style.display = (name === "public") ? "block" : "none";
    }

    if (pushUrl) {
      if (name === "maintenance") {
        if (location.pathname !== "/maintenance") {
          history.pushState({ view: "maintenance" }, "", "/maintenance");
        }
      } else if (name === "public") {
        const targetPath = "/" + (LANG === "ru" ? "" : LANG);
        if (location.pathname !== targetPath && location.pathname !== (targetPath || "/")) {
          history.pushState({ view: "public" }, "", targetPath || "/");
        }
      }
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
      const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
      const staff = typeof isStaff === "function" && isStaff();
      if (isMaint && !staff) {
        return;
      }
      showView("public");
      window.scrollTo({ top: 0, behavior: "smooth" });
      const targetPath = "/" + (LANG === "ru" ? "" : LANG);
      if (location.pathname !== targetPath) {
        history.pushState({ view: "public" }, "", targetPath || "/");
      }
    });
  }

  // История браузера: кнопка назад/вперёд
  window.addEventListener("popstate", () => {
    if (location.pathname === "/maintenance") {
      showView("maintenance", false);
    } else {
      const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
      const staff = typeof isStaff === "function" && isStaff();
      if (isMaint && !staff) {
        showView("maintenance", false);
      } else {
        showView("public", false);
      }
    }
  });

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

  // Инициализация приложения: проверка «Запомнить меня», конфиг и сессия
  (async () => {
    // 1. Проверка галочки «Запомнить меня»:
    // Если пользователь вошёл без галочки «Запомнить меня», то при обновлении страницы (F5)
    // происходит разлогин и выкидывает из аккаунта
    const remember = localStorage.getItem("delta_remember") === "1";
    if (!remember) {
      try {
        await POST("/api/logout");
      } catch { /* ignore */ }
      CURRENT_ACCOUNT = null;
      localStorage.removeItem("delta_remember");
    }

    // 2. Загрузка конфигурации сайта (техработы, приём заявок, turnstile)
    await loadSiteConfig();

    if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = renderTurnstile;
      document.head.appendChild(s);
    }

    // 3. Загрузка активной сессии (только если «Запомнить меня» было включено)
    if (remember) {
      await loadSession();
    } else {
      updateCabinetBtn();
    }

    // 4. Определение начального экрана и маршрута
    const isMaintRoute = location.pathname === "/maintenance";
    const isMaintActive = !!(SITE_CONFIG && SITE_CONFIG.maintenance_enabled);
    const staff = typeof isStaff === "function" && isStaff();

    if (isMaintActive && !staff) {
      if (location.pathname !== "/maintenance") {
        history.replaceState({ view: "maintenance" }, "", "/maintenance");
      }
      showView("maintenance", false);
    } else if (isMaintRoute) {
      showView("maintenance", false);
    } else if (CURRENT_ACCOUNT) {
      showView("cabinet", false);
      setInterval(() => { POST("/api/session/ping").catch(() => {}); }, 25000);
    } else {
      showView("public", false);
    }
  })();
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
