/* =====================================================================
   Đóng dấu hàng loạt: dấu chữ (khung dấu / chữ chéo mờ), ảnh con dấu – chữ ký – logo, số trang.
   Mọi loại dấu được vẽ thành ảnh PNG (hỗ trợ tiếng Việt), rồi chèn lên trang PDF.
   ===================================================================== */
const PRESETS = ["ĐÃ THANH TOÁN", "BẢN SAO", "ĐÃ DUYỆT", "ĐÃ NHẬP KHO", "MẬT", "NHÁP", "ĐÃ ĐỐI CHIẾU"];
const COLORS = { red: "#d32f2f", blue: "#1e4fd8", black: "#222222", gray: "#8a94a3" };
const POS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
const POS_NAME = { tl: "Trên trái", tc: "Trên giữa", tr: "Trên phải", ml: "Giữa trái", mc: "Chính giữa", mr: "Giữa phải", bl: "Dưới trái", bc: "Dưới giữa", br: "Dưới phải" };

const HTML = `
<section class="panel" aria-label="Đóng dấu">
  <div class="drop" id="dgDrop" tabindex="0" role="button" aria-describedby="dgHint">
    <strong>Kéo thả một hoặc nhiều file PDF vào đây, hoặc bấm để chọn</strong>
    <small id="dgHint">Đóng dấu "ĐÃ THANH TOÁN", chèn con dấu, chữ ký, logo hoặc đánh số trang cho nhiều file cùng lúc.</small>
    <span class="file" id="dgFileName"></span>
    <input type="file" id="dgInput" accept="application/pdf,.pdf" multiple hidden>
  </div>
  <div class="dggrid">
    <div class="namebox dgopts">
      <div class="seg" role="radiogroup" aria-label="Loại dấu">
        <label><input type="radio" name="dgType" value="text" checked><span>Dấu chữ</span></label>
        <label><input type="radio" name="dgType" value="image"><span>Ảnh dấu / chữ ký</span></label>
        <label><input type="radio" name="dgType" value="num"><span>Số trang</span></label>
      </div>
      <div data-for="text" class="dgsec">
        <div class="lblgrid"><label for="dgText">Nội dung</label><input type="text" id="dgText" value="ĐÃ THANH TOÁN" spellcheck="false"></div>
        <div class="chips" id="dgPresets"></div>
        <div class="lblgrid"><label for="dgStyle">Kiểu</label>
          <select id="dgStyle"><option value="box">Khung dấu (như dấu mộc)</option><option value="wm">Chữ chéo mờ giữa trang</option><option value="plain">Chữ thường</option></select></div>
        <div class="lblgrid"><label>Màu</label><div class="swatches" id="dgColors"></div></div>
      </div>
      <div data-for="image" class="dgsec" hidden>
        <div class="lblgrid"><label for="dgImg">Ảnh</label><input type="file" id="dgImg" accept="image/png,image/jpeg,image/webp"></div>
        <label class="note"><input type="checkbox" id="dgWhite" checked> Xóa nền trắng của ảnh (ảnh chụp con dấu, chữ ký trên giấy)</label>
      </div>
      <div data-for="num" class="dgsec" hidden>
        <div class="lblgrid"><label for="dgNumFmt">Mẫu số trang</label>
          <select id="dgNumFmt"><option value="Trang {n}/{N}">Trang 1/5</option><option value="Trang {n}">Trang 1</option><option value="{n}/{N}">1/5</option><option value="- {n} -">- 1 -</option><option value="{n}">1</option></select></div>
        <div class="lblgrid"><label for="dgStart">Bắt đầu từ số</label><input type="number" id="dgStart" value="1" min="0" max="9999"></div>
      </div>
      <div class="lblgrid" id="dgPosRow"><label>Vị trí</label><div class="posgrid" id="dgPos" role="radiogroup" aria-label="Vị trí dấu"></div></div>
      <div class="lblgrid"><label for="dgSize">Cỡ</label><input type="range" id="dgSize" min="5" max="80" value="28"></div>
      <div class="lblgrid"><label for="dgOpa">Độ đậm</label><input type="range" id="dgOpa" min="15" max="100" value="85"></div>
      <div class="lblgrid" id="dgRotRow"><label for="dgRot">Nghiêng</label><input type="range" id="dgRot" min="-45" max="45" value="-12"></div>
      <div class="lblgrid"><label for="dgPages">Trang áp dụng</label>
        <select id="dgPages"><option value="all">Tất cả các trang</option><option value="first">Chỉ trang đầu</option><option value="last">Chỉ trang cuối</option><option value="custom">Chọn trang…</option></select></div>
      <div class="lblgrid" id="dgCustomRow" hidden><label for="dgCustom">Các trang</label><input type="text" id="dgCustom" placeholder="VD: 1-3, 5" spellcheck="false"></div>
    </div>
    <div class="dgprev"><div class="note" id="dgPrevNote">Xem trước trang đầu</div><div class="dgstage"><canvas id="dgCanvas" width="10" height="14"></canvas></div></div>
  </div>
  <div class="actions">
    <button class="btn primary" id="dgRun" type="button" disabled>Đóng dấu</button>
    <button class="btn" id="dgView" type="button" disabled>Xem kết quả</button>
    <button class="btn" id="dgSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="dgBar"></div></div>
  <div class="status" id="dgStatus" role="status">Chưa chọn file.</div>
</section>`;

