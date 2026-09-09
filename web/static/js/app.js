/* app.js — точка входа: язык, вкладки, сессия, инициализация */
"use strict";

// ═══ Состояние анимаций экрана техработ ═══
let maintTypewriterTimer = null;
let maintTypewriterInterval = null;

// Логотип в хедере заново «отрисовывается» при каждом переключении вкладки
function redrawHeaderLogo() {
  const logo = document.querySelector(".brand-logo");
  if (!logo) return;
  const clone = logo.cloneNode(true);
  logo.replaceWith(clone);
}
window.redrawHeaderLogo = redrawHeaderLogo;

// Побуквенное появление hero-заголовка (в стиле deltaclient.xyz)
function applyHeroTitle() {
  const el = document.getElementById("heroTitle");
  if (!el) return;
  if (!I18N || !I18N[LANG] || !I18N[LANG].heroTitle) return;
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
window.applyHeroTitle = applyHeroTitle;

// ═══ Анимации экрана техработ: побуквенный заголовок + печать описания ═══
function applyMaintenanceTitle() {
  const el = document.getElementById("maintenanceTitle");
  if (!el) return;
  const plain = (typeof t === "function" && t("maintenanceTitle")) || "Технические";
  const highlight = (typeof t === "function" && t("maintenanceHighlight")) || "работы";
  let delay = 0;
  const split = (text) => text.split("").map((ch) => {
    const span = document.createElement("span");
    span.className = "ltr";
    span.style.animationDelay = (delay++ * 0.035) + "s";
    span.innerHTML = ch === " " ? "&nbsp;" : ch;
    return span.outerHTML;
  }).join("");
  el.innerHTML = split(plain + " ") + `<span class="text-highlight">${split(highlight)}</span>`;
}
window.applyMaintenanceTitle = applyMaintenanceTitle;

function startMaintenanceTypewriter() {
  if (maintTypewriterTimer) {
    clearTimeout(maintTypewriterTimer);
    maintTypewriterTimer = null;
  }
  if (maintTypewriterInterval) {
    clearInterval(maintTypewriterInterval);
    maintTypewriterInterval = null;
  }

  const el = document.getElementById("maintenanceDesc");
  if (!el) return;

  const fullText = (typeof t === "function" && t("maintenanceDesc")) ||
    "Мы проводим плановое обновление портала delta media. Скоро вернемся к работе.";

  el.innerHTML = '<span class="typewriter-text"></span><span class="typewriter-cursor">|</span>';
  const textSpan = el.querySelector(".typewriter-text");
  const cursor = el.querySelector(".typewriter-cursor");

  let i = 0;
  maintTypewriterTimer = setTimeout(() => {
    maintTypewriterInterval = setInterval(() => {
      if (i < fullText.length) {
        if (textSpan) textSpan.textContent += fullText.charAt(i);
        i++;
      } else {
        clearInterval(maintTypewriterInterval);
        maintTypewriterInterval = null;
        if (cursor) cursor.classList.add("cursor-done");
      }
    }, 22);
  }, 350);
}
window.startMaintenanceTypewriter = startMaintenanceTypewriter;

function applyMaintenanceAnimations() {
  applyMaintenanceTitle();
  startMaintenanceTypewriter();
}
window.applyMaintenanceAnimations = applyMaintenanceAnimations;

(function bootstrap() {
  // 1. Общая функция переключения вкладок (используется и кнопкой «Кабинет»)
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

    const isOverview = (name === "admin" && typeof adminCat !== "undefined" && adminCat === "overview");
    document.documentElement.classList.toggle("admin-overview-page", isOverview);
    document.body.classList.toggle("admin-overview-page", isOverview);

    // Футер отображается на главной странице и на странице техработ
    const footer = document.querySelector(".site-footer");
    if (footer) {
      footer.style.display = (name === "public" || name === "maintenance") ? "block" : "none";
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
      } else if (name === "cabinet" || name === "admin") {
        const targetPath = "/" + (LANG === "ru" ? "" : LANG);
        if (location.pathname === "/maintenance") {
          history.pushState({ view: name }, "", targetPath || "/");
        }
      }
    }

    redrawHeaderLogo();
    if (name === "cabinet") await loadCabinet();
    if (name === "admin") await renderAdminCategory();
    if (name === "public") applyHeroTitle();
    if (name === "maintenance") applyMaintenanceAnimations();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 2. Вкладки навигации
  document.querySelectorAll("#navTabs .nav-btn[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => showView(btn.dataset.view)));

  // Клик по логотипу и "delta media" в шапке — возврат на главную или экран техработ
  const brandLogo = document.getElementById("brandLogo");
  if (brandLogo) {
    brandLogo.addEventListener("click", (e) => {
      e.preventDefault();
      const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
      const staff = typeof isStaff === "function" && isStaff();
      if (isMaint && !staff) {
        showView("maintenance");
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

  // 3. Инициализация UI модулей
  initAuthUI();
  initPublicForm();
  initAdminNav();

  // 4. Язык из маршрута или сохранённый
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

  // 5. Инициализация приложения: проверка «Запомнить меня», конфиг и сессия
  (async () => {
    // Проверка галочки «Запомнить меня»:
    // Если пользователь вошёл без галочки «Запомнить меня» (delta_remember === "0"), то при обновлении страницы (F5)
    // происходит разлогин и выкидывает из аккаунта
    const remVal = localStorage.getItem("delta_remember");
    if (remVal === "0") {
      try {
        await POST("/api/logout");
      } catch { /* ignore */ }
      CURRENT_ACCOUNT = null;
      localStorage.removeItem("delta_remember");
    }
    const remember = remVal === "1";

    // Загрузка конфигурации сайта (техработы, приём заявок, turnstile)
    await loadSiteConfig();

    if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = renderTurnstile;
      document.head.appendChild(s);
    }

    // Загрузка активной сессии (только если «Запомнить меня» было включено)
    if (remember) {
      await loadSession();
    } else {
      updateCabinetBtn();
    }

    // Определение начального экрана и маршрута
    const isMaintRoute = location.pathname === "/maintenance";
    const isMaintActive = !!(SITE_CONFIG && SITE_CONFIG.maintenance_enabled);
    const staff = typeof isStaff === "function" && isStaff();

    if (isMaintActive && !staff) {
      if (location.pathname !== "/maintenance") {
        history.replaceState({ view: "maintenance" }, "", "/maintenance");
      }
      showView("maintenance", false);
    } else if (CURRENT_ACCOUNT) {
      showView(isMaintRoute ? "maintenance" : "cabinet", false);
    } else if (isMaintRoute) {
      showView("maintenance", false);
    } else {
      showView("public", false);
    }
  })();
})();
