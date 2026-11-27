/* =====================================================================
   Đọc bố cục trang PDF: dòng chữ, đoạn văn, căn lề, đậm/nghiêng, bảng.
   Dùng cho PDF sang Word / Excel. Trang scan: dùng OCR (vị trí từng từ).
   ===================================================================== */

/* ---------- 1. Lấy các "mảnh chữ" của trang ---------- */
async function textPieces(page) {
  try { await page.getOperatorList(); } catch {}          // để biết tên font (đậm, nghiêng)
  const vp = page.getViewport({ scale: 1 }), H = vp.height;
  const tc = await page.getTextContent();
  const fontInfo = {};
  const out = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    if (!fontInfo[it.fontName]) {
      let name = "";
      try { name = page.commonObjs.get(it.fontName)?.name || ""; } catch {}
      fontInfo[it.fontName] = { bold: /bold|black|heavy|semibold|demi|,b\b|-b\b/i.test(name), italic: /italic|oblique|,i\b|-i\b/i.test(name) };
    }
    const [a, b, c, d, e, f] = it.transform;
    if (Math.abs(b) > Math.abs(a) * 0.3) continue;          // bỏ chữ xoay dọc
    const size = Math.hypot(c, d) || Math.abs(d) || 10;
    // toạ độ theo khung nhìn (gốc trên-trái), có xét trang bị xoay
    const [ta, tb, tc2, td, te, tf] = vp.transform;
    const x0 = ta * e + tc2 * f + te, y0 = tb * e + td * f + tf;
    out.push({ s: it.str.normalize("NFC"), x0, x1: x0 + it.width, base: y0, size, ...fontInfo[it.fontName] });
  }
  return { w: vp.width, h: vp.height, pieces: out };
}
async function ocrPieces(page, worker) {
  const vp1 = page.getViewport({ scale: 1 }), k = 220 / 72, vp = page.getViewport({ scale: k });
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  await worker.setParameters({ tessedit_pageseg_mode: "3" });
  const res = await worker.recognize(c, {}, { text: true, blocks: true });
  c.width = c.height = 0;
  const out = [];
  for (const bl of res.data.blocks || []) for (const p of bl.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
    let s = (w.text || "").normalize("NFC").trim().replace(/^[|_]+|[|_]+$/g, ""); if (!s || /^[|_\[\]]+$/.test(s)) continue;   // đường kẻ bảng bị đọc thành | _
    const bb = w.bbox, size = Math.max(6, ((l.bbox.y1 - l.bbox.y0) / k) * 0.78);
    out.push({ s, x0: bb.x0 / k, x1: bb.x1 / k, base: l.bbox.y1 / k, size, bold: false, italic: false, ocr: true });
  }
  return { w: vp1.width, h: vp1.height, pieces: out };
}

