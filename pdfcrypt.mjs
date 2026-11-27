/* =====================================================================
   Mã hóa / giải mã PDF theo chuẩn Standard Security Handler (ISO 32000).
   - Đặt mật khẩu: AES-256 (V5/R6).
   - Gỡ mật khẩu: RC4 40/128 bit (R2/R3), AES-128 (R4), AES-256 (R5/R6), kể cả file có object stream.
   Chạy hoàn toàn trên trình duyệt (WebCrypto), không gửi mật khẩu đi đâu.
   ===================================================================== */
const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;
const rnd = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const latin1 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
const fromLatin1 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
const eq = (a, b, n) => { for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
const PAD = fromLatin1("\x28\xBF\x4E\x5E\x4E\x75\x8A\x41\x64\x00\x4E\x56\xFF\xFA\x01\x08\x2E\x2E\x00\xB6\xD0\x68\x3E\x80\x2F\x0C\xA9\xFE\x64\x53\x69\x7A");

/* ---------- MD5 (chỉ dùng để giải mã file kiểu cũ) ---------- */
function md5(data) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const len = data.length, n = ((len + 8) >> 6) + 1, w = new Uint32Array(n * 16);
  for (let i = 0; i < len; i++) w[i >> 2] |= data[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8); w[n * 16 - 2] = (len * 8) >>> 0; w[n * 16 - 1] = Math.floor(len / 2 ** 29);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let o = 0; o < w.length; o += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const t = d; d = c; c = b;
      const x = (a + f + K[i] + w[o + g]) >>> 0, s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0; a = t;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16), v = [a0, b0, c0, d0];
  for (let i = 0; i < 16; i++) out[i] = (v[i >> 2] >>> ((i % 4) * 8)) & 255;
  return out;
}
function rc4(key, data) {
  const s = new Uint8Array(256); for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; out[k] = data[k] ^ s[(s[i] + s[j]) & 255]; }
  return out;
}

/* ---------- AES qua WebCrypto ---------- */
const aesKey = (k, use) => subtle.importKey("raw", k, { name: "AES-CBC" }, false, [use]);
async function cbcEncNoPad(key, iv, data) {   // dữ liệu bội số 16, bỏ khối đệm WebCrypto thêm vào
  const out = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, await aesKey(key, "encrypt"), data));
  return out.subarray(0, data.length);
}
async function cbcDecNoPad(key, iv, data) {
  // thêm 1 khối đệm hợp lệ để WebCrypto chấp nhận
  const last = data.subarray(data.length - 16), padBlock = (await cbcEncNoPad(key, last, new Uint8Array(16).fill(16)));
  return new Uint8Array(await subtle.decrypt({ name: "AES-CBC", iv }, await aesKey(key, "decrypt"), cat(data, padBlock)));
}
async function aesEnc(key, data) { const iv = rnd(16); return cat(iv, new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, await aesKey(key, "encrypt"), data))); }
async function aesDec(key, data) {
  if (data.length < 32 || data.length % 16) return data.length <= 16 ? new Uint8Array(0) : data.subarray(16);
  const iv = data.subarray(0, 16), body = data.subarray(16);
  try { return new Uint8Array(await subtle.decrypt({ name: "AES-CBC", iv }, await aesKey(key, "decrypt"), body)); }
  catch { return cbcDecNoPad(key, iv, body); }   // đệm sai: giữ nguyên dữ liệu
}
const sha = async (alg, d) => new Uint8Array(await subtle.digest(alg, d));

/* thuật toán 2.B (R6) – băm mật khẩu */
async function hash2B(pw, salt, udata, R) {
  let K = await sha("SHA-256", cat(pw, salt, udata));
  if (R === 5) return K;
  for (let i = 0; ; i++) {
    const unit = cat(pw, K, udata), K1 = new Uint8Array(unit.length * 64);
    for (let j = 0; j < 64; j++) K1.set(unit, j * unit.length);
    const E = await cbcEncNoPad(K.subarray(0, 16), K.subarray(16, 32), K1);
    let m = 0; for (let j = 0; j < 16; j++) m += E[j]; m %= 3;
    K = await sha(m === 0 ? "SHA-256" : m === 1 ? "SHA-384" : "SHA-512", E);
    if (i >= 63 && E[E.length - 1] <= i - 32) break;
  }
  return K.subarray(0, 32);
}
const pwBytes = (p) => enc.encode(String(p || "").normalize("NFC")).subarray(0, 127);

