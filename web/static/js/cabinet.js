/* cabinet.js — личный кабинет: модератор (HWID/Discord/Мои заявки), медиа (выплаты/лоты/Мои заявки), фримедиа (подписки/Мои заявки) */
"use strict";

let cabinetActiveTab = null;

// Lucide SVG-иконки для вкладок и заголовков личного кабинета с фиксированными размерами
const CABINET_ICONS = {
  hwid: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  discord: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9.5 9.5 5 5"/><path d="m14.5 9.5-5 5"/></svg>',
  payout: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
  lot: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
  ideabug: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  sub: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
  my: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
  adminpanel: '<svg class="tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
};

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

function declWord(num, one, two, five) {
  const n = Math.abs(num) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

function formatDurationSince(dateInput) {
  if (!dateInput) return "1 месяц";
  const start = new Date(dateInput);
  if (isNaN(start.getTime())) return "1 месяц";
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs <= 0) return "Меньше 1 дня";

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    if (diffDays === 0) return "Меньше 1 дня";
    return `${diffDays} ${declWord(diffDays, "день", "дня", "дней")}`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${declWord(weeks, "неделя", "недели", "недель")}`;
  }

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) {
    months--;
  }
  if (months < 1) months = 1;

  if (months < 12) {
    return `${months} ${declWord(months, "месяц", "месяца", "месяцев")}`;
  }

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  let res = `${years} ${declWord(years, "год", "года", "лет")}`;
  if (remMonths > 0) {
    res += ` ${remMonths} ${declWord(remMonths, "месяц", "месяца", "месяцев")}`;
  }
  return res;
}

async function switchCabinetTab(tab) {
  cabinetActiveTab = tab;
  document.querySelectorAll("#cabinetTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const body = document.getElementById("cabinetBody");
  if (!body) return;
  if (tab === "adminpanel") { // админ-панель — полноценный раздел внутри кабинета
    await showView("admin");
    return;
  }
  body.classList.remove("tab-fade-in");
  void body.offsetWidth;
  body.classList.add("tab-fade-in");
  if (tab === "hwid") body.innerHTML = buildProofForm("hwid", "Сброс HWID", "UID пользователя", "uuid");
  else if (tab === "discord") body.innerHTML = buildProofForm("discord", "Discord бан", "ID или @username нарушителя", "offender_id");
  else if (tab === "payout") body.innerHTML = buildPayoutForm();
  else if (tab === "lot") body.innerHTML = buildLotForm();
  else if (tab === "ideabug") body.innerHTML = buildIdeaBugForm();
  else if (tab === "my") await renderMyRequests();
  bindCabinetForms();
}

function cabinetTabsForRole(role) {
  if (role === "moderator") return [["hwid", t("tabHwid")], ["discord", t("tabDiscord")], ["my", t("tabMy")]];
  if (role === "media") return [["payout", t("tabPayout")], ["lot", t("tabLot")], ["ideabug", "Идеи и баги"], ["my", t("tabMy")]];
  if (role === "admin") return [["adminpanel", t("tabAdmin")]];
  return [];
}

// ── Оповещения на рабочий стол (Web Notifications API) для модераторов ──
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
}

function sendDesktopNotification(title, options = {}) {
  playNotificationSound();
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        icon: options.icon || "/static/img/delta-icon.svg",
        badge: options.badge || "/static/img/delta-icon.svg",
        body: options.body || "",
        tag: options.tag || ("delta-mod-" + Date.now()),
        renotify: true,
        ...options
      });
      if (options.onClick) {
        notif.onclick = function(e) {
          try {
            window.focus();
            options.onClick(e);
          } catch (_) {}
          this.close();
        };
      }
      return notif;
    } catch (err) {
      console.warn("Desktop notification error:", err);
    }
  }
  return null;
}

function renderModNotifBar() {
  const container = document.getElementById("cabinetNotifBar");
  if (!container) return;
  if (!CURRENT_ACCOUNT || CURRENT_ACCOUNT.role !== "moderator" || !("Notification" in window)) {
    container.innerHTML = "";
    return;
  }

  const perm = Notification.permission;
  const dismissed = sessionStorage.getItem("delta_mod_notif_dismissed") === "1";

  if (perm === "default") {
    if (dismissed) {
      container.innerHTML = `
        <div class="mod-notif-pill-wrap">
          <div class="mod-notif-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            <span>Оповещения на рабочий стол отключены</span>
            <button type="button" class="mod-notif-pill-btn" id="btnEnableModNotifs">Включить</button>
          </div>
        </div>`;
      document.getElementById("btnEnableModNotifs")?.addEventListener("click", requestModNotificationPermission);
      return;
    }

    container.innerHTML = `
      <div class="mod-notif-banner" id="modNotifBanner">
        <div class="mod-notif-content">
          <div class="mod-notif-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </div>
          <div>
            <div class="mod-notif-title">Уведомления на рабочий стол</div>
            <div class="mod-notif-desc">Включите оповещения, чтобы сразу узнавать об одобрении или отклонении ваших заявок администратором.</div>
          </div>
        </div>
        <div class="mod-notif-actions">
          <button type="button" class="btn-primary btn-sm" id="btnEnableModNotifs">Разрешить</button>
          <button type="button" class="btn-ghost btn-sm" id="btnDismissModNotifs">Не сейчас</button>
        </div>
      </div>`;

    document.getElementById("btnEnableModNotifs")?.addEventListener("click", requestModNotificationPermission);
    document.getElementById("btnDismissModNotifs")?.addEventListener("click", () => {
      sessionStorage.setItem("delta_mod_notif_dismissed", "1");
      renderModNotifBar();
    });
  } else if (perm === "granted") {
    container.innerHTML = `
      <div class="mod-notif-pill-wrap">
        <div class="mod-notif-pill active">
          <span class="mod-notif-pill-dot"></span>
          <span>Оповещения на рабочий стол активны</span>
          <button type="button" class="mod-notif-pill-btn" id="btnTestModNotif" title="Отправить тестовое уведомление на экран">Проверить</button>
        </div>
      </div>`;
    document.getElementById("btnTestModNotif")?.addEventListener("click", testModNotification);
  } else if (perm === "denied") {
    container.innerHTML = `
      <div class="mod-notif-pill-wrap">
        <div class="mod-notif-pill denied">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span>Уведомления заблокированы в настройках браузера</span>
        </div>
      </div>`;
  }
}

async function requestModNotificationPermission() {
  if (!("Notification" in window)) {
    toast("Ваш браузер не поддерживает оповещения", "err");
    return;
  }
  try {
    const res = await Notification.requestPermission();
    renderModNotifBar();
    if (res === "granted") {
      toast("Уведомления на рабочий стол включены!", "ok");
      sendDesktopNotification("Delta Client — Оповещения активны", {
        body: "Теперь вы будете получать решения администратора прямо на рабочий стол!",
        tag: "delta-welcome"
      });
    } else if (res === "denied") {
      toast("Уведомления заблокированы в настройках браузера", "err");
    }
  } catch (e) {
    console.warn(e);
  }
}

function testModNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    requestModNotificationPermission();
    return;
  }
  sendDesktopNotification("Delta Client — Тестовое оповещение", {
    body: "Оповещения на рабочий стол работают отлично! Вы сразу узнаете о решении по заявке.",
    tag: "delta-test-" + Date.now(),
    onClick: () => {
      if (typeof showView === "function") showView("cabinet");
      if (typeof switchCabinetTab === "function") switchCabinetTab("my");
    }
  });
  toast("Тестовое уведомление отправлено на рабочий стол", "ok");
}

let modNotifWatcherTimer = null;

function getModCacheKey() {
  return CURRENT_ACCOUNT ? `delta_mod_reqs_cache_${CURRENT_ACCOUNT.id}` : null;
}

function getModRequestsCache() {
  const key = getModCacheKey();
  if (!key) return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveModRequestsCache(cache) {
  const key = getModCacheKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch (_) {}
}

async function pollModRequestsAndNotify() {
  if (!CURRENT_ACCOUNT || CURRENT_ACCOUNT.role !== "moderator") {
    stopModNotificationsWatcher();
    return;
  }

  try {
    const resp = await GET("/api/mod/requests");
    const requests = resp && resp.data ? resp.data : [];
    const cache = getModRequestsCache();
    const isFirstRun = Object.keys(cache).length === 0;

    let updated = false;
    const newDecisions = [];

    requests.forEach((r) => {
      const key = `${r.kind}:${r.id}`;
      const prev = cache[key];

      if (!isFirstRun && prev) {
        const wasPending = prev.status === "pending";
        const isDecided = r.status === "approved" || r.status === "rejected";
        const newComment = r.admin_comment && r.admin_comment !== prev.comment;

        if ((wasPending && isDecided) || (isDecided && newComment)) {
          newDecisions.push(r);
        }
      }

      if (!prev || prev.status !== r.status || prev.comment !== (r.admin_comment || "")) {
        cache[key] = { status: r.status, comment: r.admin_comment || "" };
        updated = true;
      }
    });

    if (updated || isFirstRun) {
      saveModRequestsCache(cache);
    }

    newDecisions.forEach((item) => {
      notifyModRequestVerdict(item);
    });

    if (newDecisions.length > 0 && cabinetActiveTab === "my") {
      renderMyRequests();
    }
  } catch (_) {}
}

function notifyModRequestVerdict(item) {
  const isApproved = item.status === "approved";
  const kindTitle = item.kind === "hwid" ? "Сброс HWID" : "Discord бан";
  const targetLabel = item.kind === "hwid" ? "UID" : "Нарушитель";
  const targetVal = item.target || "—";

  const title = `Delta Client — Заявка ${isApproved ? "одобрена ✅" : "отклонена ❌"}`;
  let body = `${kindTitle} #${item.id} (${targetLabel}: ${targetVal})\nСтатус: ${isApproved ? "Одобрено" : "Отклонено"}`;
  if (item.admin_comment) {
    body += `\nОтвет администратора: ${item.admin_comment}`;
  }

  sendDesktopNotification(title, {
    body: body,
    tag: `delta-mod-decision-${item.kind}-${item.id}-${item.status}`,
    onClick: () => {
      if (typeof showView === "function") showView("cabinet");
      if (typeof switchCabinetTab === "function") switchCabinetTab("my");
      openRequestDetailsModal(item, "moderator");
    }
  });

  toast(`${kindTitle} #${item.id}: ${isApproved ? "Одобрено" : "Отклонено"}${item.admin_comment ? " — " + item.admin_comment : ""}`, isApproved ? "ok" : "err", 6500);
}

