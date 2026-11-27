/* =====================================================================
   Trộn thư: mẫu PDF/ảnh + danh sách Excel/CSV -> mỗi dòng 1 file PDF (giấy mời, chứng nhận, thông báo…)
   Người dùng kéo thả các trường lên mẫu. Chữ được vẽ thành ảnh nên hiển thị đúng tiếng Việt với mọi font.
   ===================================================================== */
const HTML = `
<section class="panel" aria-label="Trộn thư">
  <div class="twodrop">
    <div class="drop" id="trDropTpl" tabindex="0" role="button"><strong>1. File mẫu (PDF hoặc ảnh)</strong><small>Giấy mời, giấy chứng nhận, thông báo… để trống chỗ cần điền.</small><span class="file" id="trTplName"></span><input type="file" id="trTpl" accept="application/pdf,.pdf,image/png,image/jpeg" hidden></div>
    <div class="drop" id="trDropData" tabindex="0" role="button"><strong>2. Danh sách (Excel hoặc CSV)</strong><small>Dòng đầu là tên cột, mỗi dòng sau là một người.</small><span class="file" id="trDataName"></span><input type="file" id="trData" accept=".xlsx,.csv,.txt" hidden></div>
  </div>
  <div id="trWork" hidden style="display:grid;gap:14px">
    <div class="namebox" style="gap:10px">
      <div class="namehead"><strong>3. Bấm tên cột để đặt lên mẫu, rồi kéo đến đúng chỗ</strong><small>Kéo mép phải của ô để chỉnh độ rộng. Chữ dài quá ô sẽ tự thu nhỏ.</small></div>
      <div class="chips" id="trCols"></div>
      <div class="trprops" id="trProps" hidden>
        <b id="trSelName"></b>
        <label>Cỡ <input type="number" id="trSize" min="5" max="120" step="1"></label>
        <select id="trFont" aria-label="Kiểu chữ"><option value="sans">Không chân</option><option value="serif">Có chân</option><option value="script">Viết tay</option></select>
        <button class="btn sm" type="button" id="trBold" aria-pressed="false"><b>B</b></button>
        <button class="btn sm" type="button" id="trItal" aria-pressed="false"><i>I</i></button>
        <span class="seg mini" role="radiogroup" aria-label="Căn chữ">
          <label><input type="radio" name="trAlign" value="left"><span>Trái</span></label><label><input type="radio" name="trAlign" value="center"><span>Giữa</span></label><label><input type="radio" name="trAlign" value="right"><span>Phải</span></label></span>
        <input type="color" id="trColor" aria-label="Màu chữ">
        <select id="trCase" aria-label="Kiểu hoa thường"><option value="">Giữ nguyên</option><option value="upper">IN HOA</option></select>
        <button class="btn sm" type="button" id="trDel">Xóa trường</button>
      </div>
    </div>
    <div class="target"><button class="btn sm" type="button" id="trPrev">‹</button><span class="note" id="trRowInfo"></span><button class="btn sm" type="button" id="trNext">›</button></div>
    <div class="trscroll"><div class="trstage" id="trStage"><canvas id="trCanvas"></canvas><div class="trlayer" id="trLayer"></div></div></div>
    <div class="namebox" style="gap:10px">
      <div class="lblgrid"><label for="trName">Tên file</label><input type="text" id="trName" spellcheck="false"></div>
      <p class="note" id="trNameHint"></p>
      <div class="optrow"><label><input type="radio" name="trOut" value="zip" checked> Mỗi người 1 file PDF (tải ZIP)</label><label><input type="radio" name="trOut" value="one"> Gộp tất cả vào 1 file để in</label></div>
    </div>
  </div>
  <div class="actions">
    <button class="btn primary" id="trRun" type="button" disabled>Tạo file</button>
    <button class="btn" id="trView" type="button" disabled>Xem kết quả</button>
    <button class="btn" id="trSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="trBar"></div></div>
  <div class="status" id="trStatus" role="status">Chọn file mẫu và danh sách.</div>
</section>`;

