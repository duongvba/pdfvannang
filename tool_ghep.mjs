/* =====================================================================
   Ghép & sắp xếp trang: thêm nhiều PDF / ảnh, kéo thả đổi thứ tự, xoay, xóa, xuất 1 file PDF.
   ===================================================================== */
const HTML = `
<section class="panel" aria-label="Ghép và sắp xếp trang">
  <div class="drop" id="gpDrop" tabindex="0" role="button" aria-describedby="gpHint">
    <strong>Kéo thả các file PDF hoặc ảnh vào đây, hoặc bấm để chọn</strong>
    <small id="gpHint">Thêm bao nhiêu file cũng được, có thể thêm nhiều lần. Sau đó kéo thả để sắp xếp, xoay hoặc xóa từng trang.</small>
    <input type="file" id="gpInput" accept="application/pdf,.pdf,image/*" multiple hidden>
  </div>
  <div class="gptools" id="gpTools" hidden>
    <span class="pill" id="gpCount"></span>
    <button class="btn sm" type="button" id="gpAdd">+ Thêm file</button>
    <button class="btn sm" type="button" id="gpSortName">Xếp theo tên file</button>
    <button class="btn sm" type="button" id="gpReverse">Đảo ngược</button>
    <button class="btn sm" type="button" id="gpRotAll">Xoay tất cả ⟳</button>
    <button class="btn sm" type="button" id="gpClear">Xóa hết</button>
    <label class="note" style="margin-left:auto"><input type="checkbox" id="gpA4" checked> Ảnh đặt vừa khổ A4</label>
  </div>
  <p class="note" id="gpTip" hidden>Kéo biểu tượng <b>⠿</b> để đổi chỗ trang. Bấm vào trang để xem lớn.</p>
  <div class="gpgrid" id="gpGrid" aria-label="Danh sách trang"></div>
  <div class="actions">
    <button class="btn primary" id="gpRun" type="button" disabled>Tạo file PDF</button>
    <button class="btn" id="gpView" type="button" disabled>Xem kết quả</button>
    <button class="btn" id="gpSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="gpBar"></div></div>
  <div class="status" id="gpStatus" role="status">Chưa có trang nào.</div>
</section>`;

const CSS = `
.gptools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.gpgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; min-height: 10px; }
.gpcard { position: relative; min-width: 0; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--line); border-radius: 10px; background: var(--sheet); padding: 8px; display: grid; gap: 6px; user-select: none; -webkit-user-select: none; }
.gpcard.dragging { opacity: .35; }
.gpcard.ghost { position: fixed; z-index: 90; pointer-events: none; box-shadow: 0 16px 40px rgba(0,0,0,.25); opacity: .95; transform: rotate(2deg); }
.gpthumb { height: 150px; display: grid; place-items: center; background: var(--paper); border-radius: 6px; overflow: hidden; cursor: zoom-in; }
.gpthumb canvas, .gpthumb img { max-width: 100%; max-height: 150px; box-shadow: 0 1px 3px rgba(0,0,0,.2); background: #fff; transition: transform .15s; }
.gpmeta { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
.gpmeta b { color: var(--ink); font-variant-numeric: tabular-nums; }
.gpmeta .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gpbtns { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.gpbtns button { min-width: 0; height: 28px; border: 1px solid var(--line); background: var(--paper); border-radius: 6px; cursor: pointer; color: var(--ink); font-size: 14px; padding: 0; }
.gpbtns button:hover { border-color: var(--muted); }
.gphandle { cursor: grab; touch-action: none; font-size: 16px; padding: 0 4px; color: var(--muted); }
.gpdot { width: 8px; height: 8px; border-radius: 99px; flex: none; }
`;
const DOTS = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00897b", "#6d4c41", "#d81b60"];

