/* auth.js — авторизация по коду и сессия (1:1 Delta Client) */
"use strict";

let CURRENT_ACCOUNT = null;
let authPollInterval = null;

function isStaff() {
  return !!(CURRENT_ACCOUNT && (CURRENT_ACCOUNT.role === "admin" || CURRENT_ACCOUNT.role === "moderator"));
}

async function loadSession() {
  try {
    const res = await GET("/api/me");
    if (res && res.success && res.account) {
      CURRENT_ACCOUNT = res.account;
      if (isStaff()) {
        document.body.classList.add("user-is-staff");
      } else {
        document.body.classList.remove("user-is-staff");
      }
      updateCabinetBtn();
      if (typeof updateMaintenanceUI === "function") updateMaintenanceUI();
      return CURRENT_ACCOUNT;
    }
  } catch {
    CURRENT_ACCOUNT = null;
  }
  document.body.classList.remove("user-is-staff");
  updateCabinetBtn();
  if (typeof updateMaintenanceUI === "function") updateMaintenanceUI();
  return null;
}

function updateCabinetBtn() {
  const btn = document.getElementById("cabinetBtn");
  if (!btn) return;
  const label = CURRENT_ACCOUNT ? esc(CURRENT_ACCOUNT.nickname || t("navCabinet")) : t("navCabinet");
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
    ${label}
  `;
}

let taglineTimer = null;
let taglineInterval = null;

function restartAuthLogo() {
  const logo = document.getElementById("authLogoSvg");
  if (!logo) return;
  const clone = logo.cloneNode(true);
  logo.replaceWith(clone);
}

function stopTaglineTypewriter() {
  if (taglineTimer) {
    clearTimeout(taglineTimer);
    taglineTimer = null;
  }
  if (taglineInterval) {
    clearInterval(taglineInterval);
    taglineInterval = null;
  }
}

function startTaglineTypewriter() {
  stopTaglineTypewriter();
  const el = document.getElementById("authTagline");
  if (!el) return;

  const fullText = (I18N[LANG] && I18N[LANG].authTagline) || "Контроль, данные и точность — в одном инструменте.";
  el.innerHTML = '<span class="typewriter-text"></span><span class="typewriter-cursor">|</span>';
  const textSpan = el.querySelector(".typewriter-text");
  const cursor = el.querySelector(".typewriter-cursor");

  let i = 0;
  // Запуск печати после выезда левой панели
  taglineTimer = setTimeout(() => {
    taglineInterval = setInterval(() => {
      if (i < fullText.length) {
        textSpan.textContent += fullText.charAt(i);
        i++;
      } else {
        clearInterval(taglineInterval);
        taglineInterval = null;
        if (cursor) cursor.classList.add("cursor-done");
      }
    }, 28);
  }, 320);
}

function openAuth() {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  
  // сброс формы и состояния
  const form = document.getElementById("authForm");
  if (form) form.reset();

  const remBox = document.getElementById("authRemember");
  if (remBox) {
    remBox.checked = localStorage.getItem("delta_remember") === "1";
  }

  setAuthError("");
  setAuthLoading(false);
  
  const pending = document.getElementById("auth2faPending");
  if (pending) pending.classList.add("hidden");
  
  if (authPollInterval) {
    clearInterval(authPollInterval);
    authPollInterval = null;
  }

  // Перезапуск анимации SVG логотипа (обводка + заливка)
  restartAuthLogo();

  // Запуск эффекта печатания текста слогана
  startTaglineTypewriter();

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  
  setTimeout(() => {
    const input = document.getElementById("authCode");
    if (input) input.focus();
  }, 100);
}

function closeAuth() {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
  
  if (authPollInterval) {
    clearInterval(authPollInterval);
    authPollInterval = null;
  }
  stopTaglineTypewriter();
}

function setAuthError(msg) {
  const errEl = document.getElementById("authError");
  if (!errEl) return;
  if (msg) {
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
  } else {
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }
}

function setAuthLoading(loading) {
  const btn = document.getElementById("authSubmit");
  const text = document.getElementById("authSubmitText");
  const arrow = document.getElementById("authSubmitArrow");
  const spinner = document.getElementById("authSpinner");
  
  if (btn) btn.disabled = loading;
  if (text) text.textContent = loading ? t("authSubmitLoading") : t("authSubmit");
  if (arrow) arrow.classList.toggle("hidden", loading);
  if (spinner) spinner.classList.toggle("hidden", !loading);
}

async function getGeoPosition() {
  if (!navigator.geolocation) return "";
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 4000,
        maximumAge: 60000,
      });
    });
    return `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
  } catch {
    return "";
  }
}

