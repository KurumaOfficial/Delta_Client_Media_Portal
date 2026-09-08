/* admin.js — панель администратора: обзор, заявки, выплаты, аккаунты, баны, окна, журнал, тексты */
"use strict";

let adminCat = "overview";
let adminCache = {};     // данные таблиц для клиентских фильтров
let logsPollTimer = null;

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("ru-RU");
  } catch {
    return String(iso);
  }
}

// lucide-иконки (та же библиотека, что на deltaclient.xyz)
const ICONS = {
  payouts: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
  accounts: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  bans: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
  windows: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>',
  logs: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>',
  edit: '<svg class="h-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
};

function initAdminNav() {
  document.querySelectorAll(".side-btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.cat === adminCat) return;
      document.querySelectorAll(".side-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      adminCat = b.dataset.cat;
      clearInterval(logsPollTimer);
      ADMIN_FILTER.search = ""; ADMIN_FILTER.statuses = new Set(); ADMIN_FILTER.page = {};
      renderAdminCategory();
    }));
}

async function renderAdminCategory() {
  const body = document.getElementById("adminBody");
  if (!body) return;
  body.classList.remove("tab-fade-in");
  void body.offsetWidth;
  body.classList.add("tab-fade-in");
  body.innerHTML = '<p class="hint">Загрузка…</p>';
  try {
    if (adminCat === "overview") await renderOverview();
    else if (adminCat === "media") await renderAppsTable("media");
    else if (adminCat === "hwid") await renderAppsTable("hwid");
    else if (adminCat === "discord") await renderAppsTable("discord");
    else if (adminCat === "payouts") await renderPayouts();
    else if (adminCat === "accounts") await renderAccounts();
    else if (adminCat === "bans") await renderBans();
    else if (adminCat === "windows") await renderWindows();
    else if (adminCat === "logs") await renderLogs();
    else if (adminCat === "settings") await renderSettings();
  } catch (e) {
    body.innerHTML = `<div class="card">${esc(e.message)}</div>`;
  }
  body.classList.remove("tab-fade-in");
  void body.offsetWidth;
  body.classList.add("tab-fade-in");
}

// ── Глобальный фильтр-бар (действует на все таблицы) ──
function filterBarHTML(withStatuses) {
  const n = ADMIN_FILTER.statuses ? ADMIN_FILTER.statuses.size : 0;
  let statusText = "Статусы: все";
  if (n === 1) {
    if (ADMIN_FILTER.statuses.has("pending")) statusText = "в ожидании";
    else if (ADMIN_FILTER.statuses.has("approved")) statusText = "одобрено";
    else if (ADMIN_FILTER.statuses.has("rejected")) statusText = "отклонено";
  } else if (n > 1) {
    statusText = `Статусы: ${n}`;
  }
  const isPending = ADMIN_FILTER.statuses && ADMIN_FILTER.statuses.has("pending");
  const isApproved = ADMIN_FILTER.statuses && ADMIN_FILTER.statuses.has("approved");
  const isRejected = ADMIN_FILTER.statuses && ADMIN_FILTER.statuses.has("rejected");

  return `
  <div class="filter-bar">
    <input type="text" id="fSearch" placeholder="Поиск по таблице…" value="${esc(ADMIN_FILTER.search || '')}">
    ${withStatuses ? `
    <div class="dropdown multi ${n > 0 ? 'has-value' : ''}" id="fStatus" data-placeholder="Статусы: все">
      <button type="button" class="dropdown-head"><span class="dropdown-value">${statusText}</span><span class="chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></button>
      <div class="dropdown-menu">
        <label class="dropdown-item check ${isPending ? 'picked' : ''}"><input type="checkbox" value="pending" ${isPending ? 'checked' : ''}> в ожидании</label>
        <label class="dropdown-item check ${isApproved ? 'picked' : ''}"><input type="checkbox" value="approved" ${isApproved ? 'checked' : ''}> одобрено</label>
        <label class="dropdown-item check ${isRejected ? 'picked' : ''}"><input type="checkbox" value="rejected" ${isRejected ? 'checked' : ''}> отклонено</label>
      </div>
    </div>` : "<span></span>"}
    <button class="btn-ghost" id="fReset" type="button">Сбросить</button>
    <span class="hint" style="align-self:center;margin:0;">Новые заявки — внизу</span>
  </div>`;
}

function bindFilterBar(rerender) {
  const s = document.getElementById("fSearch");
  if (s && !s.dataset.bound) {
    s.dataset.bound = "1";
    s.addEventListener("input", () => {
      ADMIN_FILTER.search = s.value.trim().toLowerCase();
      rerender();
    });
  }
  const reset = document.getElementById("fReset");
  if (reset && !reset.dataset.bound) {
    reset.dataset.bound = "1";
    reset.addEventListener("click", () => {
      ADMIN_FILTER.search = "";
      ADMIN_FILTER.statuses = new Set();
      ADMIN_FILTER.page = {};
      const searchInput = document.getElementById("fSearch");
      if (searchInput) searchInput.value = "";
      document.querySelectorAll("#fStatus input").forEach((c) => {
        c.checked = false;
        c.closest(".dropdown-item")?.classList.remove("picked");
      });
      const drop = document.getElementById("fStatus");
      if (drop) drop.classList.remove("has-value");
      const valEl = document.querySelector("#fStatus .dropdown-value");
      if (valEl) valEl.textContent = "Статусы: все";
      rerender();
    });
  }
  document.querySelectorAll("#fStatus input").forEach((c) => {
    if (c.dataset.bound) return;
    c.dataset.bound = "1";
    c.addEventListener("change", () => {
      if (c.checked) ADMIN_FILTER.statuses.add(c.value);
      else ADMIN_FILTER.statuses.delete(c.value);
      c.closest(".dropdown-item")?.classList.toggle("picked", c.checked);
      const n = ADMIN_FILTER.statuses.size;
      let statusText = "Статусы: все";
      if (n === 1) {
        if (ADMIN_FILTER.statuses.has("pending")) statusText = "в ожидании";
        else if (ADMIN_FILTER.statuses.has("approved")) statusText = "одобрено";
        else if (ADMIN_FILTER.statuses.has("rejected")) statusText = "отклонено";
      } else if (n > 1) {
        statusText = `Статусы: ${n}`;
      }
      const drop = document.getElementById("fStatus");
      if (drop) drop.classList.toggle("has-value", n > 0);
      const valEl = document.querySelector("#fStatus .dropdown-value");
      if (valEl) valEl.textContent = statusText;
      rerender();
    });
  });
}