/* ---------- 2. Ghép thành dòng và các đoạn trong dòng ---------- */
function toLines(pieces, W) {
  pieces.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const lines = [];
  for (const p of pieces) {
    let ln = null;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
      const L = lines[i]; if (Math.abs(L.base - p.base) <= Math.max(L.size, p.size) * 0.45) { ln = L; break; }
    }
    if (!ln) { ln = { base: p.base, size: p.size, items: [] }; lines.push(ln); }
    ln.items.push(p); ln.size = Math.max(ln.size, p.size);
  }
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x0 - b.x0);
    const segs = []; let cur = null;
    for (const it of ln.items) {
      const gap = cur ? it.x0 - cur.x1 : 0;
      if (!cur || gap > Math.max(ln.size * 1.5, 14)) { cur = { x0: it.x0, x1: it.x1, runs: [], text: "" }; segs.push(cur); }
      else if (gap > ln.size * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(it.s)) { addRun(cur, " ", it); }
      addRun(cur, it.s, it); cur.x1 = Math.max(cur.x1, it.x1);
    }
    segs.forEach((s) => { s.text = s.text.replace(/\s+/g, " ").trim(); });
    ln.segs = segs.filter((s) => s.text);
    ln.x0 = ln.segs.length ? ln.segs[0].x0 : 0; ln.x1 = ln.segs.length ? ln.segs[ln.segs.length - 1].x1 : 0;
    ln.fsegs = fineSegs(ln);
    ln.top = ln.base - ln.size;
  }
  return lines.filter((l) => l.segs.length);
}
/* tách mịn: mỗi ô bảng thường là một mảnh chữ riêng, cách nhau > ~1 cỡ chữ */
function fineSegs(l) {
  const segs = []; let cur = null;
  for (const it of l.items) {
    const gap = cur ? it.x0 - cur.x1 : 0;
    if (!cur || gap > Math.max(l.size * 0.9, 3)) { cur = { x0: it.x0, x1: it.x1, runs: [], text: "" }; segs.push(cur); }
    else if (gap > l.size * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(it.s)) addRun(cur, " ", it);
    addRun(cur, it.s, it); cur.x1 = Math.max(cur.x1, it.x1);
  }
  segs.forEach((x) => { x.text = x.text.replace(/\s+/g, " ").trim(); x.runs = cleanRuns(x.runs); });
  return segs.filter((x) => x.text);
}
function addRun(seg, text, it) {
  const last = seg.runs[seg.runs.length - 1], size = Math.round(it.size * 2) / 2;
  if (last && last.bold === it.bold && last.italic === it.italic && Math.abs(last.size - size) < 0.6) last.text += text;
  else seg.runs.push({ text, bold: !!it.bold, italic: !!it.italic, size });
  seg.text += text;
}
const cleanRuns = (runs) => {
  const r = runs.map((x) => ({ ...x })); if (!r.length) return r;
  r[0].text = r[0].text.replace(/^\s+/, ""); r[r.length - 1].text = r[r.length - 1].text.replace(/\s+$/, "");
  return r.filter((x) => x.text);
};

export async function readPages(pdfjsLib, bytes, { onProgress, getOcr, shouldStop } = {}) {
  const task = pdfjsLib.getDocument({ data: bytes.slice() }), pdf = await task.promise, pages = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (shouldStop && shouldStop()) break;
      const page = await pdf.getPage(n);
      let r = await textPieces(page), ocr = false;
      if (r.pieces.reduce((a, p) => a + p.s.replace(/\s/g, "").length, 0) < 25 && getOcr) {
        onProgress && onProgress(`Đang đọc trang ${n}/${pdf.numPages} (file scan)…`, (n - 1) / pdf.numPages);
        r = await ocrPieces(page, await getOcr()); ocr = true;
      } else onProgress && onProgress(`Đang đọc trang ${n}/${pdf.numPages}…`, (n - 1) / pdf.numPages);
      pages.push({ n, w: r.w, h: r.h, ocr, lines: toLines(r.pieces, r.w) });
      page.cleanup();
    }
  } finally { await task.destroy(); }
  return pages;
}

