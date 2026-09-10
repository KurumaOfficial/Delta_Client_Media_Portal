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
  const isOverview = (adminCat === "overview");
  document.documentElement.classList.toggle("admin-overview-page", isOverview);
  document.body.classList.toggle("admin-overview-page", isOverview);

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
    else if (adminCat === "windows") { settingsSubTab = "windows"; adminCat = "settings"; await renderSettings(); }
    else if (adminCat === "logs") { settingsSubTab = "logs"; adminCat = "settings"; await renderSettings(); }
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
    <button class="btn-ghost admin-logout-btn" id="adminLogoutBtn" type="button">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
      <span data-i18n="logout">${typeof t === "function" ? t("logout") : "Выйти из аккаунта"}</span>
    </button>
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
  const logout = document.getElementById("adminLogoutBtn");
  if (logout && !logout.dataset.bound) {
    logout.dataset.bound = "1";
    logout.addEventListener("click", () => {
      if (typeof doUserLogout === "function") {
        doUserLogout();
      } else {
        document.getElementById("cabinetLogout")?.click();
      }
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

let overviewChartPeriod = "week";
let overviewChartCache = null;

function formatWeekRangeHTML(label) {
  if (!label) return '<b class="week-dates-val">—</b>';
  const m = String(label).match(/с\s+([^\s]+)\s+(?:до|по)\s+([^\s]+)/i);
  if (m) {
    return `
      <div class="week-range-list">
        <div class="week-range-item">
          <span class="week-range-prep">с</span>
          <b class="week-range-date">${esc(m[1])}</b>
        </div>
        <div class="week-range-item">
          <span class="week-range-prep">до</span>
          <b class="week-range-date">${esc(m[2])}</b>
        </div>
      </div>`;
  }
  return `<b class="week-dates-val">${esc(label)}</b>`;
}

// ── Обзор ──
async function renderOverview() {
  const [{ stats }, chartResp] = await Promise.all([
    GET("/api/admin/stats"),
    GET("/api/admin/stats/chart").catch(() => ({ success: false, chart: null })),
  ]);
  const appsOpen = stats.apps_open !== false;
  const maintActive = !!stats.maintenance_enabled;
  document.getElementById("adminBody").innerHTML = `
    ${filterBarHTML(false)}

    <!-- 1. Динамика подачи заявок (верхний ряд) -->
    <div class="card chart-card" id="overviewChartWrap">
      <div class="chart-header">
        <div class="chart-header-left">
          <div class="chart-title-wrap">
            <div class="chart-badge-title">
              <svg class="chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              <span class="chart-title">Динамика подачи заявок</span>
            </div>
            <div class="chart-period-desc" id="chartPeriodSubtitle">Загрузка...</div>
          </div>
          <div class="chart-total-pill">
            <span class="chart-total-label">Подано:</span>
            <b class="chart-total-count" id="chartTotalCount">—</b>
          </div>
        </div>
        <div class="chart-period-tabs" id="chartPeriodTabs">
          <button type="button" class="chart-tab ${overviewChartPeriod === 'day' ? 'active' : ''}" data-period="day">День</button>
          <button type="button" class="chart-tab ${overviewChartPeriod === 'week' ? 'active' : ''}" data-period="week">Неделя</button>
          <button type="button" class="chart-tab ${overviewChartPeriod === 'month' ? 'active' : ''}" data-period="month">Месяц</button>
          <button type="button" class="chart-tab ${overviewChartPeriod === 'year' ? 'active' : ''}" data-period="year">Год</button>
          <button type="button" class="chart-tab ${overviewChartPeriod === 'all' ? 'active' : ''}" data-period="all">Всё время</button>
        </div>
      </div>
      <div class="chart-svg-wrap" id="chartSvgWrap">
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.3);font-family:var(--font-display);font-size:0.86rem;">Загрузка графика...</div>
      </div>
    </div>

    <!-- 2. Рабочий ряд: 3 блока (Неделя, Управление, Блок информации) -->
    <div class="overview-3blocks-row">
      <!-- Блок 1: Неделя с какой по какую прием выплат -->
      <div class="card block-week">
        <div class="block-head">
          <svg class="block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span class="block-title">Период выплат</span>
        </div>
        <div class="week-main-content">
          <div class="week-dates-box">
            <span class="week-dates-sub">Расчётная неделя</span>
            ${formatWeekRangeHTML(stats.week_label)}
          </div>
          <div class="week-status-wrap">
            <div class="week-status-pill ${stats.week_open ? 'open' : 'closed'}">
              <span class="pulse-dot ${stats.week_open ? '' : 'closed'}"></span>
              <span>${stats.week_open ? 'Приём выплат открыт' : 'Приём выплат закрыт'}</span>
            </div>
            <div class="week-time-sub">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>окно: пн 00:00 — вт 22:00 МСК</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Блок 2: Включение/выключение техработ и подачи заявок -->
      <div class="card block-controls">
        <div class="block-head">
          <svg class="block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="block-title">Управление</span>
        </div>

        <div class="controls-vertical-wrap">
          <!-- Подача заявок -->
          <div class="ctrl-group">
            <div class="ctrl-status-row">
              <div class="ctrl-status-label">
                <span class="status-indicator-dot ${appsOpen ? 'open' : 'closed'}"></span>
                <span>Приём заявок:</span>
              </div>
              <span class="badge ${appsOpen ? 'approved' : 'rejected'}">${appsOpen ? 'ОТКРЫТ' : 'ЗАКРЫТ'}</span>
            </div>
            <button type="button" class="btn-ghost ctrl-btn-block" id="toggleAppsBtn">
              ${appsOpen ? '✕ Закрыть набор' : '✓ Открыть набор'}
            </button>
          </div>

          <div class="ctrl-separator"></div>

          <!-- Технические работы -->
          <div class="ctrl-group">
            <div class="ctrl-status-row">
              <div class="ctrl-status-label">
                <span class="status-indicator-dot ${maintActive ? 'maint-on animate-blink' : 'maint-off'}"></span>
                <span>Техработы:</span>
              </div>
              ${maintActive ? '<span style="color:#fbbf24;font-family:var(--font-mono);font-size:0.76rem;font-weight:600;">АКТИВНЫ</span>' : '<span class="ctrl-off-lbl">ВЫКЛЮЧЕНЫ</span>'}
            </div>
            <div class="ctrl-btn-block-wrap" style="display:flex;gap:0.4rem;">
              ${maintActive ? `<button type="button" id="previewMaintBtn" class="btn-ghost ctrl-btn-block" style="padding:0.45rem 0.5rem;font-size:11px;flex:1;">👁 Страница</button>` : ''}
              <button type="button" class="btn-ghost ctrl-btn-block ${maintActive ? 'btn-maint-off' : 'btn-maint'}" id="toggleMaintenanceBtn" style="${maintActive ? 'flex:1;' : ''}">
                ${maintActive ? '✕ Отключить' : '⚙ Включить техработы'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Блок 3: Самый большой — блок информации -->
      <div class="card block-info">
        <div class="block-head">
          <svg class="block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
          </svg>
          <span class="block-title">Информация</span>
        </div>

        <div class="info-metrics-grid">
          <!-- 1. Медиа заявки -->
          <div class="info-metric-card" data-jump="media" title="Перейти в раздел Медиа заявки">
            <b class="info-metric-num">${stats.media_pending}</b>
            <span class="info-metric-lbl">Медиа заявки (в ожидании)</span>
          </div>

          <!-- 2. Выплаты -->
          <div class="info-metric-card" data-jump="payouts" title="Перейти в раздел Медиа выплаты">
            <b class="info-metric-num">${stats.payouts_pending}</b>
            <span class="info-metric-lbl">Выплаты (неделя)</span>
          </div>

          <!-- 3. Discord баны -->
          <div class="info-metric-card" data-jump="discord" title="Перейти в раздел Discord баны">
            <b class="info-metric-num">${stats.discord_pending}</b>
            <span class="info-metric-lbl">Discord баны</span>
          </div>

          <!-- 4. Активные аккаунты -->
          <div class="info-metric-card" data-jump="accounts" title="Перейти в раздел Аккаунты">
            <b class="info-metric-num">${stats.accounts_total}</b>
            <span class="info-metric-lbl">Активные аккаунты</span>
          </div>
        </div>
      </div>
    </div>`;

  // Клик по карточкам метрик переводит в соответствующий раздел
  document.querySelectorAll(".info-metric-card[data-jump]").forEach((st) => {
    st.addEventListener("click", () => {
      const cat = st.dataset.jump;
      const btn = document.querySelector(`.side-btn[data-cat="${cat}"]`);
      if (btn) btn.click();
    });
  });

  // Инициализация графика
  renderOverviewChart(chartResp?.chart);

  document.querySelectorAll("#chartPeriodTabs .chart-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      overviewChartPeriod = tab.dataset.period;
      renderOverviewChart();
    });
  });

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

function declApps(n) {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return `${n} заявок`;
  if (rem > 1 && rem < 5) return `${n} заявки`;
  if (rem === 1) return `${n} заявка`;
  return `${n} заявок`;
}

function renderOverviewChart(chartData) {
  if (chartData) {
    overviewChartCache = chartData;
  }
  const data = overviewChartCache;
  if (!data) return;

  const currentPeriod = overviewChartPeriod || "week";
  const series = data[currentPeriod] || data.week || { labels: [], values: [], total: 0, title: "" };

  // Обновляем активность табов
  document.querySelectorAll("#chartPeriodTabs .chart-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.period === currentPeriod);
  });

  // Подзаголовок и общий счетчик
  const subEl = document.getElementById("chartPeriodSubtitle");
  if (subEl) subEl.textContent = series.title || "Динамика заявок";
  const totalEl = document.getElementById("chartTotalCount");
  if (totalEl) totalEl.textContent = series.total ?? 0;

  const wrap = document.getElementById("chartSvgWrap");
  if (!wrap) return;

  const labels = series.labels || [];
  const values = series.values || [];
  const count = values.length;

  if (count === 0) {
    wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.35);font-family:var(--font-display);font-size:0.86rem;">Нет данных для отображения</div>`;
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const svgW = Math.max(600, Math.round(rect.width) || 900);
  const svgH = 195;
  const padLeft = 44;
  const padRight = 28;
  const padTop = 22;
  const padBottom = 32;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;
  const baselineY = padTop + plotH;

  const rawMax = Math.max(...values, 0);
  let maxVal = rawMax <= 0 ? 4 : rawMax;
  if (maxVal <= 4) maxVal = 4;
  else if (maxVal <= 10) maxVal = Math.ceil(maxVal / 2) * 2;
  else if (maxVal <= 30) maxVal = Math.ceil(maxVal / 5) * 5;
  else maxVal = Math.ceil(maxVal / 10) * 10;

  // Горизонтальная сетка (4 деления)
  const gridSteps = 4;
  let gridHTML = "";
  for (let s = 0; s <= gridSteps; s++) {
    const yVal = Math.round((s / gridSteps) * maxVal);
    const yPos = baselineY - (s / gridSteps) * plotH;
    gridHTML += `
      <line x1="${padLeft}" y1="${yPos.toFixed(1)}" x2="${svgW - padRight}" y2="${yPos.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 4" stroke-width="1" />
      <text x="${padLeft - 10}" y="${(yPos + 3.5).toFixed(1)}" text-anchor="end" fill="rgba(255,255,255,0.35)" font-size="10" font-family="var(--font-mono)">${yVal}</text>`;
  }

  // Расчет точек
  const pts = [];
  for (let i = 0; i < count; i++) {
    const x = count > 1 ? padLeft + (i / (count - 1)) * plotW : padLeft + plotW / 2;
    const y = baselineY - (values[i] / maxVal) * plotH;
    pts.push({ x, y, val: values[i], label: labels[i] });
  }

  // Мягкий монотонный сплайн Безье (плавный S-переход без натянутости и заломов)
  let lineD = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (count === 1) {
    lineD += ` L ${(pts[0].x + 20).toFixed(1)} ${pts[0].y.toFixed(1)}`;
  } else {
    for (let i = 0; i < count - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(count - 1, i + 2)];

      const dx = p2.x - p1.x;
      let s1 = (p2.y - p0.y) / (p2.x - p0.x || 1);
      let s2 = (p3.y - p1.y) / (p3.x - p1.x || 1);

      if (p1.val === 0) s1 = 0;
      if (p2.val === 0) s2 = 0;
      if ((p1.y - p0.y) * (p2.y - p1.y) <= 0) s1 = 0;
      if ((p2.y - p1.y) * (p3.y - p2.y) <= 0) s2 = 0;

      const curvature = 0.4;
      const cp1x = p1.x + dx * curvature;
      const cp1y = Math.min(baselineY, Math.max(padTop, p1.y + s1 * dx * curvature));
      const cp2x = p2.x - dx * curvature;
      const cp2y = Math.min(baselineY, Math.max(padTop, p2.y - s2 * dx * curvature));

      lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
  }
  const areaD = `${lineD} L ${pts[count - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;

  // Подписи по оси X
  let labelsHTML = "";
  let step = 1;
  if (currentPeriod === "day") step = 3;
  else if (currentPeriod === "month") step = 5;
  else if (currentPeriod === "all" && count > 12) step = Math.ceil(count / 8);

  for (let i = 0; i < count; i++) {
    const isEdge = i === 0 || i === count - 1;
    const isStep = i % step === 0;
    if (isStep || (isEdge && currentPeriod !== "month")) {
      labelsHTML += `<text x="${pts[i].x.toFixed(1)}" y="${(baselineY + 22).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="11" font-family="var(--font-display)">${esc(pts[i].label)}</text>`;
    }
  }

  // Интерактивные точки (статичные, без анимации появления)
  const dotR = count > 15 ? 2.5 : 3.8;
  let dotsHTML = "";
  pts.forEach((p, idx) => {
    dotsHTML += `<circle class="chart-point" data-idx="${idx}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotR}" fill="#859bff" stroke="#111216" stroke-width="2" />`;
  });

  const svgHTML = `
    <svg viewBox="0 0 ${svgW} ${svgH}" id="overviewChartSvg" style="width:100%;height:${svgH}px;display:block;">
      <defs>
        <clipPath id="chartAreaClip">
          <rect id="chartAreaClipRect" x="0" y="0" width="0" height="${svgH + 20}" />
        </clipPath>
        <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#859bff" stop-opacity="0.32" />
          <stop offset="75%" stop-color="#859bff" stop-opacity="0.05" />
          <stop offset="100%" stop-color="#859bff" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="chartStrokeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#859bff" />
          <stop offset="50%" stop-color="#a5b4fc" />
          <stop offset="100%" stop-color="#c7d2fe" />
        </linearGradient>
        <filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <g class="chart-grid">${gridHTML}</g>
      <path class="chart-area-fill" d="${areaD}" fill="url(#chartAreaGrad)" clip-path="url(#chartAreaClip)" />
      <path class="chart-line-curve" d="${lineD}" fill="none" stroke="url(#chartStrokeGrad)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#chartGlow)" />
      <g class="chart-dots">${dotsHTML}</g>
      <g class="chart-labels">${labelsHTML}</g>
      <line id="chartHoverLine" x1="0" y1="${padTop}" x2="0" y2="${baselineY}" stroke="rgba(133,155,255,0.45)" stroke-width="1.2" stroke-dasharray="3 3" style="display:none;" />
      <circle id="chartHoverDot" cx="0" cy="0" r="5.5" fill="#859bff" stroke="#fff" stroke-width="2.5" filter="url(#chartGlow)" style="display:none;" />
    </svg>
    <div class="chart-tooltip" id="chartTooltip" style="display:none;"></div>
  `;

  wrap.innerHTML = svgHTML;

  // Плавная анимация прорисовки только самой кривой
  const pathEl = wrap.querySelector(".chart-line-curve");
  const clipRect = wrap.querySelector("#chartAreaClipRect");
  const animDuration = 1200;

  if (pathEl) {
    const totalLen = Math.ceil(pathEl.getTotalLength() || 1000);
    pathEl.style.strokeDasharray = `${totalLen} ${totalLen}`;
    pathEl.style.strokeDashoffset = `${totalLen}`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pathEl.style.transition = `stroke-dashoffset ${animDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
        pathEl.style.strokeDashoffset = "0";

        if (clipRect) {
          clipRect.style.transition = `width ${animDuration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
          clipRect.setAttribute("width", String(svgW + 10));
        }
      });
    });
  }

  if (!window._overviewChartResizeBound) {
    window._overviewChartResizeBound = true;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (document.getElementById("overviewChartWrap")) {
          renderOverviewChart();
        }
      }, 150);
    });
  }

  const svgEl = document.getElementById("overviewChartSvg");
  const hoverLine = document.getElementById("chartHoverLine");
  const hoverDot = document.getElementById("chartHoverDot");
  const tooltip = document.getElementById("chartTooltip");

  function getClosestPoint(clientX, svgRect) {
    const scaleX = svgW / svgRect.width;
    const svgX = (clientX - svgRect.left) * scaleX;
    let closest = pts[0];
    let minDiff = Infinity;
    for (const p of pts) {
      const diff = Math.abs(p.x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    return closest;
  }

  function handleMove(e) {
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const p = getClosestPoint(e.clientX, rect);
    if (!p) return;

    if (hoverLine) {
      hoverLine.setAttribute("x1", p.x.toFixed(1));
      hoverLine.setAttribute("x2", p.x.toFixed(1));
      hoverLine.style.display = "block";
    }
    if (hoverDot) {
      hoverDot.setAttribute("cx", p.x.toFixed(1));
      hoverDot.setAttribute("cy", p.y.toFixed(1));
      hoverDot.style.display = "block";
    }

    if (tooltip) {
      const scaleX = rect.width / svgW;
      const scaleY = rect.height / svgH;
      const clientX = p.x * scaleX;
      const clientY = p.y * scaleY;

      tooltip.innerHTML = `
        <div class="chart-tooltip-time">${esc(p.label)}</div>
        <div class="chart-tooltip-val">Подано: <b>${declApps(p.val)}</b></div>
      `;
      tooltip.style.left = `${clientX}px`;
      tooltip.style.top = `${clientY}px`;
      tooltip.style.display = "block";
    }
  }

  function handleLeave() {
    if (hoverLine) hoverLine.style.display = "none";
    if (hoverDot) hoverDot.style.display = "none";
    if (tooltip) tooltip.style.display = "none";
  }

  wrap.addEventListener("mousemove", handleMove);
  wrap.addEventListener("mouseleave", handleLeave);
  wrap.addEventListener("touchmove", (e) => {
    if (e.touches && e.touches[0]) handleMove(e.touches[0]);
  }, { passive: true });
  wrap.addEventListener("touchend", handleLeave);
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
    JSON.stringify(r).toLowerCase(), r.status));

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
  const colSpan = kind === "media" ? 8 : (kind === "hwid" ? 5 : 7);

  const tableBoxHTML = `
    <div class="table-box"><h3>${cfg.title} <span class="badge pending">${filtered.length}</span></h3>
      <div class="table-scroll"><table>
        <thead><tr>${theadCols}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${colSpan}" class="hint">Нет заявок</td></tr>`}</tbody>
      </table></div>
      <div class="pager" id="pager-${kind}"></div>
    </div>`;

  const withStatuses = true;
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
          <div class="modal-btn-row">
            <button type="button" id="modalApproveBtn" class="btn-primary" style="background:linear-gradient(135deg,#10b981,#059669);">✓ Принять заявку</button>
            <button type="button" id="modalRejectBtn" class="btn-ghost" style="color:var(--rose);border:1px solid rgba(248,113,113,0.35);">✕ Отклонить заявку</button>
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
  (files || "").split(",").filter(Boolean).forEach((p, i) => {
    const ext = p.split(".").pop().toLowerCase();
    const isVid = ["mp4", "webm", "mov", "avi"].includes(ext);
    const ico = isVid
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
    parts.push(`<a href="${esc(p)}" target="_blank" rel="noopener" class="proof-chip">${ico}<span>Файл ${i + 1}</span></a>`);
  });
  if (link) {
    parts.push(`<a href="${esc(link)}" target="_blank" rel="noopener" class="proof-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg><span>Ссылка</span></a>`);
  }
  return parts.length ? `<div class="proof-chips-wrap">${parts.join("")}</div>` : "—";
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
      <div class="acc-create-wrap">
        <form class="acc-create-form" id="accForm">
          <input type="text" name="nickname" placeholder="Никнейм *" required minlength="2">
          <input type="text" name="telegram" placeholder="@telegram *" required>
          <input type="text" name="code" placeholder="Свой ключ (опционально)" class="mono" style="text-transform:uppercase;">
          <select name="role">
            <option value="media">Медиа</option>
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
        nickname: fd.get("nickname"),
        telegram: fd.get("telegram"),
        role: fd.get("role"),
        code: (fd.get("code") || "").trim(),
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
  const map = { admin: ["rejected", "админ"], moderator: ["warning", "модератор"], media: ["approved", "медиа"] };
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
        <div class="modal-btn-row">
          <button type="submit" class="btn-primary" style="background:linear-gradient(135deg,#ef4444,#dc2626);">
            ${isEdit ? "Сохранить изменения" : "Заблокировать"}
          </button>
          ${isEdit ? `
            <button type="button" id="banModalClearBtn" class="btn-ghost" style="color:var(--text-muted);border:1px solid rgba(255,255,255,0.14);" title="Очистить все поля формы">Стереть поля</button>
            <button type="button" id="banModalDeleteBtn" class="btn-ghost" style="color:var(--rose);border:1px solid rgba(248,113,113,0.35);">Снять бан</button>
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

// ═══ Категория «Настройки» (Тексты, Журнал, TG-окна) ═══

let settingsSubTab = "texts"; // "texts" | "logs" | "windows"

async function renderSettings() {
  clearInterval(logsPollTimer);
  const body = document.getElementById("adminBody");
  if (!body) return;

  body.innerHTML = `
    <div class="settings-subtabs">
      <button type="button" class="settings-subtab ${settingsSubTab === "texts" ? "active" : ""}" data-settings-tab="texts">
        ${ICONS.edit} Тексты
      </button>
      <button type="button" class="settings-subtab ${settingsSubTab === "logs" ? "active" : ""}" data-settings-tab="logs">
        ${ICONS.logs} Журнал
      </button>
      <button type="button" class="settings-subtab ${settingsSubTab === "windows" ? "active" : ""}" data-settings-tab="windows">
        ${ICONS.windows} TG-окна
      </button>
    </div>
    <div id="settingsContentWrap"></div>
  `;

  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.settingsTab;
      if (tab === settingsSubTab) return;
      settingsSubTab = tab;
      document.querySelectorAll("[data-settings-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      clearInterval(logsPollTimer);
      ADMIN_FILTER.search = "";
      ADMIN_FILTER.statuses = new Set();
      ADMIN_FILTER.page = {};
      renderSettingsSubTab();
    });
  });

  await renderSettingsSubTab();
}

async function renderSettingsSubTab() {
  const wrap = document.getElementById("settingsContentWrap");
  if (!wrap) return;
  wrap.innerHTML = '<p class="hint">Загрузка…</p>';

  if (settingsSubTab === "texts") {
    await renderSettingsTexts(wrap);
  } else if (settingsSubTab === "logs") {
    await renderSettingsLogs(wrap);
  } else if (settingsSubTab === "windows") {
    await renderSettingsWindows(wrap);
  }
}

// ── Подвкладка «Тексты» ──
const SETTING_GROUPS = [
  {
    title: "Медиа-заявки (Telegram-вердикты)",
    desc: "Автоматические сообщения, которые бот отправляет кандидатам в Telegram при одобрении или отклонении заявки",
    items: [
      ["media_approve_text", "Текст при одобрении медиа-заявки", "Отправляется ботом кандидату при одобрении. Плейсхолдеры: {id} — номер заявки, {comment} — ссылка на беседу / комментарий куратора."],
      ["media_reject_text", "Текст при отклонении медиа-заявки", "Отправляется ботом кандидату при отказе. Плейсхолдеры: {id} — номер заявки, {reason} — указанная причина отказа."],
    ]
  },
  {
    title: "Выплаты и отчёты",
    desc: "Шаблоны паст подачи заявок и тексты уведомлений о переводах средств",
    items: [
      ["payout_paste_template", "Паста подачи выплаты (Telegram)", "Плейсхолдеры: {uid} {duration} {want} {amount} {method} {lot_url}. Парсер бота сопоставляет строки вида «Префикс: значение»."],
      ["payout_usdt_text", "Текст при одобрении USDT-выплаты", "Плейсхолдеры: {id} — номер, {amount} — сумма USDT, {nickname} — ник, {tx} — хэш или ссылка на перевод."],
      ["payout_funpay_text", "Текст при одобрении FunPay-выплаты", "Плейсхолдеры: {id} — номер, {lot_url} — ссылка на лот, {nickname} — ник."],
      ["payout_reject_text", "Текст при отклонении выплаты", "Плейсхолдеры: {reason} — причина отказа, {id} — номер, {nickname} — ник."],
      ["week_summary_template", "Шаблон недельного отчёта", "Плейсхолдеры: {week} {total} {pending} {approved} {rejected} {usdt_total} {funpay_count}."],
    ]
  },
  {
    title: "Модерация (Сбросы и Discord)",
    desc: "Уведомления модераторам в Telegram о статусе рассмотрения их запросов",
    items: [
      ["hwid_approve_text", "Текст при одобрении сброса", "Отправляется модератору в Telegram при одобрении сброса. Плейсхолдеры: {id} — номер, {comment} — комментарий / UID."],
      ["hwid_reject_text", "Текст при отклонении сброса", "Отправляется модератору в Telegram при отказе. Плейсхолдеры: {id} — номер, {reason} — причина отказа."],
      ["discord_approve_text", "Текст при одобрении Discord-бана", "Отправляется модератору в Telegram при одобрении бана. Плейсхолдеры: {id} — номер, {comment} — заблокированный ID."],
      ["discord_reject_text", "Текст при отклонении Discord-бана", "Отправляется модератору в Telegram при отказе. Плейсхолдеры: {id} — номер, {reason} — причина отказа."],
    ]
  },
  {
    title: "Telegram-бот и Business",
    desc: "Общие сообщения от имени бота и Telegram Business",
    items: [
      ["tg_window_nudge_text", "Напоминание о 24-часовом окне Telegram", "Отправляется ботом за 5 минут до закрытия 24-часового окна Telegram Business для продления возможности переписки."],
      ["tg_bot_start_text", "Приветствие бота (/start)", "Отправляется в ЛС боту при команде /start. Плейсхолдеры: {name} — имя пользователя."],
    ]
  }
];

async function renderSettingsTexts(wrap) {
  const data = await GET("/api/admin/settings");
  const s = data.data || {};

  wrap.innerHTML = SETTING_GROUPS.map((group) => `
    <div class="settings-group">
      <div class="settings-group-header">
        <h2 class="settings-group-title">${group.title}</h2>
        <p class="settings-group-desc">${group.desc}</p>
      </div>
      <div class="settings-group-cards">
        ${group.items.map(([key, title, hint]) => `
          <div class="card">
            <h3>${title}</h3>
            <p class="hint">${hint}</p>
            <textarea id="set-${key}" rows="5" class="mono" style="min-height:100px">${esc(s[key] || "")}</textarea>
            <button class="btn-primary" data-set="${key}" style="margin-top:0.35rem;height:40px;padding:0 1.5rem;width:auto;">Сохранить</button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-set]").forEach((b) =>
    b.addEventListener("click", async () => {
      const key = b.dataset.set;
      try {
        await POST("/api/admin/settings", { key, value: document.getElementById("set-" + key).value });
        toast("Сохранено", "ok");
      } catch (e) { toast(e.message, "err"); }
    }));
}

// ── Подвкладка «Журнал» ──
async function renderSettingsLogs(wrap) {
  const data = await GET("/api/admin/logs");
  drawSettingsLogs(wrap, data.data || []);
  clearInterval(logsPollTimer);
  logsPollTimer = setInterval(async () => {
    if (adminCat !== "settings" || settingsSubTab !== "logs") {
      clearInterval(logsPollTimer);
      return;
    }
    try {
      const resp = await GET("/api/admin/logs");
      const box = document.getElementById("logsBox");
      if (box) {
        const filtered = (resp.data || []).filter((l) =>
          applyGlobalFilter((l.event_type + " " + l.details + " " + l.ip).toLowerCase(), l.status));
        box.innerHTML = filtered.slice(0, 120).map((l) => `
          <tr><td class="mono">#${l.id}</td><td>${new Date(l.created_at).toLocaleString("ru-RU")}</td>
          <td class="mono">${esc(l.event_type)}</td><td>${statusBadge(l.status)}</td>
          <td>${esc(l.details)}</td><td class="mono">${esc(l.ip)}</td></tr>`).join("");
      }
    } catch { /* тихо */ }
  }, 3000);
}

function drawSettingsLogs(wrap, list) {
  const filtered = list.filter((l) =>
    applyGlobalFilter((l.event_type + " " + l.details + " " + l.ip).toLowerCase(), l.status));
  const rows = filtered.slice(0, 120).map((l) => `
    <tr><td class="mono">#${l.id}</td><td>${new Date(l.created_at).toLocaleString("ru-RU")}</td>
    <td class="mono">${esc(l.event_type)}</td><td>${statusBadge(l.status)}</td>
    <td>${esc(l.details)}</td><td class="mono">${esc(l.ip)}</td></tr>`).join("");

  wrap.innerHTML = `
    ${filterBarHTML(false)}
    <div class="table-box"><h3>${ICONS.logs} Журнал событий <span class="badge success">Live · 3с</span></h3>
      <div class="table-scroll"><table>
        <thead><tr><th>ID</th><th>Время</th><th>Событие</th><th>Статус</th><th>Детали</th><th>IP</th></tr></thead>
        <tbody id="logsBox">${rows}</tbody>
      </table></div>
    </div>`;
  bindFilterBar(() => renderSettingsLogs(wrap));
}

// ── Подвкладка «TG-окна» ──
async function renderSettingsWindows(wrap) {
  const data = await GET("/api/admin/tg-windows");
  const rows = (data.data || []).map((w) => {
    const rem = w.remaining_sec;
    const state = rem > 3600 ? `<span class="badge approved">активно ${Math.floor(rem / 3600)} ч</span>`
      : rem > 0 ? `<span class="badge warning">истекает через ${Math.floor(rem / 60)} мин</span>`
      : '<span class="badge rejected">истекло</span>';
    return `<tr><td>@${esc(w.username || "—")}</td><td class="mono">${w.tg_user_id}</td>
      <td>${new Date(w.last_incoming_at).toLocaleString("ru-RU")}</td><td>${state}</td></tr>`;
  }).join("");

  wrap.innerHTML = `
    <div class="table-box"><h3>${ICONS.windows} Telegram-окна ответов (24 ч после сообщения пользователя)
      <span class="badge success">Live</span></h3>
      <p class="hint" style="padding:0 18px">Бот напоминает продлить окно за 5 минут до истечения. Список обновляется автоматически каждые 30 секунд.</p>
      <div class="table-scroll"><table>
        <thead><tr><th>Пользователь</th><th>TG ID</th><th>Последнее сообщение</th><th>Окно</th></tr></thead>
        <tbody id="winBody">${rows || '<tr><td colspan="4" class="hint">Нет переписок</td></tr>'}</tbody>
      </table></div>
    </div>`;

  clearInterval(logsPollTimer);
  logsPollTimer = setInterval(async () => {
    if (adminCat !== "settings" || settingsSubTab !== "windows") {
      clearInterval(logsPollTimer);
      return;
    }
    try {
      const resp = await GET("/api/admin/tg-windows");
      const body = document.getElementById("winBody");
      if (!body) return;
      body.innerHTML = (resp.data || []).map((w) => {
        const rem = w.remaining_sec;
        const state = rem > 3600 ? `<span class="badge approved">активно ${Math.floor(rem / 3600)} ч</span>`
          : rem > 0 ? `<span class="badge warning">истекает через ${Math.floor(rem / 60)} мин</span>`
          : '<span class="badge rejected">истекло</span>';
        return `<tr><td>@${esc(w.username || "—")}</td><td class="mono">${w.tg_user_id}</td>
          <td>${new Date(w.last_incoming_at).toLocaleString("ru-RU")}</td><td>${state}</td></tr>`;
      }).join("");
    } catch { /* тихо */ }
  }, 30000);
}

// Алиасы на случай прямого вызова
async function renderWindows() {
  settingsSubTab = "windows";
  adminCat = "settings";
  await renderSettings();
}

async function renderLogs() {
  settingsSubTab = "logs";
  adminCat = "settings";
  await renderSettings();
}