function startModNotificationsWatcher() {
  stopModNotificationsWatcher();
  if (!CURRENT_ACCOUNT || CURRENT_ACCOUNT.role !== "moderator") return;
  modNotifWatcherTimer = setInterval(pollModRequestsAndNotify, 12000);
  pollModRequestsAndNotify();
}

function stopModNotificationsWatcher() {
  if (modNotifWatcherTimer) {
    clearInterval(modNotifWatcherTimer);
    modNotifWatcherTimer = null;
  }
}

window.renderModNotifBar = renderModNotifBar;
window.requestModNotificationPermission = requestModNotificationPermission;
window.testModNotification = testModNotification;
window.startModNotificationsWatcher = startModNotificationsWatcher;
window.stopModNotificationsWatcher = stopModNotificationsWatcher;

async function loadCabinet() {
  if (!CURRENT_ACCOUNT) return;
  const titles = {
    moderator: t("cabinetModerator"),
    media: t("cabinetMedia"),
    admin: t("cabinetAdmin")
  };
  document.getElementById("cabinetTitle").textContent = titles[CURRENT_ACCOUNT.role] || t("cabinetTitle");
  renderModNotifBar();
  if (CURRENT_ACCOUNT.role === "moderator") {
    startModNotificationsWatcher();
  }
  const tabs = cabinetTabsForRole(CURRENT_ACCOUNT.role);
  document.getElementById("cabinetTabs").innerHTML =
    tabs.map(([id, label]) => `<button type="button" data-tab="${id}">${CABINET_ICONS[id] || ""}<span>${label}</span></button>`).join("");
  document.querySelectorAll("#cabinetTabs button").forEach((b) =>
    b.addEventListener("click", () => switchCabinetTab(b.dataset.tab)));
  const initial = tabs.find((t) => t[0] !== "adminpanel") || tabs[0];
  await switchCabinetTab(initial[0]);
}