const CSS = `
.dggrid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 760px) { .dggrid { grid-template-columns: 1fr; } }
.dgopts { display: grid; gap: 12px; }
.dgsec { display: grid; gap: 10px; }
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 4px; border-radius: 10px; background: var(--paper); border: 1px solid var(--line); }
.seg label { position: relative; } .seg input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
.seg span { display: block; text-align: center; padding: 7px 6px; border-radius: 7px; font: 600 13px var(--font-body); color: var(--muted); }
.seg input:checked + span { background: var(--sheet); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.seg input:focus-visible + span { outline: 2px solid var(--stamp); }
.swatches { display: flex; gap: 8px; }
.swatches button { width: 28px; height: 28px; border-radius: 999px; border: 2px solid var(--sheet); box-shadow: 0 0 0 1px var(--line); cursor: pointer; }
.swatches button[aria-checked="true"] { box-shadow: 0 0 0 2px var(--ink); }
.posgrid { display: grid; grid-template-columns: repeat(3, 34px); gap: 4px; }
.posgrid button { height: 26px; border-radius: 5px; border: 1px solid var(--line); background: var(--sheet); cursor: pointer; }
.posgrid button[aria-checked="true"] { background: var(--stamp); border-color: var(--stamp); }
.dgprev { display: grid; gap: 6px; position: sticky; top: 76px; }
.dgstage { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }
.dgstage canvas { display: block; width: 100%; height: auto; }
input[type="range"] { width: 100%; accent-color: var(--stamp); }
`;

/* ---------- vẽ con dấu thành ảnh ---------- */
function fontFor(px, bold = true) { return `${bold ? "800" : "600"} ${px}px "Be Vietnam Pro", "Segoe UI", Arial, sans-serif`; }
function rotCanvas(src, deg) {
  if (!deg) return src;
  const r = (deg * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const W = Math.ceil(src.width * c + src.height * s), H = Math.ceil(src.width * s + src.height * c);
  const o = document.createElement("canvas"); o.width = W; o.height = H;
  const x = o.getContext("2d"); x.translate(W / 2, H / 2); x.rotate(r); x.drawImage(src, -src.width / 2, -src.height / 2);
  return o;
}
function textStamp(text, style, color) {
  const px = 96, pad = style === "box" ? 46 : 12;
  const m = document.createElement("canvas").getContext("2d"); m.font = fontFor(px);
  const tw = Math.ceil(m.measureText(text).width);
  const c = document.createElement("canvas"); c.width = tw + pad * 2; c.height = px * 1.35 + pad * 2 - (style === "box" ? 0 : 10);
  const x = c.getContext("2d");
  x.font = fontFor(px); x.fillStyle = color; x.strokeStyle = color; x.textBaseline = "middle"; x.textAlign = "center";
  x.fillText(text, c.width / 2, c.height / 2 + 4);
  if (style === "box") {
    x.lineWidth = 11; const r = 22, i = 12;
    x.beginPath(); x.roundRect ? x.roundRect(i, i, c.width - 2 * i, c.height - 2 * i, r) : x.rect(i, i, c.width - 2 * i, c.height - 2 * i); x.stroke();
    x.lineWidth = 4; const j = 30;
    x.beginPath(); x.roundRect ? x.roundRect(j, j, c.width - 2 * j, c.height - 2 * j, r * 0.6) : x.rect(j, j, c.width - 2 * j, c.height - 2 * j); x.stroke();
    // vân mực loang cho giống dấu thật
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data; let seed = 7;
    for (let k = 3; k < a.length; k += 4) { if (!a[k]) continue; seed = (seed * 16807) % 2147483647; if (seed % 100 < 9) a[k] = Math.round(a[k] * 0.35); }
    x.putImageData(d, 0, 0);
  }
  return c;
}
function numStamp(text, color) {
  const px = 64, m = document.createElement("canvas").getContext("2d"); m.font = fontFor(px, false);
  const c = document.createElement("canvas"); c.width = Math.ceil(m.measureText(text).width) + 16; c.height = px * 1.3;
  const x = c.getContext("2d"); x.font = fontFor(px, false); x.fillStyle = color; x.textBaseline = "middle"; x.textAlign = "center";
  x.fillText(text, c.width / 2, c.height / 2); return c;
}
async function imageStamp(file, dropWhite) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const x = c.getContext("2d"); x.drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  if (dropWhite) {
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let k = 0; k < a.length; k += 4) {
      const l = 0.299 * a[k] + 0.587 * a[k + 1] + 0.114 * a[k + 2], sat = Math.max(a[k], a[k + 1], a[k + 2]) - Math.min(a[k], a[k + 1], a[k + 2]);
      if (l > 225 && sat < 40) a[k + 3] = 0; else if (l > 190 && sat < 40) a[k + 3] = Math.round(a[k + 3] * (225 - l) / 35);
    }
    x.putImageData(d, 0, 0);
  }
  return c;
}
const pngBytes = (c) => new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/png"));

