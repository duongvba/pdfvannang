/* =====================================================================
   Nén PDF scan mà chữ vẫn rõ.
   - Chỉ vẽ lại các trang dạng ảnh (scan); trang chữ thật được giữ nguyên.
   - Chế độ: auto (xám, tự giữ màu trang có dấu đỏ/ảnh màu), gray, bw (đen trắng 1-bit), color.
   - Tự chọn mức (dpi, chất lượng) nét nhất mà vẫn dưới dung lượng mục tiêu.
   ===================================================================== */

export const LEVELS = {
  jpeg: [ // dùng cho auto / gray / color
    { dpi: 200, q: 0.82 }, { dpi: 200, q: 0.72 }, { dpi: 170, q: 0.66 }, { dpi: 150, q: 0.6 },
    { dpi: 150, q: 0.5 }, { dpi: 130, q: 0.45 }, { dpi: 110, q: 0.4 }, { dpi: 96, q: 0.35 },
  ],
  bw: [{ dpi: 300 }, { dpi: 250 }, { dpi: 200 }, { dpi: 170 }, { dpi: 150 }, { dpi: 120 }],
};

/* ---------- nhận diện trang ---------- */
export async function analyze(pdfjsLib, pdf) {
  const OPS = pdfjsLib.OPS;
  const IMG = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintJpegXObject].filter((x) => x !== undefined));
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const textLen = tc.items.reduce((a, it) => a + (it.str ? it.str.replace(/\s+/g, "").length : 0), 0);
    let hasImage = false, invisibleText = false;
    if (textLen >= 30) {
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const f = ops.fnArray[i];
        if (IMG.has(f)) hasImage = true;
        if (f === OPS.setTextRenderingMode && ops.argsArray[i][0] === 3) invisibleText = true;
      }
    }
    // trang scan: không có chữ, hoặc là ảnh scan có lớp chữ ẩn (đã OCR)
    const isScan = textLen < 30 || (hasImage && invisibleText);
    pages.push({ n, wPt: vp.width, hPt: vp.height, isScan, ocrLayer: hasImage && invisibleText });
    page.cleanup();
  }
  return pages;
}

/* ---------- xử lý ảnh ---------- */
async function renderPage(pdf, n, dpi) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale: dpi / 72 });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c;
}

/** Trang có màu đáng kể (dấu đỏ, ảnh màu)? */
function hasColor(data) {
  let colored = 0, total = 0;
  for (let i = 0; i < data.length; i += 16) {      // lấy mẫu 1/4 điểm ảnh
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 70 && mx > 90) colored++;
    total++;
  }
  return colored / total > 0.0015;
}

/** Chuyển xám + kéo giãn tương phản (nền giấy về trắng, chữ đậm hơn). Trả mảng xám. */
function toGrayLevels(data, n) {
  const g = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const v = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    g[j] = v; hist[g[j]]++;
  }
  const lo = pct(hist, n, 0.005), hi = pct(hist, n, 0.92);   // nền giấy chiếm phần lớn -> đẩy về trắng
  const span = Math.max(30, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const x = Math.min(1, Math.max(0, (v - lo) / span));
    lut[v] = 255 * Math.pow(x, 1.15);                        // hơi tăng độ đậm nét chữ
  }
  for (let j = 0; j < n; j++) g[j] = lut[g[j]];
  return g;
}
function pct(hist, n, p) { let acc = 0; const lim = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lim) return v; } return 255; }

/** Ngưỡng thích ứng Bradley-Roth: chữ đen / nền trắng, chịu được giấy không đều sáng. Trả bit đã đóng gói (1 = trắng). */
function toBits(gray, w, h) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const s = Math.max(8, Math.floor(w / 24)) >> 1, t = 0.13;
  const stride = (w + 7) >> 3, out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s), y2 = Math.min(h - 1, y + s);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s), x2 = Math.min(w - 1, x + s);
      const cnt = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * (w + 1) + x2 + 1] - integral[y1 * (w + 1) + x2 + 1] - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      const v = gray[y * w + x];
      const white = v * cnt > sum * (1 - t) || v > 200;
      if (white) out[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** Dung lượng sau khi nén deflate (để ước lượng ảnh đen trắng). */
async function deflatedSize(u8) {
  if (typeof CompressionStream === "undefined") return Math.round(u8.length * 0.12);
  const cs = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
  return (await new Response(cs).arrayBuffer()).byteLength;
}

function canvasToJpeg(c, q) {
  return new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error("Không tạo được ảnh JPEG"))), "image/jpeg", q));
}

/** Xử lý 1 trang scan -> { kind: "jpeg"|"bits", data, w, h, color } */
async function processPage(pdf, n, mode, lv) {
  const c = await renderPage(pdf, n, lv.dpi);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  let out;
  const color = mode === "color" || (mode === "auto" && hasColor(img.data));
  if (mode === "bw") {
    out = { kind: "bits", data: toBits(toGrayLevels(img.data, w * h), w, h), w, h, color: false };
  } else if (color) {
    out = { kind: "jpeg", data: await canvasToJpeg(c, lv.q), w, h, color: true };
  } else {
    const g = toGrayLevels(img.data, w * h);
    const d = img.data;
    for (let i = 0, j = 0; j < g.length; i += 4, j++) d[i] = d[i + 1] = d[i + 2] = g[j];
    ctx.putImageData(img, 0, 0);
    out = { kind: "jpeg", data: await canvasToJpeg(c, lv.q), w, h, color: false };
  }
  c.width = c.height = 0;
  return out;
}