// ── Формы с доказательствами (модераторы) ──
function buildProofForm(kind, title, targetLabel, targetName) {
  return `
  <form class="card form-card" id="form-${kind}">
    <h3>${CABINET_ICONS[kind] || ""} ${title}</h3>
    <div class="field"><label>${targetLabel} *</label><input type="text" name="${targetName}" required maxlength="64" placeholder="${targetLabel}"></div>
    <div class="field">
      <label>Доказательства (файлы и/или ссылка) *</label>
      <div class="proof-dropzone" id="dropzone-${kind}">
        <input type="file" id="proof-${kind}" accept="image/*,video/*" multiple class="proof-dropzone-input">
        <div class="proof-dropzone-inner">
          <div class="proof-dropzone-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="proof-dropzone-title">Перетащите файлы сюда или <span>выберите на устройстве</span></div>
          <div class="proof-dropzone-sub">Скриншоты и видео (PNG, JPG, MP4, WebM) · Можно выбрать несколько файлов сразу</div>
        </div>
      </div>
      <div class="proof-files-list" id="filesList-${kind}"></div>
      <div class="proof-upload-progress" id="uploadProgress-${kind}" style="display:none;">
        <div class="proof-progress-bar"><div class="proof-progress-fill" id="progressFill-${kind}"></div></div>
        <div class="proof-progress-label" id="progressLabel-${kind}"></div>
      </div>
      <div style="margin-top:0.75rem;">
        <input type="url" name="proof_link" placeholder="https://... — ссылка на доказательство (необязательно, если прикреплены файлы)">
      </div>
    </div>
    <div class="field"><label>Причина *</label><textarea name="reason" required maxlength="500" rows="3" placeholder="Укажите причину..."></textarea></div>
    <button type="submit" class="btn-primary" style="margin-top:0.35rem;">Отправить</button>
  </form>`;
}

// ── Чанковая загрузка файла → путь на сервере ──
async function uploadFileBig(file, onProgress) {
  const init = await POST("/api/upload/init", { file_name: file.name, file_size: file.size });
  const total = init.total_chunks, size = init.chunk_size;
  for (let i = 0; i < total; i++) {
    const chunk = file.slice(i * size, Math.min((i + 1) * size, file.size));
    const fd = new FormData();
    fd.append("upload_id", init.upload_id);
    fd.append("chunk_index", i);
    fd.append("total_chunks", total);
    fd.append("file_name", file.name);
    fd.append("chunk", chunk);
    const res = await POST("/api/upload/chunk", fd);
    if (typeof onProgress === "function") {
      onProgress(i + 1, total, file.name);
    }
    if (i === total - 1) return res.file_path;
  }
  return "";
}

// ── Медиа: заявка на выплату ──
function buildPayoutForm() {
  return `
  <form class="card form-card" id="form-payout">
    <h3>${CABINET_ICONS.payout} Заявка на выплату</h3>
    <p class="hint">Приём заявок: понедельник 00:00 — вторник 22:00 (МСК).</p>
    <div class="field"><label>Ваш UID *</label><input type="text" name="uid" required maxlength="64" placeholder="Ваш UID" inputmode="numeric"></div>
    <div class="field"><label>Ваш промокод *</label><input type="text" name="promo_code" id="payoutPromo" required placeholder="Например: DELTA2026" maxlength="64"></div>
    <div class="field"><label>Что хотите получить *</label><textarea name="want" required maxlength="300" rows="2" placeholder="За какие видео/работы выплата"></textarea></div>
    <div class="field"><label>Какая ставка *</label><input type="text" name="rate" required placeholder="Например: 500₽ за ролик / 15 USDT" maxlength="100"></div>
    <div class="field"><label>Способ выплаты *</label>
      <div class="dropdown" id="payMethod">
        <button type="button" class="dropdown-head"><span class="dropdown-value">Выберите способ</span><span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
        <div class="dropdown-menu">
          <button type="button" class="dropdown-item" data-value="usdt">USDT-чек (CryptoBot)</button>
          <button type="button" class="dropdown-item" data-value="funpay">FunPay</button>
        </div>
      </div>
    </div>
    <div class="field hidden" id="rowLot"><label>Ссылка на лот FunPay *</label><input type="url" name="lot_url" id="payoutLotUrl" placeholder="https://funpay.com/lots/..."></div>
    <button type="submit" class="btn-primary" style="margin-top:0.35rem;">Отправить заявку</button>
  </form>`;
}

// ── Медиа: заявка на лот (выдача сабки, косметика или что-то другое) ──
function buildLotForm() {
  return `
  <form class="card form-card" id="form-lot">
    <h3>${CABINET_ICONS.lot} Заявка на лот</h3>
    <div class="field"><label>Ваш UID в Delta Client *</label><input type="text" name="uid" required maxlength="64" placeholder="Ваш UID" inputmode="numeric"></div>
    <div class="field">
      <label>Платформа *</label>
      <div class="choice-row" id="lotPlatformChoice">
        <button type="button" class="choice-card active" data-value="youtube">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px;display:inline-block;"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          YouTube
        </button>
        <button type="button" class="choice-card" data-value="tiktok">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px;display:inline-block;"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
          TikTok
        </button>
      </div>
      <input type="hidden" name="platform" id="lotPlatformInput" value="youtube">
    </div>
    <div class="field">
      <label>Сколько вы в медиа Delta *</label>
      <div class="choice-row" id="lotDurationMode" style="margin-bottom:0.6rem;">
        <button type="button" class="choice-card active" data-mode="auto">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:5px;display:inline-block;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Автоматически
        </button>
        <button type="button" class="choice-card" data-mode="manual">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:5px;display:inline-block;"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          Ввести вручную
        </button>
      </div>
      <input type="text" name="duration" id="lotDurationInput" required maxlength="100" placeholder="Срок в медиа">
      <div class="hint" id="lotDurationHint" style="font-size:0.75rem;margin-top:0.25rem;color:rgba(255,255,255,0.45);">
        Рассчитано автоматически с даты регистрации аккаунта
      </div>
    </div>
    <div class="field">
      <label>Что хотите получить? *</label>
      <div class="choice-row cols-3" id="lotTypeChoice">
        <button type="button" class="choice-card active" data-value="sub">Выдача сабки</button>
        <button type="button" class="choice-card" data-value="cosmetics">Косметика</button>
        <button type="button" class="choice-card" data-value="other">Что-то другое</button>
      </div>
      <input type="hidden" name="lot_type" id="lotTypeInput" value="sub">
    </div>
    <div class="field hidden" id="rowLotCustom">
      <label>Укажите, что именно вы хотите получить *</label>
      <textarea name="want_custom" id="lotWantCustom" maxlength="300" rows="3" placeholder="Подробно опишите, что вам необходимо..."></textarea>
    </div>
    <div class="field" id="rowLotComment">
      <label id="lotCommentLabel">Никнейм для выдачи сабки (необязательно)</label>
      <input type="text" name="comment" id="lotComment" placeholder="Если для зрителя или на свой аккаунт" maxlength="150">
    </div>
    <button type="submit" class="btn-primary" style="margin-top:0.35rem;">Отправить заявку</button>
  </form>`;
}

