/* auth.js — вход по коду: GPS → 2FA через Telegram → сессия */
"use strict";

let CURRENT_ACCOUNT = null;
let tfaTimer = null;

// Геолокация обязательна: без неё код даже не отправляется.
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Геолокация не поддерживается браузером"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy || 0)} м)`),
      () => reject(new Error("Без разрешения на геолокацию вход в аккаунт невозможна")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

async function startLogin() {
  const code = document.getElementById("loginCode").value.trim();
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!code) { errEl.textContent = "Введите код аккаунта"; return; }

  const btn = document.getElementById("loginSubmit");
  buttonState(btn, "", "Запрос геолокации…");
  let gps;
  if (SITE_CONFIG && SITE_CONFIG.gps_required === false) {
    gps = ""; // сервер не требует GPS (локальный режим)
  } else {
    try {
      gps = await getGPS();
    } catch (e) {
      buttonState(btn, "err", e.message, 3500);
      errEl.textContent = e.message;
      return;
    }
  }

  buttonState(btn, "", "Отправляем запрос…");
  let resp;
  try {
    resp = await POST("/api/auth/login", { code, gps });
  } catch (e) {
    const msg = e.tg_required ? e.error : e.message;
    buttonState(btn, "err", msg, 3500);
    errEl.textContent = msg;
    if (e.gps_required) errEl.textContent = e.error;
    return;
  }
  buttonState(btn, "ok", "Запрос отправлен");
  showTfaStep(resp.attempt_token, resp.expires_in || 300);
}

function showTfaStep(token, ttl) {
  document.getElementById("loginStep1").classList.add("hidden");
  document.getElementById("loginStep2").classList.remove("hidden");
  document.getElementById("tfaError").textContent = "";
  const deadline = Date.now() + ttl * 1000;

  tfaTimer = setInterval(async () => {
    if (Date.now() > deadline + 10000) { stopTfa("Время подтверждения истекло"); return; }
    let data;
    try {
      data = await GET("/api/auth/attempt/" + encodeURIComponent(token));
    } catch { return; }
    if (data.status === "pending") return;
    if (data.status === "approved") {
      stopTfa(null);
      toast("Вход выполнен ✅", "ok");
      location.reload();
      return;
    }
    stopTfa(data.error || "Вход не подтверждён");
  }, 2000);
}

function stopTfa(errorMsg) {
  clearInterval(tfaTimer); tfaTimer = null;
  if (!errorMsg) return;
  document.getElementById("tfaError").textContent = errorMsg;
  setTimeout(() => resetLoginModal(), 1800);
}

function resetLoginModal() {
  clearInterval(tfaTimer); tfaTimer = null;
  document.getElementById("loginStep2").classList.add("hidden");
  document.getElementById("loginStep1").classList.remove("hidden");
  document.getElementById("loginCode").value = "";
  const btn = document.getElementById("loginSubmit");
  buttonState(btn, "", I18N[LANG].loginBtn);
}

async function loadSession() {
  try {
    const data = await GET("/api/me");
    if (data.success && data.account) {
      CURRENT_ACCOUNT = data.account;
      applySessionUI();
      return true;
    }
  } catch { /* не авторизован */ }
  CURRENT_ACCOUNT = null;
  applySessionUI();
  return false;
}

const ROLE_TITLES = { admin: "Администратор", moderator: "Модератор", media: "Медиа", freemedia: "Фримедиа" };

function applySessionUI() {
  const loginBtn = document.getElementById("loginBtn");
  const chip = document.getElementById("userChip");
  const cabinetTab = document.querySelector('[data-view="cabinet"]');
  const adminTab = document.querySelector('[data-view="admin"]');
  if (CURRENT_ACCOUNT) {
    loginBtn.classList.add("hidden");
    chip.classList.remove("hidden");
    document.getElementById("userName").textContent = CURRENT_ACCOUNT.nickname;
    document.getElementById("userRole").textContent = ROLE_TITLES[CURRENT_ACCOUNT.role] || CURRENT_ACCOUNT.role;
    cabinetTab.classList.toggle("hidden", CURRENT_ACCOUNT.role === "admin");
    adminTab.classList.toggle("hidden", CURRENT_ACCOUNT.role !== "admin");
  } else {
    loginBtn.classList.remove("hidden");
    chip.classList.add("hidden");
    cabinetTab.classList.add("hidden");
    adminTab.classList.add("hidden");
  }
}

function initAuthUI() {
  document.getElementById("loginBtn").addEventListener("click", () => {
    resetLoginModal();
    openModal("loginModal");
    document.getElementById("gpsHint").classList.remove("hidden");
  });
  document.getElementById("loginSubmit").addEventListener("click", startLogin);
  document.getElementById("loginCode").addEventListener("keydown", (e) => { if (e.key === "Enter") startLogin(); });
  document.getElementById("tfaCancel").addEventListener("click", resetLoginModal);
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await POST("/api/logout");
    location.reload();
  });
}