/* ---------- 3. Mô hình văn bản cho Word ---------- */
function margins(pages) {
  const xs0 = [], xs1 = [];
  pages.forEach((p) => p.lines.forEach((l) => { xs0.push(l.x0); xs1.push(l.x1); }));
  xs0.sort((a, b) => a - b); xs1.sort((a, b) => a - b);
  const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
  return { L: q(xs0, 0.06), R: q(xs1, 0.94) };
}
/* các dòng -> đoạn văn trong vùng [L, R] */
function paragraphs(lines, L, R, cell = false) {
  const W = R - L || 1, mid = (L + R) / 2, out = [];
  const alignOf = (l) => {
    const w = l.x1 - l.x0, c = (l.x0 + l.x1) / 2;
    if (cell && Math.abs((l.x0 - L) - (R - l.x1)) < W * 0.12) return "center";
    if (l.x1 > R - W * 0.025 && l.x0 - L < W * 0.15) return w > W * 0.6 ? "both" : "left";   // dòng đầu đoạn thụt vào, chạy hết lề phải
    if (Math.abs(c - mid) < W * 0.035 && l.x0 - L > W * 0.06) return "center";
    if (l.x1 > R - W * 0.03 && l.x0 - L > W * 0.35) return "right";
    return w > W * 0.9 ? "both" : "left";
  };
  let cur = null;
  for (const l of lines) {
    const runs = l.segs.flatMap((s, i) => (i ? [{ text: "\t", bold: false, italic: false, size: l.size }] : []).concat(s.runs));
    const a = alignOf(l);
    const prev = cur && cur.last;
    const gap = prev ? l.top - prev.base : 99;
    const cont = cur && gap < l.size * 0.9 && Math.abs(prev.size - l.size) < 1.2 && (
      (cur.align === "both" || cur.align === "left") && prev.x1 > R - W * 0.08 && l.x0 - L < W * 0.03 ||
      cur.align === "center" && a === "center" && prev.x1 - prev.x0 > W * 0.85 && !!prev.items[0]?.bold === !!l.items[0]?.bold);
    if (cont) {
      const lastRun = cur.runs[cur.runs.length - 1];
      if (lastRun && !/[\s-]$/.test(lastRun.text)) cur.runs.push({ ...runs[0], text: " " });
      cur.runs.push(...runs); cur.last = l;
      if (cur.align === "left" && a === "both") cur.align = "both";
      continue;
    }
    if (cur) out.push(cur);
    const indent = a === "left" || a === "both" ? Math.max(0, l.x0 - L) : 0;
    cur = { type: "p", align: a, first: indent > W * 0.015 && indent < W * 0.2 ? indent : 0, left: indent >= W * 0.2 ? indent : 0, runs, last: l, before: prev ? Math.max(0, gap - l.size * 0.4) : 0, size: l.size };
  }
  if (cur) out.push(cur);
  out.forEach((p) => { p.runs = cleanRuns(p.runs); if (p.align === "both" && p.last && p.last.x1 < R - W * 0.15 && !p.runs.some((r) => r.text.includes(" "))) p.align = "left"; delete p.last; });
  return out.filter((p) => p.runs.length);
}
/* cột của một nhóm dòng nhiều đoạn: khoảng trống chung theo trục x */
function columnsOf(lines, L, R, key = "segs", tolF = 0.04) {
  const step = 1, n = Math.ceil((R - L) / step) + 2, cov = new Uint16Array(n), tol = Math.floor(lines.length * tolF);
  for (const l of lines) for (const s of l[key]) for (let x = Math.max(0, Math.floor((s.x0 - L) / step)); x <= Math.min(n - 1, Math.ceil((s.x1 - L) / step)); x++) cov[x]++;
  const cuts = []; let i = 0;
  while (i < n) {
    if (cov[i] <= tol) { let j = i; while (j < n && cov[j] <= tol) j++; if (j - i >= 2 || tol === 0) cuts.push(L + ((i + j) / 2) * step); i = j; } else i++;
  }
  const xs = [-Infinity, ...cuts.filter((c) => c > L + 2 && c < R - 2), Infinity];
  let cols = []; for (let k = 0; k < xs.length - 1; k++) cols.push([xs[k], xs[k + 1]]);
  // bỏ cột không có ô nào (gộp vào cột bên trái)
  const used = cols.map(() => 0);
  for (const l of lines) for (const s of l[key]) used[colOf(cols, s)]++;
  const keep = [];
  cols.forEach((c, k) => { if (used[k] >= Math.max(1, lines.length * 0.03) || !keep.length) keep.push([...c]); else keep[keep.length - 1][1] = c[1]; });
  if (keep.length) keep[keep.length - 1][1] = Infinity;
  return keep;
}
const colOf = (cols, s) => { const c = (s.x0 + s.x1) / 2; const k = cols.findIndex(([a, b]) => c >= a && c < b); return k < 0 ? 0 : k; };