/* ---------- đọc cấu trúc thô của file PDF ---------- */
const WS = /[\0\t\n\f\r ]/;
function parseVal(s, p) {
  const skip = () => { for (;;) { while (p < s.length && WS.test(s[p])) p++; if (s[p] === "%") { while (p < s.length && s[p] !== "\n" && s[p] !== "\r") p++; } else break; } };
  skip();
  const c = s[p];
  if (c === "<" && s[p + 1] === "<") {
    p += 2; const d = {};
    for (;;) { skip(); if (s[p] === ">" && s[p + 1] === ">") { p += 2; break; } if (p >= s.length) break; const k = parseVal(s, p); p = k.end; const v = parseVal(s, p); p = v.end; d[k.v.name] = v.v; }
    return { v: { dict: d }, end: p };
  }
  if (c === "[") { p++; const a = []; for (;;) { skip(); if (s[p] === "]") { p++; break; } if (p >= s.length) break; const v = parseVal(s, p); p = v.end; a.push(v.v); } return { v: a, end: p }; }
  if (c === "/") { let q = p + 1; while (q < s.length && !WS.test(s[q]) && !"/[]<>(){}%".includes(s[q])) q++; return { v: { name: s.slice(p + 1, q).replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) }, end: q }; }
  if (c === "(") {
    let q = p + 1, depth = 1, out = "";
    while (q < s.length && depth) {
      const ch = s[q];
      if (ch === "\\") {
        const n = s[q + 1]; q += 2;
        const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
        if (map[n] !== undefined) out += map[n];
        else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[q])) o += s[q++]; out += String.fromCharCode(parseInt(o, 8) & 255); }
        else if (n === "\r") { if (s[q] === "\n") q++; } else if (n !== "\n") out += n;
        continue;
      }
      if (ch === "(") depth++; else if (ch === ")") { depth--; if (!depth) { q++; break; } }
      out += ch; q++;
    }
    return { v: { str: fromLatin1(out) }, end: q };
  }
  if (c === "<") { const q = s.indexOf(">", p); let h = s.slice(p + 1, q).replace(/\s+/g, ""); if (h.length % 2) h += "0"; const b = new Uint8Array(h.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return { v: { str: b }, end: q + 1 }; }
  const m = /^([+-]?\d*\.?\d+)(?:\s+(\d+)\s+R(?![A-Za-z]))?/.exec(s.slice(p, p + 40));
  if (m) return m[2] !== undefined ? { v: { ref: +m[1], gen: +m[2] }, end: p + m[0].length } : { v: +m[1], end: p + m[0].length };
  const w = /^[A-Za-z]+/.exec(s.slice(p, p + 10));
  if (w) return { v: w[0] === "true" ? true : w[0] === "false" ? false : null, end: p + w[0].length };
  return { v: null, end: p + 1 };
}
function scanObjects(s) {
  const objs = new Map(), re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    let v; try { v = parseVal(s, start); } catch { continue; }
    objs.set(+m[1], { gen: +m[2], at: m.index, start, val: v.v, end: v.end });   // bản xuất hiện sau ghi đè bản trước (cập nhật tăng dần)
  }
  return objs;
}
function trailerOf(s, objs) {
  let t = null, i = s.lastIndexOf("trailer");
  while (i >= 0) { const v = parseVal(s, i + 7).v; if (v && v.dict && (v.dict.Encrypt || v.dict.Root)) { t = v.dict; break; } i = s.lastIndexOf("trailer", i - 1); }
  if (!t || !t.Encrypt) for (const [, o] of objs) if (o.val && o.val.dict && o.val.dict.Type && o.val.dict.Type.name === "XRef" && o.val.dict.Encrypt) t = o.val.dict;
  return t;
}
const deref = (v, objs) => (v && v.ref !== undefined ? objs.get(v.ref)?.val : v);

