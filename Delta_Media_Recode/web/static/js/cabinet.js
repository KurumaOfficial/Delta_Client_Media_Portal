/* cabinet.js — личный кабинет: модератор (HWID/Discord), медиа (выплаты/лоты), фримедиа (подписки) */
"use strict";

let cabinetActiveTab = null;

async function switchCabinetTab(tab) {
  cabinetActiveTab = tab;
  document.querySelectorAll("#cabinetTabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const body = document.getElementById("cabinetBody");
  if (tab === "adminpanel") { // админ-панель — полноценный раздел внутри кабинета
    await showView("admin");
    return;
  }
  if (tab === "hwid") body.innerHTML = buildProofForm("hwid", "Сброс HWID", "UID пользователя", "uuid");
  else if (tab === "discord") body.innerHTML = buildProofForm("discord", "Discord бан", "ID или @username нарушителя", "offender_id");
  else if (tab === "payout") body.innerHTML = buildPayoutForm();
  else if (tab === "lot") body.innerHTML = buildLotForm();
  else if (tab === "sub") body.innerHTML = buildSubForm();
  else if (tab === "my") await renderMyRequests();
  bindCabinetForms();
}

function cabinetTabsForRole(role) {
  if (role === "moderator") return [["hwid", "🔄 Сброс HWID"], ["discord", "🔨 Discord бан"]];
  if (role === "media") return [["payout", "💸 Заявка на выплату"], ["lot", "🏷️ Заявка на лот"], ["my", "📋 Мои заявки"]];
  if (role === "freemedia") return [["sub", "📺 Запрос подписки"], ["my", "📋 Мои заявки"]];
  if (role === "admin") return [["adminpanel", "🛡️ Админ-панель"], ["hwid", "🔄 Сброс HWID"],
    ["discord", "🔨 Discord бан"], ["payout", "💸 Выплата"], ["lot", "🏷️ Лот"],
    ["sub", "📺 Подписка"], ["my", "📋 Мои заявки"]];
  return [];
}

async function loadCabinet() {
  if (!CURRENT_ACCOUNT) return;
  const titles = { moderator: "Кабинет модератора", media: "Кабинет медиа", freemedia: "Кабинет фримедиа", admin: "Кабинет администратора" };
  document.getElementById("cabinetTitle").textContent = titles[CURRENT_ACCOUNT.role] || "Кабинет";
  const tabs = cabinetTabsForRole(CURRENT_ACCOUNT.role);
  document.getElementById("cabinetTabs").innerHTML =
    tabs.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join("");
  document.querySelectorAll("#cabinetTabs button").forEach((b) =>
    b.addEventListener("click", () => switchCabinetTab(b.dataset.tab)));
  // админ-панель — вкладка, но не дефолтная: после входа открываем первую обычную
  const initial = tabs.find((t) => t[0] !== "adminpanel") || tabs[0];
  await switchCabinetTab(initial[0]);
}

// ── Формы с доказательствами (модераторы) ──
function buildProofForm(kind, title, targetLabel, targetName) {
  return `
  <form class="card form-card" id="form-${kind}">
    <h3>${title}</h3>
    <div class="field"><label>${targetLabel} *</label><input type="text" name="${targetName}" maxlength="64"></div>
    <div class="field"><label>Доказательства (файлы и/или ссылка) *</label>
      <input type="file" id="proof-${kind}" accept="image/*,video/*" multiple>
      <div class="hint mono" id="files-${kind}"></div>
      <input type="url" name="proof_link" placeholder="https://... — ссылка на доказательство">
    </div>
    <div class="field"><label>Причина *</label><textarea name="reason" maxlength="500" rows="3"></textarea></div>
    <button type="submit" class="btn-primary">Отправить</button>
  </form>`;
}

// ── Чанковая загрузка файла → путь на сервере ──
async function uploadFileBig(file, progressEl) {
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
    if (progressEl) progressEl.textContent = `Загрузка ${i + 1}/${total} (${file.name})`;
    if (i === total - 1) return res.file_path;
  }
  return "";
}