// ── Обзор ──
async function renderOverview() {
  const { stats } = await GET("/api/admin/stats");
  const appsOpen = stats.apps_open !== false;
  const maintActive = !!stats.maintenance_enabled;
  document.getElementById("adminBody").innerHTML = `
    ${filterBarHTML(false)}
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.25rem;margin-bottom:1.25rem;">
      <!-- Приём заявок -->
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:1.25rem;flex-wrap:wrap;border:1px solid ${appsOpen ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'};background:${appsOpen ? 'rgba(52,211,153,0.04)' : 'rgba(248,113,113,0.04)'};">
        <div>
          <div style="display:flex;align-items:center;gap:0.65rem;">
            <span class="dot" style="width:10px;height:10px;border-radius:9999px;background:${appsOpen ? 'var(--emerald)' : 'var(--rose)'};box-shadow:0 0 12px ${appsOpen ? 'rgba(52,211,153,0.9)' : 'rgba(248,113,113,0.9)'};"></span>
            <b style="font-size:1.05rem;">Приём медиа-заявок: ${appsOpen ? '<span style="color:var(--emerald)">ОТКРЫТ</span>' : '<span style="color:var(--rose)">ЗАКРЫТ</span>'}</b>
          </div>
          <p class="hint" style="margin-top:0.35rem;">
            ${appsOpen ? 'На главной отображается «приём заявок открыт», форма активна.' : 'На главной отображается «приём заявок закрыт», кнопка заблокирована.'}
          </p>
        </div>
        <button class="btn-ghost" id="toggleAppsBtn" style="padding:0.65rem 1.35rem;font-weight:600;border:1px solid ${appsOpen ? 'rgba(248,113,113,0.45)' : 'rgba(52,211,153,0.45)'};background:${appsOpen ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)'};color:${appsOpen ? 'var(--rose)' : 'var(--emerald)'};">
          ${appsOpen ? '✕ Закрыть набор' : '✓ Открыть набор'}
        </button>
      </div>

      <!-- Режим техработ -->
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:1.25rem;flex-wrap:wrap;border:1px solid ${maintActive ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.08)'};background:${maintActive ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)'};">
        <div>
          <div style="display:flex;align-items:center;gap:0.65rem;">
            <span class="dot ${maintActive ? 'animate-blink' : ''}" style="width:10px;height:10px;border-radius:9999px;background:${maintActive ? '#fbbf24' : 'rgba(255,255,255,0.25)'};box-shadow:0 0 12px ${maintActive ? 'rgba(251,191,36,0.9)' : 'none'};"></span>
            <b style="font-size:1.05rem;">Технические работы: ${maintActive ? '<span style="color:#fbbf24">АКТИВНЫ</span>' : '<span style="color:rgba(255,255,255,0.5)">ВЫКЛЮЧЕНЫ</span>'}</b>
          </div>
          <p class="hint" style="margin-top:0.35rem;">
            ${maintActive ? `Сайт на паузе с таймером. Доступ только персоналу. До: ${formatDate(stats.maintenance_until)}` : 'Сайт открыт для всех посетителей. Таймер отключён.'}
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
          ${maintActive ? `<button type="button" id="previewMaintBtn" class="btn-ghost" style="padding:0.65rem 1.1rem;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.85);cursor:pointer;">👁 Страница техработ</button>` : ''}
          <button class="btn-ghost" id="toggleMaintenanceBtn" style="padding:0.65rem 1.35rem;font-weight:600;border:1px solid ${maintActive ? 'rgba(248,113,113,0.45)' : 'rgba(251,191,36,0.45)'};background:${maintActive ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)'};color:${maintActive ? 'var(--rose)' : '#fbbf24'};">
            ${maintActive ? '✕ Отключить техработы' : '⚙ Включить техработы'}
          </button>
        </div>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat-card"><b>${stats.media_pending}</b><span>Медиа заявки (в ожидании)</span></div>
      <div class="stat-card"><b>${stats.discord_pending}</b><span>Discord баны</span></div>
      <div class="stat-card"><b>${stats.payouts_pending}</b><span>Выплаты (неделя)</span></div>
      <div class="stat-card"><b>${stats.accounts_total}</b><span>Активные аккаунты</span></div>
    </div>
    <div class="card"><b>${esc(stats.week_label || "—")}</b>
      <p class="hint">${stats.week_open ? "🟢 Приём выплат открыт" : "🔴 Приём выплат закрыт (окно: вт 01:00 — пн 22:00 МСК)"}</p>
    </div>`;

  document.getElementById("previewMaintBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (typeof showView === "function") {
      showView("maintenance");
    } else {
      window.location.href = "/maintenance";
    }
  });

  document.getElementById("toggleAppsBtn")?.addEventListener("click", async () => {
    const res = await POST("/api/admin/toggle-apps", { open: !appsOpen });
    if (res.success) {
      toast(res.apps_open ? "Набор заявок открыт" : "Набор заявок закрыт", "ok");
      if (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG) {
        SITE_CONFIG.apps_open = res.apps_open;
      }
      if (typeof updateAppsOpenUI === "function") {
        updateAppsOpenUI(res.apps_open);
      }
      renderOverview();
    } else {
      toast(res.error || "Ошибка изменения статуса", "err");
    }
  });

  document.getElementById("toggleMaintenanceBtn")?.addEventListener("click", async () => {
    if (maintActive) {
      const res = await POST("/api/admin/toggle-maintenance", { enabled: false });
      if (res.success) {
        toast("Технические работы отключены", "ok");
        if (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG) {
          SITE_CONFIG.maintenance_enabled = false;
          SITE_CONFIG.maintenance_until = "";
          SITE_CONFIG.maintenance_seconds_left = 0;
        }
        if (typeof updateMaintenanceUI === "function") {
          updateMaintenanceUI();
        }
        renderOverview();
      } else {
        toast(res.error || "Ошибка", "err");
      }
    } else {
      openMaintenanceModal();
    }
  });

  bindFilterBar(() => renderOverview());
}

let selectedMaintMinutes = 60;

function openMaintenanceModal() {
  selectedMaintMinutes = 60;
  const modal = document.getElementById("maintenanceModal");
  if (!modal) return;
  const customInput = document.getElementById("maintCustomMinutes");
  if (customInput) customInput.value = "";
  const errEl = document.getElementById("maintModalError");
  if (errEl) { errEl.textContent = ""; errEl.classList.add("hidden"); }

  document.querySelectorAll("#maintPresets .maint-preset").forEach((btn) => {
    const min = parseInt(btn.dataset.min, 10);
    const isActive = min === 60;
    btn.style.border = isActive ? "1px solid rgba(133,155,255,0.4)" : "1px solid rgba(255,255,255,0.1)";
    btn.style.background = isActive ? "rgba(133,155,255,0.1)" : "transparent";
  });

  openModal("maintenanceModal");
}