export function isEncrypted(bytes) { const s = latin1(bytes.subarray(Math.max(0, bytes.length - 4096))); return /\/Encrypt\s/.test(s) || /\/Encrypt\s/.test(latin1(bytes)); }
export function hasSignature(bytes) { const s = latin1(bytes); return /\/ByteRange\s*\[/.test(s) && /\/Type\s*\/Sig\b|\/SubFilter\s*\/(adbe|ETSI)/.test(s); }

/* ---------- tính khóa từ mật khẩu ---------- */
function encryptInfo(bytes) {
  const s = latin1(bytes), objs = scanObjects(s), tr = trailerOf(s, objs);
  if (!tr || !tr.Encrypt) return null;
  const E = deref(tr.Encrypt, objs)?.dict; if (!E) return null;
  const num = (k, d) => (typeof deref(E[k], objs) === "number" ? deref(E[k], objs) : d);
  const str = (k) => deref(E[k], objs)?.str || new Uint8Array(0);
  const V = num("V", 0), R = num("R", 2), cf = E.CF && deref(E.CF, objs)?.dict, std = cf && E.StmF && cf[E.StmF.name] && deref(cf[E.StmF.name], objs)?.dict;
  const cfm = std && std.CFM ? std.CFM.name : V >= 4 ? "V2" : "V2";
  const id = Array.isArray(deref(tr.ID, objs)) ? deref(tr.ID, objs)[0]?.str || new Uint8Array(0) : new Uint8Array(0);
  return {
    s, objs, tr, encRef: tr.Encrypt.ref, V, R, P: num("P", -4) | 0, len: (V === 1 ? 40 : num("Length", 40)) / 8, O: str("O"), U: str("U"), OE: str("OE"), UE: str("UE"),
    id, cfm, encMeta: E.EncryptMetadata !== false, filter: E.Filter?.name,
  };
}
async function keyFor(info, password) {
  const pw = pwBytes(password);
  if (info.R >= 5) {
    const U = info.U, O = info.O;
    if (eq(await hash2B(pw, U.subarray(32, 40), new Uint8Array(0), info.R), U, 32))
      return { key: await cbcDecNoPad(await hash2B(pw, U.subarray(40, 48), new Uint8Array(0), info.R), new Uint8Array(16), info.UE.subarray(0, 32)), owner: false };
    if (eq(await hash2B(pw, O.subarray(32, 40), U.subarray(0, 48), info.R), O, 32))
      return { key: await cbcDecNoPad(await hash2B(pw, O.subarray(40, 48), U.subarray(0, 48), info.R), new Uint8Array(16), info.OE.subarray(0, 32)), owner: true };
    return null;
  }
  // R2–R4 (mật khẩu dạng latin1, đệm 32 byte)
  const padded = (p) => cat(p.subarray(0, 32), PAD.subarray(0, Math.max(0, 32 - p.length)));
  const latin = fromLatin1(String(password || "").normalize("NFC").replace(/[^\x00-\xff]/g, "?"));
  const userKey = (up) => {
    const p = new Uint8Array(4); new DataView(p.buffer).setInt32(0, info.P, true);
    let h = md5(cat(padded(up), info.O.subarray(0, 32), p, info.id, info.R >= 4 && !info.encMeta ? new Uint8Array([255, 255, 255, 255]) : new Uint8Array(0)));
    if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, info.len));
    return h.subarray(0, info.R === 2 ? 5 : info.len);
  };
  const checkUser = (key) => {
    if (info.R === 2) return eq(rc4(key, PAD), info.U, 32);
    let x = rc4(key, md5(cat(PAD, info.id)));
    for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
    return eq(x, info.U, 16);
  };
  let k = userKey(latin); if (checkUser(k)) return { key: k, owner: false };
  // thử như mật khẩu chủ sở hữu
  let h = md5(padded(latin)); if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const ok = h.subarray(0, info.R === 2 ? 5 : info.len);
  let up = info.O.subarray(0, 32);
  if (info.R === 2) up = rc4(ok, up); else for (let i = 19; i >= 0; i--) up = rc4(ok.map((b) => b ^ i), up);
  k = userKey(up); if (checkUser(k)) return { key: k, owner: true };
  return null;
}
function objKey(info, key, num, gen) {
  if (info.R >= 5) return key;
  const aes = info.cfm === "AESV2";
  const h = md5(cat(key, new Uint8Array([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]), aes ? fromLatin1("sAlT") : new Uint8Array(0)));
  return h.subarray(0, Math.min(key.length + 5, 16));
}
async function decData(info, key, num, gen, data) {
  const k = objKey(info, key, num, gen);
  if (info.cfm === "None" || info.cfm === "Identity") return data;
  return info.cfm === "AESV2" || info.cfm === "AESV3" || info.R >= 5 ? aesDec(k, data) : rc4(k, data);
}
async function inflate(data) {
  const ds = new DecompressionStream("deflate"), w = ds.writable.getWriter(); w.write(data); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/* ---------- GỠ MẬT KHẨU ----------
   passwords: danh sách mật khẩu thử lần lượt (luôn thử mật khẩu rỗng trước).
   Trả về { bytes, password } hoặc ném lỗi { code: "password" | "notenc" | "unsupported" }. */
export async function decryptPdf(bytes, passwords, PDFLib) {
  const info = encryptInfo(bytes);
  if (!info) throw Object.assign(new Error("File không có mật khẩu"), { code: "notenc" });
  if (info.filter && info.filter !== "Standard") throw Object.assign(new Error("Kiểu khóa " + info.filter + " (chứng thư số) chưa hỗ trợ"), { code: "unsupported" });
  let found = null, used = null;
  for (const p of ["", ...passwords.filter((x) => x !== "")]) { found = await keyFor(info, p); if (found) { used = p; break; } }
  if (!found) throw Object.assign(new Error("Sai mật khẩu"), { code: "password" });
  const key = found.key, s = info.s;
  // 1) giải mã sẵn các object stream ngay trên dữ liệu thô để thư viện PDF đọc được
  const inObjStm = new Set(), parts = []; let last = 0;
  const lenOf = (d) => { const L = deref(d.Length, info.objs); return typeof L === "number" ? L : null; };
  for (const [num, o] of [...info.objs.entries()].sort((a, b) => a[1].at - b[1].at)) {
    const d = o.val && o.val.dict; if (!d || !d.Type || d.Type.name !== "ObjStm") continue;
    let p = s.indexOf("stream", o.end); if (p < 0) continue; p += 6; if (s[p] === "\r") p++; if (s[p] === "\n") p++;
    let L = lenOf(d); if (L == null || s.slice(p + L, p + L + 30).indexOf("endstream") < 0) L = s.indexOf("endstream", p) - p;
    const raw = bytes.subarray(p, p + L), plain = await decData(info, key, num, o.gen, raw);
    try {   // ghi nhận các object nằm trong stream này (chuỗi bên trong không mã hóa riêng)
      const txt = latin1((await inflate(plain)).subarray(0, (deref(d.First, info.objs) || 0)));
      const nums = txt.trim().split(/\s+/).map(Number); for (let i = 0; i < nums.length; i += 2) inObjStm.add(nums[i]);
    } catch {}
    // thay /Length thành số trực tiếp
    const dictTxt = s.slice(o.start, o.end).replace(/\/Length\s+\d+(\s+\d+\s+R)?/, "/Length " + plain.length);
    parts.push(bytes.subarray(last, o.start), fromLatin1(dictTxt), bytes.subarray(o.end, p), plain);
    last = p + L;
  }
  parts.push(bytes.subarray(last));
  const pre = parts.length > 1 ? cat(...parts) : bytes;
  // 2) đọc bằng pdf-lib rồi giải mã từng chuỗi, từng stream
  const doc = await PDFLib.PDFDocument.load(pre, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const ctx = doc.context, { PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream, PDFName, PDFNumber } = PDFLib;
  const isSig = (d) => d.get(PDFName.of("ByteRange")) || (d.get(PDFName.of("Type")) && d.get(PDFName.of("Type")).toString() === "/Sig");
  async function walk(o, num, gen, sig) {
    if (o instanceof PDFDict) {
      const s2 = sig || isSig(o);
      for (const [k, v] of o.entries()) {
        if (s2 && k.toString() === "/Contents") continue;
        const nv = await walk(v, num, gen, s2); if (nv) o.set(k, nv);
      }
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) { const nv = await walk(o.get(i), num, gen, sig); if (nv) o.set(i, nv); }
    } else if (o instanceof PDFString || o instanceof PDFHexString) {
      return PDFHexString.of(hex(await decData(info, key, num, gen, o.asBytes())));
    }
    return null;
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const num = ref.objectNumber, gen = ref.generationNumber;
    if (num === info.encRef || inObjStm.has(num)) continue;
    if (obj instanceof PDFRawStream) {
      const t = obj.dict.get(PDFName.of("Type")), tn = t ? t.toString() : "";
      if (tn === "/XRef" || tn === "/ObjStm") continue;
      if (tn === "/Metadata" && !info.encMeta) continue;
      await walk(obj.dict, num, gen, false);
      const plain = await decData(info, key, num, gen, obj.contents);
      obj.dict.set(PDFName.of("Length"), PDFNumber.of(plain.length));
      ctx.assign(ref, PDFRawStream.of(obj.dict, plain));
    } else await walk(obj, num, gen, false);
  }
  if (info.encRef != null) ctx.delete(PDFLib.PDFRef.of(info.encRef, 0));
  delete ctx.trailerInfo.Encrypt;
  ctx.largestObjectNumber = Math.max(0, ...ctx.enumerateIndirectObjects().map(([r]) => r.objectNumber));
  return { bytes: await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), password: used, owner: found.owner };
}
const hex = (b) => { let s = ""; for (const x of b) s += x.toString(16).padStart(2, "0"); return s; };