export function toWordModel(pages) {
  const { L, R } = margins(pages), W = R - L, blocks = [];
  pages.forEach((pg, pi) => {
    if (pi) blocks.push({ type: "break" });
    const lines = pg.lines;
    let i = 0;
    const pend = [];
    const flush = () => { if (pend.length) { blocks.push(...paragraphs(pend, L, R)); pend.length = 0; } };
    while (i < lines.length) {
      const l = lines[i];
      if (l.segs.length < 2) { pend.push(l); i++; continue; }
      // nhóm các dòng nhiều đoạn liên tiếp (cho phép dòng 1 đoạn chen giữa nếu nằm gọn trong 1 cột)
      let j = i + 1; const grp = [l];
      while (j < lines.length) {
        const m = lines[j], gap = m.top - grp[grp.length - 1].base;
        if (gap > m.size * 2.2) break;
        if (m.segs.length >= 2) { grp.push(m); j++; continue; }
        if (m.x1 - m.x0 < W * 0.45 && j + 1 < lines.length && lines[j + 1].segs.length >= 2) { grp.push(m); j++; continue; }
        break;
      }
      const maxSegs = Math.max(...grp.map((g) => g.segs.length));
      if (grp.length === 1 && maxSegs === 2 && l.segs[0].x1 - l.segs[0].x0 > W * 0.5) { pend.push(l); i++; continue; }   // dòng có dấu tab bình thường
      flush();
      const cols = columnsOf(grp, L, R, "fsegs");
      const maxF = Math.max(...grp.map((g) => g.fsegs.length));
      if (maxF <= 2 || cols.length <= 2) {
        // khối 2 cột (đầu văn bản hành chính, phần ký tên): 1 hàng, mỗi ô là các đoạn văn
        // điểm chia 2 khối: khoảng trống chung rộng nhất giữa các dòng
        const n = Math.ceil(R - L) + 2, cov = new Uint16Array(n);
        for (const g of grp) for (const s of g.segs) for (let x = Math.max(0, Math.floor(s.x0 - L)); x <= Math.min(n - 1, Math.ceil(s.x1 - L)); x++) cov[x]++;
        let best = [0, 0], i0 = -1;
        for (let x = 0; x <= n; x++) { const z = x < n && cov[x] === 0 && x > 5 && x < n - 5; if (z && i0 < 0) i0 = x; if (!z && i0 >= 0) { if (x - i0 > best[1] - best[0]) best = [i0, x]; i0 = -1; } }
        const split = best[1] > best[0] ? L + (best[0] + best[1]) / 2 : (L + R) / 2;
        const cells = [[], []];
        for (const g of grp) for (const s of g.segs) { const k = (s.x0 + s.x1) / 2 < split ? 0 : 1; cells[k].push({ ...g, segs: [s], x0: s.x0, x1: s.x1 }); }
        const widths = [split - L, R - split];
        const bounds = [[L, split], [split, R]];
        blocks.push({ type: "table", border: false, widths, rows: [cells.map((cl, k) => paragraphs(cl, k ? bounds[k][0] + 2 : Math.min(bounds[0][0], ...cl.map((x) => x.x0)), k ? Math.max(bounds[1][1], ...cl.map((x) => x.x1)) : bounds[0][1] - 2, true))] });
      } else {
        const rows = [];
        for (const g of grp) {
          const row = cols.map(() => []);
          for (const s of g.fsegs) { const k = colOf(cols, s); if (row[k].length) row[k].push({ text: " ", bold: false, italic: false, size: g.size }); row[k].push(...s.runs); }
          const filled = row.filter((r) => r.length).length, prevRow = rows[rows.length - 1];
          if (prevRow && filled < cols.length * 0.5 && g.top - prevRow.base < g.size * 0.8) {
            row.forEach((r, k) => { if (r.length) prevRow.cells[k].push({ text: " ", bold: false, italic: false, size: g.size }, ...r); });
            prevRow.base = g.base;
          } else rows.push({ cells: row, base: g.base });
        }
        const widths = cols.map(([a, b], k) => Math.max(20, (k === cols.length - 1 ? R : Math.min(b, R)) - (k === 0 ? L : Math.max(a, L))));
        blocks.push({ type: "table", border: true, widths, rows: rows.map((r) => r.cells.map((runs) => [{ type: "p", align: "left", first: 0, left: 0, runs: cleanRuns(runs), before: 0 }])) });
      }
      i = j;
    }
    flush();
  });
  return { blocks, page: pages[0] ? { w: pages[0].w, h: pages[0].h } : { w: 595, h: 842 }, L, R, top: pages[0]?.lines[0]?.top || 56 };
}