// ── Медиа: идеи и баги ──
function buildIdeaBugForm() {
  return `
  <form class="card form-card" id="form-ideabug">
    <h3>${CABINET_ICONS.ideabug} Идеи и баги</h3>
    <p class="hint" style="margin-bottom:1.25rem;">Предложите идею по улучшению Delta Client или сообщите о найденной ошибке/баге.</p>
    
    <div class="field">
      <label>Тип обращения *</label>
      <div class="choice-row" id="feedbackTypeChoice">
        <button type="button" class="choice-card active" data-value="idea">💡 Идея / Предложение</button>
        <button type="button" class="choice-card" data-value="bug">🐛 Баг / Ошибка</button>
      </div>
      <input type="hidden" name="category" id="feedbackCategoryInput" value="idea">
    </div>

    <div class="field">
      <label id="feedbackTitleLabel">Тема идеи / предложения *</label>
      <input type="text" name="title" id="feedbackTitle" required maxlength="150" placeholder="Краткая суть идеи или улучшения">
    </div>

    <div class="field">
      <label id="feedbackDescLabel">Подробное описание *</label>
      <textarea name="description" id="feedbackDescription" required maxlength="1000" rows="4" placeholder="Опишите ваше предложение, почему это будет полезно для Delta Client..."></textarea>
    </div>

    <div class="field">
      <label>Доказательства или материалы (файлы и/или ссылка)</label>
      <div class="proof-dropzone" id="dropzone-ideabug">
        <input type="file" id="proof-ideabug" accept="image/*,video/*" multiple class="proof-dropzone-input">
        <div class="proof-dropzone-inner">
          <div class="proof-dropzone-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="proof-dropzone-title">Перетащите файлы сюда или <span>выберите на устройстве</span></div>
          <div class="proof-dropzone-sub">Скриншоты и видео (PNG, JPG, MP4, WebM) · Необязательно</div>
        </div>
      </div>
      <div class="proof-files-list" id="filesList-ideabug"></div>
      <div class="proof-upload-progress" id="uploadProgress-ideabug" style="display:none;">
        <div class="proof-progress-bar"><div class="proof-progress-fill" id="progressFill-ideabug"></div></div>
        <div class="proof-progress-label" id="progressLabel-ideabug"></div>
      </div>
      <div style="margin-top:0.75rem;">
        <input type="url" name="proof_link" placeholder="https://... — ссылка на концепт, видеозапись или скриншот (необязательно)">
      </div>
    </div>

    <button type="submit" class="btn-primary" style="margin-top:0.35rem;">Отправить обращение</button>
  </form>`;
}

// ── Вкладка «Мои заявки» (для Медиа и Модераторов) ──
async function renderMyRequests() {
  const body = document.getElementById("cabinetBody");
  if (!body) return;
  body.innerHTML = '<p class="hint" style="text-align:center">Загрузка заявок…</p>';

  const isMod = CURRENT_ACCOUNT && CURRENT_ACCOUNT.role === "moderator";
  let requests = [];
  let windowNote = "";

  try {
    if (isMod) {
      const resp = await GET("/api/mod/requests");
      requests = resp.data || [];
    } else {
      const resp = await GET("/api/cabinet/requests");
      requests = resp.data || [];
      windowNote = resp.window_open
        ? `Текущая неделя: ${esc(resp.week || "")} — приём открыт`
        : `Приём заявок закрыт. Окно приёма: понедельник 00:00 — вторник 22:00 (МСК)`;
    }
  } catch (e) {
    body.innerHTML = `<div class="card">${esc(e.message)}</div>`;
    return;
  }

  const kindTitle = {
    payout: "Выплата",
    lot: "Лот",
    subscription: "Подписка",
    hwid: "Сброс HWID",
    discord: "Discord бан",
    idea: "Идея",
    bug: "Баг"
  };

  const itemsHTML = requests.map((r, idx) => {
    let mainText = "";
    let subText = "";
    let replySnippet = "";

    if (isMod) {
      const targetLabel = r.kind === "hwid" ? "UID" : "Нарушитель";
      mainText = `<b>${kindTitle[r.kind] || r.kind}</b> — ${targetLabel}: <code>${esc(r.target || "—")}</code>`;
      subText = `${formatDate(r.created_at)} · Причина: ${esc(r.reason || "—")}`;
      if (r.admin_comment) {
        replySnippet = `<br><small style="color:var(--color-primary-300);">Ответ администратора: ${esc(r.admin_comment)}</small>`;
      }
    } else if (r.kind === "idea" || r.kind === "bug") {
      const isIdea = r.kind === "idea";
      mainText = `<b>${isIdea ? "💡 Идея" : "🐛 Баг"}</b> — ${esc(r.title || r.want || "")}`;
      subText = `${formatDate(r.created_at)} · ${esc(r.description || "").slice(0, 90)}${r.description && r.description.length > 90 ? "…" : ""}`;
      const comment = r.decision_comment || r.admin_comment;
      if (comment) {
        replySnippet = `<br><small style="color:var(--color-primary-300);">Ответ администратора: ${esc(comment)}</small>`;
      }
    } else {
      mainText = `<b>${kindTitle[r.kind] || r.kind}</b> — ${esc(r.want || r.amount || "")}`;
      subText = `${esc(r.week || "")} · ${r.source === "telegram" ? "из Telegram" : "с сайта"} · ${formatDate(r.created_at)}`;
      if (r.decision_comment) {
        replySnippet = `<br><small style="color:var(--color-primary-300);">Ответ администратора: ${esc(r.decision_comment)}</small>`;
      }
    }

    return `
      <div class="request-item" data-req-idx="${idx}">
        <b>#${r.id}</b>
        <div class="grow">
          <div>${mainText}</div>
          <small>${subText}${replySnippet}</small>
        </div>
        ${statusBadge(r.status)}
        <span class="req-arrow">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </div>`;
  }).join("");

  body.innerHTML = `
    ${windowNote ? `<p class="hint" style="text-align:center;margin-bottom:1rem;">${windowNote}</p>` : ""}
    <div class="request-list">
      ${itemsHTML || '<p class="hint" style="text-align:center;padding:2rem 0;">Заявок пока нет</p>'}
    </div>`;

  body.querySelectorAll("[data-req-idx]").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = +el.dataset.reqIdx;
      const req = requests[idx];
      if (req) openRequestDetailsModal(req, isMod ? "moderator" : "media");
    });
  });
}