function initAuthUI() {
  // Кнопка «Кабинет» в шапке
  const cabBtn = document.getElementById("cabinetBtn");
  if (cabBtn && !cabBtn.dataset.bound) {
    cabBtn.dataset.bound = "1";
    cabBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (CURRENT_ACCOUNT) {
        showView("cabinet");
      } else {
        openAuth();
      }
    });
  }



  // Закрытие модалки
  document.getElementById("authCloseBtn")?.addEventListener("click", closeAuth);
  document.getElementById("authBackdrop")?.addEventListener("click", closeAuth);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("authModal")?.classList.contains("open")) {
      closeAuth();
    }
  });

  // Кнопка выхода из кабинета
  document.getElementById("cabinetLogout")?.addEventListener("click", async () => {
    try {
      await POST("/api/logout");
    } catch { /* ignore */ }
    CURRENT_ACCOUNT = null;
    localStorage.removeItem("delta_remember");
    document.body.classList.remove("user-is-staff");
    updateCabinetBtn();
    if (typeof updateMaintenanceUI === "function") {
      updateMaintenanceUI();
    } else {
      showView("public");
    }
    toast(t("authLoggedOut"));
  });

  // Отправка формы входа
  document.getElementById("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthError("");
    
    const codeInput = document.getElementById("authCode");
    const code = codeInput ? codeInput.value.trim().toUpperCase() : "";
    if (!code) {
      setAuthError(t("authEnterCode"));
      return;
    }

    const remBox = document.getElementById("authRemember");
    const rememberMe = !!(remBox && remBox.checked);

    setAuthLoading(true);

    let gps = "";
    try {
      gps = await getGeoPosition();
    } catch { /* ignore */ }

    try {
      const res = await POST("/api/auth/login", { code, gps });
      if (!res.success) {
        setAuthError(res.error || t("authErrorConnection"));
        setAuthLoading(false);
        return;
      }

      // Если вернулся attempt_token — ждём подтверждения (2FA / DEV mode)
      const token = res.attempt_token;
      if (!token) {
        setAuthError(t("authErrorConnection"));
        setAuthLoading(false);
        return;
      }

      const pendingEl = document.getElementById("auth2faPending");
      if (pendingEl) pendingEl.classList.remove("hidden");

      // Поллинг статуса попытки
      if (authPollInterval) clearInterval(authPollInterval);
      authPollInterval = setInterval(async () => {
        try {
          const statusRes = await GET("/api/auth/attempt/" + encodeURIComponent(token));
          if (statusRes.status === "approved") {
            clearInterval(authPollInterval);
            authPollInterval = null;

            if (rememberMe) {
              localStorage.setItem("delta_remember", "1");
            } else {
              localStorage.setItem("delta_remember", "0");
            }

            await loadSession();
            closeAuth();
            if (isStaff()) {
              showView("cabinet");
            } else if (SITE_CONFIG && SITE_CONFIG.maintenance_enabled) {
              showView("maintenance");
            } else {
              showView("cabinet");
            }
            toast(t("authSuccess"));
          } else if (statusRes.status === "denied" || statusRes.status === "expired") {
            clearInterval(authPollInterval);
            authPollInterval = null;
            setAuthError(statusRes.error || t("authAttemptDenied"));
            if (pendingEl) pendingEl.classList.add("hidden");
            setAuthLoading(false);
          }
        } catch (pollErr) {
          clearInterval(authPollInterval);
          authPollInterval = null;
          setAuthError(pollErr.message || t("authErrorConnection"));
          if (pendingEl) pendingEl.classList.add("hidden");
          setAuthLoading(false);
        }
      }, 1000);

    } catch (err) {
      setAuthError(err.message || t("authErrorConnection"));
      setAuthLoading(false);
    }
  });
}