/* ---------- 4. Bảng cho Excel ---------- */
const VN_NUM = /^[-+]?\(?\d{1,3}(?:\.\d{3})+(?:,\d+)?\)?$|^[-+]?\d+(?:,\d+)?$/;
export function toNumber(s) {
  const t = String(s).trim().replace(/\s/g, "");
  if (!t || /^0\d/.test(t) || t.length > 18) return null;
  if (VN_NUM.test(t)) { const neg = /^\(.*\)$/.test(t) || t.startsWith("-"); const v = Number(t.replace(/[()+-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? (neg ? -v : v) : null; }
  if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) { const v = Number(t.replace(/,/g, "")); return Number.isFinite(v) ? v : null; }
  return null;
}
export function toTables(pages, { merge = true } = {}) {
  const sheets = [];
  const fine = (l) => ({ ...l, segs: l.fsegs });
  const one = (pg0) => {
    const pg = { ...pg0, lines: pg0.lines.map(fine) };
    const L = Math.min(...pg.lines.map((l) => l.x0)), R = Math.max(...pg.lines.map((l) => l.x1));
    const tl = pg.lines.filter((l) => l.segs.length >= 2);
    const cols = tl.length >= 2 ? columnsOf(tl, L, R, "segs", 0.15) : [[-Infinity, Infinity]];
    const rows = [];
    for (const l of pg.lines) {
      const row = cols.map(() => "");
      for (const s of l.segs) { const k = colOf(cols, s); row[k] = row[k] ? row[k] + " " + s.text : s.text; }
      // dòng chữ dài vắt qua nhiều cột (tiêu đề, ghi chú): đặt ở cột đầu
      if (l.segs.length === 1 && (l.x1 - l.x0 > (R - L) * 0.5 || !rows.some((r) => r.table))) { row.fill(""); row[0] = l.segs[0].text; }
      const prev = rows[rows.length - 1];
      const filled = row.filter(Boolean).length;
      if (prev && prev.table && filled && filled <= Math.max(1, cols.length / 3) && l.top - prev.base < l.size * 0.7 && !row.some((v) => toNumber(v) != null)) {
        row.forEach((v, k) => { if (v) prev.cells[k] = prev.cells[k] ? prev.cells[k] + " " + v : v; }); prev.base = l.base; continue;
      }
      rows.push({ cells: row, base: l.base, table: l.segs.length >= 2, bold: l.segs.every((s) => s.runs.every((r) => r.bold)) });
    }
    return { cols: cols.length, rows };
  };
  const per = pages.map(one);
  if (!merge) return per.map((p, i) => {
    const h = p.rows.findIndex((r) => r.table && r.cells.filter(Boolean).length >= 2 && r.cells.every((v) => toNumber(v) == null));
    if (h >= 0) p.rows[h].head = true;
    return { name: `Trang ${pages[i].n}`, ...p };
  });
  // gộp các trang: bỏ hàng tiêu đề bảng lặp lại ở đầu trang sau
  const n = Math.max(...per.map((p) => p.cols)), all = [];
  let header = null;
  per.forEach((p, pi) => {
    for (const r of p.rows) {
      const cells = [...r.cells, ...Array(n - r.cells.length).fill("")];
      const key = cells.join("|").toLowerCase();
      if (r.table && !header && cells.filter(Boolean).length >= 2 && cells.every((v) => toNumber(v) == null)) { header = key; all.push({ ...r, cells, head: true }); continue; }
      else if (pi > 0 && header && key === header) continue;
      all.push({ ...r, cells });
    }
  });
  return [{ name: "Dữ liệu", cols: n, rows: all }];
}