// ── Модальное окно просмотра деталей заявки с ответом администратора ──
function openRequestDetailsModal(req, role) {
  let modalWrap = document.getElementById("reqDetailsModalOverlay");
  if (!modalWrap) {
    modalWrap = document.createElement("div");
    modalWrap.id = "reqDetailsModalOverlay";
    modalWrap.className = "ban-modal-overlay";
    document.body.appendChild(modalWrap);
  }

  const kindTitle = {
    payout: "Заявка на выплату",
    lot: "Заявка на лот",
    subscription: "Запрос подписки",
    hwid: "Запрос сброса HWID",
    discord: "Запрос Discord-бана",
    idea: "Предложение / Идея",
    bug: "Сообщение об ошибке (баг)"
  };

  let fieldsHTML = "";
  let adminComment = "";

  if (role === "moderator") {
    adminComment = req.admin_comment || "";
    const targetLabel = req.kind === "hwid" ? "UID пользователя" : "Нарушитель (ID/@username)";

    let proofsHTML = "—";
    const chips = [];
    if (req.proof_file) {
      req.proof_file.split(",").filter(Boolean).forEach((p, i) => {
        const ext = p.split(".").pop().toLowerCase();
        const isVid = ["mp4", "webm", "mov", "avi"].includes(ext);
        const ico = isVid
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
        chips.push(`<a href="${esc(p)}" target="_blank" rel="noopener" class="proof-chip">${ico}<span>Файл ${i + 1}</span></a>`);
      });
    }
    if (req.proof_link) {
      chips.push(`<a href="${esc(req.proof_link)}" target="_blank" rel="noopener" class="proof-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Ссылка</span></a>`);
    }
    if (chips.length) {
      proofsHTML = `<div class="proof-chips-wrap">${chips.join("")}</div>`;
    }

    fieldsHTML = `
      <div class="req-detail-field">
        <span class="req-detail-label">Тип запроса</span>
        <span class="req-detail-value">${kindTitle[req.kind] || req.kind}</span>
      </div>
      <div class="req-detail-field">
        <span class="req-detail-label">${targetLabel}</span>
        <span class="req-detail-value mono">${esc(req.target || "—")}</span>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Причина</span>
        <span class="req-detail-value">${esc(req.reason || "—")}</span>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Доказательства</span>
        <div class="req-detail-value">${proofsHTML}</div>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Дата отправки</span>
        <span class="req-detail-value">${formatDate(req.created_at)}</span>
      </div>
    `;
  } else if (req.kind === "idea" || req.kind === "bug") {
    adminComment = req.decision_comment || req.admin_comment || "";
    const isIdea = req.kind === "idea";

    let proofsHTML = "—";
    const chips = [];
    const filesStr = req.proof_files || req.proof_file || "";
    if (filesStr) {
      filesStr.split(",").filter(Boolean).forEach((p, i) => {
        const ext = p.split(".").pop().toLowerCase();
        const isVid = ["mp4", "webm", "mov", "avi"].includes(ext);
        const ico = isVid
          ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>'
          : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
        chips.push(`<a href="${esc(p)}" target="_blank" rel="noopener" class="proof-chip">${ico}<span>Файл ${i + 1}</span></a>`);
      });
    }
    if (req.proof_link) {
      chips.push(`<a href="${esc(req.proof_link)}" target="_blank" rel="noopener" class="proof-chip"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Ссылка</span></a>`);
    }
    if (chips.length) {
      proofsHTML = `<div class="proof-chips-wrap">${chips.join("")}</div>`;
    }

    fieldsHTML = `
      <div class="req-detail-field">
        <span class="req-detail-label">Тип обращения</span>
        <span class="req-detail-value">${isIdea ? "💡 Идея / Предложение" : "🐛 Баг / Ошибка"}</span>
      </div>
      <div class="req-detail-field">
        <span class="req-detail-label">Тема</span>
        <span class="req-detail-value"><b>${esc(req.title || "—")}</b></span>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Подробное описание</span>
        <span class="req-detail-value" style="white-space:pre-wrap;word-break:break-word;line-height:1.5;">${esc(req.description || "—")}</span>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Материалы и доказательства</span>
        <div class="req-detail-value">${proofsHTML}</div>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Дата отправки</span>
        <span class="req-detail-value">${formatDate(req.created_at)}</span>
      </div>
    `;
  } else {
    adminComment = req.decision_comment || "";

    const methodOrPlatform = req.method === "usdt"
      ? `USDT-чек (CryptoBot)`
      : req.method === "funpay"
      ? `<a href="${esc(req.lot_url)}" target="_blank" rel="noopener">FunPay лот</a>`
      : (req.platform ? (req.platform.toLowerCase() === "youtube" ? "YouTube" : req.platform.toLowerCase() === "tiktok" ? "TikTok" : req.platform) : "—");

    fieldsHTML = `
      <div class="req-detail-field">
        <span class="req-detail-label">Тип заявки</span>
        <span class="req-detail-value">${kindTitle[req.kind] || req.kind}</span>
      </div>
      <div class="req-detail-field">
        <span class="req-detail-label">UID аккаунта</span>
        <span class="req-detail-value mono">${esc(req.uid || "—")}</span>
      </div>
      ${req.promo_code ? `
      <div class="req-detail-field">
        <span class="req-detail-label">Промокод</span>
        <span class="req-detail-value mono font-bold" style="color:var(--color-primary-400, #38bdf8);">${esc(req.promo_code)}</span>
      </div>` : ""}
      ${req.amount ? `
      <div class="req-detail-field">
        <span class="req-detail-label">Ставка</span>
        <span class="req-detail-value font-bold">${esc(req.amount)}</span>
      </div>` : ""}
      ${req.duration ? `
      <div class="req-detail-field">
        <span class="req-detail-label">Срок в медиа</span>
        <span class="req-detail-value">${esc(req.duration)}</span>
      </div>` : ""}
      <div class="req-detail-field">
        <span class="req-detail-label">Способ / Платформа</span>
        <span class="req-detail-value">${methodOrPlatform}</span>
      </div>
      ${req.channel_url ? `
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Ссылка на канал</span>
        <span class="req-detail-value"><a href="${esc(req.channel_url)}" target="_blank" rel="noopener">${esc(req.channel_url)}</a></span>
      </div>` : ""}
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Что хотите получить</span>
        <span class="req-detail-value">${esc(req.want || "—")}</span>
      </div>
      <div class="req-detail-field span-2">
        <span class="req-detail-label">Дата подачи</span>
        <span class="req-detail-value">${formatDate(req.created_at)}</span>
      </div>
    `;
  }

  let adminReplyBlock = "";
  if (adminComment) {
    adminReplyBlock = `
      <div class="req-admin-reply ${req.status || ''}">
        <div class="req-admin-reply-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Ответ / уточнение администратора:
        </div>
        <p>${esc(adminComment)}</p>
      </div>`;
  } else if (req.status === "pending") {
    adminReplyBlock = `
      <div class="hint" style="margin-top:1.15rem;padding:0.85rem 1rem;background:rgba(255,255,255,0.02);border-radius:0.75rem;border:1px solid rgba(255,255,255,0.06);">
        Заявка находится на рассмотрении. Администратор ещё не вынес решение.
      </div>`;
  }

  modalWrap.innerHTML = `
    <div class="req-detail-modal-card">
      <div class="ban-modal-header" style="margin-bottom:0.75rem;">
        <div class="ban-modal-title">
          <h3 style="margin:0;padding:0;font-size:1.1rem;display:flex;align-items:center;gap:0.6rem;">
            Заявка #${req.id} ${statusBadge(req.status)}
          </h3>
        </div>
        <button type="button" class="ban-modal-close" id="reqDetailsCloseBtn">&times;</button>
      </div>
      <div class="req-detail-grid">
        ${fieldsHTML}
      </div>
      ${adminReplyBlock}
      <div style="margin-top:1.25rem;display:flex;justify-content:flex-end;">
        <button type="button" class="btn-ghost" id="reqDetailsOkBtn" style="padding:0.6rem 1.4rem;font-size:0.88rem;">Закрыть</button>
      </div>
    </div>`;

  void modalWrap.offsetWidth;
  modalWrap.classList.add("open");

  const close = () => modalWrap.classList.remove("open");
  document.getElementById("reqDetailsCloseBtn")?.addEventListener("click", close);
  document.getElementById("reqDetailsOkBtn")?.addEventListener("click", close);
  modalWrap.addEventListener("click", (e) => {
    if (e.target === modalWrap) close();
  });
}

