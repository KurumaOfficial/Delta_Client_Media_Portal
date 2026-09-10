/* auth.js — авторизация по коду и сессия (1:1 Delta Client) */
"use strict";

let CURRENT_ACCOUNT = null;
let authPollInterval = null;

function isStaff() {
  return !!(CURRENT_ACCOUNT && (CURRENT_ACCOUNT.role === "admin" || CURRENT_ACCOUNT.role === "moderator"));
}

let sessionHeartbeatTimer = null;

function startSessionHeartbeat() {
  stopSessionHeartbeat();
  if (!CURRENT_ACCOUNT) return;
  sessionHeartbeatTimer = setInterval(async () => {
    if (!CURRENT_ACCOUNT) {
      stopSessionHeartbeat();
      return;
    }
    try {
      const res = await POST("/api/session/ping");
      if (res && res._status === 401) {
        handleSessionExpired();
      }
    } catch (err) {
      if (err && err._status === 401) {
        handleSessionExpired();
      }
    }
  }, 20000);
}

function stopSessionHeartbeat() {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }
}

function handleSessionExpired() {
  if (!CURRENT_ACCOUNT) return;
  CURRENT_ACCOUNT = null;
  stopSessionHeartbeat();
  if (typeof stopModNotificationsWatcher === "function") stopModNotificationsWatcher();
  document.body.classList.remove("user-is-staff");
  updateCabinetBtn();
  if (typeof updateMaintenanceUI === "function") updateMaintenanceUI();
  const currentView = document.querySelector("main.view.active")?.id;
  if (currentView === "view-cabinet" || currentView === "view-admin") {
    const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
    if (typeof showView === "function") {
      showView(isMaint ? "maintenance" : "public", true);
    }
    openAuth();
  }
}
window.startSessionHeartbeat = startSessionHeartbeat;
window.stopSessionHeartbeat = stopSessionHeartbeat;
window.handleSessionExpired = handleSessionExpired;

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
      startSessionHeartbeat();
      if (CURRENT_ACCOUNT.role === "moderator" && typeof startModNotificationsWatcher === "function") {
        startModNotificationsWatcher();
      }
      return CURRENT_ACCOUNT;
    }
  } catch {
    CURRENT_ACCOUNT = null;
  }
  stopSessionHeartbeat();
  if (typeof stopModNotificationsWatcher === "function") stopModNotificationsWatcher();
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

// ═══ Защита от подбора кода (максимум 3 неверных ввода в день) ═══
try {
  if (localStorage.getItem("delta_lockout_reset_v2") !== "done") {
    localStorage.removeItem("delta_login_lock_until");
    localStorage.removeItem("delta_failed_login_attempts");
    localStorage.setItem("delta_lockout_reset_v2", "done");
  }
} catch (_) {}

function checkBrowserLoginLock() {
  const lockUntil = parseInt(localStorage.getItem("delta_login_lock_until") || "0", 10);
  const now = Date.now();
  if (lockUntil && now < lockUntil) {
    const hoursLeft = Math.max(1, Math.ceil((lockUntil - now) / (1000 * 60 * 60)));
    return {
      locked: true,
      msg: `Превышен лимит попыток (3 неверных ввода). Вход заблокирован на ${hoursLeft} ч. для защиты от подбора кода.`,
    };
  }
  if (lockUntil && now >= lockUntil) {
    localStorage.removeItem("delta_login_lock_until");
    localStorage.removeItem("delta_failed_login_attempts");
  }
  const fails = parseInt(localStorage.getItem("delta_failed_login_attempts") || "0", 10);
  return { locked: false, fails };
}

function recordBrowserFailedAttempt() {
  let fails = parseInt(localStorage.getItem("delta_failed_login_attempts") || "0", 10) + 1;
  localStorage.setItem("delta_failed_login_attempts", fails);
  if (fails >= 3) {
    const lockUntil = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem("delta_login_lock_until", lockUntil);
    return {
      locked: true,
      msg: "Превышен лимит попыток (3 неверных ввода). Вход заблокирован на 24 часа для защиты от подбора кода.",
    };
  }
  return {
    locked: false,
    fails,
    remaining: 3 - fails,
  };
}