let maintModalInited = false;
function initMaintenanceModal() {
  if (maintModalInited) return;
  maintModalInited = true;

  document.querySelectorAll("#maintPresets .maint-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMaintMinutes = parseInt(btn.dataset.min, 10);
      const customInput = document.getElementById("maintCustomMinutes");
      if (customInput) customInput.value = "";
      document.querySelectorAll("#maintPresets .maint-preset").forEach((b) => {
        const isActive = b === btn;
        b.style.border = isActive ? "1px solid rgba(133,155,255,0.4)" : "1px solid rgba(255,255,255,0.1)";
        b.style.background = isActive ? "rgba(133,155,255,0.1)" : "transparent";
      });
    });
  });

  const customInput = document.getElementById("maintCustomMinutes");
  if (customInput) {
    customInput.addEventListener("input", () => {
      const val = parseInt(customInput.value, 10);
      if (val > 0) {
        selectedMaintMinutes = val;
        document.querySelectorAll("#maintPresets .maint-preset").forEach((b) => {
          b.style.border = "1px solid rgba(255,255,255,0.1)";
          b.style.background = "transparent";
        });
      }
    });
  }

  document.getElementById("maintModalOk")?.addEventListener("click", async () => {
    const mins = selectedMaintMinutes;
    if (!mins || mins <= 0) {
      const errEl = document.getElementById("maintModalError");
      if (errEl) {
        errEl.textContent = "Укажите корректное время техработ";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const res = await POST("/api/admin/toggle-maintenance", { enabled: true, duration_minutes: mins });
    if (res.success) {
      closeModal("maintenanceModal");
      toast("Техработы включены на " + mins + " мин", "ok");
      if (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG) {
        SITE_CONFIG.maintenance_enabled = true;
        SITE_CONFIG.maintenance_until = res.maintenance_until;
        SITE_CONFIG.maintenance_seconds_left = res.maintenance_seconds_left;
      }
      if (typeof updateMaintenanceUI === "function") {
        updateMaintenanceUI();
      }
      // Перенаправляем на отдельный роут техработ /maintenance
      if (typeof showView === "function") {
        showView("maintenance");
      } else {
        window.location.href = "/maintenance";
      }
    } else {
      const errEl = document.getElementById("maintModalError");
      if (errEl) {
        errEl.textContent = res.error || "Не удалось включить техработы";
        errEl.classList.remove("hidden");
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initMaintenanceModal);
initMaintenanceModal();

// ── Заявки media/hwid/discord ──
const APP_TABLES = {
  media: { api: "/api/admin/media", decide: (id, st, c) => POST(`/api/admin/media/${id}/decide`, { status: st, admin_comment: c }),
    title: "Заявки на вступление в медиа", pageSize: 10 },
  hwid: { api: "/api/admin/hwid", decide: (id, st, c) => POST(`/api/admin/hwid/${id}/decide`, { status: st, admin_comment: c }),
    title: "HWID запросы", pageSize: 10 },
  discord: { api: "/api/admin/discord", decide: (id, st, c) => POST(`/api/admin/discord/${id}/decide`, { status: st, admin_comment: c }),
    title: "Discord баны", pageSize: 10 },
};

async function renderAppsTable(kind) {
  const cfg = APP_TABLES[kind];
  adminCache[kind] = (await GET(cfg.api)).data || [];
  drawAppsTable(kind, cfg);
}

function drawAppsTable(kind, cfg) {
  const all = adminCache[kind] || [];
  const filtered = all.filter((r) => applyGlobalFilter(
    JSON.stringify(r).toLowerCase(), kind === "hwid" ? "" : r.status));

  // пагинация: новые внизу (ASC), срез текущей страницы
  const pageSize = cfg.pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(ADMIN_FILTER.page[kind] || 1, pages);
  ADMIN_FILTER.page[kind] = page;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const rows = pageRows.map((r) => {
    if (kind === "media") {
      const tgClean = (r.telegram || "").replace(/^@/, "");
      const tgLink = tgClean ? `<a href="https://t.me/${esc(tgClean)}" target="_blank" rel="noopener" class="link-chip" onclick="event.stopPropagation()">@${esc(tgClean)}</a>` : '<span class="hint">—</span>';
      return `
        <tr class="clickable-row" data-media-id="${r.id}" style="cursor:pointer;" title="Нажмите, чтобы просмотреть всю информацию по заявке">
          <td class="mono">#${r.id}</td>
          <td class="mono">${esc(r.uid)}</td>
          <td><b>${esc(r.platform)}</b></td>
          <td><a href="${esc(r.channel_url)}" target="_blank" rel="noopener" class="link-chip" onclick="event.stopPropagation()">${esc(r.channel_url)}</a></td>
          <td>${esc(r.servers)}</td>
          <td>${tgLink}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${r.status === "pending" ? `<div class="row-actions" onclick="event.stopPropagation()">
            <button class="act" data-decide="approved" data-id="${r.id}">✓ Одобрить</button>
            <button class="act reject" data-decide="rejected" data-id="${r.id}">✕ Отклонить</button></div>` : "—"}</td>
        </tr>`;
    }
    if (kind === "hwid") return `
      <tr><td class="mono">#${r.id}</td><td><b>${esc(r.mod_nickname)}</b></td><td class="mono">${esc(r.uuid)}</td>
      <td>${proofLinks(r.proof_file, r.proof_link)}</td><td>${esc(r.reason)}</td></tr>`;
    return `
      <tr><td class="mono">#${r.id}</td><td><b>${esc(r.mod_nickname)}</b></td><td class="mono">${esc(r.offender_id)}</td>
      <td>${proofLinks(r.proof_file, r.proof_link)}</td><td>${esc(r.reason)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.status === "pending" ? decideButtons(r.id) : "—"}</td></tr>`;
  }).join("");

  const theadCols = kind === "media"
    ? "<th>ID</th><th>UID</th><th>Платформа</th><th>Канал</th><th>Серверы</th><th>Telegram</th><th>Статус</th><th>Действия</th>"
    : kind === "hwid"
    ? "<th>ID</th><th>Модератор</th><th>UID</th><th>Доказательства</th><th>Причина</th>"
    : "<th>ID</th><th>Модератор</th><th>Нарушитель</th><th>Доказательства</th><th>Причина</th><th>Статус</th><th>Действия</th>";
  const colSpan = kind === "hwid" ? 5 : (kind === "media" ? 8 : 7);

  const tableBoxHTML = `
    <div class="table-box"><h3>${cfg.title} <span class="badge pending">${filtered.length}</span></h3>
      <div class="table-scroll"><table>
        <thead><tr>${theadCols}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${colSpan}" class="hint">Нет заявок</td></tr>`}</tbody>
      </table></div>
      <div class="pager" id="pager-${kind}"></div>
    </div>`;

  const withStatuses = kind !== "hwid";
  let tableWrap = document.getElementById("adminTableWrap");
  const hasStatusFilter = !!document.getElementById("fStatus");
  if (!tableWrap || (withStatuses !== hasStatusFilter)) {
    document.getElementById("adminBody").innerHTML = `
      <div id="adminFilterWrap">${filterBarHTML(withStatuses)}</div>
      <div id="adminTableWrap">${tableBoxHTML}</div>`;
    tableWrap = document.getElementById("adminTableWrap");
    bindFilterBar(() => drawAppsTable(kind, cfg));
  } else {
    tableWrap.innerHTML = tableBoxHTML;
  }

  renderPager("pager-" + kind, kind, filtered.length, pageSize, () => drawAppsTable(kind, cfg));

  if (kind === "media") {
    document.querySelectorAll("[data-media-id]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const id = parseInt(tr.dataset.mediaId, 10);
        const app = (adminCache["media"] || []).find((x) => x.id === id);
        if (app) openMediaAppModal(app);
      });
    });
    document.querySelectorAll("[data-view-media]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.viewMedia, 10);
        const app = (adminCache["media"] || []).find((x) => x.id === id);
        if (app) openMediaAppModal(app);
      });
    });
  }

  document.querySelectorAll(`[data-decide]`).forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.dataset.id, decision = b.dataset.decide;
      const comment = await askComment(
        (decision === "approved" ? "Одобрение" : "Отклонение") + " заявки #" + id, false);
      if (comment === null) return;
      try {
        await cfg.decide(id, decision, comment);
        toast("Решение применено", "ok");
        renderAppsTable(kind);
      } catch (e) { toast(e.message, "err"); }
    }));
}

function openMediaAppModal(r) {
  let modalWrap = document.getElementById("mediaAppModalOverlay");
  if (!modalWrap) {
    modalWrap = document.createElement("div");
    modalWrap.id = "mediaAppModalOverlay";
    modalWrap.className = "ban-modal-overlay";
    document.body.appendChild(modalWrap);
  }

  const isYT = r.platform === "youtube";
  const tgClean = (r.telegram || "").replace(/^@/, "");
  const exclusiveLabel = r.exclusive === "yes" ? "Да (только Delta Client)" : "Нет";

  modalWrap.innerHTML = `
    <div class="media-modal-card">
      <div class="ban-modal-header">
        <div class="ban-modal-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-400)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
          </svg>
          Заявка в медиа #${r.id}
          ${statusBadge(r.status)}
        </div>
        <button type="button" class="ban-modal-close" id="mediaModalCloseBtn">&times;</button>
      </div>

      <div class="media-info-grid">
        <div class="media-info-item">
          <div class="media-info-label">UID заявителя</div>
          <div class="media-info-value mono" style="color:var(--color-primary-300);">${esc(r.uid)}</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Telegram</div>
          <div class="media-info-value">
            ${tgClean ? `<a href="https://t.me/${esc(tgClean)}" target="_blank" rel="noopener" class="link-chip" style="font-weight:600;">@${esc(tgClean)} ↗</a>` : '<span class="hint">—</span>'}
          </div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Платформа</div>
          <div class="media-info-value" style="font-weight:600;">
            ${isYT ? `<span style="color:#f87171;">YouTube</span>` : `<span style="color:#38bdf8;">TikTok</span>`}
          </div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Канал / Аккаунт</div>
          <div class="media-info-value">
            ${r.channel_url ? `<a href="${esc(r.channel_url)}" target="_blank" rel="noopener" class="link-chip" style="word-break:break-all;">${esc(r.channel_url)} ↗</a>` : '<span class="hint">—</span>'}
          </div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Серверы</div>
          <div class="media-info-value">${esc(r.servers || "—")}</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">${isYT ? "Роликов в неделю" : "Сотрудничества / опыт"}</div>
          <div class="media-info-value">${esc(isYT ? (r.videos_per_week || "—") : (r.collaborations || "—"))}</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Эксклюзивный контент</div>
          <div class="media-info-value">${esc(exclusiveLabel)}</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Согласие с критериями</div>
          <div class="media-info-value" style="color:var(--emerald);">✓ Да, согласен</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Дата подачи</div>
          <div class="media-info-value" style="color:var(--text-muted);">${formatDate(r.created_at)}</div>
        </div>
        <div class="media-info-item">
          <div class="media-info-label">Язык интерфейса</div>
          <div class="media-info-value mono">${esc((r.lang || "ru").toUpperCase())}</div>
        </div>
      </div>

      <div class="media-motivation-block">
        <div class="media-info-label" style="margin-bottom:0.5rem;color:rgba(255,255,255,0.7);">Мотивация («Почему именно вы?»)</div>
        <div class="media-motivation-text">${esc(r.why_join || "—")}</div>
      </div>

      ${r.admin_comment ? `
        <div class="media-info-item" style="margin-bottom:1.15rem;border-color:rgba(142,126,255,0.3);background:rgba(142,126,255,0.06);">
          <div class="media-info-label" style="color:var(--color-primary-300);">Комментарий администратора</div>
          <div class="media-info-value" style="white-space:pre-wrap;">${esc(r.admin_comment)}</div>
        </div>
      ` : ""}

      ${r.status === "pending" ? `
        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:1.25rem;">
          <div style="margin-bottom:0.85rem;">
            <label style="display:block;font-size:0.8rem;color:rgba(255,255,255,0.6);margin-bottom:0.35rem;">Комментарий к решению (опционально):</label>
            <input type="text" id="modalMediaComment" placeholder="Причина отказа или приветствие..." style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:0.65rem 0.95rem;color:#fff;outline:none;">
          </div>
          <div style="display:flex;gap:0.75rem;align-items:center;">
            <button type="button" id="modalApproveBtn" class="btn-primary" style="background:linear-gradient(135deg,#10b981,#059669);flex:1;padding:0.75rem;font-weight:600;">✓ Одобрить заявку</button>
            <button type="button" id="modalRejectBtn" class="btn-ghost" style="color:var(--rose);border:1px solid rgba(248,113,113,0.3);flex:1;padding:0.75rem;font-weight:600;">✕ Отклонить заявку</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  void modalWrap.offsetWidth;
  modalWrap.classList.add("open");

  const closeModal = () => {
    modalWrap.classList.remove("open");
  };

  document.getElementById("mediaModalCloseBtn").addEventListener("click", closeModal);
  modalWrap.addEventListener("click", (e) => {
    if (e.target === modalWrap) closeModal();
  });

  const onKeyEsc = (e) => {
    if (e.key === "Escape") {
      closeModal();
      window.removeEventListener("keydown", onKeyEsc);
    }
  };
  window.addEventListener("keydown", onKeyEsc);

  document.getElementById("modalApproveBtn")?.addEventListener("click", async () => {
    const comment = document.getElementById("modalMediaComment")?.value.trim() || "";
    try {
      await APP_TABLES.media.decide(r.id, "approved", comment);
      toast("Заявка #" + r.id + " одобрена", "ok");
      closeModal();
      renderAppsTable("media");
    } catch (ex) {
      toast(ex.message, "err");
    }
  });

  document.getElementById("modalRejectBtn")?.addEventListener("click", async () => {
    const comment = document.getElementById("modalMediaComment")?.value.trim() || "";
    try {
      await APP_TABLES.media.decide(r.id, "rejected", comment);
      toast("Заявка #" + r.id + " отклонена", "ok");
      closeModal();
      renderAppsTable("media");
    } catch (ex) {
      toast(ex.message, "err");
    }
  });
}

function decideButtons(id) {
  return `<div class="row-actions">
    <button class="act" data-decide="approved" data-id="${id}">✓ Одобрить</button>
    <button class="act reject" data-decide="rejected" data-id="${id}">✕ Отклонить</button></div>`;
}

function proofLinks(files, link) {
  const parts = [];
  (files || "").split(",").filter(Boolean).forEach((p, i) =>
    parts.push(`<a href="${esc(p)}" target="_blank" rel="noopener">Файл ${i + 1}</a>`));
  if (link) parts.push(`<a href="${esc(link)}" target="_blank" rel="noopener">Ссылка</a>`);
  return parts.join(", ") || "—";
}

// ═══ Категория «Медиа выплаты» ═══

let payoutsWeekID = null;

async function renderPayouts(keepWeek) {
  const q = keepWeek && payoutsWeekID ? "?week=" + payoutsWeekID : "";
  const data = await GET("/api/admin/payouts" + q);
  payoutsWeekID = data.week ? data.week.id : null;
  const week = data.week || {};
  const stats = data.stats || {};
  const rows = (data.data || []).filter((r) =>
    applyGlobalFilter(JSON.stringify(r).toLowerCase(), r.status)).map((r) => {
    const kindT = { payout: "Выплата", lot: "Лот", subscription: "Подписка" }[r.kind] || r.kind;
    const method = r.method === "usdt" ? `USDT ${esc(r.amount)}` :
                   r.method === "funpay" ? `<a href="${esc(r.lot_url)}" target="_blank" rel="noopener">FunPay лот</a>` : "—";
    return `<tr>
      <td class="mono">#${r.id}</td>
      <td><b>${esc(r.nickname)}</b><br><small>${esc(r.telegram)} ${r.source === "telegram" ? "· из TG" : ""}</small></td>
      <td class="mono">${esc(r.uid)}</td>
      <td>${esc(r.duration || "—")}</td>
      <td>${esc(r.want || "—")}</td>
      <td>${kindT}<br><small>${method}</small></td>
      <td>${statusBadge(r.status)}${r.decision_comment ? `<br><small>💬 ${esc(r.decision_comment)}</small>` : ""}</td>
      <td>${r.status === "pending" ? `<div class="row-actions">
        <button class="act" data-pay="approve" data-id="${r.id}">✓ Принять</button>
        <button class="act reject" data-pay="reject" data-id="${r.id}">✕ Отклонить</button></div>` : "—"}</td>
    </tr>`;
  }).join("");

  const weeks = (data.history || []).map((w) =>
    `<option value="${w.id}" ${w.id === payoutsWeekID ? "selected" : ""}>${esc(w.label)}${w.is_current ? " (текущая)" : ""}</option>`).join("");

  const payoutsBoxHTML = `
    <div class="table-box">
      <h3>${ICONS.payouts} Медиа выплаты
        <span class="badge ${week.is_current ? "approved" : "frozen"}">${week.is_current ? "приём открыт" : "архив"}</span>
        <div class="week-bar">
          <select id="weekSelect">${weeks}</select>
          <span class="hint">Всего: ${stats.total || 0} · В ожидании: ${stats.pending || 0} · Одобрено: ${stats.approved || 0} · USDT: ${stats.usdt_total || 0} · FunPay: ${stats.funpay_count || 0}</span>
        </div>
      </h3>
      <div class="table-scroll"><table>
        <thead><tr><th>ID</th><th>Заявитель</th><th>UID</th><th>В медиа</th><th>Хочет</th><th>Тип/способ</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="hint">Заявок на этой неделе нет</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="card summary-editor">
      <h3>${ICONS.edit} Итоговый текст недели <span class="hint">(редактируется как черновик; сохраняется в БД по неделям)</span></h3>
      <textarea id="weekSummary">${esc(week.summary_text || "")}</textarea>
      <div class="row-actions">
        <button class="btn-primary" id="saveSummary">Сохранить</button>
        <button class="btn-ghost" id="genSummary">Сгенерировать черновик</button>
      </div>
    </div>`;

  let tableWrap = document.getElementById("adminTableWrap");
  if (!tableWrap || !document.getElementById("fStatus")) {
    document.getElementById("adminBody").innerHTML = `
      <div id="adminFilterWrap">${filterBarHTML(true)}</div>
      <div id="adminTableWrap">${payoutsBoxHTML}</div>`;
    tableWrap = document.getElementById("adminTableWrap");
    bindFilterBar(() => renderPayouts(true));
  } else {
    tableWrap.innerHTML = payoutsBoxHTML;
  }

  document.getElementById("weekSelect")?.addEventListener("change", (e) => {
    payoutsWeekID = +e.target.value;
    renderPayouts(true);
  });

  document.querySelectorAll("[data-pay]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.id, action = b.dataset.pay;
      if (action === "reject") {
        const reason = await askComment("Отклонение выплаты #" + id, true);
        if (reason === null) return;
        try {
          await POST(`/api/admin/payouts/${id}/decide`, { action: "reject", reason });
          toast("Выплата отклонена, причина отправлена заявителю", "ok");
          renderPayouts(true);
        } catch (e) { toast(e.message, "err"); }
      } else {
        try {
          await POST(`/api/admin/payouts/${id}/decide`, { action: "approve" });
          toast("Выплата принята — средства/текст отправлены заявителю", "ok");
          renderPayouts(true);
        } catch (e) { toast(e.message, "err"); }
      }
    }));

  document.getElementById("saveSummary").addEventListener("click", async () => {
    try {
      await POST("/api/admin/week-summary", { week_id: payoutsWeekID, text: document.getElementById("weekSummary").value });
      toast("Текст недели сохранён", "ok");
    } catch (e) { toast(e.message, "err"); }
  });
  document.getElementById("genSummary").addEventListener("click", async () => {
    const settings = await GET("/api/admin/settings");
    const tpl = (settings.data || {}).week_summary_template || "";
    const text = tpl
      .replaceAll("{week}", week.label || "")
      .replaceAll("{total}", stats.total ?? 0)
      .replaceAll("{pending}", stats.pending ?? 0)
      .replaceAll("{approved}", stats.approved ?? 0)
      .replaceAll("{rejected}", stats.rejected ?? 0)
      .replaceAll("{usdt_total}", stats.usdt_total ?? 0)
      .replaceAll("{funpay_count}", stats.funpay_count ?? 0);
    document.getElementById("weekSummary").value = text;
    toast("Черновик сгенерирован — отредактируйте и сохраните");
  });
}

// ═══ Категория «Аккаунты» (коды) ═══

async function renderAccounts() {
  const data = await GET("/api/admin/accounts");
  const filtered = (data.data || []).filter((a) =>
    applyGlobalFilter((a.nickname + " " + a.telegram + " " + a.role + " " + a.code).toLowerCase(), "")
  );
  const rows = filtered.map((a) => `
    <tr>
      <td class="mono">#${a.id}</td>
      <td><b>${esc(a.nickname)}</b></td>
      <td>${esc(a.telegram)}</td>
      <td>${roleBadge(a.role)}</td>
      <td><span class="copy-chip" data-code="${esc(a.code)}" title="Нажмите, чтобы скопировать">${esc(a.code)}</span></td>
      <td>${a.is_active === 1 ? '<span class="badge approved">активен</span>' : '<span class="badge rejected">отключён</span>'}${a.tg_user_id ? `<br><small class="mono">tg:${a.tg_user_id}</small>` : ""}</td>
      <td><div class="row-actions">
        <button class="act" data-acc="toggle" data-id="${a.id}">${a.is_active === 1 ? "Отключить" : "Включить"}</button>
        <button class="act" data-acc="recode" data-id="${a.id}">Новый код</button>
        <button class="act reject" data-acc="delete" data-id="${a.id}">Удалить</button>
      </div></td>
    </tr>`).join("");

  const accountsBoxHTML = `
    <div class="table-box">
      <h3>${ICONS.accounts} Аккаунты и коды входа</h3>
      <div class="card" style="border:none;background:transparent;padding:0 0 14px">
        <form class="filter-bar" id="accForm">
          <input type="text" name="nickname" placeholder="Никнейм *" required minlength="2">
          <input type="text" name="telegram" placeholder="@telegram *" required>
          <select name="role">
            <option value="media">Медиа</option>
            <option value="freemedia">Фримедиа</option>
            <option value="moderator">Модератор</option>
            <option value="admin">Администратор</option>
          </select>
          <button class="btn-primary" type="submit">Создать код</button>
        </form>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>ID</th><th>Никнейм</th><th>Telegram</th><th>Роль</th><th>Код входа</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;

  let tableWrap = document.getElementById("adminTableWrap");
  if (!tableWrap) {
    document.getElementById("adminBody").innerHTML = `
      <div id="adminFilterWrap">${filterBarHTML(false)}</div>
      <div id="adminTableWrap">${accountsBoxHTML}</div>`;
    tableWrap = document.getElementById("adminTableWrap");
    bindFilterBar(renderAccounts);
  } else {
    tableWrap.innerHTML = accountsBoxHTML;
  }

  document.getElementById("accForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const resp = await POST("/api/admin/accounts", {
        nickname: fd.get("nickname"), telegram: fd.get("telegram"), role: fd.get("role"),
      });
      toast(`Код создан: ${resp.account.code} — скопируйте и выдайте`, "ok");
      renderAccounts();
    } catch (ex) { toast(ex.message, "err"); }
  });

  document.querySelectorAll(".copy-chip").forEach((c) =>
    c.addEventListener("click", () => {
      navigator.clipboard.writeText(c.dataset.code).then(() => toast("Код скопирован", "ok"));
    }));

  document.querySelectorAll("[data-acc]").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.id, act = b.dataset.acc;
      if (act === "delete" && !confirm("Удалить аккаунт и его код?")) return;
      try {
        if (act === "toggle") await POST(`/api/admin/accounts/${id}/toggle`);
        if (act === "recode") {
          const resp = await POST(`/api/admin/accounts/${id}/recode`);
          toast("Новый код: " + resp.code, "ok");
        }
        if (act === "delete") await DELETE(`/api/admin/accounts/${id}`);
        renderAccounts();
      } catch (e) { toast(e.message, "err"); }
    }));
}

