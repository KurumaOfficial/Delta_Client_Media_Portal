/* public.js — публичная форма заявки на вступление в медиа */
"use strict";

let SITE_CONFIG = null;
let mediaTurnstileWidgetId = null;
let loginTurnstileWidgetId = null;

async function loadSiteConfig() {
  try {
    SITE_CONFIG = await GET("/api/health");
    const staff = SITE_CONFIG.staff_contact || "notyxs";
    const admin = SITE_CONFIG.admin_contact || "notyxs";
    const staffBtn = document.getElementById("staffContactBtn");
    if (staffBtn) staffBtn.href = "https://t.me/" + staff;
    const bugBtn = document.getElementById("bugReportBtn");
    if (bugBtn) bugBtn.href = "https://t.me/" + staff;
    const forgotBtn = document.getElementById("authForgot");
    if (forgotBtn) forgotBtn.href = "https://t.me/" + admin;
    if (!SITE_CONFIG.turnstile_enabled) {
      document.getElementById("captchaField")?.classList.add("hidden");
      document.getElementById("loginCaptcha")?.classList.add("hidden");
    } else {
      document.getElementById("captchaField")?.classList.remove("hidden");
      document.getElementById("loginCaptcha")?.classList.remove("hidden");
      if (typeof renderTurnstile === "function") renderTurnstile();
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
        showView("maintenance", false);
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
  const pill = document.querySelector("#view-public .hero-pill");
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

  const mediaBox = document.getElementById("turnstileBox");
  if (mediaBox && mediaTurnstileWidgetId === null) {
    try {
      mediaTurnstileWidgetId = window.turnstile.render("#turnstileBox", {
        sitekey: SITE_CONFIG.turnstile_sitekey,
        theme: "dark",
      });
    } catch (e) {
      console.warn("[Turnstile] media render:", e);
    }
  }

  const loginBox = document.getElementById("loginTurnstileBox");
  if (loginBox && loginTurnstileWidgetId === null) {
    try {
      loginTurnstileWidgetId = window.turnstile.render("#loginTurnstileBox", {
        sitekey: SITE_CONFIG.turnstile_sitekey,
        theme: "dark",
      });
    } catch (e) {
      console.warn("[Turnstile] login render:", e);
    }
  }
}

function getTurnstileToken() {
  if (!window.turnstile || mediaTurnstileWidgetId === null) return "";
  try {
    return window.turnstile.getResponse(mediaTurnstileWidgetId);
  } catch {
    return "";
  }
}

function getLoginTurnstileToken() {
  if (!window.turnstile || loginTurnstileWidgetId === null) return "";
  try {
    return window.turnstile.getResponse(loginTurnstileWidgetId);
  } catch {
    return "";
  }
}

function resetMediaTurnstile() {
  if (window.turnstile && mediaTurnstileWidgetId !== null) {
    try { window.turnstile.reset(mediaTurnstileWidgetId); } catch {}
  }
}

function resetLoginTurnstile() {
  if (window.turnstile && loginTurnstileWidgetId !== null) {
    try { window.turnstile.reset(loginTurnstileWidgetId); } catch {}
  }
}

window.renderTurnstile = renderTurnstile;
window.getTurnstileToken = getTurnstileToken;
window.getMediaTurnstileToken = getTurnstileToken;
window.getLoginTurnstileToken = getLoginTurnstileToken;
window.resetMediaTurnstile = resetMediaTurnstile;
window.resetLoginTurnstile = resetLoginTurnstile;

let currentTgVerifyState = "idle";

function setTgVerifyState(state) {
  currentTgVerifyState = state;
  const st = document.getElementById("tgVerifyStatus");
  const ping = document.getElementById("tgVerifyPing");
  const block = document.getElementById("tgVerifyBlock");
  const staffBtn = document.getElementById("staffContactBtn");
  const btnLabel = staffBtn ? staffBtn.querySelector(".tg-btn-label") : null;
  if (!st) return;

  // На кнопке связи с сотрудником ВСЕГДА пишется только «Написать сотруднику»
  if (btnLabel) btnLabel.textContent = t("tgVerifyBtn");
  if (staffBtn) staffBtn.classList.remove("err");

  if (block) {
    block.classList.toggle("ok", state === "ok");
    if (state === "ok") block.classList.remove("flash");
  }

  if (state === "idle" || !state || state === "err") {
    st.className = "tg-verify-status-box hidden";
    st.innerHTML = "";
    if (ping) ping.className = "tg-verify-ping";
    return;
  }

  if (state === "ok") {
    st.className = "tg-verify-status-box ok";
    if (ping) ping.className = "tg-verify-ping ok";
    const iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    st.innerHTML = `<span class="tg-status-icon">${iconSvg}</span><span class="tg-status-text">${t("tgStatusOk")}</span>`;
  } else if (state === "checking") {
    st.className = "tg-verify-status-box checking";
    if (ping) ping.className = "tg-verify-ping checking";
    const iconSvg = '<span class="tg-status-spinner"></span>';
    st.innerHTML = `<span class="tg-status-icon">${iconSvg}</span><span class="tg-status-text">${t("tgStatusChecking")}</span>`;
  }
}

function refreshTgVerifyUI() {
  setTgVerifyState(currentTgVerifyState);
}

function initPublicForm() {
  const uidInput = document.getElementById("mediaUid");
  const uidError = document.getElementById("uidErrorText");

  function validateUidDigits() {
    if (!uidInput) return true;
    const v = uidInput.value.trim();
    if (!v) {
      uidInput.classList.remove("uid-error");
      if (uidError) uidError.classList.add("hidden");
      return true;
    }
    if (/\D/.test(v)) {
      uidInput.classList.add("uid-error");
      if (uidError) uidError.classList.remove("hidden");
      return false;
    }
    uidInput.classList.remove("uid-error");
    if (uidError) uidError.classList.add("hidden");
    return true;
  }

  if (uidInput) {
    uidInput.addEventListener("input", () => {
      validateUidDigits();
      const v = uidInput.value.trim();
      if (v.length >= 8 && /^DLT-/i.test(v)) {
        toast("Это код аккаунта — нажмите «Войти» справа вверху", "ok");
      }
    });

    uidInput.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (["Backspace", "Delete", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        uidInput.classList.add("uid-error");
        if (uidError) uidError.classList.remove("hidden");
        setTimeout(() => {
          if (!/\D/.test(uidInput.value.trim())) {
            uidInput.classList.remove("uid-error");
            if (uidError) uidError.classList.add("hidden");
          }
        }, 2200);
      }
    });

    uidInput.addEventListener("blur", () => {
      validateUidDigits();
    });
  }

  // ═══ Валидация количества видео в неделю (только цифры) ═══
  const ytVideosInput = document.getElementById("ytVideos");
  const ytVideosError = document.getElementById("ytVideosErrorText");
  const ytVideosErrorMsg = document.getElementById("ytVideosErrorMsg");

  function validateVideosPerWeek(val) {
    const v = (val || "").trim();
    if (!v) {
      return { valid: false, empty: true, errorMsg: "Укажите количество роликов в неделю" };
    }
    if (/\D/.test(v)) {
      return { valid: false, empty: false, errorMsg: t("ytVideosDigitsOnly") || "В поле количества роликов разрешены только цифры" };
    }
    return { valid: true, empty: false };
  }
  window._validateVideosPerWeek = validateVideosPerWeek;

  if (ytVideosInput) {
    ytVideosInput.addEventListener("input", () => {
      const v = ytVideosInput.value.trim();
      if (!v) {
        ytVideosInput.classList.remove("videos-error");
        if (ytVideosError) ytVideosError.classList.add("hidden");
        return;
      }
      const res = validateVideosPerWeek(v);
      if (!res.valid) {
        ytVideosInput.classList.add("videos-error");
        if (ytVideosError && ytVideosErrorMsg) {
          ytVideosErrorMsg.textContent = res.errorMsg;
          ytVideosError.classList.remove("hidden");
        }
      } else {
        ytVideosInput.classList.remove("videos-error");
        if (ytVideosError) ytVideosError.classList.add("hidden");
      }
    });

    ytVideosInput.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (["Backspace", "Delete", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        ytVideosInput.classList.add("videos-error");
        if (ytVideosError && ytVideosErrorMsg) {
          ytVideosErrorMsg.textContent = t("ytVideosDigitsOnly") || "В поле количества роликов разрешены только цифры";
          ytVideosError.classList.remove("hidden");
        }
        setTimeout(() => {
          if (!/\D/.test(ytVideosInput.value.trim())) {
            ytVideosInput.classList.remove("videos-error");
            if (ytVideosError) ytVideosError.classList.add("hidden");
          }
        }, 2200);
      }
    });

    ytVideosInput.addEventListener("blur", () => {
      const v = ytVideosInput.value.trim();
      if (v) {
        const res = validateVideosPerWeek(v);
        if (!res.valid) {
          ytVideosInput.classList.add("videos-error");
          if (ytVideosError && ytVideosErrorMsg) {
            ytVideosErrorMsg.textContent = res.errorMsg;
            ytVideosError.classList.remove("hidden");
          }
        }
      }
    });
  }

  // ═══ Валидация ссылки на канал (YouTube / TikTok) ═══
  const DUMMY_CHANNEL_HANDLES = new Set([
    "username", "user", "channel", "name", "test", "dummy",
    "asdf", "fake", "example", "placeholder", "123", "null", "undefined"
  ]);

  function validateChannelUrl(platform, rawVal) {
    const v = (rawVal || "").trim();
    if (!v) {
      return { valid: false, empty: true, errorMsg: t("qChannel") || "Укажите ссылку на канал" };
    }

    let norm = v;
    if (!/^https?:\/\//i.test(norm)) {
      if (platform === "youtube" && /^(www\.|m\.)?youtube\.com\//i.test(norm)) norm = "https://" + norm;
      else if (platform === "tiktok" && /^(www\.)?tiktok\.com\//i.test(norm)) norm = "https://" + norm;
    }

    if (platform === "youtube") {
      if (/(youtube\.com\/(watch\?|shorts\/|live\/|playlist\?|clip\/)|youtu\.be\/)/i.test(norm)) {
        return { valid: false, empty: false, errorMsg: t("ytVideoLinkErr") || "Укажите ссылку на сам канал, а не на видео или Shorts" };
      }

      const ytMatch = norm.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:@([a-zA-Z0-9_.\-]+)|channel\/([a-zA-Z0-9_\-]+)|c\/([a-zA-Z0-9_\-]+)|user\/([a-zA-Z0-9_\-]+))\/?$/i);
      if (!ytMatch) {
        return { valid: false, empty: false, errorMsg: t("ytInvalidFormat") || "Укажите прямую ссылку на канал (например, https://youtube.com/@username)" };
      }

      const handle = (ytMatch[1] || ytMatch[2] || ytMatch[3] || ytMatch[4] || "").toLowerCase();
      if (DUMMY_CHANNEL_HANDLES.has(handle) || handle.length < 3 || /^[\.\-_]+$/.test(handle)) {
        return { valid: false, empty: false, errorMsg: t("ytFakeLinkErr") || "Укажите настоящую ссылку на ваш канал" };
      }

      return { valid: true, empty: false, normalized: norm };
    }

    if (platform === "tiktok") {
      if (/tiktok\.com\/@[^\/]+\/video\//i.test(norm)) {
        return { valid: false, empty: false, errorMsg: t("ttVideoLinkErr") || "Укажите ссылку на профиль TikTok, а не на видео" };
      }

      const ttMatch = norm.match(/^https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]+)\/?$/i);
      if (!ttMatch) {
        return { valid: false, empty: false, errorMsg: t("ttInvalidFormat") || "Укажите прямую ссылку на TikTok-аккаунт (например, https://tiktok.com/@username)" };
      }

      const handle = (ttMatch[1] || "").toLowerCase();
      if (DUMMY_CHANNEL_HANDLES.has(handle) || handle.length < 2 || /^[\._]+$/.test(handle)) {
        return { valid: false, empty: false, errorMsg: t("ttFakeLinkErr") || "Укажите настоящую ссылку на ваш TikTok-аккаунт" };
      }

      return { valid: true, empty: false, normalized: norm };
    }

    return { valid: true, empty: false, normalized: norm };
  }

  const ytInput = document.getElementById("ytChannel");
  const ytError = document.getElementById("ytErrorText");
  const ytErrorMsg = document.getElementById("ytErrorMsg");

  const ttInput = document.getElementById("ttChannel");
  const ttError = document.getElementById("ttErrorText");
  const ttErrorMsg = document.getElementById("ttErrorMsg");

  function bindChannelValidation(inputEl, errorEl, errorMsgEl, plat) {
    if (!inputEl) return;

    function check(force) {
      const v = inputEl.value.trim();
      if (!v) {
        if (force) {
          inputEl.classList.add("channel-error");
          if (errorEl && errorMsgEl) {
            errorMsgEl.textContent = t("qChannel") || "Укажите ссылку на канал";
            errorEl.classList.remove("hidden");
          }
          return false;
        }
        inputEl.classList.remove("channel-error");
        if (errorEl) errorEl.classList.add("hidden");
        return true;
      }

      const res = validateChannelUrl(plat, v);
      if (res.valid) {
        inputEl.classList.remove("channel-error");
        if (errorEl) errorEl.classList.add("hidden");
        return true;
      }

      const isClearlyBad = v.length > 8 && (
        /(watch|shorts|live|video|\.be\/|google|twitch|@username|tiktok\.com\/@[^\/]+\/video)/i.test(v) ||
        !/(youtube|tiktok)/i.test(v) ||
        /^https?:\/\//i.test(v)
      );

      if (force || inputEl.classList.contains("channel-error") || isClearlyBad) {
        inputEl.classList.add("channel-error");
        if (errorEl && errorMsgEl) {
          errorMsgEl.textContent = res.errorMsg;
          errorEl.classList.remove("hidden");
        }
        return false;
      }
      return true;
    }

    inputEl.addEventListener("input", () => check(false));
    inputEl.addEventListener("blur", () => {
      const v = inputEl.value.trim();
      if (v) {
        if (plat === "youtube" && /^(www\.|m\.)?youtube\.com\//i.test(v)) inputEl.value = "https://" + v;
        else if (plat === "tiktok" && /^(www\.)?tiktok\.com\//i.test(v)) inputEl.value = "https://" + v;
      }
      check(true);
    });
  }

  bindChannelValidation(ytInput, ytError, ytErrorMsg, "youtube");
  bindChannelValidation(ttInput, ttError, ttErrorMsg, "tiktok");

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
      if (ytInput) { ytInput.classList.remove("channel-error"); if (ytError) ytError.classList.add("hidden"); }
      if (ttInput) { ttInput.classList.remove("channel-error"); if (ttError) ttError.classList.add("hidden"); }
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
    if (!v) {
      setTgVerifyState("idle");
      return;
    }
    if (!/^@?[a-zA-Z0-9_]{4,32}$/.test(v)) return;
    setTgVerifyState("checking");
    tgCheckTimer = setTimeout(async () => {
      try {
        const r = await POST("/api/check-tg-verified", { telegram: v });
        const block = document.getElementById("tgVerifyBlock");
        if (r.verified) {
          setTgVerifyState("ok");
          if (block) block.classList.remove("flash");
        } else {
          setTgVerifyState("err");
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
  if (!body.uid) {
    const uidEl = document.getElementById("mediaUid");
    if (uidEl) {
      uidEl.focus();
      uidEl.classList.add("uid-error");
    }
    return err("Укажите UID");
  }
  if (/\D/.test(body.uid)) {
    const uidEl = document.getElementById("mediaUid");
    if (uidEl) {
      uidEl.classList.add("uid-error");
      uidEl.scrollIntoView({ behavior: "smooth", block: "center" });
      uidEl.focus();
    }
    const uidErr = document.getElementById("uidErrorText");
    if (uidErr) uidErr.classList.remove("hidden");
    return err(t("uidDigitsOnly") || "В поле UID разрешены только цифры");
  }
  if (!body.criteria_agreed) return err("Подтвердите критерии (Да)");
  if (!platform) return err("Выберите платформу");

  const isYt = platform === "youtube";
  const chanInput = isYt ? document.getElementById("ytChannel") : document.getElementById("ttChannel");
  const chanErrBlock = isYt ? document.getElementById("ytErrorText") : document.getElementById("ttErrorText");
  const chanErrMsg = isYt ? document.getElementById("ytErrorMsg") : document.getElementById("ttErrorMsg");

  if (!body.channel_url) {
    if (chanInput) {
      chanInput.focus();
      chanInput.classList.add("channel-error");
      chanInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (chanErrBlock && chanErrMsg) {
      chanErrMsg.textContent = t("qChannel") || "Укажите ссылку на канал";
      chanErrBlock.classList.remove("hidden");
    }
    return err("Укажите ссылку на канал");
  }

  // Проверка формата и подлинности ссылки на канал
  const chanRes = (typeof validateChannelUrl === "function") ? validateChannelUrl(platform, body.channel_url) : { valid: true };
  if (!chanRes.valid) {
    if (chanInput) {
      chanInput.classList.add("channel-error");
      chanInput.scrollIntoView({ behavior: "smooth", block: "center" });
      chanInput.focus();
    }
    if (chanErrBlock && chanErrMsg) {
      chanErrMsg.textContent = chanRes.errorMsg;
      chanErrBlock.classList.remove("hidden");
    }
    return err(chanRes.errorMsg);
  }
  if (chanRes.normalized) {
    body.channel_url = chanRes.normalized;
  }
  if (platform === "youtube") {
    const vCheck = (typeof window._validateVideosPerWeek === "function")
      ? window._validateVideosPerWeek(body.videos_per_week)
      : { valid: !!body.videos_per_week, errorMsg: "Укажите количество роликов в неделю" };
    if (!vCheck.valid) {
      const vInput = document.getElementById("ytVideos");
      const vErr = document.getElementById("ytVideosErrorText");
      const vErrMsg = document.getElementById("ytVideosErrorMsg");
      if (vInput) {
        vInput.classList.add("videos-error");
        vInput.scrollIntoView({ behavior: "smooth", block: "center" });
        vInput.focus();
      }
      if (vErr && vErrMsg) {
        vErrMsg.textContent = vCheck.errorMsg;
        vErr.classList.remove("hidden");
      }
      return err(vCheck.errorMsg);
    }
  }
  if (platform === "tiktok" && !body.collaborations) return err("Укажите сотрудничества");
  if (!servers.length) return err("Выберите серверы");
  if (body.why_join.length < 10) return err("Мотивация — минимум 10 символов");
  if (!body.exclusive) return err("Укажите готовность снимать с Delta Client");
  if (!body.telegram) return err("Укажите Telegram");
  if (currentTgVerifyState !== "ok") {
    buttonState(btn, "", "Проверка…");
    try {
      const r = await POST("/api/check-tg-verified", { telegram: body.telegram });
      if (r && r.verified) {
        setTgVerifyState("ok");
      } else {
        currentTgVerifyState = "err";
        return err(t("tgStatusErr"));
      }
    } catch {
      // при ошибке сети проверит бэкенд
    }
  }
  if (SITE_CONFIG && SITE_CONFIG.turnstile_enabled && !body.turnstile_token && !CURRENT_ACCOUNT)
    return err("Пройдите капчу");

  buttonState(btn, "", "Отправляем…");
  try {
    await POST("/api/media/submit", body);
    buttonState(btn, "ok", "Заявка отправлена! ✅", 3500);
    e.target.reset();
    ["platformDrop", "serversDrop", "exclusiveDrop"].forEach((id) => {
      const d = document.getElementById(id);
      if (!d) return;
      d.dataset.value = "";
      d.classList.remove("has-value");
      const valSpan = d.querySelector(".dropdown-value");
      if (valSpan) {
        if (valSpan.dataset.origI18n) valSpan.setAttribute("data-i18n", valSpan.dataset.origI18n);
        valSpan.textContent =
          id === "platformDrop" ? I18N[LANG].pickPlatform :
          id === "serversDrop" ? I18N[LANG].pickServers : I18N[LANG].pickVariant;
      }
      d.querySelectorAll("input:checked").forEach((c) => { c.checked = false; });
      d.querySelectorAll(".dropdown-item").forEach((it) => it.classList.remove("picked"));
    });
    document.getElementById("criteriaChoice").dataset.value = "";
    document.querySelectorAll("#criteriaChoice .choice-card").forEach((b) => b.classList.remove("active"));
    ["ytBlock", "ttBlock", "commonBlock"].forEach((id) => document.getElementById(id).classList.add("hidden"));
    document.getElementById("whyCount").textContent = "0";
    setTgVerifyState("idle");
    resetMediaTurnstile();
  } catch (ex) {
    if (ex.tg_required) { err(ex.error || t("tgStatusErr")); return; }
    if (ex.banned) { buttonState(btn, "err", ex.error, 6000); return; }
    err(ex.message || "Ошибка отправки");
  }
}

function flashTGBlock() {
  const block = document.getElementById("tgVerifyBlock");
  if (!block) return;
  block.classList.add("flash");
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => block.classList.remove("flash"), 4000);
}