function clearBrowserLoginLock() {
  localStorage.removeItem("delta_failed_login_attempts");
  localStorage.removeItem("delta_login_lock_until");
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

  // Проверка лимита попыток в браузере (localStorage)
  const lock = checkBrowserLoginLock();
  const codeInput = document.getElementById("authCode");
  const submitBtn = document.getElementById("authSubmit");

  if (lock.locked) {
    setAuthError(lock.msg);
    if (codeInput) codeInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
  } else {
    if (codeInput) codeInput.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
    if (lock.fails > 0) {
      setAuthError(`Осталось попыток ввода: ${3 - lock.fails} из 3`);
    }
  }

  // Рендерим Turnstile капчу
  if (typeof renderTurnstile === "function") {
    setTimeout(renderTurnstile, 50);
  }

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  
  setTimeout(() => {
    if (codeInput && !lock.locked) codeInput.focus();
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

  // Переход на подачу заявки: «не член? войти сейчас»
  document.getElementById("authApplyLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeAuth();
    if (typeof showView === "function") {
      showView("public");
    }
    const form = document.getElementById("mediaForm");
    if (form) {
      setTimeout(() => {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  });

  // Функция выхода из аккаунта
  async function doUserLogout() {
    try {
      await POST("/api/logout");
    } catch { /* ignore */ }
    CURRENT_ACCOUNT = null;
    stopSessionHeartbeat();
    if (typeof stopModNotificationsWatcher === "function") stopModNotificationsWatcher();
    localStorage.removeItem("delta_remember");
    document.body.classList.remove("user-is-staff");
    updateCabinetBtn();
    if (typeof updateMaintenanceUI === "function") {
      updateMaintenanceUI();
    }
    const isMaint = SITE_CONFIG && SITE_CONFIG.maintenance_enabled;
    if (typeof showView === "function") {
      showView(isMaint ? "maintenance" : "public");
    }
    toast(t("authLoggedOut"));
  }
  window.doUserLogout = doUserLogout;

  // Кнопка выхода из кабинета
  document.getElementById("cabinetLogout")?.addEventListener("click", doUserLogout);

  // Отправка формы входа
  document.getElementById("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setAuthError("");

    // Проверка браузерной блокировки
    const lock = checkBrowserLoginLock();
    if (lock.locked) {
      setAuthError(lock.msg);
      return;
    }
    
    const codeInput = document.getElementById("authCode");
    const code = codeInput ? codeInput.value.trim().toUpperCase() : "";
    if (!code) {
      setAuthError(t("authEnterCode"));
      return;
    }

    // Проверка Cloudflare Turnstile капчи
    let turnstile_token = "";
    if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled) {
      turnstile_token = (typeof getLoginTurnstileToken === "function") ? getLoginTurnstileToken() : "";
      if (!turnstile_token) {
        setAuthError("Пройдите проверку на бота (капчу)");
        return;
      }
    }

    const remBox = document.getElementById("authRemember");
    const rememberMe = !!(remBox && remBox.checked);

    setAuthLoading(true);

    let gps = "";
    try {
      gps = await getGeoPosition();
    } catch { /* ignore */ }

    try {
      const res = await POST("/api/auth/login", { code, gps, turnstile_token });
      if (!res.success) {
        const failStatus = recordBrowserFailedAttempt();
        if (typeof resetLoginTurnstile === "function") resetLoginTurnstile();
        if (failStatus.locked) {
          setAuthError(failStatus.msg);
          if (codeInput) codeInput.disabled = true;
        } else {
          setAuthError(res.error || `Неверный код доступа. Осталось попыток: ${failStatus.remaining} из 3`);
        }
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

            // Успешный вход — очищаем счётчик неудачных попыток в браузере
            clearBrowserLoginLock();

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
            const failStatus = recordBrowserFailedAttempt();
            if (typeof resetLoginTurnstile === "function") resetLoginTurnstile();
            if (failStatus.locked) {
              setAuthError(failStatus.msg);
              if (codeInput) codeInput.disabled = true;
            } else {
              setAuthError(statusRes.error || t("authAttemptDenied"));
            }
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
      if (typeof resetLoginTurnstile === "function") resetLoginTurnstile();
      if (err._status === 401 || err._status === 429) {
        const failStatus = recordBrowserFailedAttempt();
        if (failStatus.locked) {
          setAuthError(failStatus.msg);
          if (codeInput) codeInput.disabled = true;
          const submitBtn = document.getElementById("authSubmit");
          if (submitBtn) submitBtn.disabled = true;
        } else {
          setAuthError(err.message || `Неверный код доступа. Осталось попыток: ${failStatus.remaining} из 3`);
        }
      } else {
        setAuthError(err.message || t("authErrorConnection"));
      }
      setAuthLoading(false);
    }
  });
}