function roleBadge(role) {
  const map = { admin: ["rejected", "админ"], moderator: ["warning", "модератор"], media: ["approved", "медиа"], freemedia: ["pending", "фримедиа"] };
  const [cls, label] = map[role] || ["pending", role];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ═══ Категория «Банлист» ═══

let bansCache = [];

async function renderBans() {
  const data = await GET("/api/admin/bans");
  bansCache = data.data || [];
  const filtered = bansCache.filter((b) =>
    applyGlobalFilter(
      ((b.channel || "") + " " + (b.uid || "") + " " + (b.telegram || "") + " " + (b.discord || "") + " " + (b.ip || "") + " " + (b.reason || "") + " " + (b.banned_by || "")).toLowerCase(),
      ""
    )
  );

  const rows = filtered.map((b) => `
    <tr class="clickable-row" data-ban-row="${b.id}" style="cursor:pointer;" title="Нажмите, чтобы открыть и изменить данные">
      <td class="mono">#${b.id}</td>
      <td>${b.channel ? `<span class="mono">${esc(b.channel)}</span>` : '<span class="hint">—</span>'}</td>
      <td>${b.uid ? `<span class="mono">${esc(b.uid)}</span>` : '<span class="hint">—</span>'}</td>
      <td>${b.telegram ? `<span class="mono">@${esc(b.telegram.replace(/^@/, ''))}</span>` : '<span class="hint">—</span>'}</td>
      <td>${b.discord ? `<span class="mono">${esc(b.discord)}</span>` : '<span class="hint">—</span>'}</td>
      <td>${b.ip ? `<span class="mono">${esc(b.ip)}</span>` : '<span class="hint">—</span>'}</td>
      <td>${esc(b.reason || "—")}</td>
      <td>${esc(b.banned_by || "admin")}</td>
    </tr>
  `).join("");

  const bansBoxHTML = `
    <div class="table-box">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem 0.5rem;flex-wrap:wrap;gap:0.75rem;">
        <div>
          <h3 style="padding:0;margin:0;">${ICONS.bans} Заблокированные пользователи <span class="badge pending">${filtered.length}</span></h3>
          <p class="hint" style="margin:0.25rem 0 0 0;">1 строка = 1 блокировка. Нажмите на любую запись, чтобы изменить или стереть данные.</p>
        </div>
        <button class="btn-primary" id="openAddBanBtn" type="button" style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:0.6rem 1.25rem;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:0.4rem;border:none;cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Заблокировать пользователя
        </button>
      </div>
      <div class="table-scroll"><table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Аккаунт</th>
            <th>UID</th>
            <th>Telegram</th>
            <th>Discord</th>
            <th>IP-адрес</th>
            <th>Причина</th>
            <th>Кем</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8" class="hint">Банлист пуст</td></tr>'}</tbody>
      </table></div>
    </div>`;

  let tableWrap = document.getElementById("adminTableWrap");
  if (!tableWrap) {
    document.getElementById("adminBody").innerHTML = `
      <div id="adminFilterWrap">${filterBarHTML(false)}</div>
      <div id="adminTableWrap">${bansBoxHTML}</div>`;
    tableWrap = document.getElementById("adminTableWrap");
    bindFilterBar(renderBans);
  } else {
    tableWrap.innerHTML = bansBoxHTML;
  }

  document.getElementById("openAddBanBtn")?.addEventListener("click", () => {
    openBanModal(null);
  });

  document.querySelectorAll("[data-ban-row]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = parseInt(tr.dataset.banRow, 10);
      const ban = bansCache.find((x) => x.id === id);
      if (ban) openBanModal(ban);
    });
  });
}

