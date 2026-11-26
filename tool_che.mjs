/* =====================================================================
   Che thông tin nhạy cảm (xóa thật).
   - Tự tìm: CCCD/CMND, số điện thoại, số tài khoản, email, MST, ngày sinh, từ khóa riêng.
   - Trang scan: dùng OCR có tọa độ từng chữ.
   - Người dùng xem lại, bỏ chọn, hoặc kéo chuột để che thêm.
   - Trang có vùng che được vẽ lại thành ảnh, nên chữ bên dưới bị xóa hẳn khỏi file.
   ===================================================================== */

const TYPES = [
  { k: "cccd", label: "Số CCCD / CMND", on: true },
  { k: "sdt", label: "Số điện thoại", on: true },
  { k: "stk", label: "Số tài khoản ngân hàng", on: true },
  { k: "email", label: "Email", on: true },
  { k: "mst", label: "Mã số thuế", on: false },
  { k: "ngaysinh", label: "Ngày sinh", on: false },
];

const HTML = `
<section class="panel" aria-label="Che thông tin">
  <div class="drop" id="chDrop" tabindex="0" role="button" aria-describedby="chHint">
    <strong>Kéo thả file PDF cần che thông tin vào đây hoặc bấm để chọn</strong>
    <small id="chHint">Hồ sơ nhân sự, hợp đồng, sao kê… Đọc được cả file scan (OCR).</small>
    <span class="file" id="chFileName"></span>
    <input type="file" id="chInput" accept="application/pdf,.pdf" hidden>
  </div>
  <div class="namebox">
    <div class="namehead"><strong>Tìm và che</strong><small>Tick loại thông tin cần che. Có thể thêm tên người, tên công ty… vào ô từ khóa.</small></div>
    <div class="optrow" id="chTypes"></div>
    <div class="lblgrid"><label for="chWords">Từ khóa che thêm</label><input type="text" id="chWords" placeholder="VD: Nguyễn Văn An, Công ty ABC (cách nhau bằng dấu phẩy)" spellcheck="false"></div>
  </div>
  <div class="actions">
    <button class="btn primary" id="chFind" type="button" disabled>Tìm thông tin</button>
    <button class="btn" id="chApply" type="button" disabled>Che và tạo file</button>
    <button class="btn" id="chView" type="button" disabled>Xem file đã che</button>
    <button class="btn" id="chSave" type="button" disabled>Tải file đã che</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="chBar"></div></div>
  <div class="status" id="chStatus" role="status">Chưa chọn file.</div>
</section>
<section class="panel" id="chReview" aria-label="Xem lại vùng che" hidden>
  <div class="summary" id="chSummary"></div>
  <p class="note">Ô viền đỏ là vùng sẽ bị che. <b>Chạm vào ô</b> để bỏ hoặc chọn lại. Muốn che thêm (ảnh chân dung, chữ ký…), bấm <b>✏️ Vẽ vùng che</b> rồi kéo trên trang; bấm lại nút đó để quay về chế độ xem, cuộn, phóng to.</p>
  <div class="target">
    <button class="btn" id="chPrev" type="button" aria-label="Trang trước">‹ Trang trước</button>
    <span id="chPageInfo" class="note"></span>
    <button class="btn" id="chNext" type="button" aria-label="Trang sau">Trang sau ›</button>
    <button class="btn" id="chClearPage" type="button">Bỏ hết vùng che trang này</button>
  </div>
  <div class="chtools">
    <button class="btn" id="chMode" type="button" aria-pressed="false">✏️ Vẽ vùng che</button>
    <span class="chzoom"><button class="btn" id="chZoomOut" type="button" aria-label="Thu nhỏ">−</button><span id="chZoomLbl">100%</span><button class="btn" id="chZoomIn" type="button" aria-label="Phóng to">+</button></span>
  </div>
  <div class="chscroll" id="chScroll"><div class="chstage view" id="chStage"><canvas id="chCanvas"></canvas><div class="chlayer" id="chLayer"></div></div></div>
  <div class="tablewrap"><table><thead><tr><th>Che</th><th>Trang</th><th>Loại</th><th>Nội dung tìm thấy</th></tr></thead><tbody id="chList"></tbody></table></div>
</section>`;

