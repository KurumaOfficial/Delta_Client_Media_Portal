/* ui.js — модалки, дропдауны, тосты, пагинация */
"use strict";

// Lucide SVG иконки для интерфейса вместо эмодзи
const UI_ICONS = {
  check: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  close: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  gear: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  eye: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  key: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-1.5 1.5L14 9m-4.5 4.5L7 16m-4.5 4.5L2 21m13-17 6 6-10 10H7v-4z"/></svg>',
  gift: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
  palette: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>',
  idea: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  bug: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
  tag: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
  comment: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  money: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
  alert: '<svg class="ui-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};
window.UI_ICONS = UI_ICONS;

// ── Модалки ──
function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) (closer.closest(".modal-overlay") || closer.closest(".auth-backdrop"))?.classList.remove("open");
  if (e.target.classList && (e.target.classList.contains("modal-overlay") || e.target.classList.contains("auth-backdrop"))) {
    e.target.classList.remove("open");
  }
});

// ── Дропдауны ──
document.addEventListener("click", (e) => {
  const head = e.target.closest(".dropdown-head");
  if (head) {
    const drop = head.closest(".dropdown");
    const wasOpen = drop.classList.contains("open");
    document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
    if (!wasOpen) drop.classList.add("open");
    return;
  }
  if (!e.target.closest(".dropdown")) {
    document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
  }
});

function dropdownSet(dropOrId, value, label, iconHtml) {
  const drop = typeof dropOrId === "string" ? document.getElementById(dropOrId) : dropOrId;
  if (!drop) return;
  drop.dataset.value = value || "";
  const valSpan = drop.querySelector(".dropdown-value");
  if (valSpan) {
    if (value) {
      if (!valSpan.dataset.origI18n && valSpan.getAttribute("data-i18n")) {
        valSpan.dataset.origI18n = valSpan.getAttribute("data-i18n");
      }
      valSpan.removeAttribute("data-i18n");
      if (iconHtml) {
        valSpan.innerHTML = `${iconHtml} <span>${esc(label)}</span>`;
      } else {
        valSpan.textContent = label;
      }
    } else {
      if (valSpan.dataset.origI18n) {
        valSpan.setAttribute("data-i18n", valSpan.dataset.origI18n);
        valSpan.textContent = (I18N[LANG] && I18N[LANG][valSpan.dataset.origI18n]) || valSpan.dataset.placeholder || label;
      } else {
        valSpan.textContent = label;
      }
    }
  }
  drop.classList.toggle("has-value", !!value);
  drop.querySelectorAll(".dropdown-item").forEach((it) => {
    it.classList.toggle("picked", it.dataset.value === value);
  });
  drop.classList.remove("open");
  drop.dispatchEvent(new CustomEvent("dropdown:change", { detail: { value, label } }));
}

// single-select: клики по пунктам
document.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown:not(.multi) .dropdown-item:not(.check)");
  if (!item) return;
  const drop = item.closest(".dropdown");
  if (!drop) return;
  const svg = item.querySelector("svg");
  const iconHtml = svg ? svg.outerHTML : "";
  let label = item.textContent.trim();
  if (item.dataset.label) label = item.dataset.label;
  dropdownSet(drop, item.dataset.value, label, iconHtml);
});

// multi-select: чекбоксы
document.addEventListener("change", (e) => {
  if (!e.target.matches(".dropdown.multi input[type=checkbox]")) return;
  const drop = e.target.closest(".dropdown");
  if (!drop) return;
  const checkedBoxes = [...drop.querySelectorAll("input:checked")];
  const picked = checkedBoxes.map((c) => c.value);

  // Подсветка активных чекбокс-строк
  drop.querySelectorAll(".dropdown-item.check").forEach((lbl) => {
    const input = lbl.querySelector("input[type=checkbox]");
    lbl.classList.toggle("picked", !!(input && input.checked));
  });

  drop.dataset.value = picked.join(",");
  drop.classList.toggle("has-value", picked.length > 0);

  // Специфичные дропдауны (например #fStatus в админке) имеют отдельную логику
  if (drop.id === "fStatus") return;

  const valSpan = drop.querySelector(".dropdown-value");
  if (valSpan) {
    if (picked.length === 0) {
      if (valSpan.dataset.origI18n) {
        valSpan.setAttribute("data-i18n", valSpan.dataset.origI18n);
        valSpan.textContent = (I18N[LANG] && I18N[LANG][valSpan.dataset.origI18n]) || valSpan.dataset.placeholder || "Выберите…";
      } else {
        const ph = valSpan.dataset.placeholder || drop.dataset.placeholder || (I18N[LANG] && I18N[LANG][valSpan.dataset.i18n]) || "Выберите…";
        valSpan.textContent = ph;
      }
    } else {
      if (!valSpan.dataset.origI18n && valSpan.getAttribute("data-i18n")) {
        valSpan.dataset.origI18n = valSpan.getAttribute("data-i18n");
      }
      valSpan.removeAttribute("data-i18n");
      const labels = checkedBoxes.map((c) => {
        const itemLbl = c.closest("label");
        return itemLbl ? itemLbl.textContent.trim() : c.value;
      });
      valSpan.textContent = labels.length <= 2 ? labels.join(", ") : `${labels[0]}, +${labels.length - 1}`;
    }
  }
});