function openBanModal(ban) {
  let modalWrap = document.getElementById("banModalOverlay");
  if (!modalWrap) {
    modalWrap = document.createElement("div");
    modalWrap.id = "banModalOverlay";
    modalWrap.className = "ban-modal-overlay";
    document.body.appendChild(modalWrap);
  }

  const isEdit = !!(ban && ban.id);
  const channelVal = ban ? ban.channel || "" : "";
  const uidVal = ban ? ban.uid || "" : "";
  const tgVal = ban ? (ban.telegram ? (ban.telegram.startsWith("@") ? ban.telegram : "@" + ban.telegram) : "") : "";
  const dcVal = ban ? ban.discord || "" : "";
  const ipVal = ban ? ban.ip || "" : "";
  const reasonVal = ban ? ban.reason || "" : "";

  modalWrap.innerHTML = `
    <div class="ban-modal-card">
      <div class="ban-modal-header">
        <div class="ban-modal-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
          ${isEdit ? `Данные блокировки #${ban.id}` : "Заблокировать пользователя"}
        </div>
        <button type="button" class="ban-modal-close" id="banModalCloseBtn">&times;</button>
      </div>
      <form id="banModalForm">
        <div class="ban-field-row">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem;">
            <label style="margin-bottom:0;">Аккаунт (YouTube / TikTok)</label>
            ${channelVal && channelVal.startsWith("http") ? `<a href="${esc(channelVal)}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--color-primary-400);text-decoration:none;" title="Открыть ссылку">Открыть ↗</a>` : ""}
          </div>
          <input type="text" name="channel" placeholder="https://youtube.com/@username или TikTok" value="${esc(channelVal)}">
        </div>
        <div class="ban-field-row">
          <label>UID</label>
          <input type="text" name="uid" placeholder="UID пользователя" value="${esc(uidVal)}">
        </div>
        <div class="ban-field-row">
          <label>Telegram</label>
          <input type="text" name="telegram" placeholder="@username" value="${esc(tgVal)}">
        </div>
        <div class="ban-field-row">
          <label>Discord</label>
          <input type="text" name="discord" placeholder="username#0000" value="${esc(dcVal)}">
        </div>
        <div class="ban-field-row">
          <label>IP-адрес</label>
          <input type="text" name="ip" placeholder="192.168.1.1 или CIDR 185.22.0.0/16" value="${esc(ipVal)}">
        </div>
        <div class="ban-field-row">
          <label>Причина блокировки</label>
          <input type="text" name="reason" placeholder="Спам, нарушение правил, читы..." value="${esc(reasonVal)}">
        </div>
        <p class="hint" style="margin: 0.85rem 0 1.25rem 0; font-size: 0.78rem; line-height: 1.4;">
          Вы можете вписать новые данные или стереть ненужные. Для сохранения блокировки должно оставаться хотя бы одно поле.
        </p>
        <div style="display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;">
          <button type="submit" class="btn-primary" style="background:linear-gradient(135deg,#ef4444,#dc2626);flex:1;padding:0.75rem;min-width:140px;">
            ${isEdit ? "Сохранить изменения" : "Заблокировать"}
          </button>
          ${isEdit ? `
            <button type="button" id="banModalClearBtn" class="btn-ghost" style="padding:0.75rem 1rem;color:var(--text-muted);border:1px solid rgba(255,255,255,0.12);" title="Очистить все поля формы">Стереть поля</button>
            <button type="button" id="banModalDeleteBtn" class="btn-ghost" style="color:var(--rose);border:1px solid rgba(248,113,113,0.3);padding:0.75rem 1rem;">Снять бан</button>
          ` : ""}
        </div>
      </form>
    </div>
  `;

  // Показ модалки
  void modalWrap.offsetWidth;
  modalWrap.classList.add("open");

  const closeModal = () => {
    modalWrap.classList.remove("open");
  };

  document.getElementById("banModalCloseBtn").addEventListener("click", closeModal);
  modalWrap.addEventListener("click", (e) => {
    if (e.target === modalWrap) closeModal();
  });

  const onKeyEsc = (e) => {
    if (e.key === "Escape") {
      closeModal();
      window.removeEventListener("keydown", onKeyEsc);
    }
  };
  window.addEventListener("keydown", onKeyEsc);

  document.getElementById("banModalClearBtn")?.addEventListener("click", () => {
    const form = document.getElementById("banModalForm");
    if (!form) return;
    form.querySelectorAll("input").forEach((inp) => (inp.value = ""));
    toast("Поля очищены. Вы можете вписать новые или снять бан.", "ok");
  });

  document.getElementById("banModalDeleteBtn")?.addEventListener("click", async () => {
    if (!confirm(`Снять блокировку #${ban.id}?`)) return;
    try {
      await DELETE("/api/admin/bans/" + ban.id);
      closeModal();
      toast("Блокировка снята", "ok");
      renderBans();
    } catch (ex) {
      toast(ex.message, "err");
    }
  });

  document.getElementById("banModalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      channel: (fd.get("channel") || "").trim(),
      uid: (fd.get("uid") || "").trim(),
      telegram: (fd.get("telegram") || "").trim(),
      discord: (fd.get("discord") || "").trim(),
      ip: (fd.get("ip") || "").trim(),
      reason: (fd.get("reason") || "").trim(),
    };

    const hasAny = payload.channel || payload.uid || payload.telegram || payload.discord || payload.ip;
    if (!hasAny) {
      if (isEdit) {
        if (confirm("Все идентификаторы стёрты. Снять эту блокировку?")) {
          try {
            await DELETE("/api/admin/bans/" + ban.id);
            closeModal();
            toast("Блокировка снята", "ok");
            renderBans();
          } catch (ex) {
            toast(ex.message, "err");
          }
        }
        return;
      } else {
        toast("Заполните хотя бы одно поле", "err");
        return;
      }
    }

    try {
      if (isEdit) {
        await POST("/api/admin/bans/" + ban.id, payload);
        toast("Блокировка обновлена", "ok");
      } else {
        await POST("/api/admin/bans", payload);
        toast("Блокировка добавлена", "ok");
      }
      closeModal();
      renderBans();
    } catch (ex) {
      toast(ex.message, "err");
    }
  });
}