function parsePages(spec, n) {
  const set = new Set();
  for (const part of String(spec).split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part); if (!m) continue;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(n, b); i++) set.add(i - 1);
  }
  return set;
}

/* Toạ độ đặt dấu trên trang (đơn vị điểm PDF, gốc dưới-trái) */
function place(pos, pw, ph, w, h) {
  const m = Math.min(pw, ph) * 0.045;
  const col = pos[1] === "l" ? 0 : pos[1] === "c" ? 1 : 2, row = pos[0] === "t" ? 0 : pos[0] === "m" ? 1 : 2;
  const x = col === 0 ? m : col === 1 ? (pw - w) / 2 : pw - w - m;
  const yTop = row === 0 ? m : row === 1 ? (ph - h) / 2 : ph - h - m;
  return { x, y: ph - yTop - h };
}

export function initDong(D) {
  const { $, esc } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewDong").innerHTML = HTML;
  const st = { files: [], out: null, outName: "", busy: false, color: "red", pos: "tr", img: null, prevPdf: null };
  const status = (t, err) => { $("dgStatus").textContent = t; $("dgStatus").className = "status" + (err ? " err" : ""); };
  const type = () => document.querySelector('input[name="dgType"]:checked').value;
  const lock = (on) => { st.busy = on; $("dgRun").disabled = on || !st.files.length; $("dgView").disabled = $("dgSave").disabled = on || !st.out; };

  $("dgPresets").innerHTML = PRESETS.map((p) => `<button class="chip" type="button">${esc(p)}</button>`).join("");
  $("dgPresets").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { $("dgText").value = b.textContent; changed(); } });
  $("dgColors").innerHTML = Object.entries(COLORS).map(([k, v]) => `<button type="button" role="radio" aria-checked="${k === st.color}" aria-label="${k}" data-c="${k}" style="background:${v}"></button>`).join("");
  $("dgColors").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; st.color = b.dataset.c; $("dgColors").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b))); changed(); });
  $("dgPos").innerHTML = POS.map((p) => `<button type="button" role="radio" aria-checked="${p === st.pos}" data-p="${p}" title="${POS_NAME[p]}" aria-label="${POS_NAME[p]}"></button>`).join("");
  const setPos = (p) => { st.pos = p; $("dgPos").querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.p === p))); };
  $("dgPos").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { setPos(b.dataset.p); changed(); } });

  const DEF = { text: { pos: "tr", size: 28, rot: -12 }, image: { pos: "br", size: 20, rot: 0 }, num: { pos: "bc", size: 9, rot: 0 } };
  document.querySelectorAll('input[name="dgType"]').forEach((r) => r.addEventListener("change", () => {
    const t = type();
    document.querySelectorAll(".dgsec").forEach((s) => (s.hidden = s.dataset.for !== t));
    setPos(DEF[t].pos); $("dgSize").value = DEF[t].size; $("dgRot").value = DEF[t].rot;
    $("dgRotRow").hidden = t === "num"; syncWm(); changed();
  }));
  const syncWm = () => { const wm = type() === "text" && $("dgStyle").value === "wm"; $("dgPosRow").hidden = wm; if (wm) { $("dgSize").value = Math.max(+$("dgSize").value, 60); $("dgRot").value = -35; $("dgOpa").value = Math.min(+$("dgOpa").value, 30); } };
  $("dgStyle").addEventListener("change", () => { syncWm(); changed(); });
  $("dgPages").addEventListener("change", () => { $("dgCustomRow").hidden = $("dgPages").value !== "custom"; });
  ["dgText", "dgSize", "dgOpa", "dgRot", "dgNumFmt", "dgStart"].forEach((id) => $(id).addEventListener("input", changed));
  $("dgImg").addEventListener("change", async () => { const f = $("dgImg").files[0]; st.img = f || null; st.imgCanvas = null; changed(); });
  $("dgWhite").addEventListener("change", () => { st.imgCanvas = null; changed(); });

  async function stampFor(pageNo, total) {
    const t = type(), color = COLORS[st.color];
    if (t === "num") return numStamp($("dgNumFmt").value.replace("{n}", pageNo).replace("{N}", total), color);
    if (t === "image") {
      if (!st.img) return null;
      if (!st.imgCanvas) st.imgCanvas = await imageStamp(st.img, $("dgWhite").checked);
      return rotCanvas(st.imgCanvas, +$("dgRot").value);
    }
    const text = $("dgText").value.trim(); if (!text) return null;
    return rotCanvas(textStamp(text, $("dgStyle").value === "box" ? "box" : "plain", color), +$("dgRot").value);
  }
  /* kích thước + vị trí dấu trên trang pw×ph (điểm PDF) */
  function geom(stamp, pw, ph) {
    const t = type(), wm = t === "text" && $("dgStyle").value === "wm";
    let w = (pw * +$("dgSize").value) / 100;
    if (t === "num") w = Math.min(w * (stamp.width / stamp.height) / 4, pw * 0.5);
    let h = (w * stamp.height) / stamp.width;
    if (h > ph * 0.9) { h = ph * 0.9; w = (h * stamp.width) / stamp.height; }
    const p = place(wm ? "mc" : st.pos, pw, ph, w, h);
    return { ...p, w, h };
  }

  // xem trước
  let prevTimer = null;
  function changed() { st.out = null; lock(false); clearTimeout(prevTimer); prevTimer = setTimeout(preview, 120); }
  async function preview() {
    const c = $("dgCanvas");
    if (!st.files.length) return;
    try {
      if (!st.prevPdf) { st.prevTask = D.pdfjsLib.getDocument({ data: st.files[0].bytes.slice() }); st.prevPdf = await st.prevTask.promise; }
      const page = await st.prevPdf.getPage(1), base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 900 / base.width), vp = page.getViewport({ scale });
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, viewport: vp }).promise;
      const sel = pagesOf(st.prevPdf.numPages);
      if (!sel.has(0)) { $("dgPrevNote").textContent = "Xem trước trang đầu (trang này không đóng dấu)"; return; }
      $("dgPrevNote").textContent = "Xem trước trang đầu";
      const s = await stampFor(+$("dgStart").value || 1, st.prevPdf.numPages); if (!s) return;
      const g = geom(s, base.width, base.height);
      x.globalAlpha = +$("dgOpa").value / 100;
      x.drawImage(s, g.x * scale, (base.height - g.y - g.h) * scale, g.w * scale, g.h * scale);
      x.globalAlpha = 1;
    } catch (e) { console.error(e); }
  }
  function pagesOf(n) {
    const v = $("dgPages").value;
    if (v === "first") return new Set([0]);
    if (v === "last") return new Set([n - 1]);
    if (v === "custom") return parsePages($("dgCustom").value, n);
    return new Set([...Array(n).keys()]);
  }
  $("dgPages").addEventListener("change", changed); $("dgCustom").addEventListener("input", changed);

  async function pick(list) {
    const fs = [...(list || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!fs.length) { status("Không có file PDF nào.", true); return; }
    fs.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
    st.files = []; for (const f of fs) st.files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    if (st.prevTask) { st.prevTask.destroy(); st.prevTask = null; st.prevPdf = null; }
    $("dgFileName").innerHTML = (fs.length === 1 ? esc(fs[0].name) : `${fs.length} file PDF`) + ` <span class="sz">· ${D.fmtMB(fs.reduce((a, f) => a + f.size, 0))}</span>`;
    status("Chỉnh dấu ở bên trái, xem trước ở bên phải, rồi bấm \"Đóng dấu\".");
    changed();
  }
  const drop = $("dgDrop");
  drop.addEventListener("click", () => $("dgInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("dgInput").click(); } });
  $("dgInput").addEventListener("change", (e) => pick(e.target.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));

  $("dgRun").addEventListener("click", async () => {
    if (st.busy || !st.files.length) return;
    if (type() === "image" && !st.img) { status("Hãy chọn ảnh con dấu / chữ ký trước.", true); return; }
    if (type() === "text" && !$("dgText").value.trim()) { status("Hãy nhập nội dung dấu.", true); return; }
    if (!(await D.trialAllow("dong", status))) return;
    lock(true); $("dgBar").style.width = "0%";
    try {
      const outs = [], opa = +$("dgOpa").value / 100, cache = new Map();
      const nFiles = Math.min(st.files.length, D.trialLeft("dong"));
      for (let fi = 0; fi < nFiles; fi++) {
        status(`Đang đóng dấu file ${fi + 1}/${st.files.length}…`);
        const doc = await PDFLib.PDFDocument.load(st.files[fi].bytes, { ignoreEncryption: true, updateMetadata: false });
        const pages = doc.getPages(), n = pages.length, sel = pagesOf(n), start = +$("dgStart").value || 1;
        let k = 0;
        for (let i = 0; i < n; i++) {
          if (!sel.has(i)) continue;
          const no = start + k++;
          const key = type() === "num" ? `n${no}/${n}` : "one";
          let emb = cache.get(key);
          if (!emb) {
            const s = await stampFor(no, n); if (!s) continue;
            emb = { s, img: null }; cache.set(key, emb);
          }
          const im = await doc.embedPng(await pngBytes(emb.s));   // mỗi file nhúng lại (không dùng chung giữa các file)
          const pg = pages[i], { width: pw, height: ph } = pg.getSize(), rot = ((pg.getRotation().angle % 360) + 360) % 360;
          // trang bị xoay: tính theo khổ đang hiển thị rồi đổi toạ độ
          const vw = rot % 180 ? ph : pw, vh = rot % 180 ? pw : ph, g = geom(emb.s, vw, vh);
          if (!rot) pg.drawImage(im, { x: g.x, y: g.y, width: g.w, height: g.h, opacity: opa });
          else {
            const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
            const [ux, uy] = rot === 90 ? [cy, pw - cx] : rot === 180 ? [pw - cx, ph - cy] : [ph - cy, cx];
            const ang = PDFLib.degrees(rot), r = (rot * Math.PI) / 180;
            pg.drawImage(im, { x: ux - (g.w / 2) * Math.cos(r) + (g.h / 2) * Math.sin(r), y: uy - (g.w / 2) * Math.sin(r) - (g.h / 2) * Math.cos(r), width: g.w, height: g.h, rotate: ang, opacity: opa });
          }
        }
        outs.push({ name: st.files[fi].name.replace(/\.pdf$/i, "") + "_dongdau.pdf", bytes: await doc.save() });
        $("dgBar").style.width = Math.round(((fi + 1) / st.files.length) * 100) + "%";
        if (type() !== "num") cache.clear();
      }
      if (outs.length === 1) { st.out = outs[0].bytes; st.outName = outs[0].name; st.outType = "application/pdf"; }
      else {
        const zip = new JSZip(); outs.forEach((o) => zip.file(o.name, o.bytes, { binary: true }));
        st.out = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); st.outName = "DongDau_" + outs.length + "file.zip"; st.outType = "application/zip";
        st.first = outs[0];
      }
      D.trialUse("dong", outs.length);
      const skip = st.files.length - outs.length;
      status(`Xong: đã đóng dấu ${outs.length} file. Bấm "Xem kết quả" hoặc "Tải về".` + (skip ? ` Bản dùng thử chỉ đủ lượt cho ${outs.length} file, ${skip} file còn lại chưa đóng dấu – kích hoạt bản quyền để làm hết.` : ""), skip > 0);
    } catch (e) { console.error(e); status("Lỗi khi đóng dấu: " + (e.message || e), true); }
    lock(false);
  });
  const save = () => st.out && D.offerSave(st.outName, new Blob([st.out], { type: st.outType }));
  $("dgSave").addEventListener("click", save);
  $("dgView").addEventListener("click", () => {
    if (!st.out) return;
    if (st.outType === "application/pdf") D.openViewer(st.out, st.outName, save);
    else D.openViewer(st.first.bytes, st.first.name + " (file đầu tiên)", save);
  });
}