function addImagePage(doc, info, res) {
  const P = PDFLib;
  const page = doc.addPage([info.wPt, info.hPt]);
  let ref;
  if (res.kind === "jpeg") {
    return doc.embedJpg(res.data).then((im) => { page.drawImage(im, { x: 0, y: 0, width: info.wPt, height: info.hPt }); });
  }
  const stream = doc.context.flateStream(res.data, {
    Type: "XObject", Subtype: "Image", Width: res.w, Height: res.h, ColorSpace: "DeviceGray", BitsPerComponent: 1,
  });
  ref = doc.context.register(stream);
  const name = page.node.newXObject("Im", ref);
  page.pushOperators(P.pushGraphicsState(), P.concatTransformationMatrix(info.wPt, 0, 0, info.hPt, 0, 0), P.drawObject(name), P.popGraphicsState());
  return Promise.resolve();
}

/* ---------- ước lượng + nén ---------- */
/**
 * @param opts { mode: "auto"|"gray"|"bw"|"color", targetBytes: number|0, onProgress(text, frac) , shouldStop() }
 */
export async function compressPdf(pdfjsLib, bytes, opts) {
  const { mode = "auto", targetBytes = 0, onProgress = () => {}, shouldStop = () => false } = opts;
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  try {
    onProgress("Đang phân tích các trang…", 0.02);
    const pages = await analyze(pdfjsLib, pdf);
    const scan = pages.filter((p) => p.isScan);
    if (!scan.length) return { noScan: true, pages: pages.length };

    const levels = mode === "bw" ? LEVELS.bw : LEVELS.jpeg;
    const textShare = pages.length > scan.length ? bytes.length * (pages.length - scan.length) / pages.length : 0;
    let li = 0;
    if (targetBytes) {
      // lấy mẫu tối đa 4 trang scan, thử từng mức để ước lượng dung lượng
      const k = Math.min(4, scan.length);
      const sample = Array.from({ length: k }, (_, i) => scan[Math.floor((i + 0.5) * scan.length / k)]);
      li = levels.length - 1;
      for (let i = 0; i < levels.length; i++) {
        if (shouldStop()) throw new Error("Đã dừng");
        onProgress(`Đang thử mức ${levels[i].dpi} dpi${levels[i].q ? ", chất lượng " + Math.round(levels[i].q * 100) + "%" : ""}…`, 0.05 + 0.15 * i / levels.length);
        let sum = 0;
        for (const p of sample) {
          const r = await processPage(pdf, p.n, mode, levels[i]);
          sum += r.kind === "bits" ? await deflatedSize(r.data) : r.data.length;
        }
        const est = (sum / k) * scan.length * 1.04 + textShare * 0.9 + 30000;
        if (est <= targetBytes * 0.93) { li = i; break; }
      }
    }

    // nén thật; nếu vẫn vượt mục tiêu thì hạ một mức và làm lại
    let src = null;
    for (;;) {
      const lv = levels[li];
      const doc = await PDFLib.PDFDocument.create();
      let colorPages = 0;
      for (let i = 0; i < pages.length; i++) {
        if (shouldStop()) throw new Error("Đã dừng");
        const p = pages[i];
        if (p.isScan) {
          const res = await processPage(pdf, p.n, mode, lv);
          if (res.color) colorPages++;
          await addImagePage(doc, p, res);
        } else {
          if (!src) src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
          const [cp] = await doc.copyPages(src, [i]);
          doc.addPage(cp);
        }
        onProgress(`Đang nén trang ${i + 1}/${pages.length} (${lv.dpi} dpi${lv.q ? ", " + Math.round(lv.q * 100) + "%" : ", đen trắng"})…`, 0.2 + 0.78 * (i + 1) / pages.length);
        if (i % 3 === 0) await new Promise((r) => setTimeout(r));
      }
      const out = await doc.save({ useObjectStreams: true });
      if (!targetBytes || out.length <= targetBytes || li >= levels.length - 1) {
        return { bytes: out, level: lv, levelIndex: li, levels: levels.length, pages: pages.length, scanPages: scan.length,
          textPages: pages.length - scan.length, colorPages, ocrLayerLost: pages.some((p) => p.ocrLayer), fit: !targetBytes || out.length <= targetBytes };
      }
      li++;
      onProgress("Vẫn hơi lớn, đang hạ thêm một mức…", 0.2);
    }
  } finally {
    await task.destroy();
  }
}

/** Vẽ một vùng của trang để so sánh trước/sau (vùng tính theo tỉ lệ 0..1). */
export async function renderRegion(pdfjsLib, bytes, n, region, cssWidth, canvas) {
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(Math.min(n, pdf.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = (cssWidth * (window.devicePixelRatio || 1)) / (base.width * region.w);
    const vp = page.getViewport({ scale });
    canvas.width = Math.round(base.width * region.w * scale);
    canvas.height = Math.round(base.height * region.h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-region.x * base.width * scale, -region.y * base.height * scale);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } finally { await task.destroy(); }
}
