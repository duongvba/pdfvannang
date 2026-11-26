/* =====================================================================
   Chụp giấy tờ bằng điện thoại -> PDF.
   Tự tìm 4 góc tờ giấy, nắn phẳng (perspective), làm trắng nền, xóa bóng, ghép nhiều trang.
   ===================================================================== */

const HTML = `
<section class="panel" aria-label="Chụp giấy tờ">
  <div class="twodrop">
    <div class="drop" id="cpDrop" tabindex="0" role="button" aria-describedby="cpHint">
      <strong>Chọn ảnh giấy tờ (nhiều ảnh cùng lúc)</strong>
      <small id="cpHint">Kéo thả ảnh JPG/PNG vào đây hoặc bấm để chọn. Mỗi ảnh là 1 trang.</small>
      <input type="file" id="cpInput" accept="image/*" multiple hidden>
    </div>
    <div class="drop" id="cpCam" tabindex="0" role="button">
      <strong>📷 Chụp bằng camera</strong>
      <small>Trên điện thoại: mở camera, chụp từng trang. Đặt giấy trên nền tối, đủ sáng.</small>
      <input type="file" id="cpCamInput" accept="image/*" capture="environment" hidden>
    </div>
  </div>
  <div class="optrow" role="radiogroup" aria-label="Chế độ ảnh">
    <strong style="font-size:14px">Kiểu trang:</strong>
    <label><input type="radio" name="cpMode" value="bw" checked> Đen trắng rõ chữ (nhẹ nhất)</label>
    <label><input type="radio" name="cpMode" value="gray"> Xám, xóa bóng</label>
    <label><input type="radio" name="cpMode" value="color"> Màu, làm sáng nền</label>
    <label><input type="radio" name="cpMode" value="orig"> Giữ nguyên ảnh</label>
  </div>
  <div class="optrow">
    <label><input type="checkbox" id="cpA4" checked> Đặt vào khổ A4</label>
    <label><input type="checkbox" id="cpAuto" checked> Tự tìm góc giấy</label>
  </div>
  <div class="actions">
    <button class="btn primary" id="cpMake" type="button" disabled>Tạo PDF</button>
    <button class="btn" id="cpView" type="button" disabled>Xem PDF</button>
    <button class="btn" id="cpSave" type="button" disabled>Tải PDF</button>
    <button class="btn" id="cpClear" type="button" disabled>Xóa hết ảnh</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="cpBar"></div></div>
  <div class="status" id="cpStatus" role="status">Chưa có ảnh nào.</div>
</section>
<section class="panel" id="cpPages" aria-label="Các trang" hidden>
  <p class="note">Bấm vào một trang để chỉnh 4 góc. Dùng nút ◀ ▶ để đổi thứ tự, ⟳ để xoay.</p>
  <div class="cpthumbs" id="cpThumbs"></div>
  <div id="cpEditor" hidden>
    <div class="target"><strong id="cpEdTitle"></strong>
      <button class="btn" type="button" id="cpEdAuto">Tự tìm lại góc</button>
      <button class="btn" type="button" id="cpEdFull">Lấy cả ảnh</button>
      <button class="btn primary" type="button" id="cpEdDone">Xong</button></div>
    <p class="note">Kéo 4 chấm tròn vào đúng 4 góc tờ giấy.</p>
    <div class="cpstage" id="cpStage"><canvas id="cpCanvas"></canvas><svg id="cpSvg"></svg></div>
  </div>
</section>`;

const CSS = `
.twodrop { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { .twodrop { grid-template-columns: 1fr; } }
.cpthumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
.cpthumb { border: 1px solid var(--line); border-radius: 6px; padding: 6px; background: var(--sheet); display: grid; gap: 6px; }
.cpthumb img { width: 100%; height: 160px; object-fit: contain; background: #f3f4f6; cursor: pointer; border-radius: 4px; }
.cpthumb .row { display: flex; justify-content: space-between; align-items: center; gap: 2px; font-size: 12px; }
.cpthumb .row button { border: 1px solid var(--line); background: var(--paper); border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 13px; }
.cpstage { position: relative; max-width: 720px; margin: 0 auto; touch-action: none; user-select: none; }
.cpstage canvas { display: block; width: 100%; height: auto; }
.cpstage svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.cpstage polygon { fill: rgba(30, 99, 214, .15); stroke: #1e63d6; stroke-width: 2; vector-effect: non-scaling-stroke; }
.cpstage circle { fill: #fff; stroke: #1e63d6; stroke-width: 3; vector-effect: non-scaling-stroke; cursor: grab; }
`;

