/* =====================================================================
   Đọc thông tin hóa đơn từ chữ của một trang (chữ thật hoặc chữ OCR).
   - Dò nhãn trên bản "bỏ dấu" nên chịu được OCR sai dấu và nhiều mẫu hóa đơn.
   - Lấy giá trị ở cùng vị trí trên chữ gốc để giữ nguyên dấu tiếng Việt.
   ===================================================================== */

const VN = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
const BS = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";
const FOLD = new Map();
[...VN].forEach((ch, k) => { FOLD.set(ch, BS[k]); FOLD.set(ch.toUpperCase(), BS[k]); });

/** Bỏ dấu + chữ thường, giữ nguyên độ dài chuỗi (để ánh xạ vị trí về chữ gốc). */
export function fold(t) {
  let o = "";
  for (const ch of t) o += FOLD.get(ch) ?? (ch.length === 1 ? ch.toLowerCase() : ch);
  return o;
}

/* Nhãn mặc định (viết không dấu, dạng regex). Thứ tự = ưu tiên. */
export const DEFAULT_LABELS = {
  donvi: [
    "ten don vi(?! ban)",
    "don vi mua(?: hang)?",
    "ten (?:cong ty|to chuc) mua",
    "ten khach hang",
    "ben mua",
  ],
  nguoimua: ["ho (?:va )?ten nguoi mua(?: hang)?", "nguoi mua hang", "ten nguoi mua"],
  mst: ["ma so thue", "\\bmst\\b"],
  kyhieu: ["ky hieu(?: hoa don)?"],
  tienhang: [
    "cong tien hang(?: hoa)?(?:,? dich vu)?",
    "tong (?:cong )?tien (?:hang|chua (?:co )?thue)(?: hoa)?(?:,? dich vu)?",
    "thanh tien truoc thue",
    "tien hang",
  ],
  thue: ["tien thue gtgt", "tong (?:cong )?tien thue(?: gtgt)?", "tien thue", "thue gtgt(?! *\\()"],
  tong: [
    "tong (?:cong )?tien thanh toan",
    "tong (?:cong )?thanh toan",
    "tong tien thanh toan",
    "tong cong tien",
    "tong cong",
  ],
};

/** Chuyển chuỗi tiền kiểu VN (54.741.268 / 54,741,268 / 1.234,5) thành số. */
export function parseMoney(s) {
  s = String(s).replace(/\s/g, "");
  if (!/\d/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
  if (dots && commas) {                         // cả hai: dấu cuối cùng là phần thập phân
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (dots || commas) {
    const sep = dots ? "." : ",";
    const parts = s.split(sep);
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = thousands ? parts.join("") : parts.join(".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONEY_RE = "(-?\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,2})?|-?\\d+(?:[.,]\\d{1,2})?)";

function compile(list) { return list.map((l) => new RegExp(l, "g")); }

/** Tìm nhãn (bản bỏ dấu), trả giá trị trên cùng dòng lấy từ chữ gốc. */
function findField(t, ft, regs, from = 0, opts = {}) {
  let best = null;
  for (const re of regs) {
    const full = new RegExp("(?:" + re.source + ")[ \\t]*[:;.]?[ \\t]*([^\\r\\n]*)", "g");
    full.lastIndex = from;
    let m;
    while ((m = full.exec(ft))) {
      const st = m.index + m[0].length - m[1].length;
      let v = t.slice(st, st + m[1].length);
      const p = v.indexOf("   "); if (p >= 0) v = v.slice(0, p);
      v = v.trim().replace(/^[:;.\-|_ ]+|[:;.\-|_ ]+$/g, "");
      if (opts.need && !opts.need.test(v)) continue;
      const hit = { v, end: m.index + m[0].length, at: m.index };
      if (opts.last) { if (!best || hit.at > best.at) best = hit; }
      else { if (!best || hit.at < best.at) best = hit; break; }
    }
    if (best && !opts.last) return best;
  }
  return best || { v: "", end: from, at: -1 };
}

function compileLabels(extra = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULT_LABELS)) {
    const ex = (extra[k] || []).map((s) => fold(s.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
    out[k] = compile([...ex, ...DEFAULT_LABELS[k]]);
  }
  return out;
}
let cache = { key: "", labels: null };
function labelsFor(extra) {
  const key = JSON.stringify(extra || {});
  if (cache.key !== key) cache = { key, labels: compileLabels(extra) };
  return cache.labels;
}

/**
 * Đọc thông tin một trang.
 * @returns {so, kyhieu, ngay, donvi, mst, tienhang, thue, tong, thuesuat, coNguoiMua}
 */
export function parseInvoice(text, extra) {
  const L = labelsFor(extra);
  const t = String(text).normalize("NFC");
  const ft = fold(t);

  // Số hóa đơn: "Số:", "Số HĐ:", "Số hóa đơn:" theo sau là >= 5 chữ số
  const mSo = ft.match(/\bso(?: (?:hd|hoa don))?[ \t]*[:;.]?[ \t]*([0-9o]{5,})\b/);
  const so = mSo ? mSo[1].replace(/o/g, "0") : "";

  // Ngày: "Ngày 30 tháng 09 năm 2022" hoặc "Ngày lập: 30/09/2022"
  let ngay = "";
  const d1 = ft.match(/ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})/);
  const d2 = ft.match(/ngay(?: lap| hoa don| xuat)?[ \t]*[:;.]?[ \t]*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const d = d1 || d2;
  if (d) ngay = `${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}-${d[3]}`;

  const kh = findField(t, ft, L.kyhieu);
  const dv = findField(t, ft, L.donvi, 0, { need: /\S{2,}/ });
  const nm = findField(t, ft, L.nguoimua, 0, { need: /^[^(\[]\S/ });
  let donvi = dv.v, mst = "";
  const fromBuyer = dv.v ? dv.end : nm.v ? nm.end : -1;
  if (fromBuyer >= 0) {
    const ms = findField(t, ft, L.mst, fromBuyer, { need: /\d{5,}/ });
    mst = ms.v.replace(/[oO]/g, "0").replace(/[^\d-]/g, "").replace(/^-+|-+$/g, "");
  }
  if (!donvi) donvi = nm.v;

  // Tiền: lấy lần xuất hiện CUỐI có số (dòng tổng nằm cuối hóa đơn)
  const money = (regs) => {
    const f = findField(t, ft, regs, 0, { last: true, need: new RegExp(MONEY_RE) });
    if (!f.v) return null;
    const m = f.v.match(new RegExp(MONEY_RE + "(?![\\d%])"));
    return m ? parseMoney(m[1]) : null;
  };
  const tienhang = money(L.tienhang), thue = money(L.thue), tong = money(L.tong);
  const ts = ft.match(/thue suat(?: gtgt)?[ \t]*[:;.]?[ \t]*(\d{1,2}|kct|kkknt)[ \t]*%?/);

  return {
    so, kyhieu: kh.v.split(/\s+/)[0] || "", ngay, donvi, mst,
    tienhang, thue, tong, thuesuat: ts ? (/\d/.test(ts[1]) ? ts[1] + "%" : ts[1].toUpperCase()) : "",
    coNguoiMua: !!(dv.v || nm.v),
  };
}
