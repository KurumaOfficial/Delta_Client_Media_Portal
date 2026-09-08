/* public.js — публичная форма заявки на вступление в медиа */
"use strict";

let SITE_CONFIG = null;
let turnstileWidgetId = null;

async function loadSiteConfig() {
  try {
    SITE_CONFIG = await GET("/api/health");
    const staff = SITE_CONFIG.staff_contact || "notyxs";
    const admin = SITE_CONFIG.admin_contact || "notyxx";
    const staffBtn = document.getElementById("staffContactBtn");
    if (staffBtn) staffBtn.href = "https://t.me/" + staff;
    const bugBtn = document.getElementById("bugReportBtn");
    if (bugBtn) bugBtn.href = "https://t.me/" + admin;
    const forgotBtn = document.getElementById("authForgot");
    if (forgotBtn) forgotBtn.href = "https://t.me/" + admin;
    if (!SITE_CONFIG.turnstile_enabled) {
      document.getElementById("captchaField")?.classList.add("hidden");
      document.getElementById("loginCaptcha")?.classList.add("hidden");
    }
    updateAppsOpenUI(SITE_CONFIG.apps_open !== false);
    updateMaintenanceUI();
  } catch {
    SITE_CONFIG = {};
    updateAppsOpenUI(true);
    updateMaintenanceUI();
  }
}

let maintenanceTimerInterval = null;

function updateMaintenanceUI() {
  if (!SITE_CONFIG) return;
  const isMaint = !!SITE_CONFIG.maintenance_enabled;
  const staff = typeof isStaff === "function" && isStaff();

  if (isMaint) {
    document.body.classList.add("maintenance-active");
    if (staff) {
      document.body.classList.add("user-is-staff");
    } else {
      document.body.classList.remove("user-is-staff");
      if (typeof showView === "function") {
        showView("maintenance");
      }
    }
    startMaintenanceCountdown(SITE_CONFIG.maintenance_until, SITE_CONFIG.maintenance_seconds_left);
  } else {
    document.body.classList.remove("maintenance-active");
    document.body.classList.remove("user-is-staff");
    if (maintenanceTimerInterval) {
      clearInterval(maintenanceTimerInterval);
      maintenanceTimerInterval = null;
    }
    const maintView = document.getElementById("view-maintenance");
    if (maintView && maintView.classList.contains("active")) {
      if (typeof showView === "function") {
        showView("public");
      }
    }
  }
}

function startMaintenanceCountdown(untilDateStr, initialSecLeft) {
  if (maintenanceTimerInterval) {
    clearInterval(maintenanceTimerInterval);
    maintenanceTimerInterval = null;
  }

  let targetTime = 0;
  if (untilDateStr) {
    const parsed = new Date(untilDateStr).getTime();
    if (!isNaN(parsed)) targetTime = parsed;
  }
  if (!targetTime && initialSecLeft && initialSecLeft > 0) {
    targetTime = Date.now() + initialSecLeft * 1000;
  }

  function tick() {
    if (!targetTime) {
      updateTimerDisplay(0, 0, 0);
      return;
    }
    const now = Date.now();
    let diff = Math.max(0, Math.floor((targetTime - now) / 1000));

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    updateTimerDisplay(hours, minutes, seconds);

    if (diff <= 0) {
      if (maintenanceTimerInterval) {
        clearInterval(maintenanceTimerInterval);
        maintenanceTimerInterval = null;
      }
      setTimeout(async () => {
        await loadSiteConfig();
      }, 1500);
    }
  }

  tick();
  maintenanceTimerInterval = setInterval(tick, 1000);
}

function updateTimerDisplay(h, m, s) {
  const elH = document.getElementById("timerHours");
  const elM = document.getElementById("timerMinutes");
  const elS = document.getElementById("timerSeconds");
  if (elH) elH.textContent = String(h).padStart(2, "0");
  if (elM) elM.textContent = String(m).padStart(2, "0");
  if (elS) elS.textContent = String(s).padStart(2, "0");
}

