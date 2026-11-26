/* =====================================================================
   Kết nối máy chủ bản quyền (Google Apps Script) + đăng nhập Google.
   Không gửi nội dung file PDF đi đâu: chỉ gửi email (qua mã đăng nhập Google), mã thiết bị và số lượt đã dùng.
   ===================================================================== */
import { SERVER_URL, GOOGLE_CLIENT_ID, OFFLINE_GRACE_DAYS } from "./config.mjs";

export const CLOUD = !!(SERVER_URL && GOOGLE_CLIENT_ID);
const LS_SESS = "tachpdf_sess", LS_ACCT = "tachpdf_acct";
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const del = (k) => { try { localStorage.removeItem(k); } catch {} };

export const acct = { data: null, checkedAt: 0, offline: false, error: "" };
try { const c = JSON.parse(get(LS_ACCT) || "null"); if (c && c.data) Object.assign(acct, { data: c.data, checkedAt: c.checkedAt || 0 }); } catch {}

export const loggedIn = () => !!get(LS_SESS) && !!acct.data;

async function call1(action, body, timeoutMs) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // text/plain để không bị kiểm tra CORS trước (Apps Script không trả lời OPTIONS)
    const res = await fetch(SERVER_URL, { method: "POST", body: JSON.stringify({ action, ...body }), signal: ctl.signal, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { throw new Error("BADREPLY"); }
  } finally { clearTimeout(tm); }
}
/* Gọi máy chủ, tự thử lại 1 lần khi lỗi mạng; lỗi trả về bằng tiếng Việt */
async function call(action, body, timeoutMs = 20000) {
  let err;
  for (let i = 0; i < 2; i++) {
    try { return await call1(action, body, timeoutMs); }
    catch (e) { err = e; if (i === 0) await new Promise((r) => setTimeout(r, 1200)); }
  }
  const m = String(err && err.message || err);
  const e2 = new Error(
    err && err.name === "AbortError" ? "Máy chủ bản quyền phản hồi quá chậm, thử lại sau ít phút." :
    m === "BADREPLY" || /^HTTP/.test(m) ? "Máy chủ bản quyền đang gặp lỗi, vui lòng thử lại sau hoặc liên hệ người bán." :
    "Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.");
  e2.name = err && err.name === "AbortError" ? "AbortError" : "NetError";
  throw e2;
}

function save(data) {
  acct.data = data; acct.checkedAt = Date.now(); acct.offline = false; acct.error = "";
  set(LS_ACCT, JSON.stringify({ data, checkedAt: acct.checkedAt }));
}

export function logout() { del(LS_SESS); del(LS_ACCT); acct.data = null; acct.checkedAt = 0; acct.error = ""; try { window.google?.accounts?.id?.disableAutoSelect(); } catch {} }

/* Trả về true nếu có dữ liệu dùng được (mới từ máy chủ hoặc bản lưu còn hạn khi mất mạng) */
export async function refresh(device, maxAgeMs = 0) {
  if (!CLOUD || !get(LS_SESS)) return false;
  if (acct.data && Date.now() - acct.checkedAt < maxAgeMs) return true;
  try {
    const r = await call("status", { session: get(LS_SESS), device });
    if (!r.ok) { if (r.code === "auth") logout(); acct.error = r.msg || "Lỗi máy chủ"; return false; }
    save(r); return true;
  } catch (e) {
    acct.offline = true; acct.error = "Không kết nối được máy chủ bản quyền (kiểm tra mạng).";
    return !!acct.data;
  }
}

export async function use(device, kind, n) {
  const r = await call("use", { session: get(LS_SESS), device, kind, n });
  if (!r.ok) { if (r.code === "auth") logout(); throw new Error(r.msg || "Lỗi máy chủ"); }
  save(r); return r.granted;
}

/* Gói hiện hành, có tính thời gian ân hạn khi mất mạng */
export function isPro() {
  if (!acct.data || acct.data.plan !== "pro") return false;
  if (!acct.offline) return true;
  return Date.now() - acct.checkedAt < OFFLINE_GRACE_DAYS * 86400000;
}
export function left(kind) {
  if (!acct.data) return 0;
  if (isPro()) return Infinity;
  if (acct.offline) return 0;                       // dùng thử cần có mạng
  const t = acct.data.trial[kind]; return t ? Math.max(0, t.free - t.used) : 0;
}
export const freeOf = (kind) => (acct.data && acct.data.trial[kind] ? acct.data.trial[kind].free : 0);

/* ---------- nút "Đăng nhập bằng Google" ---------- */
let gsiReady = null;
function loadGsi() {
  if (gsiReady) return gsiReady;
  gsiReady = new Promise((ok, fail) => {
    if (window.google?.accounts?.id) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gsiReady = null; fail(new Error("Không tải được nút đăng nhập Google (kiểm tra mạng).")); };
    document.head.appendChild(s);
  });
  return gsiReady;
}
export async function renderLoginButton(el, device, onDone, onError) {
  try {
    await loadGsi();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true,
      callback: async (resp) => {
        try {
          const r = await call("login", { idToken: resp.credential, device });
          if (!r.ok) throw new Error(r.msg || "Đăng nhập không thành công");
          set(LS_SESS, r.session); delete r.session; save(r); onDone(r);
        } catch (e) { onError(e.message); }
      },
    });
    el.innerHTML = "";
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    window.google.accounts.id.renderButton(el, { theme: dark ? "filled_black" : "outline", size: "large", text: "signin_with", shape: "pill", locale: "vi", width: Math.min(320, el.clientWidth || 320) });
  } catch (e) { onError(e.message); }
}