// ═══ Категория «TG-окна» (24 часа на ответ) ═══

async function renderWindows() {
  const data = await GET("/api/admin/tg-windows");
  const rows = (data.data || []).map((w) => {
    const rem = w.remaining_sec;
    const state = rem > 3600 ? `<span class="badge approved">активно ${Math.floor(rem / 3600)} ч</span>`
      : rem > 0 ? `<span class="badge warning">истекает через ${Math.floor(rem / 60)} мин</span>`
      : '<span class="badge rejected">истекло</span>';
    return `<tr><td>@${esc(w.username || "—")}</td><td class="mono">${w.tg_user_id}</td>
      <td>${new Date(w.last_incoming_at).toLocaleString("ru-RU")}</td><td>${state}</td></tr>`;
  }).join("");
  document.getElementById("adminBody").innerHTML = `
    <div class="table-box"><h3>${ICONS.windows} Telegram-окна ответов (24 ч после сообщения пользователя)
      <span class="badge success">Live</span></h3>
      <p class="hint" style="padding:0 18px">Бот напоминает продлить окно за 5 минут до истечения. Список обновляется автоматически каждые 30 секунд.</p>
      <div class="table-scroll"><table>
        <thead><tr><th>Пользователь</th><th>TG ID</th><th>Последнее сообщение</th><th>Окно</th></tr></thead>
        <tbody id="winBody">${rows || '<tr><td colspan="4" class="hint">Нет переписок</td></tr>'}</tbody>
      </table></div>
    </div>`;
  clearInterval(logsPollTimer);
  logsPollTimer = setInterval(refreshWindowsQuiet, 30000);
}