// ── Обработчики всех кабинетных форм ──
function bindCabinetForms() {
  // дропдауны способа/платформы уже работают глобально; показываем доп-поля
  const method = document.getElementById("payMethod");
  if (method) method.querySelectorAll(".dropdown-item").forEach((it) =>
    it.addEventListener("click", () => {
      const isFunpay = (it.dataset.value === "funpay");
      document.getElementById("rowLot")?.classList.toggle("hidden", !isFunpay);
      const lotInput = document.getElementById("payoutLotUrl");
      if (lotInput) lotInput.required = isFunpay;
    }));

  // Переключение платформы для лота (YouTube / TikTok)
  const lotPlatChoice = document.getElementById("lotPlatformChoice");
  if (lotPlatChoice) {
    lotPlatChoice.querySelectorAll(".choice-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        lotPlatChoice.querySelectorAll(".choice-card").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const platInput = document.getElementById("lotPlatformInput");
        if (platInput) platInput.value = btn.dataset.value;
      });
    });
  }

  // Переключение режима «Сколько вы в медиа» (автоматически / вручную)
  const lotDurMode = document.getElementById("lotDurationMode");
  const lotDurInput = document.getElementById("lotDurationInput");
  const lotDurHint = document.getElementById("lotDurationHint");

  function initLotDurationAuto() {
    if (!lotDurInput) return;
    const autoVal = formatDurationSince(CURRENT_ACCOUNT ? CURRENT_ACCOUNT.created_at : null);
    lotDurInput.value = autoVal;
    lotDurInput.readOnly = true;
    if (lotDurHint) {
      lotDurHint.textContent = `Рассчитано автоматически с даты регистрации аккаунта (${autoVal})`;
    }
  }

  if (lotDurMode && lotDurInput) {
    initLotDurationAuto();

    lotDurMode.querySelectorAll(".choice-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        lotDurMode.querySelectorAll(".choice-card").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        if (mode === "auto") {
          initLotDurationAuto();
        } else {
          lotDurInput.readOnly = false;
          lotDurInput.value = "";
          lotDurInput.placeholder = "Например: 6 месяцев";
          lotDurInput.focus();
          if (lotDurHint) {
            lotDurHint.textContent = "Укажите ваш реальный срок участия в медиа Delta Client";
          }
        }
      });
    });
  }

  // Переключение типа лота (выдача сабки / косметика / что-то другое)
  const lotChoice = document.getElementById("lotTypeChoice");
  if (lotChoice) {
    lotChoice.querySelectorAll(".choice-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        lotChoice.querySelectorAll(".choice-card").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const val = btn.dataset.value;
        const input = document.getElementById("lotTypeInput");
        if (input) input.value = val;

        const rowCustom = document.getElementById("rowLotCustom");
        const commentLabel = document.getElementById("lotCommentLabel");
        const commentInput = document.getElementById("lotComment");
        const customInput = document.getElementById("lotWantCustom");

        if (val === "sub") {
          rowCustom?.classList.add("hidden");
          if (customInput) customInput.required = false;
          if (commentLabel) commentLabel.textContent = "Никнейм для выдачи сабки (необязательно)";
          if (commentInput) commentInput.placeholder = "Если для зрителя или на свой аккаунт";
        } else if (val === "cosmetics") {
          rowCustom?.classList.add("hidden");
          if (customInput) customInput.required = false;
          if (commentLabel) commentLabel.textContent = "Предмет косметики / никнейм (необязательно)";
          if (commentInput) commentInput.placeholder = "Например: Плащ / крылья или ник получателя";
        } else if (val === "other") {
          rowCustom?.classList.remove("hidden");
          if (customInput) customInput.required = true;
          if (commentLabel) commentLabel.textContent = "Дополнительный комментарий (необязательно)";
          if (commentInput) commentInput.placeholder = "Комментарий или контакты";
        }
      });
    });
  }

  bindProofForm("hwid");
  bindProofForm("discord");
  bindSimpleForm("payout");
  bindSimpleForm("lot");
  bindIdeaBugForm();
}

function formToJSON(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  return data;
}