const MAXSRC = 2400;          // cạnh dài tối đa của ảnh gốc khi xử lý
const OUTLONG = 2200;         // cạnh dài tối đa trang kết quả (~ 190 dpi khổ A4)

/* ---------- tiện ích ảnh ---------- */
async function loadImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { const url = URL.createObjectURL(file); const im = new Image(); im.src = url; await im.decode(); bmp = im; setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const w = bmp.width, h = bmp.height, s = Math.min(1, MAXSRC / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}
function grayOf(c, maxSide) {
  const s = Math.min(1, maxSide / Math.max(c.width, c.height));
  const w = Math.max(1, Math.round(c.width * s)), h = Math.max(1, Math.round(c.height * s));
  const t = document.createElement("canvas"); t.width = w; t.height = h;
  const x = t.getContext("2d"); x.drawImage(c, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return { g, w, h, s };
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let acc = 0; const o = y * w;
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / (2 * r + 1); acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
function otsu(g) {
  const hist = new Float64Array(256); for (const v of g) hist[Math.min(255, Math.max(0, v | 0))]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128; const N = g.length;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
    sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  return th;
}

/* Tự tìm 4 góc: tờ giấy sáng hơn nền -> vùng sáng liên thông lớn nhất -> 4 điểm cực trị */
function detectCorners(c) {
  const { g, w, h } = grayOf(c, 360);
  const b = boxBlur(g, w, h, 2), th = otsu(b);
  const m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = b[i] > th ? 1 : 0;
  // vùng liên thông lớn nhất
  const lab = new Int32Array(w * h); let best = 0, bestId = 0, id = 0; const stack = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i]) continue; id++; let n = 0; stack.push(i); lab[i] = id;
    while (stack.length) { const p = stack.pop(); n++; const x = p % w, y = (p / w) | 0;
      if (x > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = id; stack.push(p + w); } }
    if (n > best) { best = n; bestId = id; }
  }
  const full = [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (best < w * h * 0.12 || best > w * h * 0.985) return { pts: full, found: false };
  // 4 góc: cực trị của x+y, x-y
  let tl = [0, 0, Infinity], tr = [0, 0, -Infinity], br = [0, 0, -Infinity], bl = [0, 0, -Infinity];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (lab[y * w + x] !== bestId) continue;
    const s = x + y, d = x - y;
    if (s < tl[2]) tl = [x, y, s]; if (s > br[2]) br = [x, y, s];
    if (d > tr[2]) tr = [x, y, d]; if (-d > bl[2]) bl = [x, y, -d];
  }
  const pts = [tl, tr, br, bl].map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h]);
  // tứ giác quá nhỏ hoặc méo -> bỏ
  const area = Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % 4]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  if (area < 0.12) return { pts: full, found: false };
  return { pts, found: true };
}

/* Ma trận đồng nhất (homography) từ 4 điểm -> 4 điểm */
function homography(src, dst) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  for (let c = 0; c < 8; c++) {   // Gauss
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
  }
  return B.map((b, i) => b / A[i][i]).concat(1);
}

function warp(srcC, ptsN) {
  const W = srcC.width, H = srcC.height, P = ptsN.map(([x, y]) => [x * W, y * H]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let ow = Math.max(dist(P[0], P[1]), dist(P[3], P[2])), oh = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
  const s = Math.min(1.4, OUTLONG / Math.max(ow, oh)); ow = Math.round(ow * s); oh = Math.round(oh * s);
  const Hm = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], P);   // đích -> nguồn
  const sd = srcC.getContext("2d").getImageData(0, 0, W, H).data;
  const out = document.createElement("canvas"); out.width = ow; out.height = oh;
  const oc = out.getContext("2d"), od = oc.createImageData(ow, oh), o = od.data;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const z = Hm[6] * x + Hm[7] * y + 1, sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, di = (y * ow + x) * 4;
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) { o[di] = o[di + 1] = o[di + 2] = 255; o[di + 3] = 255; continue; }
    const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
    for (let k = 0; k < 3; k++) o[di + k] = (sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx) * (1 - fy) + (sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx) * fy;
    o[di + 3] = 255;
  }
  oc.putImageData(od, 0, 0);
  return out;
}