// ── Медиа: заявка на выплату ──
function buildPayoutForm() {
  return `
  <form class="card form-card" id="form-payout">
    <h3>💸 Заявка на выплату</h3>
    <p class="hint">Приём заявок: вторник 01:00 — понедельник 22:00 (МСК). О одной нерассмотренной заявке каждого типа в неделю.</p>
    <div class="field"><label>Ваш UID *</label><input type="text" name="uid" maxlength="64"></div>
    <div class="field"><label>Сколько вы в медиа Delta *</label><input type="text" name="duration" placeholder="Например: 8 месяцев" maxlength="100"></div>
    <div class="field"><label>Что хотите получить *</label><textarea name="want" maxlength="300" rows="2" placeholder="За какие видео/работы выплата"></textarea></div>
    <div class="field"><label>Способ выплаты *</label>
      <div class="dropdown" id="payMethod">
        <button type="button" class="dropdown-head"><span class="dropdown-value">Выберите способ</span><span class="chev">▾</span></button>
        <div class="dropdown-menu">
          <button type="button" class="dropdown-item" data-value="usdt">USDT-чек (CryptoBot)</button>
          <button type="button" class="dropdown-item" data-value="funpay">FunPay</button>
        </div>
      </div>
    </div>
    <div class="field hidden" id="rowAmount"><label>Сумма USDT *</label><input type="text" name="amount" placeholder="Например: 25.5"></div>
    <div class="field hidden" id="rowLot"><label>Ссылка на лот FunPay *</label><input type="url" name="lot_url" placeholder="https://funpay.com/lots/..."></div>
    <button type="submit" class="btn-primary">Отправить заявку</button>
  </form>`;
}

// ── Медиа: заявка на лот ──
function buildLotForm() {
  return `
  <form class="card form-card" id="form-lot">
    <h3>🏷️ Заявка на лот</h3>
    <div class="field"><label>Ваш UID *</label><input type="text" name="uid" maxlength="64"></div>
    <div class="field"><label>Платформа *</label>
      <div class="dropdown" id="lotPlatform">
        <button type="button" class="dropdown-head"><span class="dropdown-value">Выберите платформу</span><span class="chev">▾</span></button>
        <div class="dropdown-menu">
          <button type="button" class="dropdown-item" data-value="youtube">YouTube</button>
          <button type="button" class="dropdown-item" data-value="tiktok">TikTok</button>
          <button type="button" class="dropdown-item" data-value="funpay">FunPay</button>
        </div>
      </div>
    </div>
    <div class="field" id="rowChannel"><label>Ссылка на ваш канал *</label><input type="url" name="channel_url" placeholder="https://youtube.com/@..."></div>
    <div class="field hidden" id="rowLotLink"><label>Ссылка на лот FunPay *</label><input type="url" name="lot_url" placeholder="https://funpay.com/lots/..."></div>
    <div class="field"><label>Что хотите получить *</label><textarea name="want" maxlength="300" rows="2"></textarea></div>
    <button type="submit" class="btn-primary">Отправить</button>
  </form>`;
}

// ── Фримедиа: запрос подписки ──
function buildSubForm() {
  return `
  <form class="card form-card" id="form-sub">
    <h3>📺 Запрос подписки</h3>
    <div class="field"><label>Ваш UID *</label><input type="text" name="uid" maxlength="64"></div>
    <div class="field"><label>Ссылка на ваш канал</label><input type="url" name="channel_url" placeholder="https://... (необязательно)"></div>
    <div class="field"><label>Какую подписку хотите получить *</label><textarea name="want" maxlength="300" rows="2"></textarea></div>
    <button type="submit" class="btn-primary">Отправить запрос</button>
  </form>`;
}