const CSS = `
.trscroll { overflow: auto; max-height: 80vh; border-radius: 8px; }
.trstage { position: relative; margin: 0 auto; border: 1px solid var(--line); background: #fff; user-select: none; -webkit-user-select: none; }
.trstage canvas { display: block; width: 100%; height: auto; }
.trlayer { position: absolute; inset: 0; }
.trf { position: absolute; border: 1px dashed rgba(30,99,214,.75); background: rgba(30,99,214,.06); cursor: move; touch-action: none; white-space: nowrap; overflow: visible; line-height: 1; padding: 0; }
.trf.sel { border: 1.5px solid #1e63d6; background: rgba(30,99,214,.10); z-index: 2; }
.trf .h { position: absolute; right: -7px; top: 50%; width: 12px; height: 22px; margin-top: -11px; border-radius: 4px; background: #1e63d6; cursor: ew-resize; touch-action: none; }
.trf .tg { position: absolute; left: -1px; top: -18px; font: 600 10px var(--font-body); color: #fff; background: #1e63d6; padding: 1px 5px; border-radius: 3px 3px 0 0; white-space: nowrap; }
.trf:not(.sel) .tg, .trf:not(.sel) .h { display: none; }
.trprops { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--sheet); }
.trprops label { display: inline-flex; gap: 4px; align-items: center; font-size: 13px; }
.trprops input[type=number] { width: 62px; } .trprops input[type=color] { width: 36px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
.trprops button[aria-pressed="true"] { background: var(--ink); color: var(--sheet); }
.seg.mini { display: inline-grid; padding: 2px; } .seg.mini span { padding: 4px 8px; font-size: 12px; }
.chip.used { border-color: #1e63d6; color: #1e63d6; }
`;

const FONTS = { sans: "'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif", serif: "'Times New Roman', 'Noto Serif', Georgia, serif", script: "'Segoe Script', 'Brush Script MT', 'Dancing Script', cursive" };
const fontCss = (f, px) => `${f.italic ? "italic " : ""}${f.bold ? "700" : "400"} ${px}px ${FONTS[f.font] || FONTS.sans}`;

