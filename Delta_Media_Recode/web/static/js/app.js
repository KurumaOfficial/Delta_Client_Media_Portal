/* app.js — точка входа: язык, вкладки, сессия, инициализация */
"use strict";

(function bootstrap() {
  // язык из маршрута
  setLanguage(location.pathname.startsWith("/en") ? "en" : "ru");
  document.querySelectorAll(".lang-switch button").forEach((b) =>
    b.addEventListener("click", () => setLanguage(b.dataset.lang)));

  // вкладки
  document.querySelectorAll("#navTabs .nav-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#navTabs .nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll("main.view").forEach((v) => v.classList.remove("active"));
      const view = document.getElementById("view-" + btn.dataset.view);
      view.classList.add("active");
      // перезапуск анимации
      view.style.animation = "none";
      void view.offsetWidth;
      view.style.animation = "";
      if (btn.dataset.view === "cabinet") await loadCabinet();
      if (btn.dataset.view === "admin") await renderAdminCategory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));

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

  // сессия: показываем кабинет/админку тем, у кого есть права
  loadSession().then(() => {
    if (CURRENT_ACCOUNT && CURRENT_ACCOUNT.role !== "admin") {
      // сразу открываем кабинет после входа
      document.querySelector('[data-view="cabinet"]').click();
    }
  });
})();