async function renderMyRequests() {
  const body = document.getElementById("cabinetBody");
  let data;
  try {
    data = await GET("/api/cabinet/requests");
  } catch (e) { body.innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
  const kindTitle = { payout: "Выплата", lot: "Лот", subscription: "Подписка" };
  const items = (data.data || []).map((r) => `
    <div class="request-item">
      <b>#${r.id}</b>
      <div class="grow"><b>${kindTitle[r.kind] || r.kind}</b> — ${esc(r.want || r.amount || "")}
        <br><small>${esc(r.week || "")} · ${r.source === "telegram" ? "из Telegram" : "с сайта"} · ${new Date(r.created_at).toLocaleString("ru-RU")}</small>
        ${r.decision_comment ? `<br><small>💬 ${esc(r.decision_comment)}</small>` : ""}
      </div>
      ${statusBadge(r.status)}
    </div>`).join("");
  const windowNote = data.window_open
    ? `Текущая неделя: ${esc(data.week)} — приём открыт`
    : `⚠️ Приём заявок закрыт до вторника 01:00 (МСК)`;
  document.getElementById("cabinetBody").innerHTML = `
    <p class="hint" style="text-align:center">${windowNote}</p>
    <div class="request-list">${items || '<p class="hint" style="text-align:center">Заявок пока нет</p>'}</div>`;
}

// ── Обработчики всех кабинетных форм ──
function bindCabinetForms() {
  // дропдауны способа/платформы уже работают глобально; показываем доп-поля
  const method = document.getElementById("payMethod");
  if (method) method.querySelectorAll(".dropdown-item").forEach((it) =>
    it.addEventListener("click", () => {
      document.getElementById("rowAmount").classList.toggle("hidden", it.dataset.value !== "usdt");
      document.getElementById("rowLot").classList.toggle("hidden", it.dataset.value !== "funpay");
    }));
  const lotPlat = document.getElementById("lotPlatform");
  if (lotPlat) lotPlat.querySelectorAll(".dropdown-item").forEach((it) =>
    it.addEventListener("click", () => {
      document.getElementById("rowChannel").classList.toggle("hidden", it.dataset.value === "funpay");
      document.getElementById("rowLotLink").classList.toggle("hidden", it.dataset.value !== "funpay");
    }));

  bindProofForm("hwid");
  bindProofForm("discord");
  bindSimpleForm("payout");
  bindSimpleForm("lot");
  bindSimpleForm("sub");
}

function formToJSON(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  return data;
}

async function bindProofForm(kind) {
  const form = document.getElementById("form-" + kind);
  if (!form) return;
  const filesInput = document.getElementById("proof-" + kind);
  let picked = [];
  if (filesInput) filesInput.addEventListener("change", () => {
    picked = picked.concat([...filesInput.files]);
    filesInput.value = "";
    const box = document.getElementById("files-" + kind);
    box.innerHTML = picked.map((f, i) =>
      `${i + 1}. ${esc(f.name)} (${(f.size / 1073741824).toFixed(2)} ГБ)`).join("<br>") || "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    buttonState(btn, "", "Отправляем…");
    try {
      const fd = new FormData(form);
      if (picked.length) {
        const paths = [];
        for (const f of picked) paths.push(await uploadFileBig(f, document.getElementById("files-" + kind)));
        fd.append("proof_file_paths", paths.join(","));
      }
      const resp = await fetch("/api/mod/" + (kind === "hwid" ? "hwid" : "discord"), {
        method: "POST", body: fd, credentials: "same-origin",
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка");
      buttonState(btn, "ok", "Заявка отправлена! ✅", 3500);
      form.reset(); picked = [];
      if (document.getElementById("files-" + kind)) document.getElementById("files-" + kind).textContent = "";
    } catch (ex) {
      buttonState(btn, "err", ex.message, 3500);
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
    if (kind === "payout") body.method = (document.getElementById("payMethod").dataset.value || "").toLowerCase();
    if (kind === "lot") body.platform = (document.getElementById("lotPlatform").dataset.value || "").toLowerCase();
    buttonState(btn, "", "Отправляем…");
    try {
      const resp = await POST(endpoint, body);
      buttonState(btn, "ok", `Заявка №${resp.id} принята ✅`, 3500);
      form.reset();
      if (kind === "payout") { document.getElementById("rowAmount").classList.add("hidden"); document.getElementById("rowLot").classList.add("hidden"); }
      if (kind === "lot") { document.getElementById("rowLotLink").classList.add("hidden"); document.getElementById("rowChannel").classList.remove("hidden"); }
    } catch (ex) {
      buttonState(btn, "err", ex.message, 4000);
    }
  });
}