async function refreshWindowsQuiet() {
  if (adminCat !== "windows") { clearInterval(logsPollTimer); return; }
  try {
    const data = await GET("/api/admin/tg-windows");
    const body = document.getElementById("winBody");
    if (!body) return;
    body.innerHTML = (data.data || []).map((w) => {
      const rem = w.remaining_sec;
      const state = rem > 3600 ? `<span class="badge approved">активно ${Math.floor(rem / 3600)} ч</span>`
        : rem > 0 ? `<span class="badge warning">истекает через ${Math.floor(rem / 60)} мин</span>`
        : '<span class="badge rejected">истекло</span>';
      return `<tr><td>@${esc(w.username || "—")}</td><td class="mono">${w.tg_user_id}</td>
        <td>${new Date(w.last_incoming_at).toLocaleString("ru-RU")}</td><td>${state}</td></tr>`;
    }).join("");
  } catch { /* тихо */ }
}

// ═══ Категория «Журнал» ═══

async function renderLogs() {
  const data = await GET("/api/admin/logs");
  drawLogs(data.data || []);
  clearInterval(logsPollTimer);
  logsPollTimer = setInterval(async () => {
    if (adminCat !== "logs") { clearInterval(logsPollTimer); return; }
    try { drawLogs((await GET("/api/admin/logs")).data || []); } catch { /* тихо */ }
  }, 3000);
}