async function bindProofForm(kind) {
  const form = document.getElementById("form-" + kind);
  if (!form) return;
  const dropzone = document.getElementById("dropzone-" + kind);
  const filesInput = document.getElementById("proof-" + kind);
  const filesList = document.getElementById("filesList-" + kind);
  const progressWrap = document.getElementById("uploadProgress-" + kind);
  const progressFill = document.getElementById("progressFill-" + kind);
  const progressLabel = document.getElementById("progressLabel-" + kind);

  let picked = [];

  function renderList() {
    if (!filesList) return;
    if (picked.length === 0) {
      filesList.innerHTML = "";
      return;
    }
    filesList.innerHTML = picked.map((f, i) => {
      const isVid = f.type.startsWith("video/") || /\.(mp4|webm|mov|avi)$/i.test(f.name);
      const ico = isVid
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
      return `
        <div class="proof-file-card">
          <div class="proof-file-ico">${ico}</div>
          <div class="proof-file-info">
            <span class="proof-file-name" title="${esc(f.name)}">${esc(f.name)}</span>
            <span class="proof-file-size">${formatFileSize(f.size)}</span>
          </div>
          <button type="button" class="proof-file-remove" data-del="${i}" title="Удалить файл">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>`;
    }).join("");

    filesList.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.del;
        picked.splice(idx, 1);
        renderList();
      });
    });
  }

  function addFiles(fileList) {
    if (!fileList) return;
    for (const f of fileList) {
      if (!picked.some((p) => p.name === f.name && p.size === f.size)) {
        picked.push(f);
      }
    }
    renderList();
  }

  if (filesInput) {
    filesInput.addEventListener("change", () => {
      addFiles(filesInput.files);
      filesInput.value = "";
    });
  }

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("dragend", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const linkVal = (form.querySelector('[name="proof_link"]')?.value || "").trim();
    if (picked.length === 0 && !linkVal) {
      toast("Приложите доказательства: выберите файл(ы) или укажите ссылку", "err");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    buttonState(btn, "", "Отправка…");
    if (progressWrap) progressWrap.style.display = "flex";

    try {
      const paths = [];
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        if (progressLabel) {
          progressLabel.textContent = `Загрузка файла ${i + 1} из ${picked.length} (${file.name})…`;
        }
        const filePath = await uploadFileBig(file, (currChunk, totalChunks) => {
          if (progressFill) {
            const fileBasePct = (i / picked.length) * 100;
            const chunkPct = (currChunk / totalChunks) * (100 / picked.length);
            progressFill.style.width = Math.min(100, Math.round(fileBasePct + chunkPct)) + "%";
          }
        });
        if (filePath) paths.push(filePath);
      }

      if (progressFill) progressFill.style.width = "100%";
      if (progressLabel) progressLabel.textContent = "Сохранение заявки…";

      const fd = new FormData(form);
      fd.delete("proof");
      fd.delete("file");
      if (paths.length) {
        fd.append("proof_file_paths", paths.join(","));
      }

      const resp = await fetch("/api/mod/" + (kind === "hwid" ? "hwid" : "discord"), {
        method: "POST", body: fd, credentials: "same-origin",
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка");
      if (data.id) {
        const cache = getModRequestsCache();
        cache[`${kind}:${data.id}`] = { status: "pending", comment: "" };
        saveModRequestsCache(cache);
      }
      buttonState(btn, "ok", "Заявка отправлена", 3500);
      toast("Заявка успешно отправлена", "ok");
      form.reset();
      picked = [];
      renderList();
      if (progressWrap) progressWrap.style.display = "none";
      if (progressFill) progressFill.style.width = "0%";
    } catch (ex) {
      buttonState(btn, "err", ex.message, 4000);
      toast(ex.message, "err");
      if (progressWrap) progressWrap.style.display = "none";
    }
  });
}

async function bindIdeaBugForm() {
  const form = document.getElementById("form-ideabug");
  if (!form) return;

  const typeChoice = document.getElementById("feedbackTypeChoice");
  if (typeChoice) {
    typeChoice.querySelectorAll(".choice-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        typeChoice.querySelectorAll(".choice-card").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const val = btn.dataset.value;
        const input = document.getElementById("feedbackCategoryInput");
        if (input) input.value = val;

        const titleLabel = document.getElementById("feedbackTitleLabel");
        const titleInput = document.getElementById("feedbackTitle");
        const descLabel = document.getElementById("feedbackDescLabel");
        const descInput = document.getElementById("feedbackDescription");

        if (val === "idea") {
          if (titleLabel) titleLabel.textContent = "Тема идеи / предложения *";
          if (titleInput) titleInput.placeholder = "Краткая суть идеи или улучшения";
          if (descLabel) descLabel.textContent = "Подробное описание *";
          if (descInput) descInput.placeholder = "Опишите ваше предложение, почему это будет полезно для Delta Client...";
        } else {
          if (titleLabel) titleLabel.textContent = "Суть ошибки / бага *";
          if (titleInput) titleInput.placeholder = "Где и при каких условиях возникает баг";
          if (descLabel) descLabel.textContent = "Шаги для воспроизведения и описание *";
          if (descInput) descInput.placeholder = "1. Зайти в... 2. Нажать... Ожидаемый и фактический результат...";
        }
      });
    });
  }

  const dropzone = document.getElementById("dropzone-ideabug");
  const filesInput = document.getElementById("proof-ideabug");
  const filesList = document.getElementById("filesList-ideabug");
  const progressWrap = document.getElementById("uploadProgress-ideabug");
  const progressFill = document.getElementById("progressFill-ideabug");
  const progressLabel = document.getElementById("progressLabel-ideabug");

  let picked = [];

  function renderList() {
    if (!filesList) return;
    if (picked.length === 0) {
      filesList.innerHTML = "";
      return;
    }
    filesList.innerHTML = picked.map((f, i) => {
      const isVid = f.type.startsWith("video/") || /\.(mp4|webm|mov|avi)$/i.test(f.name);
      const ico = isVid
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
      return `
        <div class="proof-file-card">
          <div class="proof-file-ico">${ico}</div>
          <div class="proof-file-info">
            <span class="proof-file-name" title="${esc(f.name)}">${esc(f.name)}</span>
            <span class="proof-file-size">${formatFileSize(f.size)}</span>
          </div>
          <button type="button" class="proof-file-remove" data-del="${i}" title="Удалить файл">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>`;
    }).join("");

    filesList.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.del;
        picked.splice(idx, 1);
        renderList();
      });
    });
  }

  function addFiles(fileList) {
    if (!fileList) return;
    for (const f of fileList) {
      if (!picked.some((p) => p.name === f.name && p.size === f.size)) {
        picked.push(f);
      }
    }
    renderList();
  }

  if (filesInput) {
    filesInput.addEventListener("change", () => {
      addFiles(filesInput.files);
      filesInput.value = "";
    });
  }

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("dragend", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleVal = (form.querySelector('[name="title"]')?.value || "").trim();
    const descVal = (form.querySelector('[name="description"]')?.value || "").trim();
    if (!titleVal || !descVal) {
      toast("Заполните тему и описание обращения", "err");
      return;
    }

    const btn = form.querySelector("button[type=submit]");
    buttonState(btn, "", "Отправка…");
    if (progressWrap) progressWrap.style.display = "flex";

    try {
      const paths = [];
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        if (progressLabel) {
          progressLabel.textContent = `Загрузка файла ${i + 1} из ${picked.length} (${file.name})…`;
        }
        const filePath = await uploadFileBig(file, (currChunk, totalChunks) => {
          if (progressFill) {
            const fileBasePct = (i / picked.length) * 100;
            const chunkPct = (currChunk / totalChunks) * (100 / picked.length);
            progressFill.style.width = Math.min(100, Math.round(fileBasePct + chunkPct)) + "%";
          }
        });
        if (filePath) paths.push(filePath);
      }

      if (progressFill) progressFill.style.width = "100%";
      if (progressLabel) progressLabel.textContent = "Сохранение обращения…";

      const fd = new FormData(form);
      fd.delete("proof");
      fd.delete("file");
      if (paths.length) {
        fd.append("proof_file_paths", paths.join(","));
      }

      const resp = await fetch("/api/cabinet/feedback", {
        method: "POST", body: fd, credentials: "same-origin",
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка сохранения");

      buttonState(btn, "ok", "Обращение отправлено", 3500);
      toast("Ваше обращение успешно отправлено", "ok");
      form.reset();
      picked = [];
      renderList();
      if (typeChoice) {
        typeChoice.querySelectorAll(".choice-card").forEach((b) => b.classList.toggle("active", b.dataset.value === "idea"));
      }
      const categoryInput = document.getElementById("feedbackCategoryInput");
      if (categoryInput) categoryInput.value = "idea";
      if (progressWrap) progressWrap.style.display = "none";
      if (progressFill) progressFill.style.width = "0%";
    } catch (ex) {
      buttonState(btn, "err", ex.message, 4000);
      toast(ex.message, "err");
      if (progressWrap) progressWrap.style.display = "none";
    }
  });
}