/* ---------- đọc Excel (.xlsx) không cần thư viện ngoài ---------- */
const xdoc = (t) => new DOMParser().parseFromString(t, "application/xml");
const byTag = (el, n) => [...el.getElementsByTagNameNS("*", n)];
function colIndex(ref) { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
function serialToDate(v) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; }
export async function readXlsx(buf) {
  const z = await JSZip.loadAsync(buf);
  const wb = xdoc(await z.file("xl/workbook.xml").async("string"));
  const first = byTag(wb, "sheet")[0], rid = first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  let path = "xl/worksheets/sheet1.xml";
  const relF = z.file("xl/_rels/workbook.xml.rels");
  if (relF) { const rel = byTag(xdoc(await relF.async("string")), "Relationship").find((r) => r.getAttribute("Id") === rid); if (rel) { const t = rel.getAttribute("Target"); path = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); } }
  const ss = z.file("xl/sharedStrings.xml") ? byTag(xdoc(await z.file("xl/sharedStrings.xml").async("string")), "si").map((si) => byTag(si, "t").map((t) => t.textContent).join("")) : [];
  // ô ngày tháng: dựa vào định dạng số của style
  const dateStyle = new Set();
  if (z.file("xl/styles.xml")) {
    const sd = xdoc(await z.file("xl/styles.xml").async("string")), custom = {};
    byTag(sd, "numFmt").forEach((n) => { custom[n.getAttribute("numFmtId")] = n.getAttribute("formatCode") || ""; });
    const xfs = byTag(sd, "cellXfs")[0]; if (xfs) [...xfs.children].forEach((xf, i) => {
      const id = +xf.getAttribute("numFmtId"), code = custom[id] || "";
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (/[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/0\.0|#/.test(code))) dateStyle.add(i);
    });
  }
  const sh = xdoc(await z.file(path).async("string")), rows = [];
  for (const r of byTag(sh, "row")) {
    const ri = +r.getAttribute("r") - 1, row = [];
    for (const c of byTag(r, "c")) {
      const t = c.getAttribute("t"), v = byTag(c, "v")[0], s = +c.getAttribute("s") || 0;
      let val = "";
      if (t === "s") val = ss[+v?.textContent] ?? "";
      else if (t === "inlineStr") val = byTag(c, "t").map((x) => x.textContent).join("");
      else if (t === "b") val = v?.textContent === "1" ? "TRUE" : "FALSE";
      else if (v) { const n = Number(v.textContent); val = t !== "str" && dateStyle.has(s) && Number.isFinite(n) ? serialToDate(n) : Number.isFinite(n) && t !== "str" ? String(Math.round(n * 1e6) / 1e6) : v.textContent; }
      row[colIndex(c.getAttribute("r") || "A")] = val;
    }
    rows[ri] = row;
  }
  return rows.filter(Boolean).map((r) => [...r].map((x) => (x == null ? "" : String(x))));
}
export function readCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "", sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : first.includes("\t") ? "\t" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/* bố cục có sẵn cho file mẫu đi kèm app */
const PRESET = {
  "GiayChungNhan_mau.pdf": [
    { col: "Họ và tên", x: 0.15, y: 0.37, w: 0.7, size: 30, font: "script", bold: false, align: "center", color: "#8b1a1a" },
    { col: "Đơn vị", x: 0.22, y: 0.49, w: 0.56, size: 15, font: "serif", align: "center", color: "#222222" },
    { col: "Khóa học", x: 0.18, y: 0.59, w: 0.64, size: 17, font: "serif", bold: true, align: "center", color: "#1e3a8a", tcase: "upper" },
    { col: "Ngày cấp", x: 0.55, y: 0.70, w: 0.36, size: 12, font: "serif", italic: true, align: "center", color: "#333333" },
    { col: "Số", x: 0.105, y: 0.858, w: 0.3, size: 10, font: "sans", align: "left", color: "#555555" },
  ],
};

export function initTron(D) {
  const { $, esc } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewTron").innerHTML = HTML;
  const st = { tpl: null, head: [], rows: [], fields: [], sel: -1, cur: 0, out: null, busy: false, pw: 595, ph: 842, bg: null };
  // tpl: {name, kind:'pdf'|'img', bytes, type}
  const status = (t, err) => { $("trStatus").textContent = t; $("trStatus").className = "status" + (err ? " err" : ""); };
  const lock = (on) => { st.busy = on; $("trRun").disabled = on || !ready(); $("trView").disabled = $("trSave").disabled = on || !st.out; };
  const ready = () => st.tpl && st.rows.length && st.fields.length;
  const changed = () => { st.out = null; lock(false); };

  function bindDrop(dropId, inputId, fn) {
    const drop = $(dropId), inp = $(inputId);
    drop.addEventListener("click", () => inp.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    inp.addEventListener("change", (e) => fn(e.target.files[0]));
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => fn(e.dataTransfer.files[0]));
  }
  bindDrop("trDropTpl", "trTpl", async (f) => {
    if (!f) return;
    const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
    if (!isPdf && !/^image\/(png|jpe?g)/.test(f.type)) { status("File mẫu phải là PDF, PNG hoặc JPG.", true); return; }
    st.tpl = { name: f.name, kind: isPdf ? "pdf" : "img", bytes: new Uint8Array(await f.arrayBuffer()), type: f.type };
    $("trTplName").innerHTML = `${esc(f.name)} <span class="sz">· ${D.fmtMB(f.size)}</span>`;
    try { await loadBg(); } catch (e) { console.error(e); status("Không đọc được file mẫu.", true); st.tpl = null; return; }
    applyPreset(); await showWork();
  });
  bindDrop("trDropData", "trData", async (f) => {
    if (!f) return;
    try {
      const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : readCsv(await f.text());
      if (rows.length < 2) { status("Danh sách cần ít nhất 1 dòng tên cột và 1 dòng dữ liệu.", true); return; }
      const w = Math.max(...rows.map((r) => r.length));
      st.head = [...Array(w).keys()].map((i) => (rows[0][i] || "").trim() || `Cột ${i + 1}`);
      st.rows = rows.slice(1).filter((r) => r.some((x) => String(x).trim()));
      st.cur = 0;
      $("trDataName").innerHTML = `${esc(f.name)} <span class="sz">· ${st.rows.length} dòng · ${st.head.length} cột</span>`;
      if (!$("trName").value || !st.head.some((h) => $("trName").value.includes(`{${h}}`))) $("trName").value = `{${st.head[0]}}`;
      st.fields = st.fields.filter((fl) => st.head.includes(fl.col));
      applyPreset(); await showWork();
    } catch (e) { console.error(e); status("Không đọc được danh sách. Hãy lưu Excel dạng .xlsx hoặc CSV.", true); }
  });
  function applyPreset() {
    const pre = st.tpl && PRESET[st.tpl.name];
    if (!pre || st.fields.length || !st.head.length) return;
    st.fields = pre.filter((p) => st.head.includes(p.col)).map((p) => ({ italic: false, bold: false, tcase: "", ...p }));
    if (st.head.includes("Họ và tên")) $("trName").value = "{Số}_{Họ và tên}".replace("{Số}_", st.head.includes("Số") ? "{Số}_" : "");
  }

  async function loadBg() {
    if (st.tpl.kind === "pdf") {
      if (st.bgTask) st.bgTask.destroy(); st.bgTask = D.pdfjsLib.getDocument({ data: st.tpl.bytes.slice() }); const pdf = await st.bgTask.promise, page = await pdf.getPage(1), v = page.getViewport({ scale: 1 });
      st.pw = v.width; st.ph = v.height; st.bgPage = page; st.bgPdf = pdf; st.bgImg = null;
    } else {
      const bmp = await createImageBitmap(new Blob([st.tpl.bytes], { type: st.tpl.type }));
      const land = bmp.width > bmp.height; st.pw = land ? 841.89 : 595.28; st.ph = land ? 595.28 : 841.89; st.bgImg = bmp; st.bgPage = null;
    }
  }
  async function showWork() {
    if (!st.tpl || !st.rows.length) {
      status(!st.tpl ? "Chọn tiếp file mẫu (PDF hoặc ảnh)." : "Chọn tiếp file danh sách (Excel hoặc CSV).");
      return;
    }
    $("trWork").hidden = false;
    $("trCols").innerHTML = st.head.map((h) => `<button class="chip${st.fields.some((f) => f.col === h) ? " used" : ""}" type="button" data-c="${esc(h)}">+ ${esc(h)}</button>`).join("");
    $("trNameHint").textContent = `Dùng {Tên cột} để lấy dữ liệu. Các cột: ${st.head.map((h) => `{${h}}`).join(" ")}`;
    await drawBg(); renderFields(); changed();
    status(st.fields.length ? `Đã sẵn sàng ${st.rows.length} người. Xem lại vị trí chữ, rồi bấm "Tạo file".` : "Bấm vào tên cột để đặt lên mẫu.");
  }
  let pxPerPt = 1;
  async function drawBg() {
    const stage = $("trStage"), c = $("trCanvas");
    const W = Math.min(stage.parentElement.clientWidth - 2, 900);
    stage.style.width = W + "px"; pxPerPt = W / st.pw;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round((W * st.ph / st.pw) * dpr);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    if (st.bgPage) await st.bgPage.render({ canvasContext: x, viewport: st.bgPage.getViewport({ scale: (W * dpr) / st.pw }) }).promise;
    else if (st.bgImg) { const k = Math.min(c.width / st.bgImg.width, c.height / st.bgImg.height); x.drawImage(st.bgImg, (c.width - st.bgImg.width * k) / 2, (c.height - st.bgImg.height * k) / 2, st.bgImg.width * k, st.bgImg.height * k); }
  }
  const valueOf = (f, row) => { let v = String(row[st.head.indexOf(f.col)] ?? "").trim(); return f.tcase === "upper" ? v.toLocaleUpperCase("vi") : v; };
  const mctx = document.createElement("canvas").getContext("2d");
  /* cỡ chữ thực tế (pt) để vừa ô */
  function fitSize(f, text, boxPt) { mctx.font = fontCss(f, 100); const w = mctx.measureText(text).width / 100; return w * f.size > boxPt ? Math.max(4, boxPt / w) : f.size; }
  function renderFields() {
    const row = st.rows[st.cur] || [];
    $("trRowInfo").textContent = `Xem trước dòng ${st.cur + 1}/${st.rows.length}`;
    $("trLayer").innerHTML = st.fields.map((f, i) => {
      const text = valueOf(f, row) || `{${f.col}}`, size = fitSize(f, text, f.w * st.pw);
      return `<div class="trf${i === st.sel ? " sel" : ""}" data-i="${i}" style="left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.size * 1.3 * pxPerPt}px;font:${fontCss(f, size * pxPerPt)};color:${f.color};text-align:${f.align};line-height:${f.size * 1.3 * pxPerPt}px"><span class="tg">${esc(f.col)}</span>${esc(text)}<span class="h" data-h="1"></span></div>`;
    }).join("");
    const f = st.fields[st.sel];
    $("trProps").hidden = !f;
    if (f) {
      $("trSelName").textContent = f.col; $("trSize").value = f.size; $("trFont").value = f.font; $("trColor").value = f.color; $("trCase").value = f.tcase || "";
      $("trBold").setAttribute("aria-pressed", String(!!f.bold)); $("trItal").setAttribute("aria-pressed", String(!!f.italic));
      document.querySelectorAll('input[name="trAlign"]').forEach((r) => (r.checked = r.value === f.align));
    }
    $("trCols").querySelectorAll(".chip").forEach((c) => c.classList.toggle("used", st.fields.some((x) => x.col === c.dataset.c)));
  }
  $("trCols").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const n = st.fields.length;
    st.fields.push({ col: b.dataset.c, x: 0.25, y: Math.min(0.85, 0.3 + n * 0.08), w: 0.5, size: 16, font: "sans", bold: false, italic: false, align: "center", color: "#111111", tcase: "" });
    st.sel = st.fields.length - 1; renderFields(); changed();
  });
  const upd = (fn) => { const f = st.fields[st.sel]; if (!f) return; fn(f); renderFields(); changed(); };
  $("trSize").addEventListener("input", () => upd((f) => (f.size = Math.max(4, +$("trSize").value || 12))));
  $("trFont").addEventListener("change", () => upd((f) => (f.font = $("trFont").value)));
  $("trColor").addEventListener("input", () => upd((f) => (f.color = $("trColor").value)));
  $("trCase").addEventListener("change", () => upd((f) => (f.tcase = $("trCase").value)));
  $("trBold").addEventListener("click", () => upd((f) => (f.bold = !f.bold)));
  $("trItal").addEventListener("click", () => upd((f) => (f.italic = !f.italic)));
  document.querySelectorAll('input[name="trAlign"]').forEach((r) => r.addEventListener("change", () => upd((f) => (f.align = r.value))));
  $("trDel").addEventListener("click", () => { if (st.sel < 0) return; st.fields.splice(st.sel, 1); st.sel = -1; renderFields(); changed(); });
  $("trPrev").addEventListener("click", () => { if (st.cur > 0) { st.cur--; renderFields(); } });
  $("trNext").addEventListener("click", () => { if (st.cur < st.rows.length - 1) { st.cur++; renderFields(); } });
  window.addEventListener("resize", () => { if (!$("trWork").hidden && st.tpl) drawBg().then(renderFields); });

  // kéo để di chuyển / đổi độ rộng
  let drag = null;
  const layer = $("trLayer");
  layer.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".trf");
    if (!el) { if (st.sel >= 0) { st.sel = -1; renderFields(); } return; }
    const i = +el.dataset.i, f = st.fields[i], r = layer.getBoundingClientRect();
    if (st.sel !== i) { st.sel = i; renderFields(); }
    e.preventDefault(); layer.setPointerCapture(e.pointerId);
    drag = { i, resize: !!e.target.dataset.h, sx: e.clientX, sy: e.clientY, x: f.x, y: f.y, w: f.w, W: r.width, H: r.height };
  });
  layer.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const f = st.fields[drag.i], dx = (e.clientX - drag.sx) / drag.W, dy = (e.clientY - drag.sy) / drag.H;
    if (drag.resize) f.w = Math.min(1 - f.x, Math.max(0.05, drag.w + dx));
    else { f.x = Math.min(1 - f.w, Math.max(0, drag.x + dx)); f.y = Math.min(0.98, Math.max(0, drag.y + dy)); }
    const el = layer.querySelector(`.trf[data-i="${drag.i}"]`);
    if (el) { el.style.left = f.x * 100 + "%"; el.style.top = f.y * 100 + "%"; el.style.width = f.w * 100 + "%"; }
  });
  const end = () => { if (drag) { drag = null; renderFields(); changed(); } };
  layer.addEventListener("pointerup", end); layer.addEventListener("pointercancel", end);
  document.addEventListener("keydown", (e) => {
    if ($("viewTron").hidden || st.sel < 0 || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const f = st.fields[st.sel], k = e.shiftKey ? 0.01 : 0.002;
    const mv = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, -k], ArrowDown: [0, k] }[e.key];
    if (mv) { e.preventDefault(); f.x = Math.max(0, f.x + mv[0]); f.y = Math.max(0, f.y + mv[1]); renderFields(); changed(); }
    if (e.key === "Delete") { st.fields.splice(st.sel, 1); st.sel = -1; renderFields(); changed(); }
  });

  /* ---------- tạo file ---------- */
  const scale = 4;   // độ nét chữ: 4 điểm ảnh / 1 pt
  async function textPng(f, text, boxPt) {
    const size = fitSize(f, text, boxPt), c = document.createElement("canvas");
    c.width = Math.ceil(boxPt * scale); c.height = Math.ceil(f.size * 1.3 * scale);
    const x = c.getContext("2d"); x.font = fontCss(f, size * scale); x.fillStyle = f.color; x.textBaseline = "middle"; x.textAlign = f.align;
    x.fillText(text, f.align === "left" ? 0 : f.align === "right" ? c.width : c.width / 2, c.height / 2 + size * scale * 0.04);
    return new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/png"));
  }
  function fileName(row, i) {
    let s = $("trName").value.replace(/\{([^}]+)\}/g, (_, k) => String(row[st.head.indexOf(k.trim())] ?? "").trim());
    s = s.replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().replace(/^[_\-. ]+|[_\-. ]+$/g, "");
    return (s || `File_${String(i + 1).padStart(3, "0")}`).slice(0, 150);
  }
  $("trRun").addEventListener("click", async () => {
    if (st.busy || !ready()) return;
    if (!(await D.trialAllow("tron", status))) return;
    const n = Math.min(st.rows.length, D.trialLeft("tron"));
    lock(true); $("trBar").style.width = "0%";
    try {
      const one = document.querySelector('input[name="trOut"]:checked').value === "one";
      const src = st.tpl.kind === "pdf" ? await PDFLib.PDFDocument.load(st.tpl.bytes, { ignoreEncryption: true, updateMetadata: false }) : null;
      const big = one ? await PDFLib.PDFDocument.create() : null, outs = [], used = new Map(); let bigIm = null;
      for (let i = 0; i < n; i++) {
        const row = st.rows[i], doc = big || (await PDFLib.PDFDocument.create());
        let page;
        if (src) { const [cp] = await doc.copyPages(src, [0]); page = doc.addPage(cp); }
        else {
          page = doc.addPage([st.pw, st.ph]);
          const im = (big && bigIm) || (/png/i.test(st.tpl.type) ? await doc.embedPng(st.tpl.bytes) : await doc.embedJpg(st.tpl.bytes)); if (big) bigIm = im;
          const k = Math.min(st.pw / im.width, st.ph / im.height); page.drawImage(im, { x: (st.pw - im.width * k) / 2, y: (st.ph - im.height * k) / 2, width: im.width * k, height: im.height * k });
        }
        const { width: PW, height: PH } = page.getSize(), sx = PW / st.pw, sy = PH / st.ph;
        for (const f of st.fields) {
          const text = valueOf(f, row); if (!text) continue;
          const boxW = f.w * st.pw, img = await doc.embedPng(await textPng(f, text, boxW));
          const h = f.size * 1.3;
          page.drawImage(img, { x: f.x * st.pw * sx, y: PH - (f.y * st.ph + h) * sy, width: boxW * sx, height: h * sy });
        }
        if (!big) {
          let name = fileName(row, i); const k = name.toLowerCase(), c = (used.get(k) || 0) + 1; used.set(k, c); if (c > 1) name += ` (${c})`;
          outs.push({ name: name + ".pdf", bytes: await doc.save() });
        }
        if (i % 5 === 0) { $("trBar").style.width = Math.round(((i + 1) / n) * 100) + "%"; status(`Đang tạo ${i + 1}/${n}…`); await new Promise((r) => setTimeout(r)); }
      }
      if (big) { st.out = await big.save(); st.outName = `TronThu_${n}trang.pdf`; st.outType = "application/pdf"; st.first = { name: st.outName, bytes: st.out }; }
      else if (outs.length === 1) { st.out = outs[0].bytes; st.outName = outs[0].name; st.outType = "application/pdf"; st.first = outs[0]; }
      else {
        const zip = new JSZip(); outs.forEach((o) => zip.file(o.name, o.bytes, { binary: true }));
        st.out = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); st.outName = `TronThu_${outs.length}file.zip`; st.outType = "application/zip"; st.first = outs[0];
      }
      $("trBar").style.width = "100%";
      D.trialUse("tron", n);
      const skip = st.rows.length - n;
      status(`Xong: ${one ? `1 file ${n} trang` : `${n} file`}. Bấm "Xem kết quả" hoặc "Tải về".` + (skip ? ` Bản dùng thử chỉ đủ lượt cho ${n} người, ${skip} người còn lại chưa tạo – kích hoạt bản quyền để làm hết.` : ""), skip > 0);
    } catch (e) { console.error(e); status("Lỗi khi tạo file: " + (e.message || e), true); }
    lock(false);
  });
  const save = () => st.out && D.offerSave(st.outName, new Blob([st.out], { type: st.outType }));
  $("trSave").addEventListener("click", save);
  $("trView").addEventListener("click", () => st.first && D.openViewer(st.first.bytes, st.first.name + (st.outType === "application/zip" ? " (file đầu tiên)" : ""), save));
  $("trName").addEventListener("input", changed);
}