/* ---------- ĐẶT MẬT KHẨU (AES-256) ----------
   perms: { print, copy, modify } (true = cho phép). ownerPw để trống thì tạo ngẫu nhiên. */
export async function encryptPdf(bytes, { userPw, ownerPw, perms = {} }, PDFLib) {
  const { PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream, PDFName, PDFNumber, PDFBool } = PDFLib;
  // nạp lại từ byte để mọi stream ở dạng thô, không dùng object stream
  let doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  doc = await PDFLib.PDFDocument.load(await doc.save({ useObjectStreams: false }), { updateMetadata: false });
  const ctx = doc.context, FK = rnd(32);
  const up = pwBytes(userPw), op = pwBytes(ownerPw || hex(rnd(16)));
  const uvs = rnd(8), uks = rnd(8), ovs = rnd(8), oks = rnd(8), zero = new Uint8Array(16);
  const U = cat(await hash2B(up, uvs, new Uint8Array(0), 6), uvs, uks);
  const UE = await cbcEncNoPad(await hash2B(up, uks, new Uint8Array(0), 6), zero, FK);
  const O = cat(await hash2B(op, ovs, U, 6), ovs, oks);
  const OE = await cbcEncNoPad(await hash2B(op, oks, U, 6), zero, FK);
  // quyền: bit 3 in, 4 sửa, 5 sao chép, 6 ghi chú, 9 điền biểu mẫu, 10 trích xuất trợ năng, 11 ghép trang, 12 in chất lượng cao
  let P = 0xfffff0c0 | 0x200;
  if (perms.print !== false) P |= 0x4 | 0x800;
  if (perms.modify !== false) P |= 0x8 | 0x20 | 0x100 | 0x400;
  if (perms.copy !== false) P |= 0x10;
  P |= 0; const pb = new Uint8Array(16); new DataView(pb.buffer).setInt32(0, P, true);
  pb.set([255, 255, 255, 255, 0x54, 0x61, 0x64, 0x62], 4); pb.set(rnd(4), 12);
  const Perms = await cbcEncNoPad(FK, zero, pb);
  const encStr = async (b) => PDFHexString.of(hex(await aesEnc(FK, b)));
  async function walk(o) {
    if (o instanceof PDFDict) { for (const [k, v] of o.entries()) { const nv = await walk(v); if (nv) o.set(k, nv); } }
    else if (o instanceof PDFArray) { for (let i = 0; i < o.size(); i++) { const nv = await walk(o.get(i)); if (nv) o.set(i, nv); } }
    else if (o instanceof PDFString || o instanceof PDFHexString) return encStr(o.asBytes());
    return null;
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const t = obj.dict.get(PDFName.of("Type")); if (t && (t.toString() === "/XRef" || t.toString() === "/ObjStm")) continue;
      await walk(obj.dict);
      const c = await aesEnc(FK, obj.contents);
      obj.dict.set(PDFName.of("Length"), PDFNumber.of(c.length));
      ctx.assign(ref, PDFRawStream.of(obj.dict, c));
    } else { const nv = await walk(obj); if (nv) ctx.assign(ref, nv); }
  }
  const H = (b) => PDFHexString.of(hex(b));
  const stdcf = ctx.obj({ AuthEvent: "DocOpen", CFM: "AESV3", Length: 32 });
  const encDict = ctx.obj({ Filter: "Standard", V: 5, R: 6, Length: 256, P, StmF: "StdCF", StrF: "StdCF", CF: { StdCF: stdcf } });
  encDict.set(PDFName.of("O"), H(O)); encDict.set(PDFName.of("U"), H(U)); encDict.set(PDFName.of("OE"), H(OE)); encDict.set(PDFName.of("UE"), H(UE)); encDict.set(PDFName.of("Perms"), H(Perms));
  encDict.set(PDFName.of("EncryptMetadata"), PDFBool.True);
  ctx.trailerInfo.Encrypt = ctx.register(encDict);
  const id = H(rnd(16)); ctx.trailerInfo.ID = ctx.obj([id, id]);
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}

/* mật khẩu ngẫu nhiên, bỏ ký tự dễ nhầm */
export function randomPassword(len, kind) {
  const digits = "23456789", lower = "abcdefghjkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", sym = "@#$%&*+=?";
  const pool = kind === "num" ? digits : kind === "sym" ? digits + lower + upper + sym : digits + lower + upper;
  const need = kind === "num" ? [digits] : kind === "sym" ? [digits, lower, upper, sym] : [digits, lower, upper];
  for (;;) {
    const r = rnd(len), s = [...r].map((x) => pool[x % pool.length]).join("");
    if (len < need.length || need.every((set) => [...s].some((ch) => set.includes(ch)))) return s;
  }
}