async function bindSimpleForm(kind) {
  const form = document.getElementById("form-" + kind);
  if (!form) return;
  const endpoint = { payout: "/api/cabinet/payout", lot: "/api/cabinet/lot", sub: "/api/cabinet/subscription" }[kind];
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const body = formToJSON(form);
    if (kind === "payout") {
      body.promo_code = (body.promo_code || "").trim();
      if (!body.promo_code) {
        toast("Укажите ваш промокод", "err");
        buttonState(btn, "err", "Укажите промокод", 3000);
        return;
      }
      body.method = (document.getElementById("payMethod")?.dataset.value || "").toLowerCase();
      if (!body.method) {
        toast("Выберите способ выплаты", "err");
        buttonState(btn, "err", "Выберите способ", 3000);
        return;
      }
      if (body.method === "funpay" && (!body.lot_url || !body.lot_url.trim())) {
        toast("Укажите ссылку на лот FunPay", "err");
        buttonState(btn, "err", "Укажите лот", 3000);
        return;
      }
    }
    if (kind === "lot") {
      const lotType = body.lot_type || "sub";
      if (lotType === "sub") {
        body.want = "Выдача сабки" + (body.comment ? ` (Ник: ${body.comment})` : "");
      } else if (lotType === "cosmetics") {
        body.want = "Косметика" + (body.comment ? ` (${body.comment})` : "");
      } else if (lotType === "other") {
        if (!body.want_custom || !body.want_custom.trim()) {
          toast("Укажите, что именно вы хотите получить", "err");
          return;
        }
        body.want = body.want_custom.trim();
      }

      body.platform = (body.platform || "youtube").toLowerCase();
      if (body.platform !== "youtube" && body.platform !== "tiktok") {
        body.platform = "youtube";
      }

      body.duration = (body.duration || "").trim();
      if (!body.duration) {
        toast("Укажите, сколько вы в медиа Delta", "err");
        return;
      }
    }
    buttonState(btn, "", "Отправка…");
    try {
      const resp = await POST(endpoint, body);
      buttonState(btn, "ok", `Заявка №${resp.id} принята`, 3500);
      toast(`Заявка №${resp.id} успешно принята`, "ok");
      form.reset();
      if (kind === "payout") {
        document.getElementById("rowLot")?.classList.add("hidden");
        const d = document.getElementById("payMethod");
        if (d) {
          delete d.dataset.value;
          const valSpan = d.querySelector(".dropdown-value");
          if (valSpan) valSpan.textContent = "Выберите способ";
          d.querySelectorAll(".dropdown-item").forEach((it) => it.classList.remove("picked"));
        }
      }
      if (kind === "lot") {
        document.getElementById("rowLotCustom")?.classList.add("hidden");
        const choice = document.getElementById("lotTypeChoice");
        if (choice) {
          choice.querySelectorAll(".choice-card").forEach((b) => b.classList.toggle("active", b.dataset.value === "sub"));
        }
        const lotTypeInput = document.getElementById("lotTypeInput");
        if (lotTypeInput) lotTypeInput.value = "sub";
        const commentLabel = document.getElementById("lotCommentLabel");
        if (commentLabel) commentLabel.textContent = "Никнейм для выдачи сабки (необязательно)";
        const commentInput = document.getElementById("lotComment");
        if (commentInput) commentInput.placeholder = "Если для зрителя или на свой аккаунт";

        const platChoice = document.getElementById("lotPlatformChoice");
        if (platChoice) {
          platChoice.querySelectorAll(".choice-card").forEach((b) => b.classList.toggle("active", b.dataset.value === "youtube"));
        }
        const platInput = document.getElementById("lotPlatformInput");
        if (platInput) platInput.value = "youtube";

        const lotDurMode = document.getElementById("lotDurationMode");
        if (lotDurMode) {
          lotDurMode.querySelectorAll(".choice-card").forEach((b) => b.classList.toggle("active", b.dataset.mode === "auto"));
        }
        const lotDurInput = document.getElementById("lotDurationInput");
        const lotDurHint = document.getElementById("lotDurationHint");
        if (lotDurInput) {
          const autoVal = formatDurationSince(CURRENT_ACCOUNT ? CURRENT_ACCOUNT.created_at : null);
          lotDurInput.value = autoVal;
          lotDurInput.readOnly = true;
          if (lotDurHint) {
            lotDurHint.textContent = `Рассчитано автоматически с даты регистрации аккаунта (${autoVal})`;
          }
        }
      }
    } catch (ex) {
      buttonState(btn, "err", ex.message, 4000);
      toast(ex.message, "err");
    }
  });
}
