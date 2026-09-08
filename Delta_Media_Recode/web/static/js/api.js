/* api.js — единый fetch-хелпер с cookie-сессией и человеческими ошибками */
"use strict";

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  let resp;
  try {
    resp = await fetch(path, opts);
  } catch {
    throw new Error("Нет соединения с сервером");
  }
  let data = {};
  try { data = await resp.json(); } catch { /* пустое тело */ }
  if (!resp.ok && !data.error) {
    data.error = "Ошибка сервера (" + resp.status + ")";
  }
  data._status = resp.status;
  if (!resp.ok) {
    if (resp.status === 401 && !path.startsWith("/api/auth/") && path !== "/api/me") {
      if (typeof handleSessionExpired === "function") {
        handleSessionExpired();
      }
    }
    throw Object.assign(new Error(data.error || "Ошибка"), data);
  }
  return data;
}

const GET = (p) => api("GET", p);
const POST = (p, b) => api("POST", p, b);
const DELETE = (p) => api("DELETE", p);

// Перехват клиентских ошибок → аудит-лог сервера (с фильтром шумов и расширений)
(function clientErrorLogger() {
  function shouldIgnore(val) {
    if (!val) return false;
    const s = String(val).toLowerCase();
    return s.includes("turnstile") ||
           s.includes("300010") ||
           s.includes("challenges.cloudflare.com") ||
           s.includes("chrome-extension") ||
           s.includes("moz-extension") ||
           s.includes("safari-extension") ||
           s.includes("extension:") ||
           s.includes("resizeobserver") ||
           s.includes("script error") ||
           s.includes("grammarly") ||
           s.includes("failed to fetch");
  }

  function send(type, message, error) {
    if (shouldIgnore(message) || shouldIgnore(error)) return;
    try {
      navigator.sendBeacon("/api/log-client-error",
        new Blob([JSON.stringify({ type, message, error: String(error || "") })],
                 { type: "application/json" }));
    } catch { /* ignore */ }
  }

  window.addEventListener("error", (e) => {
    if (shouldIgnore(e.message) || shouldIgnore(e.filename)) return;
    send("JS_ERROR", e.message + " @ " + (e.filename || "") + ":" + (e.lineno || 0), e.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (shouldIgnore(e.reason)) return;
    send("UNHANDLED_PROMISE", String(e.reason));
  });
})();
