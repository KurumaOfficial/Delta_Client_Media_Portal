/* ui.js — модалки, дропдауны, тосты, пагинация */
"use strict";

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

function dropdownSet(dropId, value, label, iconHtml) {
  const drop = document.getElementById(dropId);
  if (!drop) return;
  drop.dataset.value = value || "";
  const valSpan = drop.querySelector(".dropdown-value");
  if (valSpan) {
    if (iconHtml) {
      valSpan.innerHTML = `${iconHtml} <span>${esc(label)}</span>`;
    } else {
      valSpan.textContent = label;
    }
  }
  drop.classList.toggle("has-value", !!value);
  drop.querySelectorAll(".dropdown-item").forEach((it) => {
    it.classList.toggle("picked", it.dataset.value === value);
  });
  drop.classList.remove("open");
}

// single-select: клики по пунктам
document.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown:not(.multi) .dropdown-item:not(.check)");
  if (!item) return;
  const drop = item.closest(".dropdown");
  const svg = item.querySelector("svg");
  const iconHtml = svg ? svg.outerHTML : "";
  dropdownSet(drop.id, item.dataset.value, item.textContent.trim(), iconHtml);
});

// multi-select: чекбоксы
document.addEventListener("change", (e) => {
  if (!e.target.matches(".dropdown.multi input[type=checkbox]")) return;
  const drop = e.target.closest(".dropdown");
  if (!drop) return;
  const checkedBoxes = [...drop.querySelectorAll("input:checked")];
  const picked = checkedBoxes.map((c) => c.value);
  const label = drop.querySelector(`input[value="${picked[picked.length - 1]}"]`)?.closest("label")?.textContent.trim();
  drop.dataset.value = picked.join(",");
  drop.classList.toggle("has-value", picked.length > 0);
  const defaultLabel = (I18N[LANG] && I18N[LANG].pickServers) || "Выберите серверы";
  const valSpan = drop.querySelector(".dropdown-value");
  if (valSpan) {
    valSpan.textContent = picked.length ? (picked.length === 1 ? label : picked.join(", ")) : defaultLabel;
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
  const original = btn.dataset.originalText || btn.textContent;
  btn.dataset.originalText = original;
  btn.classList.remove("err", "ok");
  if (state) btn.classList.add(state);
  btn.textContent = text;
  if (revertMs) {
    setTimeout(() => {
      btn.classList.remove("err", "ok");
      btn.textContent = btn.dataset.originalText;
    }, revertMs);
  }
}

// ── Таблица с пагинацией и глобальным фильтром ──
const ADMIN_FILTER = { search: "", statuses: new Set(), page: {} };

function applyGlobalFilter(rowText, rowStatus) {
  if (ADMIN_FILTER.search && !rowText.includes(ADMIN_FILTER.search)) return false;
  if (ADMIN_FILTER.statuses.size && !ADMIN_FILTER.statuses.has(rowStatus)) return false;
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
function askComment(title, required) {
  return new Promise((resolve) => {
    commentResolve = resolve;
    document.getElementById("commentTitle").textContent = title;
    document.getElementById("commentText").value = "";
    document.getElementById("commentError").textContent = "";
    openModal("commentModal");
    document.getElementById("commentOk").onclick = () => {
      const text = document.getElementById("commentText").value.trim();
      if (required && !text) {
        document.getElementById("commentError").textContent = "Укажите причину отклонения";
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