function drawLogs(list) {
  const filtered = list.filter((l) =>
    applyGlobalFilter((l.event_type + " " + l.details + " " + l.ip).toLowerCase(), l.status));
  const rows = filtered.slice(0, 120).map((l) => `
    <tr><td class="mono">#${l.id}</td><td>${new Date(l.created_at).toLocaleString("ru-RU")}</td>
    <td class="mono">${esc(l.event_type)}</td><td>${statusBadge(l.status)}</td>
    <td>${esc(l.details)}</td><td class="mono">${esc(l.ip)}</td></tr>`).join("");
  const box = document.getElementById("logsBox");
  if (box) { box.innerHTML = rows; return; }
  document.getElementById("adminBody").innerHTML = `
    ${filterBarHTML(false)}
    <div class="table-box"><h3>${ICONS.logs} Журнал событий <span class="badge success">Live · 3с</span></h3>
      <div class="table-scroll"><table>
        <thead><tr><th>ID</th><th>Время</th><th>Событие</th><th>Статус</th><th>Детали</th><th>IP</th></tr></thead>
        <tbody id="logsBox">${rows}</tbody>
      </table></div>
    </div>`;
  bindFilterBar(renderLogs);
}

// ═══ Категория «Тексты» (пасты и шаблоны) ═══

const SETTING_META = [
  ["payout_paste_template", "Паста подачи выплаты (Telegram)", "Плейсхолдеры: {uid} {duration} {want} {amount} {method} {lot_url}. Парсер сопоставляет строки «Префикс: значение»."],
  ["payout_usdt_text", "Текст при одобрении USDT-выплаты", "Плейсхолдеры: {id} {amount} {nickname} {tx}"],
  ["payout_funpay_text", "Текст при одобрении FunPay-выплаты", "Плейсхолдеры: {id} {lot_url} {nickname}"],
  ["payout_reject_text", "Текст при отклонении выплаты", "Плейсхолдеры: {reason} {id} {nickname}"],
  ["week_summary_template", "Шаблон недельного отчёта", "Плейсхолдеры: {week} {total} {pending} {approved} {rejected} {usdt_total} {funpay_count}"],
];

async function renderSettings() {
  const data = await GET("/api/admin/settings");
  const s = data.data || {};
  document.getElementById("adminBody").innerHTML = `
    ${SETTING_META.map(([key, title, hint]) => `
      <div class="card">
        <h3>${title}</h3>
        <p class="hint">${hint}</p>
        <textarea id="set-${key}" rows="6" class="mono" style="min-height:110px">${esc(s[key] || "")}</textarea>
        <button class="btn-primary" data-set="${key}">Сохранить</button>
      </div>`).join("")}`;
  document.querySelectorAll("[data-set]").forEach((b) =>
    b.addEventListener("click", async () => {
      const key = b.dataset.set;
      try {
        await POST("/api/admin/settings", { key, value: document.getElementById("set-" + key).value });
        toast("Сохранено", "ok");
      } catch (e) { toast(e.message, "err"); }
    }));
}
