/* =====================================================================
   So sánh 2 phiên bản PDF (hợp đồng, báo giá…): tìm chữ/số bị sửa, thêm, xóa.
   Diff theo từ (Myers/LCS). Hiển thị song song + danh sách thay đổi + xuất PDF có tô màu.
   ===================================================================== */

const HTML = `
<section class="panel" aria-label="So sánh 2 bản">
  <div class="twodrop">
    <div class="drop" id="ssDropA" tabindex="0" role="button"><strong>Bản cũ (bản gốc)</strong><small>Kéo thả hoặc bấm để chọn PDF</small><span class="file" id="ssNameA"></span><input type="file" id="ssInA" accept="application/pdf,.pdf" hidden></div>
    <div class="drop" id="ssDropB" tabindex="0" role="button"><strong>Bản mới (bản đã sửa)</strong><small>Kéo thả hoặc bấm để chọn PDF</small><span class="file" id="ssNameB"></span><input type="file" id="ssInB" accept="application/pdf,.pdf" hidden></div>
  </div>
  <div class="optrow">
    <label><input type="checkbox" id="ssCase"> Phân biệt chữ hoa/thường</label>
    <label><input type="checkbox" id="ssSpace" checked> Bỏ qua khác biệt dấu cách, xuống dòng</label>
  </div>
  <div class="actions">
    <button class="btn primary" id="ssRun" type="button" disabled>So sánh</button>
    <button class="btn" id="ssPdf" type="button" disabled>Tải báo cáo PDF tô màu</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="ssBar"></div></div>
  <div class="status" id="ssStatus" role="status">Chọn 2 file PDF cần so sánh.</div>
</section>
<section class="panel" id="ssResult" aria-label="Kết quả so sánh" hidden>
  <div class="summary" id="ssSummary"></div>
  <div class="sslegend"><span class="ssdel">chữ bị xóa / sửa ở bản cũ</span><span class="ssins">chữ thêm / sửa ở bản mới</span></div>
  <div class="tablewrap"><table><thead><tr><th>#</th><th>Trang</th><th>Loại</th><th>Bản cũ</th><th>Bản mới</th></tr></thead><tbody id="ssList"></tbody></table></div>
  <div class="target">
    <button class="btn" id="ssPrev" type="button">‹ Trang trước</button><span class="note" id="ssPageInfo"></span><button class="btn" id="ssNext" type="button">Trang sau ›</button>
  </div>
  <div class="sspair"><div><div class="note">Bản cũ</div><div class="ssstage" id="ssStageA"><canvas></canvas><div class="sslayer"></div></div></div>
  <div><div class="note">Bản mới</div><div class="ssstage" id="ssStageB"><canvas></canvas><div class="sslayer"></div></div></div></div>
</section>`;

const CSS = `
.twodrop { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { .twodrop, .sspair { grid-template-columns: 1fr !important; } }
.sspair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ssstage { position: relative; border: 1px solid var(--line); background: #fff; }
.ssstage canvas { display: block; width: 100%; height: auto; }
.sslayer { position: absolute; inset: 0; pointer-events: none; }
.sshl { position: absolute; mix-blend-mode: multiply; border-radius: 2px; }
.sshl.del { background: rgba(239, 83, 80, .45); } .sshl.ins { background: rgba(76, 175, 80, .45); }
.sshl.flash { outline: 3px solid #1e63d6; }
.sslegend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.ssdel, .ssins { padding: 1px 6px; border-radius: 3px; }
.ssdel { background: rgba(239, 83, 80, .35); text-decoration: line-through; } .ssins { background: rgba(76, 175, 80, .35); }
#ssList tr { cursor: pointer; }
`;

let mctx = null; const wcache = new Map();
function charW(ch) {
  if (wcache.has(ch)) return wcache.get(ch);
  if (!mctx) { mctx = document.createElement("canvas").getContext("2d"); mctx.font = "100px Arial, Helvetica, sans-serif"; }
  const w = Math.max(20, mctx.measureText(ch).width); wcache.set(ch, w); return w;
}