// ── Тосты ──
function toast(msg, type) {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  const dot = document.createElement("span");
  dot.className = "toast-dot";
  if (type === "err") dot.style.background = "var(--rose)";
  if (type === "ok") dot.style.background = "var(--emerald)";
  el.appendChild(dot);
  el.appendChild(document.createTextNode(msg));
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ── Кнопка-состояние ──
function buttonState(btn, state, text, revertMs) {
  if (!btn) return;
  if (btn._revertTimer) {
    clearTimeout(btn._revertTimer);
    btn._revertTimer = null;
  }
  const original = btn.dataset.originalText || btn.innerHTML;
  btn.dataset.originalText = original;
  btn.classList.remove("err", "ok");
  if (state) btn.classList.add(state);
  btn.innerHTML = text;
  if (revertMs) {
    btn._revertTimer = setTimeout(() => {
      btn.classList.remove("err", "ok");
      btn.innerHTML = btn.dataset.originalText;
      btn._revertTimer = null;
    }, revertMs);
  }
}

// ── Таблица с пагинацией и глобальным фильтром ──
const ADMIN_FILTER = { search: "", statuses: new Set(), page: {} };

function applyGlobalFilter(rowText, rowStatus) {
  if (ADMIN_FILTER.search && !rowText.includes(ADMIN_FILTER.search)) return false;
  if (rowStatus && ADMIN_FILTER.statuses.size && !ADMIN_FILTER.statuses.has(rowStatus)) return false;
  return true;
}

function renderPager(containerId, pageKey, total, pageSize, renderFn) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(ADMIN_FILTER.page[pageKey] || 1, pages);
  ADMIN_FILTER.page[pageKey] = page;
  const box = document.getElementById(containerId);
  if (!box) return;
  if (total <= pageSize) { box.innerHTML = total ? `Показано ${total} записей` : ""; return; }
  box.innerHTML = `<span>Показано ${total} записей</span>
    <div class="pages">
      <button ${page <= 1 ? "disabled" : ""} data-pg="${page - 1}">←</button>
      <span class="mono">Стр. ${page} / ${pages}</span>
      <button ${page >= pages ? "disabled" : ""} data-pg="${page + 1}">→</button>
    </div>`;
  box.querySelectorAll("button[data-pg]").forEach((b) =>
    b.addEventListener("click", () => { ADMIN_FILTER.page[pageKey] = +b.dataset.pg; renderFn(); }));
}

function statusBadge(status) {
  const map = { pending: "pending", approved: "approved", rejected: "rejected",
                success: "success", failed: "failed", error: "error", warning: "warning" };
  const labels = { pending: "в ожидании", approved: "одобрено", rejected: "отклонено",
                   success: "успех", failed: "провал", error: "ошибка", warning: "внимание" };
  const cls = map[status] || "pending";
  return `<span class="badge ${cls}">${labels[status] || status}</span>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── Модалка комментария/причины (обязательная причина опциональна) ──
let commentResolve = null;
function askComment(title, required, hint, placeholder, okText) {
  return new Promise((resolve) => {
    commentResolve = resolve;
    document.getElementById("commentTitle").textContent = title;
    const hintEl = document.getElementById("commentHint");
    if (hintEl) hintEl.innerHTML = hint || (required ? "Причина обязательна:" : "Примечание (опционально):");
    const input = document.getElementById("commentText");
    input.value = "";
    input.placeholder = placeholder || "";
    document.getElementById("commentError").textContent = "";
    const okBtn = document.getElementById("commentOk");
    if (okBtn) okBtn.textContent = okText || (typeof t === "function" ? t("confirm") : "Подтвердить");
    openModal("commentModal");
    setTimeout(() => input.focus(), 50);
    okBtn.onclick = () => {
      const text = document.getElementById("commentText").value.trim();
      if (required && !text) {
        document.getElementById("commentError").textContent = placeholder ? "Заполните это поле" : "Укажите причину";
        return;
      }
      closeModal("commentModal");
      commentResolve(text);
    };
  });
}
document.querySelector("#commentModal [data-close]").addEventListener("click", () => {
  if (commentResolve) { commentResolve(null); commentResolve = null; }
});

// ── Универсальная валидация цифровых UID полей с красным свечением ──
function attachNumericUIDValidation(inputEl, errorEl, errorMessage) {
  if (!inputEl) return;
  const defaultMsg = "В поле UID разрешены только цифры";

  function check() {
    const v = inputEl.value.trim();
    if (!v) {
      inputEl.classList.remove("uid-error");
      if (errorEl) errorEl.classList.add("hidden");
      return true;
    }
    if (/\D/.test(v)) {
      inputEl.classList.add("uid-error");
      if (errorEl) {
        const span = errorEl.querySelector("span") || errorEl;
        span.textContent = errorMessage || (typeof t === "function" ? t("uidDigitsOnly") : defaultMsg);
        errorEl.classList.remove("hidden");
      }
      return false;
    }
    inputEl.classList.remove("uid-error");
    if (errorEl) errorEl.classList.add("hidden");
    return true;
  }

  inputEl.addEventListener("input", check);
  inputEl.addEventListener("blur", check);
  inputEl.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (["Backspace", "Delete", "Tab", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      inputEl.classList.add("uid-error");
      if (errorEl) {
        const span = errorEl.querySelector("span") || errorEl;
        span.textContent = errorMessage || (typeof t === "function" ? t("uidDigitsOnly") : defaultMsg);
        errorEl.classList.remove("hidden");
      }
      setTimeout(() => {
        if (!/\D/.test(inputEl.value.trim())) {
          inputEl.classList.remove("uid-error");
          if (errorEl) errorEl.classList.add("hidden");
        }
      }, 2200);
    }
  });
}
window.attachNumericUIDValidation = attachNumericUIDValidation;