const CSS = `
.chscroll { overflow: auto; max-height: 78vh; border-radius: 6px; -webkit-overflow-scrolling: touch; }
.chstage { position: relative; margin: 0 auto; border: 1px solid var(--line); background: #fff; touch-action: none; user-select: none; -webkit-user-select: none; }
.chstage.view { touch-action: manipulation; }
.chstage.view .chlayer { cursor: default; }
.chtools { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.chzoom { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.chzoom .btn { min-width: 40px; padding-left: 0; padding-right: 0; font-size: 18px; }
#chMode[aria-pressed="true"] { background: var(--stamp); color: #fff; border-color: var(--stamp); }
.chstage canvas { display: block; width: 100%; height: auto; }
.chlayer { position: absolute; inset: 0; cursor: crosshair; }
.chbox { position: absolute; border: 2px solid #e53935; background: rgba(0,0,0,.55); cursor: pointer; }
.chbox.off { background: transparent; border-style: dashed; border-color: #9aa7b6; }
.chbox.draft { background: rgba(229,57,53,.15); }
`;

function rectVP(vp, [ax, ay, bx, by]) {
  const [a, b, c, d, e, f] = vp.transform;
  return [a * ax + c * ay + e, b * ax + d * ay + f, a * bx + c * by + e, b * bx + d * by + f];
}
let mctx = null; const wcache = new Map();
function charW(ch) {
  if (wcache.has(ch)) return wcache.get(ch);
  if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); mctx.font = "100px Arial, Helvetica, sans-serif"; }
  const w = Math.max(20, mctx.measureText(ch).width); wcache.set(ch, w); return w;
}
function mask(s) { s = String(s); return s.length <= 4 ? "••••" : s.slice(0, 2) + "•".repeat(Math.max(2, s.length - 4)) + s.slice(-2); }