/* Làm trắng nền, xóa bóng: chia cho ảnh nền ước lượng (blur lớn của ảnh đã "đóng" chữ) */
function enhance(c, mode) {
  if (mode === "orig") return c;
  const w = c.width, h = c.height, ctx = c.getContext("2d"), im = ctx.getImageData(0, 0, w, h), d = im.data;
  // ảnh nền ở độ phân giải thấp
  const sm = grayOf(c, 200), bw = sm.w, bh = sm.h;
  // "max filter" để xóa chữ tối, rồi làm mờ
  const mx = new Float32Array(bw * bh), r = 3;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let m = 0; for (let dy = -r; dy <= r; dy++) { const yy = Math.min(bh - 1, Math.max(0, y + dy));
      for (let dx = -r; dx <= r; dx++) { const v = sm.g[yy * bw + Math.min(bw - 1, Math.max(0, x + dx))]; if (v > m) m = v; } }
    mx[y * bw + x] = m;
  }
  const bg = boxBlur(mx, bw, bh, 4);
  const bgAt = (x, y) => { const X = Math.min(bw - 1, x * bw / w), Y = Math.min(bh - 1, y * bh / h), x0 = X | 0, y0 = Y | 0, x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1), fx = X - x0, fy = Y - y0;
    return (bg[y0 * bw + x0] * (1 - fx) + bg[y0 * bw + x1] * fx) * (1 - fy) + (bg[y1 * bw + x0] * (1 - fx) + bg[y1 * bw + x1] * fx) * fy; };
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, b = Math.max(40, bgAt(x, y)), k = 255 / b;
    if (mode === "color") { for (let c2 = 0; c2 < 3; c2++) d[i + c2] = Math.min(255, d[i + c2] * k * 1.02); }
    else { const v = Math.min(255, (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * k); gray[y * w + x] = v; }
  }
  if (mode === "gray") {
    for (let j = 0; j < gray.length; j++) { let v = gray[j]; v = v > 235 ? 255 : Math.max(0, (v - 30) * 255 / 205); d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v; }
  } else if (mode === "bw") {
    // ngưỡng thích nghi trên ảnh đã làm phẳng nền
    const loc = boxBlur(gray, w, h, Math.max(8, Math.round(Math.min(w, h) / 60)));
    for (let j = 0; j < gray.length; j++) { const v = gray[j] < Math.min(200, loc[j] * 0.86) ? 0 : 255; d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v; }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}
function rotate90(c, times) {
  times = ((times % 4) + 4) % 4; if (!times) return c;
  const o = document.createElement("canvas"); const sw = times % 2;
  o.width = sw ? c.height : c.width; o.height = sw ? c.width : c.height;
  const x = o.getContext("2d"); x.translate(o.width / 2, o.height / 2); x.rotate(times * Math.PI / 2); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
const toJpeg = (c, q) => new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), "image/jpeg", q));