function updateAppsOpenUI(isOpen) {
  const pill = document.querySelector(".hero-pill");
  const pillText = pill ? pill.querySelector("[data-i18n]") : null;
  const submitBtn = document.getElementById("mediaSubmit");

  if (isOpen) {
    if (pill) pill.classList.remove("closed");
    if (pillText) {
      pillText.setAttribute("data-i18n", "heroPill");
      pillText.textContent = t("heroPill");
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("disabled");
      submitBtn.setAttribute("data-i18n", "sendApp");
      submitBtn.textContent = t("sendApp");
    }
  } else {
    if (pill) pill.classList.add("closed");
    if (pillText) {
      pillText.setAttribute("data-i18n", "heroPillClosed");
      pillText.textContent = t("heroPillClosed");
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("disabled");
      submitBtn.setAttribute("data-i18n", "sendAppClosed");
      submitBtn.textContent = t("sendAppClosed");
    }
  }
}

function renderTurnstile() {
  if (!SITE_CONFIG || !SITE_CONFIG.turnstile_enabled || !window.turnstile) return;
  if (turnstileWidgetId === null && document.getElementById("turnstileBox")) {
    turnstileWidgetId = window.turnstile.render("#turnstileBox", {
      sitekey: SITE_CONFIG.turnstile_sitekey, theme: "dark",
    });
  }
  const loginBox = document.getElementById("loginTurnstileBox");
  if (loginBox && !loginBox.hasChildNodes()) {
    window.turnstile.render("#loginTurnstileBox", {
      sitekey: SITE_CONFIG.turnstile_sitekey, theme: "dark",
    });
  }
}

function getTurnstileToken() {
  if (!window.turnstile || turnstileWidgetId === null) return "";
  return window.turnstile.getResponse(turnstileWidgetId);
}

function initPublicForm() {
  const uidInput = document.getElementById("mediaUid");
  uidInput.addEventListener("input", () => {
    const v = uidInput.value.trim();
    if (v.length >= 8 && /^DLT-/i.test(v)) {
      toast("Это код аккаунта — нажмите «Войти» справа вверху", "ok");
    }
  });

  // критерии: yes/no карточки
  document.querySelectorAll("#criteriaChoice .choice-card").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#criteriaChoice .choice-card").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("criteriaChoice").dataset.value = btn.dataset.value;
    }));
  document.getElementById("openCriteria").addEventListener("click", (e) => { e.preventDefault(); openModal("criteriaModal"); });

  // платформа → блоки
  document.querySelectorAll("#platformDrop .dropdown-item").forEach((item) =>
    item.addEventListener("click", () => {
      const p = item.dataset.value;
      document.getElementById("ytBlock").classList.toggle("hidden", p !== "youtube");
      document.getElementById("ttBlock").classList.toggle("hidden", p !== "tiktok");
      document.getElementById("commonBlock").classList.toggle("hidden", !p);
      if (p) setTimeout(renderTurnstile, 50);
    }));

  // счётчик символов
  const why = document.getElementById("whyJoin");
  why.addEventListener("input", () => { document.getElementById("whyCount").textContent = why.value.length; });

  // проверка «написал сотруднику»
  const tgInput = document.getElementById("mediaTg");
  let tgCheckTimer = null;
  tgInput.addEventListener("input", () => {
    clearTimeout(tgCheckTimer);
    const v = tgInput.value.trim();
    if (!/^@?[a-zA-Z0-9_]{4,32}$/.test(v)) return;
    tgCheckTimer = setTimeout(async () => {
      try {
        const r = await POST("/api/check-tg-verified", { telegram: v });
        const st = document.getElementById("tgVerifyStatus");
        const block = document.getElementById("tgVerifyBlock");
        if (r.verified) {
          st.textContent = "✅ Вы написали сотруднику — можно отправлять заявку";
          st.className = "tg-status ok";
          block.classList.remove("flash");
        } else {
          st.textContent = "⚠️ Вы ещё не написали сотруднику. Нажмите кнопку выше!";
          st.className = "tg-status err";
        }
      } catch { /* тихо */ }
    }, 700);
  });

  document.getElementById("mediaForm").addEventListener("submit", submitMediaApp);
}