export function initChe(D) {
  const { $, esc, fold } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewChe").innerHTML = HTML;
  $("chTypes").innerHTML = TYPES.map((t) => `<label><input type="checkbox" data-k="${t.k}" ${t.on ? "checked" : ""}> ${esc(t.label)}</label>`).join("");
  const st = { file: null, bytes: null, pages: [], boxes: [], cur: 0, out: null, busy: false };
  // boxes: { page, x, y, w, h (0..1 theo trang), type, text, on }

  const status = (t, err) => { $("chStatus").textContent = t; $("chStatus").className = "status" + (err ? " err" : ""); };
  const bar = (f) => ($("chBar").style.width = Math.round(f * 100) + "%");
  const lock = (on) => {
    st.busy = on;
    $("chFind").disabled = on || !st.bytes;
    $("chApply").disabled = on || !st.pages.length;
    $("chView").disabled = $("chSave").disabled = on || !st.out;
  };

  async function pick(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { status("File không phải PDF. Hãy chọn file .pdf.", true); return; }
    st.file = f; st.bytes = new Uint8Array(await f.arrayBuffer()); st.pages = []; st.boxes = []; st.out = null;
    $("chFileName").innerHTML = `${esc(f.name)} <span class="sz">· ${D.fmtMB(f.size)}</span>`;
    $("chReview").hidden = true; bar(0);
    status("Đã chọn file. Tick loại thông tin cần che rồi bấm \"Tìm thông tin\".");
    lock(false);
  }
  const drop = $("chDrop");
  drop.addEventListener("click", () => $("chInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("chInput").click(); } });
  $("chInput").addEventListener("change", (e) => pick(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));

  /* ---------- quy tắc tìm ---------- */
  function rules() {
    const on = {}; document.querySelectorAll("#chTypes input").forEach((i) => (on[i.dataset.k] = i.checked));
    const R = [];
    // nhóm 1 của regex là phần cần che (nếu không có nhóm thì che cả kết quả); chạy trên chữ đã bỏ dấu, chữ thường
    if (on.cccd) {
      R.push({ type: "CCCD/CMND", re: /(?:cccd|cmnd|can cuoc(?: cong dan)?|so dinh danh|chung minh nhan dan|ho chieu)[^\d\n]{0,25}((?:\d[ .]?){8,11}\d)/g });
      R.push({ type: "CCCD", re: /(?<![\d-])(\d{3}[ .]?\d{3}[ .]?\d{6}|\d{12})(?![\d-])/g });
    }
    if (on.sdt) R.push({ type: "Số điện thoại", re: /(?<![\d-])((?:\+84[ .-]?|\(\+84\)[ .-]?|0)\d{2,3}(?:[ .-]?\d){6,7})(?![\d-])/g, skipAfter: /(?:ma so thue|mst|so tai khoan|stk|tai khoan|cccd|cmnd|can cuoc|dinh danh|so hd|so hoa don)[^\n]{0,6}$/ });
    if (on.stk) R.push({ type: "Số tài khoản", re: /(?:so tai khoan|tai khoan so|so tk|stk|tk ngan hang|account(?: no)?)[^\d\n]{0,12}((?:\d[ .-]?){5,19}\d)/g });
    if (on.email) R.push({ type: "Email", re: /([a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/g });
    if (on.mst) R.push({ type: "Mã số thuế", re: /(?:ma so thue|mst)[^\d\n]{0,16}(\d{10}(?:-\d{3})?)/g });
    if (on.ngaysinh) R.push({ type: "Ngày sinh", re: /(?:ngay(?:,? thang,? nam)? sinh|sinh ngay)[^\d\n]{0,6}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/g });
    for (const w of $("chWords").value.split(",").map((x) => x.trim()).filter((x) => x.length >= 2)) {
      const f = fold(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      R.push({ type: "Từ khóa", re: new RegExp("(" + f + ")", "g") });
    }
    return R;
  }

  /* line = { text, chars: [{x0,x1,y0,y1}] } toạ độ chuẩn hoá 0..1. Trả về các vùng khớp. */
  function scanLine(line, R, pageIdx, out) {
    const ft = fold(line.text);
    const hits = [];
    for (const r of R) {
      r.re.lastIndex = 0; let m;
      while ((m = r.re.exec(ft))) {
        const g = m[1] !== undefined ? 1 : 0;
        const val = m[g];
        const s = m.index + m[0].length - val.length - (g ? m[0].length - m[0].indexOf(val, m[0].length - val.length - 0) - val.length : 0);
        const start = m.index + m[0].lastIndexOf(val), end = start + val.length;
        if (r.skipAfter && r.skipAfter.test(ft.slice(Math.max(0, start - 40), start))) continue;
        if (hits.some((h) => start < h.end && end > h.start)) continue;   // trùng vùng đã có
        hits.push({ start, end, type: r.type });
        if (m[0].length === 0) r.re.lastIndex++;
      }
    }
    for (const h of hits) {
      const cs = line.chars.slice(h.start, h.end).filter(Boolean);
      if (!cs.length) continue;
      const x0 = Math.min(...cs.map((c) => c.x0)), x1 = Math.max(...cs.map((c) => c.x1));
      const y0 = Math.min(...cs.map((c) => c.y0)), y1 = Math.max(...cs.map((c) => c.y1));
      const px = (x1 - x0) * 0.04 + 0.005, py = (y1 - y0) * 0.18;
      out.push({ page: pageIdx, x: Math.max(0, x0 - px), y: Math.max(0, y0 - py), w: Math.min(1, x1 - x0 + 2 * px), h: (y1 - y0) + 2 * py,
        type: h.type, text: line.text.slice(h.start, h.end).trim(), on: true });
    }
  }

  /* Dòng chữ + toạ độ từng ký tự từ lớp chữ PDF */
  async function textLines(page) {
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const [x1, y1, x2, y2] = rectVP(vp, [it.transform[4], it.transform[5] - Math.abs(it.transform[3]) * 0.22,
        it.transform[4] + it.width, it.transform[5] + Math.abs(it.transform[3]) * 0.9]);
      items.push({ s: it.str, x0: Math.min(x1, x2) / vp.width, x1: Math.max(x1, x2) / vp.width, y0: Math.min(y1, y2) / vp.height, y1: Math.max(y1, y2) / vp.height });
    }
    const lines = [];
    for (const it of items) {
      const cy = (it.y0 + it.y1) / 2, hh = it.y1 - it.y0;
      let ln = lines.find((l) => Math.abs(l.cy - cy) < hh * 0.45);
      if (!ln) { ln = { cy, items: [] }; lines.push(ln); }
      ln.items.push(it);
    }
    return lines.sort((a, b) => a.cy - b.cy).map((l) => {
      l.items.sort((a, b) => a.x0 - b.x0);
      let text = ""; const chars = [];
      l.items.forEach((it, i) => {
        if (i) { text += " "; chars.push(null); }
        // chia bề rộng theo độ rộng thật của từng ký tự (chữ hoa rộng hơn chữ thường)
        const ws = [...it.s].map(charW), tot = ws.reduce((x, y) => x + y, 0) || 1;
        let acc = 0;
        [...it.s].forEach((ch, k) => {
          const a0 = it.x0 + (it.x1 - it.x0) * acc / tot; acc += ws[k];
          text += ch; chars.push({ x0: a0, x1: it.x0 + (it.x1 - it.x0) * acc / tot, y0: it.y0, y1: it.y1 });
        });
      });
      return { text, chars };
    });
  }

  /* Dòng chữ + toạ độ từ OCR (trang scan) */
  async function ocrLines(page) {
    const ws = await D.getOcrWorkers();
    const vp = page.getViewport({ scale: 200 / 72 });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    await ws[0].setParameters({ tessedit_pageseg_mode: "3" });
    const res = await ws[0].recognize(c, {}, { text: true, blocks: true });
    const W = c.width, H = c.height; c.width = c.height = 0;
    const lines = [];
    for (const b of res.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      let text = ""; const chars = [];
      (l.words || []).forEach((w, i) => {
        if (i) { text += " "; chars.push(null); }
        const s = (w.text || "").normalize("NFC"), n = s.length, bb = w.bbox, cw = (bb.x1 - bb.x0) / Math.max(1, n);
        for (let k = 0; k < n; k++) { text += s[k]; chars.push({ x0: (bb.x0 + cw * k) / W, x1: (bb.x0 + cw * (k + 1)) / W, y0: bb.y0 / H, y1: bb.y1 / H }); }
      });
      if (text.trim()) lines.push({ text, chars });
    }
    return lines;
  }

  $("chFind").addEventListener("click", async () => {
    if (!st.bytes || st.busy) return;
    if (!(await D.trialAllow("che", status))) return;
    lock(true); bar(0); st.boxes = []; st.pages = []; st.out = null;
    const R = rules();
    if (!R.length) { status("Hãy tick ít nhất một loại thông tin hoặc nhập từ khóa.", true); lock(false); return; }
    const task = D.pdfjsLib.getDocument({ data: st.bytes.slice() });
    try {
      const pdf = await task.promise;
      let ocrCount = 0;
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        let lines = await textLines(page), ocr = false;
        if (lines.reduce((a, l) => a + l.text.replace(/\s/g, "").length, 0) < 30) {
          status(`Đang OCR trang ${n}/${pdf.numPages} (file scan)…`);
          lines = await ocrLines(page); ocr = true; ocrCount++;
        } else status(`Đang tìm ở trang ${n}/${pdf.numPages}…`);
        st.pages.push({ n, w: vp.width, h: vp.height, ocr });
        for (const l of lines) scanLine(l, R, n - 1, st.boxes);
        page.cleanup(); bar(n / pdf.numPages);
      }
      st.cur = st.boxes.length ? st.boxes[0].page : 0;
      $("chReview").hidden = false;
      await renderReview();
      const pg = new Set(st.boxes.map((b) => b.page)).size;
      status(st.boxes.length
        ? `Tìm thấy ${st.boxes.length} chỗ cần che trên ${pg} trang${ocrCount ? ` (OCR ${ocrCount} trang scan)` : ""}. Xem lại bên dưới, rồi bấm "Che và tạo file".`
        : `Không tìm thấy thông tin nào theo lựa chọn. Bạn vẫn có thể kéo chuột trên trang để che bằng tay, rồi bấm "Che và tạo file".`);
      D.trialUse("che");
    } catch (e) { console.error(e); status("Lỗi khi tìm: " + (e.message || e), true); }
    await task.destroy();
    lock(false);
  });

  /* ---------- xem lại + vẽ thêm vùng che ---------- */
  let previewTask = null, previewPdf = null;
  async function renderReview() {
    if (!previewPdf) { previewTask = D.pdfjsLib.getDocument({ data: st.bytes.slice() }); previewPdf = await previewTask.promise; }
    const n = st.cur + 1, page = await previewPdf.getPage(n);
    const stage = $("chStage");
    const fitW = Math.min($("chScroll").clientWidth - 2, 820), maxW = Math.round(fitW * zoom);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min((maxW / base.width) * Math.min(2, window.devicePixelRatio || 1), 4200 / base.width);
    const vp = page.getViewport({ scale });
    const c = $("chCanvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    stage.style.width = maxW + "px";
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    drawBoxes();
    $("chPageInfo").textContent = `Trang ${n}/${st.pages.length}`;
    $("chPrev").disabled = st.cur <= 0; $("chNext").disabled = st.cur >= st.pages.length - 1;
    renderList();
  }
  function drawBoxes() {
    const layer = $("chLayer");
    layer.innerHTML = st.boxes.map((b, i) => b.page !== st.cur ? "" :
      `<div class="chbox${b.on ? "" : " off"}" data-i="${i}" title="${esc(b.type)}: ${esc(mask(b.text))}" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%"></div>`).join("");
    const on = st.boxes.filter((b) => b.on).length;
    $("chSummary").innerHTML = `<span class="pill">${on} vùng sẽ bị che</span><span class="pill">${new Set(st.boxes.filter((b) => b.on).map((b) => b.page)).size} trang có che</span>` +
      (st.boxes.length - on ? `<span class="pill warn">${st.boxes.length - on} vùng đã bỏ chọn</span>` : "");
  }
  function renderList() {
    $("chList").innerHTML = st.boxes.length ? st.boxes.map((b, i) => `<tr><td><input type="checkbox" data-i="${i}" ${b.on ? "checked" : ""} aria-label="Che vùng ${i + 1}"></td>
      <td class="num"><button class="linkbtn" type="button" data-go="${b.page}">${b.page + 1}</button></td><td>${esc(b.type)}</td><td class="mono">${esc(mask(b.text))}</td></tr>`).join("")
      : `<tr><td colspan="4">Chưa có vùng che nào.</td></tr>`;
  }
  $("chList").addEventListener("change", (e) => { const i = e.target.dataset.i; if (i !== undefined) { st.boxes[+i].on = e.target.checked; drawBoxes(); } });
  $("chList").addEventListener("click", (e) => { const g = e.target.dataset.go; if (g !== undefined) { st.cur = +g; renderReview(); $("chStage").scrollIntoView({ block: "center", behavior: "smooth" }); } });
  $("chPrev").addEventListener("click", () => { if (st.cur > 0) { st.cur--; renderReview(); } });
  $("chNext").addEventListener("click", () => { if (st.cur < st.pages.length - 1) { st.cur++; renderReview(); } });
  $("chClearPage").addEventListener("click", () => { st.boxes.forEach((b) => { if (b.page === st.cur) b.on = false; }); drawBoxes(); renderList(); });

  // Chế độ xem (mặc định): cuộn, phóng to, chạm ô để bật/tắt. Chế độ vẽ: kéo để thêm vùng che.
  let drawMode = false, zoom = 1, drag = null;
  const ZOOMS = [1, 1.5, 2, 3, 4];
  const layer = $("chLayer"), stageEl = $("chStage");
  const setMode = (on) => {
    drawMode = on; stageEl.classList.toggle("view", !on);
    $("chMode").setAttribute("aria-pressed", on ? "true" : "false");
    $("chMode").textContent = on ? "✋ Xong, quay về xem" : "✏️ Vẽ vùng che";
  };
  $("chMode").addEventListener("click", () => setMode(!drawMode));
  const setZoom = async (z) => {
    const sc = $("chScroll"), fx = (sc.scrollLeft + sc.clientWidth / 2) / (sc.scrollWidth || 1), fy = (sc.scrollTop + sc.clientHeight / 2) / (sc.scrollHeight || 1);
    zoom = z; $("chZoomLbl").textContent = Math.round(z * 100) + "%";
    $("chZoomOut").disabled = z <= ZOOMS[0]; $("chZoomIn").disabled = z >= ZOOMS[ZOOMS.length - 1];
    await renderReview();
    sc.scrollLeft = fx * sc.scrollWidth - sc.clientWidth / 2; sc.scrollTop = fy * sc.scrollHeight - sc.clientHeight / 2;
  };
  $("chZoomIn").addEventListener("click", () => { const z = ZOOMS.find((x) => x > zoom); if (z) setZoom(z); });
  $("chZoomOut").addEventListener("click", () => { const z = [...ZOOMS].reverse().find((x) => x < zoom); if (z) setZoom(z); });
  $("chZoomOut").disabled = true;
  const rel = (e) => { const r = layer.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const toggleBox = (box) => { const b = st.boxes[+box.dataset.i]; b.on = !b.on; drawBoxes(); renderList(); };
  // chạm (không kéo) vào ô -> bật/tắt; "click" không phát ra khi người dùng đang cuộn
  layer.addEventListener("click", (e) => { if (drawMode) return; const box = e.target.closest(".chbox"); if (box && !box.classList.contains("draft")) toggleBox(box); });
  const fingers = new Set();
  const cancelDrag = () => { if (drag) { drag.el.remove(); drag = null; } };
  layer.addEventListener("pointerdown", (e) => {
    fingers.add(e.pointerId);
    if (!drawMode) return;
    if (fingers.size > 1) { cancelDrag(); return; }          // 2 ngón: không vẽ
    layer.setPointerCapture(e.pointerId);
    drag = { a: rel(e), el: document.createElement("div"), box: e.target.closest(".chbox:not(.draft)") };
    drag.el.className = "chbox draft"; layer.appendChild(drag.el);
    e.preventDefault();
  });
  layer.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const b = rel(e), x = Math.min(drag.a.x, b.x), y = Math.min(drag.a.y, b.y);
    Object.assign(drag.el.style, { left: x * 100 + "%", top: y * 100 + "%", width: Math.abs(b.x - drag.a.x) * 100 + "%", height: Math.abs(b.y - drag.a.y) * 100 + "%" });
    drag.b = b;
  });
  const endPointer = (e) => {
    fingers.delete(e.pointerId);
    if (!drag) return;
    if (e.type === "pointercancel") { cancelDrag(); return; }
    const a = drag.a, b = drag.b, box = drag.box; drag.el.remove(); drag = null;
    const tiny = !b || Math.hypot(b.x - a.x, b.y - a.y) < 0.008 / zoom;
    if (tiny && box) { toggleBox(box); return; }            // chạm vào ô -> bật/tắt
    if (!b || Math.abs(b.x - a.x) < 0.01 / zoom || Math.abs(b.y - a.y) < 0.006 / zoom) return;
    st.boxes.push({ page: st.cur, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), type: "Vùng tự chọn", text: "(vẽ tay)", on: true });
    drawBoxes(); renderList();
  };
  layer.addEventListener("pointerup", endPointer);
  layer.addEventListener("pointercancel", endPointer);
  // máy tính có chuột: vào thẳng chế độ vẽ cho tiện
  if (matchMedia("(pointer: fine)").matches) setMode(true);

  /* ---------- tạo file đã che ---------- */
  $("chApply").addEventListener("click", async () => {
    if (st.busy || !st.pages.length) return;
    const boxes = st.boxes.filter((b) => b.on);
    if (!boxes.length) { status("Chưa có vùng nào được chọn để che.", true); return; }
    lock(true); bar(0);
    const task = D.pdfjsLib.getDocument({ data: st.bytes.slice() });
    try {
      const pdf = await task.promise;
      const src = await PDFLib.PDFDocument.load(st.bytes, { ignoreEncryption: true, updateMetadata: false });
      const doc = await PDFLib.PDFDocument.create();
      const byPage = new Map(); boxes.forEach((b) => { if (!byPage.has(b.page)) byPage.set(b.page, []); byPage.get(b.page).push(b); });
      for (let i = 0; i < st.pages.length; i++) {
        const P = st.pages[i];
        if (!byPage.has(i)) { const [cp] = await doc.copyPages(src, [i]); doc.addPage(cp); }
        else {
          status(`Đang che trang ${i + 1}/${st.pages.length}…`);
          const page = await pdf.getPage(i + 1);
          const vp = page.getViewport({ scale: 200 / 72 });
          const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          ctx.fillStyle = "#000";
          for (const b of byPage.get(i)) ctx.fillRect(Math.floor(b.x * c.width), Math.floor(b.y * c.height), Math.ceil(b.w * c.width) + 1, Math.ceil(b.h * c.height) + 1);
          const jpg = await new Promise((res) => c.toBlob((bl) => bl.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/jpeg", 0.85));
          c.width = c.height = 0; page.cleanup();
          const im = await doc.embedJpg(jpg);
          const np = doc.addPage([P.w, P.h]); np.drawImage(im, { x: 0, y: 0, width: P.w, height: P.h });
        }
        bar((i + 1) / st.pages.length);
        if (i % 3 === 0) await new Promise((r) => setTimeout(r));
      }
      st.out = await doc.save({ useObjectStreams: true });
      status(`Xong: đã che ${boxes.length} vùng trên ${byPage.size} trang. Trang có che đã chuyển thành ảnh nên chữ bị che không còn trong file. Các trang khác giữ nguyên.`);
    } catch (e) { console.error(e); status("Lỗi khi tạo file: " + (e.message || e), true); }
    await task.destroy();
    lock(false);
  });
  const outName = () => st.file.name.replace(/\.pdf$/i, "") + "_da_che.pdf";
  $("chView").addEventListener("click", () => st.out && D.openViewer(st.out, outName(), () => D.offerSave(outName(), new Blob([st.out], { type: "application/pdf" }))));
  $("chSave").addEventListener("click", () => st.out && D.offerSave(outName(), new Blob([st.out], { type: "application/pdf" })));
  // đổi file -> bỏ bản xem trước cũ
  $("chInput").addEventListener("change", () => { if (previewTask) { previewTask.destroy(); previewTask = previewPdf = null; } });
}