export function initGhep(D) {
  const { $, esc } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewGhep").innerHTML = HTML;
  const st = { srcs: [], pages: [], out: null, busy: false, uid: 0 };
  // srcs: {name, kind:'pdf'|'img', bytes, pdf (pdf.js), file}
  // pages: {id, src, idx, rot}
  const status = (t, err) => { $("gpStatus").textContent = t; $("gpStatus").className = "status" + (err ? " err" : ""); };
  const lock = (on) => { st.busy = on; $("gpRun").disabled = on || !st.pages.length; $("gpView").disabled = $("gpSave").disabled = on || !st.out; };

  async function add(list) {
    const fs = [...(list || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf" || /^image\//.test(f.type));
    if (!fs.length) { status("Chỉ nhận file PDF hoặc ảnh.", true); return; }
    lock(true);
    for (const f of fs) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const si = st.srcs.length;
      try {
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
          const task = D.pdfjsLib.getDocument({ data: bytes.slice() }), pdf = await task.promise;
          st.srcs.push({ name: f.name, kind: "pdf", bytes, pdf, task });
          for (let i = 0; i < pdf.numPages; i++) st.pages.push({ id: ++st.uid, src: si, idx: i, rot: 0 });
        } else {
          st.srcs.push({ name: f.name, kind: "img", bytes, type: f.type, url: URL.createObjectURL(f) });
          st.pages.push({ id: ++st.uid, src: si, idx: 0, rot: 0 });
        }
      } catch (e) { console.error(e); status(`Không đọc được file "${f.name}".`, true); }
    }
    st.out = null; render(); lock(false);
    status(`Có ${st.pages.length} trang từ ${st.srcs.length} file. Sắp xếp xong thì bấm "Tạo file PDF".`);
  }
  const drop = $("gpDrop");
  drop.addEventListener("click", () => $("gpInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("gpInput").click(); } });
  $("gpInput").addEventListener("change", (e) => { add(e.target.files); e.target.value = ""; });
  $("gpAdd").addEventListener("click", () => $("gpInput").click());
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => add(e.dataTransfer.files));

  /* ---------- lưới trang ---------- */
  const thumbs = new Map();   // id trang nguồn "src:idx" -> dataURL
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); drawThumb(en.target); } }), { rootMargin: "300px" });
  let queue = Promise.resolve();
  function drawThumb(box) {
    const p = st.pages.find((x) => x.id === +box.dataset.id); if (!p) return;
    const s = st.srcs[p.src], key = p.src + ":" + p.idx;
    const show = (url) => { box.innerHTML = `<img alt="" src="${url}" style="transform:rotate(${p.rot}deg)">`; };
    if (s.kind === "img") return show(s.url);
    if (thumbs.has(key)) return show(thumbs.get(key));
    queue = queue.then(async () => {
      try {
        const page = await s.pdf.getPage(p.idx + 1), base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(2, 300 / Math.max(base.width, base.height)) });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: x, viewport: vp }).promise;
        const url = c.toDataURL("image/jpeg", 0.75); thumbs.set(key, url); c.width = c.height = 0;
        if (box.isConnected) show(url);
      } catch (e) { console.error(e); }
    });
  }
  function render() {
    const has = st.pages.length > 0;
    $("gpTools").hidden = $("gpTip").hidden = !has;
    $("gpCount").textContent = `${st.pages.length} trang`;
    $("gpGrid").innerHTML = st.pages.map((p, i) => {
      const s = st.srcs[p.src];
      return `<div class="gpcard" data-id="${p.id}">
        <div class="gpthumb" data-id="${p.id}" title="Bấm để xem lớn"></div>
        <div class="gpmeta"><span class="gphandle" title="Kéo để đổi chỗ" aria-label="Kéo để đổi chỗ trang ${i + 1}">⠿</span><b>${i + 1}</b>
          <span class="gpdot" style="background:${DOTS[p.src % DOTS.length]}"></span><span class="nm" title="${esc(s.name)}">${esc(s.name)}${s.kind === "pdf" ? " · tr." + (p.idx + 1) : ""}</span></div>
        <div class="gpbtns"><button type="button" data-a="left" aria-label="Lên trước">◀</button><button type="button" data-a="rl" aria-label="Xoay trái">⟲</button>
          <button type="button" data-a="rr" aria-label="Xoay phải">⟳</button><button type="button" data-a="del" aria-label="Xóa trang">✕</button><button type="button" data-a="right" aria-label="Ra sau">▶</button></div>
      </div>`;
    }).join("");
    $("gpGrid").querySelectorAll(".gpthumb").forEach((b) => io.observe(b));
    lock(st.busy);
  }
  function rerotate(p) {
    const im = $("gpGrid").querySelector(`.gpthumb[data-id="${p.id}"] img`);
    if (im) im.style.transform = `rotate(${p.rot}deg)`;
  }
  $("gpGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".gpcard"); if (!card || st.busy) return;
    const i = st.pages.findIndex((x) => x.id === +card.dataset.id), p = st.pages[i];
    const a = e.target.closest("button")?.dataset.a;
    if (!a) { if (e.target.closest(".gpthumb")) viewPage(p); return; }
    st.out = null;
    if (a === "rl" || a === "rr") { p.rot = (p.rot + (a === "rr" ? 90 : 270)) % 360; rerotate(p); lock(false); return; }
    if (a === "del") st.pages.splice(i, 1);
    if (a === "left" && i > 0) [st.pages[i - 1], st.pages[i]] = [st.pages[i], st.pages[i - 1]];
    if (a === "right" && i < st.pages.length - 1) [st.pages[i + 1], st.pages[i]] = [st.pages[i], st.pages[i + 1]];
    render();
  });
  $("gpSortName").addEventListener("click", () => {
    st.pages.sort((a, b) => st.srcs[a.src].name.localeCompare(st.srcs[b.src].name, "vi", { numeric: true }) || a.src - b.src || a.idx - b.idx);
    st.out = null; render();
  });
  $("gpReverse").addEventListener("click", () => { st.pages.reverse(); st.out = null; render(); });
  $("gpRotAll").addEventListener("click", () => { st.pages.forEach((p) => { p.rot = (p.rot + 90) % 360; rerotate(p); }); st.out = null; lock(false); });
  $("gpClear").addEventListener("click", () => {
    st.srcs.forEach((s) => { if (s.task) s.task.destroy(); if (s.url) URL.revokeObjectURL(s.url); });
    st.srcs = []; st.pages = []; thumbs.clear(); st.out = null; render(); status("Đã xóa hết. Thêm file để bắt đầu lại.");
  });

  async function onePagePdf(p) {
    const doc = await PDFLib.PDFDocument.create(); await addPage(doc, p, new Map()); return doc.save();
  }
  async function viewPage(p) { try { const b = await onePagePdf(p); D.openViewer(b, `Trang ${st.pages.indexOf(p) + 1}`, null); } catch (e) { console.error(e); } }

  /* ---------- kéo thả đổi chỗ (chuột + cảm ứng) ---------- */
  let drag = null;
  $("gpGrid").addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".gphandle"); if (!h || st.busy) return;
    const card = h.closest(".gpcard"), r = card.getBoundingClientRect();
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    const ghost = card.cloneNode(true); ghost.classList.add("ghost"); ghost.style.width = r.width + "px"; ghost.style.left = r.left + "px"; ghost.style.top = r.top + "px";
    document.body.appendChild(ghost); card.classList.add("dragging");
    drag = { h, card, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, id: +card.dataset.id };
  });
  $("gpGrid").addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.ghost.style.left = e.clientX - drag.dx + "px"; drag.ghost.style.top = e.clientY - drag.dy + "px";
    // cuộn trang khi kéo sát mép
    if (e.clientY < 90) window.scrollBy(0, -12); else if (e.clientY > innerHeight - 60) window.scrollBy(0, 12);
    const cards = [...$("gpGrid").querySelectorAll(".gpcard:not(.dragging)")];
    let target = null, after = false;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6 && e.clientX >= r.left - 6 && e.clientX <= r.right + 6) { target = c; after = e.clientX > r.left + r.width / 2; break; }
    }
    if (target) { if (after) target.after(drag.card); else target.before(drag.card); }
  });
  const end = () => {
    if (!drag) return;
    drag.ghost.remove(); drag.card.classList.remove("dragging");
    const order = [...$("gpGrid").querySelectorAll(".gpcard")].map((c) => +c.dataset.id);
    const changed = order.some((id, i) => st.pages[i].id !== id);
    st.pages.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    drag = null;
    if (changed) { st.out = null; render(); }
  };
  $("gpGrid").addEventListener("pointerup", end); $("gpGrid").addEventListener("pointercancel", end);

  /* ---------- xuất PDF ---------- */
  async function addPage(doc, p, cache) {
    const s = st.srcs[p.src];
    if (s.kind === "pdf") {
      if (!cache.has(p.src)) cache.set(p.src, await PDFLib.PDFDocument.load(s.bytes, { ignoreEncryption: true, updateMetadata: false }));
      const [cp] = await doc.copyPages(cache.get(p.src), [p.idx]);
      if (p.rot) cp.setRotation(PDFLib.degrees((cp.getRotation().angle + p.rot) % 360));
      doc.addPage(cp); return;
    }
    // ảnh: đổi sang JPEG/PNG mà pdf-lib nhận được
    let im;
    if (/png/i.test(s.type)) im = await doc.embedPng(s.bytes);
    else if (/jpe?g/i.test(s.type)) im = await doc.embedJpg(s.bytes);
    else {
      const bmp = await createImageBitmap(new Blob([s.bytes], { type: s.type }));
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      im = await doc.embedJpg(await new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/jpeg", 0.9)));
    }
    const a4 = $("gpA4").checked, sw = p.rot % 180 ? im.height : im.width, sh = p.rot % 180 ? im.width : im.height;
    let PW, PH;
    if (a4) { const land = sw > sh; PW = land ? 841.89 : 595.28; PH = land ? 595.28 : 841.89; }
    else { PW = sw * 0.75; PH = sh * 0.75; }
    const M = a4 ? 18 : 0, k = Math.min((PW - 2 * M) / sw, (PH - 2 * M) / sh), w = sw * k, h = sh * k;
    const pg = doc.addPage([PW, PH]), x0 = (PW - w) / 2, y0 = (PH - h) / 2;
    // vẽ ảnh có xoay quanh góc dưới-trái
    const iw = im.width * k, ih = im.height * k;
    const pos = { 0: [x0, y0], 90: [x0, y0 + h], 180: [x0 + w, y0 + h], 270: [x0 + w, y0] }[p.rot];
    pg.drawImage(im, { x: pos[0], y: pos[1], width: iw, height: ih, rotate: PDFLib.degrees(-p.rot) });
  }
  $("gpRun").addEventListener("click", async () => {
    if (st.busy || !st.pages.length) return;
    if (!(await D.trialAllow("ghep", status))) return;
    lock(true); $("gpBar").style.width = "0%";
    try {
      const doc = await PDFLib.PDFDocument.create(), cache = new Map();
      for (let i = 0; i < st.pages.length; i++) {
        await addPage(doc, st.pages[i], cache);
        if (i % 5 === 0) { $("gpBar").style.width = Math.round(((i + 1) / st.pages.length) * 100) + "%"; status(`Đang ghép trang ${i + 1}/${st.pages.length}…`); await new Promise((r) => setTimeout(r)); }
      }
      st.out = await doc.save({ useObjectStreams: true });
      $("gpBar").style.width = "100%";
      D.trialUse("ghep");
      status(`Xong: file PDF ${st.pages.length} trang, ${D.fmtMB(st.out.length)}. Bấm "Xem kết quả" hoặc "Tải về".`);
    } catch (e) { console.error(e); status("Lỗi khi ghép: " + (e.message || e), true); }
    lock(false);
  });
  const outName = () => (st.srcs.length === 1 ? st.srcs[0].name.replace(/\.[^.]+$/, "") + "_sapxep" : "GhepPDF_" + st.pages.length + "trang") + ".pdf";
  const save = () => st.out && D.offerSave(outName(), new Blob([st.out], { type: "application/pdf" }));
  $("gpSave").addEventListener("click", save);
  $("gpView").addEventListener("click", () => st.out && D.openViewer(st.out, outName(), save));
}