async function submitMediaApp(e) {
  e.preventDefault();
  const btn = document.getElementById("mediaSubmit");
  const err = (msg) => { buttonState(btn, "err", msg, 3500); if (msg.includes("сотруднику")) flashTGBlock(); };

  if (SITE_CONFIG && SITE_CONFIG.apps_open === false) {
    err(t("heroPillClosed"));
    return;
  }

  const platform = document.getElementById("platformDrop").dataset.value;
  const servers = (document.getElementById("serversDrop").dataset.value || "").split(",").filter(Boolean);
  const body = {
    lang: LANG,
    uid: document.getElementById("mediaUid").value.trim(),
    criteria_agreed: document.getElementById("criteriaChoice").dataset.value === "yes",
    platform,
    channel_url: platform === "youtube" ? document.getElementById("ytChannel").value.trim()
                 : document.getElementById("ttChannel").value.trim(),
    servers,
    videos_per_week: document.getElementById("ytVideos").value.trim(),
    collaborations: document.getElementById("ttCollab").value.trim(),
    why_join: document.getElementById("whyJoin").value.trim(),
    exclusive: document.getElementById("exclusiveDrop").dataset.value,
    telegram: document.getElementById("mediaTg").value.trim(),
    turnstile_token: getTurnstileToken(),
  };

  // клиентская валидация (зеркалит серверную)
  if (!body.uid) return err("Укажите UID");
  if (!body.criteria_agreed) return err("Подтвердите критерии (Да)");
  if (!platform) return err("Выберите платформу");
  if (!body.channel_url) return err("Укажите ссылку на канал");
  if (platform === "youtube" && !body.videos_per_week) return err("Укажите роликов в неделю");
  if (platform === "tiktok" && !body.collaborations) return err("Укажите сотрудничества");
  if (!servers.length) return err("Выберите серверы");
  if (body.why_join.length < 10) return err("Мотивация — минимум 10 символов");
  if (!body.exclusive) return err("Укажите эксклюзивность");
  if (!body.telegram) return err("Укажите Telegram");
  if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled && !body.turnstile_token && !CURRENT_ACCOUNT)
    return err("Пройдите капчу");

  buttonState(btn, "", "Отправляем…");
  try {
    await POST("/api/media/submit", body);
    buttonState(btn, "ok", "Заявка отправлена! ✅", 3500);
    e.target.reset();
    ["platformDrop", "serversDrop", "exclusiveDrop"].forEach((id) => {
      const d = document.getElementById(id);
      d.dataset.value = "";
      d.querySelector(".dropdown-value").textContent =
        id === "platformDrop" ? I18N[LANG].pickPlatform :
        id === "serversDrop" ? I18N[LANG].pickServers : I18N[LANG].pickVariant;
      d.querySelectorAll("input:checked").forEach((c) => { c.checked = false; });
    });
    document.getElementById("criteriaChoice").dataset.value = "";
    document.querySelectorAll("#criteriaChoice .choice-card").forEach((b) => b.classList.remove("active"));
    ["ytBlock", "ttBlock", "commonBlock"].forEach((id) => document.getElementById(id).classList.add("hidden"));
    document.getElementById("whyCount").textContent = "0";
    document.getElementById("tgVerifyStatus").textContent = "";
    if (turnstileWidgetId !== null && window.turnstile) window.turnstile.reset(turnstileWidgetId);
  } catch (ex) {
    if (ex.tg_required) { err(ex.error || "Сначала напишите сотруднику"); return; }
    if (ex.banned) { buttonState(btn, "err", ex.error, 6000); return; }
    err(ex.message || "Ошибка отправки");
  }
}

function flashTGBlock() {
  const block = document.getElementById("tgVerifyBlock");
  block.classList.add("flash");
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => block.classList.remove("flash"), 4000);
}