/* ---------- diff theo từ (Myers O(ND)) ---------- */
function diff(a, b) {
  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2), trace = [];
  const off = max + 1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { trace.push(v.slice()); break outer; }
    }
    if (d > 20000) throw new Error("Hai file khác nhau quá nhiều, không so sánh được.");
  }
  // dò ngược
  const ops = []; let x = n, y = m;
  for (let d = trace.length - 2; d >= 0 && (x > 0 || y > 0); d--) {
    const vv = trace[d], k = x - y;
    const pk = (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) ? k + 1 : k - 1;
    const px = vv[off + pk], py = px - pk;
    while (x > px && y > py) { ops.push(["=", x - 1, y - 1]); x--; y--; }
    if (d > 0) { if (x === px) ops.push(["+", -1, y - 1]); else ops.push(["-", x - 1, -1]); }
    x = px; y = py;
  }
  return ops.reverse();
}

export function initSoSanh(D) {
  const { $, esc, fold } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewSoSanh").innerHTML = HTML;
  const st = { A: null, B: null, words: {}, changes: [], cur: 0, pages: 1, busy: false, docs: {} };
  const status = (t, err) => { $("ssStatus").textContent = t; $("ssStatus").className = "status" + (err ? " err" : ""); };
  const bar = (f) => ($("ssBar").style.width = Math.round(f * 100) + "%");
  const lock = (on) => { st.busy = on; $("ssRun").disabled = on || !st.A || !st.B; $("ssPdf").disabled = on || !st.changes.length; };

  for (const side of ["A", "B"]) {
    const drop = $("ssDrop" + side), inp = $("ssIn" + side);
    const pick = async (f) => {
      if (!f) return;
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { status("File không phải PDF.", true); return; }
      st[side] = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
      if (st.docs[side]) { st.docs[side].task.destroy(); delete st.docs[side]; }
      $("ssName" + side).innerHTML = `${esc(f.name)} <span class="sz">· ${D.fmtMB(f.size)}</span>`;
      st.changes = []; $("ssResult").hidden = true;
      status(st.A && st.B ? "Đã đủ 2 file. Bấm \"So sánh\"." : `Chọn tiếp ${st.A ? "bản mới" : "bản cũ"}.`);
      lock(false);
    };
    drop.addEventListener("click", () => inp.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    inp.addEventListener("change", (e) => pick(e.target.files[0]));
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));
  }

  async function getDoc(side) {
    if (!st.docs[side]) { const task = D.pdfjsLib.getDocument({ data: st[side].bytes.slice() }); st.docs[side] = { task, pdf: await task.promise }; }
    return st.docs[side].pdf;
  }

  /* Lấy danh sách từ + toạ độ (0..1) của cả file */
  async function words(side, onP) {
    const pdf = await getDoc(side), out = [];
    let ocrPages = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim());
      if (items.reduce((a, it) => a + it.str.replace(/\s/g, "").length, 0) < 30) {
        // trang scan: OCR theo từ
        const ws = await D.getOcrWorkers(); ocrPages++;
        const v2 = page.getViewport({ scale: 200 / 72 }), c = document.createElement("canvas");
        c.width = Math.round(v2.width); c.height = Math.round(v2.height);
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: v2 }).promise;
        await ws[0].setParameters({ tessedit_pageseg_mode: "3" });
        const res = await ws[0].recognize(c, {}, { text: true, blocks: true });
        for (const b of res.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
          const t = (w.text || "").normalize("NFC").trim(); if (!t) continue;
          out.push({ t, p: n - 1, x0: w.bbox.x0 / c.width, x1: w.bbox.x1 / c.width, y0: w.bbox.y0 / c.height, y1: w.bbox.y1 / c.height });
        }
        c.width = c.height = 0;
      } else {
        const [a, b, cc, d, e, f] = vp.transform;
        const tr = (x, y) => [a * x + cc * y + e, b * x + d * y + f];
        const its = items.map((it) => {
          const h = Math.abs(it.transform[3]) || Math.hypot(it.transform[2], it.transform[3]) || 10;
          const [X0, Y0] = tr(it.transform[4], it.transform[5] - h * 0.22), [X1, Y1] = tr(it.transform[4] + it.width, it.transform[5] + h * 0.9);
          return { s: it.str.normalize("NFC"), x0: Math.min(X0, X1) / vp.width, x1: Math.max(X0, X1) / vp.width, y0: Math.min(Y0, Y1) / vp.height, y1: Math.max(Y0, Y1) / vp.height };
        });
        // sắp xếp theo dòng rồi theo x
        const lines = [];
        for (const it of its) {
          const cy = (it.y0 + it.y1) / 2, hh = it.y1 - it.y0;
          let ln = lines.find((l) => Math.abs(l.cy - cy) < hh * 0.45);
          if (!ln) { ln = { cy, items: [] }; lines.push(ln); }
          ln.items.push(it);
        }
        lines.sort((p, q) => p.cy - q.cy);
        for (const it of lines.flatMap((l) => l.items.sort((p, q) => p.x0 - q.x0))) {
          const cum = [0]; for (let k = 0; k < it.s.length; k++) cum.push(cum[k] + charW(it.s[k]));
          const X = (k) => it.x0 + (it.x1 - it.x0) * cum[k] / (cum[cum.length - 1] || 1);
          const re = /\S+/g; let m;
          while ((m = re.exec(it.s))) out.push({ t: m[0], p: n - 1, x0: X(m.index), x1: X(m.index + m[0].length), y0: it.y0, y1: it.y1 });
        }
      }
      page.cleanup(); onP && onP(n / pdf.numPages);
    }
    return { list: out, pages: pdf.numPages, ocrPages };
  }

  $("ssRun").addEventListener("click", async () => {
    if (st.busy || !st.A || !st.B) return;
    if (!(await D.trialAllow("sosanh", status))) return;
    lock(true); bar(0);
    try {
      status("Đang đọc bản cũ…");
      const A = await words("A", (f) => bar(f * 0.4));
      status("Đang đọc bản mới…");
      const B = await words("B", (f) => bar(0.4 + f * 0.4));
      if (!A.list.length || !B.list.length) { status("Một trong hai file không có chữ đọc được.", true); lock(false); return; }
      status("Đang so sánh…"); await new Promise((r) => setTimeout(r, 20));
      const cs = $("ssCase").checked;
      const key = (w) => { let t = w.t; if (!cs) t = t.toLowerCase(); return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"); };
      // tách dấu câu đầu/cuối để "đồng," và "đồng" không lệch cả cụm
      const ka = A.list.map(key), kb = B.list.map(key);
      const ops = diff(ka, kb);
      // gộp thành các thay đổi liền nhau
      const changes = []; let cur = null;
      for (const [o, i, j] of ops) {
        if (o === "=") { if (cur) { changes.push(cur); cur = null; } continue; }
        if (!cur) cur = { del: [], ins: [] };
        if (o === "-") cur.del.push(i); else cur.ins.push(j);
      }
      if (cur) changes.push(cur);
      st.A.w = A.list; st.B.w = B.list; st.pages = Math.max(A.pages, B.pages);
      st.changes = changes.map((c) => {
        const tA = c.del.map((i) => A.list[i].t).join(" "), tB = c.ins.map((j) => B.list[j].t).join(" ");
        const type = !c.del.length ? "Thêm" : !c.ins.length ? "Xóa" : /\d/.test(tA + tB) ? "Sửa số" : "Sửa chữ";
        const pg = c.ins.length ? B.list[c.ins[0]].p : A.list[c.del[0]].p;
        const pa = c.del.length ? A.list[c.del[0]].p : null;
        return { ...c, tA, tB, type, pg, pa };
      });
      bar(1);
      $("ssResult").hidden = false;
      const cnt = (t) => st.changes.filter((c) => c.type === t).length;
      $("ssSummary").innerHTML = st.changes.length
        ? `<span class="pill">${st.changes.length} chỗ khác nhau</span>` + ["Sửa số", "Sửa chữ", "Thêm", "Xóa"].map((t) => cnt(t) ? `<span class="pill ${t === "Sửa số" ? "warn" : ""}">${cnt(t)} ${t.toLowerCase()}</span>` : "").join("")
        : `<span class="pill ok">Nội dung chữ giống nhau 100%</span>`;
      $("ssList").innerHTML = st.changes.map((c, i) => `<tr data-i="${i}"><td class="num">${i + 1}</td><td class="num">${c.pg + 1}</td><td>${c.type === "Sửa số" ? `<span class="tag warn">${c.type}</span>` : esc(c.type)}</td>
        <td><span class="ssdel">${esc(c.tA.length > 160 ? c.tA.slice(0, 160) + "…" : c.tA)}</span></td><td><span class="ssins">${esc(c.tB.length > 160 ? c.tB.slice(0, 160) + "…" : c.tB)}</span></td></tr>`).join("");
      st.cur = st.changes.length ? st.changes[0].pg : 0;
      await renderPage();
      const ocr = A.ocrPages + B.ocrPages;
      status(st.changes.length ? `Tìm thấy ${st.changes.length} chỗ khác nhau${ocr ? ` (có ${ocr} trang scan, có thể lệch vài chữ)` : ""}. Bấm vào từng dòng để xem vị trí.`
        : "Hai bản giống nhau về nội dung chữ.");
      D.trialUse("sosanh");
    } catch (e) { console.error(e); status("Lỗi khi so sánh: " + (e.message || e), true); }
    lock(false);
  });

  async function drawSide(side, pageIdx, hl) {
    const stage = $("ssStage" + side), c = stage.querySelector("canvas"), layer = stage.querySelector(".sslayer");
    const pdf = await getDoc(side);
    if (pageIdx >= pdf.numPages) { c.width = 10; c.height = 14; layer.innerHTML = ""; return; }
    const page = await pdf.getPage(pageIdx + 1);
    const w = stage.clientWidth || 400, base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (w / base.width) * Math.min(2, window.devicePixelRatio || 1) });
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    layer.innerHTML = hl.map((h) => `<div class="sshl ${h.cls}" data-c="${h.ci}" style="left:${h.x0 * 100}%;top:${h.y0 * 100}%;width:${(h.x1 - h.x0) * 100}%;height:${(h.y1 - h.y0) * 100}%"></div>`).join("");
  }
  function boxes(side, pageIdx) {
    const out = [], W = st[side].w;
    st.changes.forEach((c, ci) => {
      for (const i of side === "A" ? c.del : c.ins) { const w = W[i]; if (w.p === pageIdx) out.push({ ...w, cls: side === "A" ? "del" : "ins", ci }); }
    });
    return out;
  }
  async function renderPage(flash) {
    $("ssPageInfo").textContent = `Trang ${st.cur + 1}/${st.pages}`;
    $("ssPrev").disabled = st.cur <= 0; $("ssNext").disabled = st.cur >= st.pages - 1;
    await Promise.all([drawSide("A", st.cur, boxes("A", st.cur)), drawSide("B", st.cur, boxes("B", st.cur))]);
    if (flash !== undefined) document.querySelectorAll(`.sshl[data-c="${flash}"]`).forEach((e) => e.classList.add("flash"));
  }
  $("ssPrev").addEventListener("click", () => { if (st.cur > 0) { st.cur--; renderPage(); } });
  $("ssNext").addEventListener("click", () => { if (st.cur < st.pages - 1) { st.cur++; renderPage(); } });
  $("ssList").addEventListener("click", async (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const c = st.changes[+tr.dataset.i]; st.cur = c.pg; await renderPage(+tr.dataset.i);
    $("ssStageB").scrollIntoView({ block: "center", behavior: "smooth" });
  });

  /* ---------- báo cáo PDF: bản mới tô xanh chỗ thêm/sửa, kèm trang tóm tắt ---------- */
  $("ssPdf").addEventListener("click", async () => {
    if (!st.changes.length || st.busy) return;
    lock(true); status("Đang tạo báo cáo PDF…");
    try {
      const out = await PDFLib.PDFDocument.create();
      const pdfB = await getDoc("B"), pdfA = await getDoc("A");
      // trang tóm tắt dạng ảnh (dùng canvas để hiển thị tiếng Việt không cần nhúng font)
      const rows = st.changes.map((c, i) => [String(i + 1), String(c.pg + 1), c.type, c.tA, c.tB]);
      const PW = 1240, PH = 1754, M = 70, LH = 30;
      let c = null, ctx = null, y = 0;
      const pagesImg = [];
      const newPage = (first) => {
        if (c) pagesImg.push(c);
        c = document.createElement("canvas"); c.width = PW; c.height = PH; ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, PW, PH); ctx.fillStyle = "#111"; y = M;
        if (first) {
          ctx.font = "bold 34px Arial, sans-serif"; ctx.fillText("BÁO CÁO SO SÁNH 2 BẢN", M, y + 30); y += 64;
          ctx.font = "22px Arial, sans-serif";
          ctx.fillText("Bản cũ: " + st.A.name, M, y); y += LH; ctx.fillText("Bản mới: " + st.B.name, M, y); y += LH;
          ctx.fillText(`Số chỗ khác nhau: ${st.changes.length}`, M, y); y += LH * 1.5;
        }
        ctx.font = "bold 20px Arial, sans-serif";
        [["#", 0], ["Trang", 50], ["Loại", 120], ["Bản cũ", 250], ["Bản mới", 690]].forEach(([t, x]) => ctx.fillText(t, M + x, y)); y += 10;
        ctx.fillRect(M, y, PW - 2 * M, 2); y += LH;
        ctx.font = "19px Arial, sans-serif";
      };
      const wrap = (t, w) => { const ws = t.split(" "), ls = []; let l = ""; for (const x of ws) { const tt = l ? l + " " + x : x; if (ctx.measureText(tt).width > w && l) { ls.push(l); l = x; } else l = tt; } ls.push(l); return ls.slice(0, 6); };
      newPage(true);
      for (const r of rows) {
        const la = wrap(r[3] || "—", 420), lb = wrap(r[4] || "—", 420), h = Math.max(la.length, lb.length) * 24 + 12;
        if (y + h > PH - M) newPage(false);
        ctx.fillStyle = "#111"; ctx.fillText(r[0], M, y); ctx.fillText(r[1], M + 50, y); ctx.fillText(r[2], M + 120, y);
        ctx.fillStyle = "rgba(239,83,80,.25)"; ctx.fillRect(M + 245, y - 18, 430, la.length * 24 + 4);
        ctx.fillStyle = "rgba(76,175,80,.25)"; ctx.fillRect(M + 685, y - 18, 430, lb.length * 24 + 4);
        ctx.fillStyle = "#111"; la.forEach((l, k) => ctx.fillText(l, M + 250, y + k * 24)); lb.forEach((l, k) => ctx.fillText(l, M + 690, y + k * 24));
        y += h; ctx.fillStyle = "#ddd"; ctx.fillRect(M, y - 16, PW - 2 * M, 1); ctx.fillStyle = "#111";
      }
      pagesImg.push(c);
      for (const pc of pagesImg) {
        const jpg = await new Promise((res) => pc.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/jpeg", 0.9));
        const im = await out.embedJpg(jpg), p = out.addPage([595.28, 841.89]); p.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 });
      }
      // các trang bản mới có thay đổi: giữ nguyên trang + vẽ khung màu
      const srcB = await PDFLib.PDFDocument.load(st.B.bytes, { ignoreEncryption: true, updateMetadata: false });
      const pagesWithChange = [...new Set(st.changes.map((c) => c.pg))].sort((a, b) => a - b).filter((p) => p < pdfB.numPages);
      const copied = await out.copyPages(srcB, pagesWithChange);
      copied.forEach((p, k) => {
        out.addPage(p);
        const { width, height } = p.getSize();
        for (const b of boxes("B", pagesWithChange[k])) {
          p.drawRectangle({ x: b.x0 * width, y: height - b.y1 * height, width: (b.x1 - b.x0) * width, height: (b.y1 - b.y0) * height,
            color: PDFLib.rgb(0.3, 0.69, 0.31), opacity: 0.35, borderColor: PDFLib.rgb(0.1, 0.5, 0.1), borderWidth: 0.6 });
        }
      });
      void pdfA;
      const bytes = await out.save();
      const name = st.B.name.replace(/\.pdf$/i, "") + "_SoSanh.pdf";
      D.openViewer(bytes, name, () => D.offerSave(name, new Blob([bytes], { type: "application/pdf" })));
      status(`Đã tạo báo cáo: ${pagesImg.length} trang tóm tắt + ${pagesWithChange.length} trang bản mới có tô màu chỗ thay đổi.`);
    } catch (e) { console.error(e); status("Lỗi khi tạo báo cáo: " + (e.message || e), true); }
    lock(false);
  });
}