export function initChup(D) {
  const { $, esc } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewChup").innerHTML = HTML;
  const st = { pages: [], out: null, busy: false, edit: -1 };
  // page: { name, src(canvas), pts, rot, thumb(url) }
  const status = (t, err) => { $("cpStatus").textContent = t; $("cpStatus").className = "status" + (err ? " err" : ""); };
  const bar = (f) => ($("cpBar").style.width = Math.round(f * 100) + "%");
  const mode = () => document.querySelector('input[name="cpMode"]:checked').value;
  const lock = (on) => {
    st.busy = on;
    $("cpMake").disabled = $("cpClear").disabled = on || !st.pages.length;
    $("cpView").disabled = $("cpSave").disabled = on || !st.out;
  };

  async function thumb(p) {
    const s = 260 / Math.max(p.src.width, p.src.height);
    const t = document.createElement("canvas"); t.width = Math.round(p.src.width * s); t.height = Math.round(p.src.height * s);
    t.getContext("2d").drawImage(p.src, 0, 0, t.width, t.height);
    let r = warp(t, p.pts); r = enhance(r, mode()); r = rotate90(r, p.rot);
    p.thumb = r.toDataURL("image/jpeg", 0.7);
  }
  async function renderThumbs() {
    $("cpPages").hidden = !st.pages.length;
    $("cpThumbs").innerHTML = st.pages.map((p, i) => `<div class="cpthumb"><img src="${p.thumb}" alt="Trang ${i + 1}" data-ed="${i}">
      <div class="row"><b>Trang ${i + 1}</b>${p.found === false ? '<span class="tag warn" title="Không tự tìm được góc">?</span>' : ""}</div>
      <div class="row"><button type="button" data-mv="${i}" data-d="-1" aria-label="Lên trước">◀</button><button type="button" data-rot="${i}" aria-label="Xoay">⟳</button>
      <button type="button" data-ed="${i}" aria-label="Chỉnh góc">✎</button><button type="button" data-del="${i}" aria-label="Xóa">✕</button>
      <button type="button" data-mv="${i}" data-d="1" aria-label="Ra sau">▶</button></div></div>`).join("");
  }
  async function addFiles(list) {
    const fs = [...(list || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|bmp)$/i.test(f.name));
    if (!fs.length) { status("Không có ảnh nào hợp lệ.", true); return; }
    lock(true);
    for (let i = 0; i < fs.length; i++) {
      status(`Đang xử lý ảnh ${i + 1}/${fs.length}…`); bar((i + 1) / fs.length);
      try {
        const src = await loadImage(fs[i]);
        const det = $("cpAuto").checked ? detectCorners(src) : { pts: [[0, 0], [1, 0], [1, 1], [0, 1]], found: true };
        const p = { name: fs[i].name, src, pts: det.pts, found: det.found, rot: 0 };
        await thumb(p); st.pages.push(p);
      } catch (e) { console.error(e); status(`Không đọc được ảnh "${fs[i].name}" (định dạng HEIC trên một số máy chưa hỗ trợ, hãy chọn JPG).`, true); }
      await new Promise((r) => setTimeout(r));
    }
    st.out = null; await renderThumbs();
    const miss = st.pages.filter((p) => p.found === false).length;
    status(`Có ${st.pages.length} trang.${miss ? ` ${miss} trang chưa tìm được góc giấy (dấu ?), bấm ✎ để chỉnh tay.` : ""} Bấm "Tạo PDF".`);
    lock(false);
  }
  const bindDrop = (drop, input) => {
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  };
  bindDrop($("cpDrop"), $("cpInput")); bindDrop($("cpCam"), $("cpCamInput"));
  document.querySelectorAll('input[name="cpMode"]').forEach((r) => r.addEventListener("change", async () => {
    st.out = null; lock(false); for (const p of st.pages) await thumb(p); renderThumbs();
  }));
  $("cpClear").addEventListener("click", () => { st.pages = []; st.out = null; $("cpEditor").hidden = true; renderThumbs(); lock(false); status("Đã xóa hết ảnh."); });

  $("cpThumbs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ed],[data-mv],[data-rot],[data-del]"); if (!b || st.busy) return;
    const d = b.dataset;
    if (d.mv !== undefined) { const i = +d.mv, j = i + +d.d; if (j < 0 || j >= st.pages.length) return; [st.pages[i], st.pages[j]] = [st.pages[j], st.pages[i]]; }
    else if (d.rot !== undefined) { const p = st.pages[+d.rot]; p.rot = (p.rot + 1) % 4; await thumb(p); }
    else if (d.del !== undefined) { st.pages.splice(+d.del, 1); $("cpEditor").hidden = true; }
    else if (d.ed !== undefined) { openEditor(+d.ed); return; }
    st.out = null; lock(false); renderThumbs();
  });

  /* ---------- chỉnh 4 góc ---------- */
  function openEditor(i) {
    st.edit = i; const p = st.pages[i];
    $("cpEditor").hidden = false; $("cpEdTitle").textContent = `Trang ${i + 1}`;
    const c = $("cpCanvas"), s = Math.min(1, 1400 / Math.max(p.src.width, p.src.height));
    c.width = Math.round(p.src.width * s); c.height = Math.round(p.src.height * s);
    c.getContext("2d").drawImage(p.src, 0, 0, c.width, c.height);
    $("cpSvg").setAttribute("viewBox", "0 0 1 1"); $("cpSvg").setAttribute("preserveAspectRatio", "none");
    drawHandles();
    $("cpEditor").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function drawHandles() {
    const p = st.pages[st.edit], svg = $("cpSvg"), r = svg.getBoundingClientRect();
    const rx = 11 / (r.width || 600), ry = 11 / (r.height || 800);
    svg.innerHTML = `<polygon points="${p.pts.map((q) => q.join(",")).join(" ")}"/>` +
      p.pts.map((q, k) => `<ellipse data-k="${k}" cx="${q[0]}" cy="${q[1]}" rx="${rx}" ry="${ry}" style="fill:#fff;stroke:#1e63d6;stroke-width:3;vector-effect:non-scaling-stroke;cursor:grab"/>`).join("");
  }
  let dragK = -1;
  const svg = $("cpSvg");
  const relP = (e) => { const r = svg.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  svg.addEventListener("pointerdown", (e) => {
    const p = st.pages[st.edit]; if (!p) return;
    const q = relP(e); let best = -1, bd = 0.08;
    p.pts.forEach((pt, k) => { const dd = Math.hypot(pt[0] - q[0], pt[1] - q[1]); if (dd < bd) { bd = dd; best = k; } });
    if (best < 0) return; dragK = best; svg.setPointerCapture(e.pointerId); e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => { if (dragK < 0) return; st.pages[st.edit].pts[dragK] = relP(e); drawHandles(); });
  svg.addEventListener("pointerup", () => { dragK = -1; });
  $("cpEdAuto").addEventListener("click", () => { const p = st.pages[st.edit]; const d = detectCorners(p.src); p.pts = d.pts; p.found = d.found; drawHandles(); status(d.found ? "Đã tìm lại góc giấy." : "Không tự tìm được, hãy kéo tay 4 góc.", !d.found); });
  $("cpEdFull").addEventListener("click", () => { const p = st.pages[st.edit]; p.pts = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawHandles(); });
  $("cpEdDone").addEventListener("click", async () => {
    const p = st.pages[st.edit]; p.found = true; await thumb(p); $("cpEditor").hidden = true; st.out = null; lock(false); renderThumbs();
  });
  window.addEventListener("resize", () => { if (!$("cpEditor").hidden) drawHandles(); });

  /* ---------- tạo PDF ---------- */
  $("cpMake").addEventListener("click", async () => {
    if (st.busy || !st.pages.length) return;
    if (!(await D.trialAllow("chup", status))) return;
    lock(true); bar(0);
    try {
      const doc = await PDFLib.PDFDocument.create(), m = mode(), a4 = $("cpA4").checked;
      for (let i = 0; i < st.pages.length; i++) {
        status(`Đang nắn phẳng trang ${i + 1}/${st.pages.length}…`); await new Promise((r) => setTimeout(r, 10));
        const p = st.pages[i];
        let c = warp(p.src, p.pts); c = enhance(c, m); c = rotate90(c, p.rot);
        const jpg = await toJpeg(c, m === "bw" ? 0.6 : m === "gray" ? 0.7 : 0.8);
        const im = await doc.embedJpg(jpg);
        if (a4) {
          const land = c.width > c.height, PW = land ? 841.89 : 595.28, PH = land ? 595.28 : 841.89, M = 14;
          const s = Math.min((PW - 2 * M) / c.width, (PH - 2 * M) / c.height), w = c.width * s, h = c.height * s;
          doc.addPage([PW, PH]).drawImage(im, { x: (PW - w) / 2, y: (PH - h) / 2, width: w, height: h });
        } else {
          const s = 72 / 200; doc.addPage([c.width * s, c.height * s]).drawImage(im, { x: 0, y: 0, width: c.width * s, height: c.height * s });
        }
        c.width = c.height = 0; bar((i + 1) / st.pages.length);
      }
      st.out = await doc.save();
      D.trialUse("chup");
      status(`Đã tạo PDF ${st.pages.length} trang, dung lượng ${D.fmtMB(st.out.length)}. Bấm "Xem PDF" hoặc "Tải PDF".`);
    } catch (e) { console.error(e); status("Lỗi khi tạo PDF: " + (e.message || e), true); }
    lock(false);
  });
  const outName = () => { const d = new Date(); return `ChupGiayTo_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.pdf`; };
  $("cpView").addEventListener("click", () => { if (!st.out) return; const n = outName(); D.openViewer(st.out, n, () => D.offerSave(n, new Blob([st.out], { type: "application/pdf" }))); });
  $("cpSave").addEventListener("click", () => st.out && D.offerSave(outName(), new Blob([st.out], { type: "application/pdf" })));
}
