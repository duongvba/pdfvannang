/* =====================================================================
   PDF sang ảnh JPG/PNG: từng trang thành ảnh, hoặc ghép tất cả thành 1 ảnh dài (gửi Zalo).
   ===================================================================== */
import { parseRanges } from "./tool_tachtrang.mjs";

const HTML = `
<section class="panel" aria-label="PDF sang ảnh">
  <div class="drop" id="anDrop" tabindex="0" role="button" aria-describedby="anHint">
    <strong>Kéo thả file PDF vào đây, hoặc bấm để chọn</strong>
    <small id="anHint">Đổi từng trang thành ảnh để gửi Zalo, dán vào slide, Word, Excel.</small>
    <span class="file" id="anFileName"></span>
    <input type="file" id="anInput" accept="application/pdf,.pdf" hidden>
  </div>
  <div class="namebox">
    <div class="seg" role="radiogroup" aria-label="Kiểu xuất">
      <label><input type="radio" name="anOut" value="each" checked><span>Mỗi trang 1 ảnh</span></label>
      <label><input type="radio" name="anOut" value="long"><span>Ghép thành 1 ảnh dài</span></label>
    </div>
    <div class="lblgrid"><label for="anFmt">Định dạng</label>
      <select id="anFmt"><option value="jpg">JPG – nhẹ, hợp gửi Zalo, email</option><option value="png">PNG – nét nhất, nền trong suốt không mất</option></select></div>
    <div class="lblgrid"><label for="anDpi">Độ nét</label>
      <select id="anDpi"><option value="100">Vừa (100 dpi) – xem trên điện thoại</option><option value="150" selected>Nét (150 dpi) – khuyên dùng</option><option value="220">Rất nét (220 dpi) – phóng to, in</option><option value="300">In ấn (300 dpi) – file nặng</option></select></div>
    <div class="lblgrid"><label for="anPages">Trang</label><input type="text" id="anPages" placeholder="Để trống = tất cả. VD: 1-3, 5" spellcheck="false"></div>
  </div>
  <div class="actions">
    <button class="btn primary" id="anRun" type="button" disabled>Chuyển thành ảnh</button>
    <button class="btn" id="anSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="anBar"></div></div>
  <div class="status" id="anStatus" role="status">Chưa chọn file.</div>
</section>
<section aria-label="Ảnh kết quả"><div class="angrid" id="anGrid"></div></section>`;

const CSS = `
.angrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.angrid figure { margin: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--sheet); padding: 8px; display: grid; gap: 6px; min-width: 0; }
.angrid img { width: 100%; height: 190px; object-fit: contain; background: var(--paper); border-radius: 6px; }
.angrid figcaption { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.angrid figcaption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.angrid.long { grid-template-columns: minmax(0, 420px); }
.angrid.long img { height: auto; max-height: 70vh; }
`;

const blobOf = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

export function initAnh(D) {
  const { $, esc } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewAnh").innerHTML = HTML;
  const st = { file: null, bytes: null, n: 0, imgs: [], out: null, outName: "", outType: "", busy: false };
  const status = (t, err) => { $("anStatus").textContent = t; $("anStatus").className = "status" + (err ? " err" : ""); };
  const lock = (on) => { st.busy = on; $("anRun").disabled = on || !st.bytes; $("anSave").disabled = on || !st.out; };
  const reset = () => { st.imgs.forEach((i) => URL.revokeObjectURL(i.url)); st.imgs = []; st.out = null; $("anGrid").innerHTML = ""; lock(false); };
  ["anFmt", "anDpi", "anPages"].forEach((id) => $(id).addEventListener("input", reset));
  document.querySelectorAll('input[name="anOut"]').forEach((r) => r.addEventListener("change", reset));

  async function pick(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { status("Hãy chọn file PDF.", true); return; }
    reset(); st.file = f; st.bytes = new Uint8Array(await f.arrayBuffer());
    try { const tk = D.pdfjsLib.getDocument({ data: st.bytes.slice() }); const pdf = await tk.promise; st.n = pdf.numPages; tk.destroy(); }
    catch (e) { console.error(e); status("Không đọc được file PDF: " + (e.message || e), true); st.bytes = null; lock(false); return; }
    $("anFileName").innerHTML = `${esc(f.name)} <span class="sz">· ${st.n} trang · ${D.fmtMB(f.size)}</span>`;
    status(`File có ${st.n} trang. Chọn kiểu ảnh rồi bấm "Chuyển thành ảnh".`); lock(false);
  }
  const drop = $("anDrop");
  drop.addEventListener("click", () => $("anInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("anInput").click(); } });
  $("anInput").addEventListener("change", (e) => pick(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));

  $("anRun").addEventListener("click", async () => {
    if (st.busy || !st.bytes) return;
    const spec = $("anPages").value.trim();
    const pages = spec ? parseRanges(spec, st.n).flat() : [...Array(st.n).keys()];
    if (!pages.length) { status("Số trang không hợp lệ.", true); return; }
    if (!(await D.trialAllow("anh", status))) return;
    reset(); lock(true); $("anBar").style.width = "0%";
    const png = $("anFmt").value === "png", type = png ? "image/png" : "image/jpeg", ext = png ? "png" : "jpg";
    const long = document.querySelector('input[name="anOut"]:checked').value === "long";
    let dpi = +$("anDpi").value;
    const base = st.file.name.replace(/\.pdf$/i, "");
    const task = D.pdfjsLib.getDocument({ data: st.bytes.slice() });
    try {
      const pdf = await task.promise, canv = [];
      if (long) {   // ảnh dài: giới hạn chiều cao (trình duyệt điện thoại không vẽ được ảnh quá lớn)
        let h = 0; for (const p of pages) { const v = (await pdf.getPage(p + 1)).getViewport({ scale: 1 }); h += v.height; }
        const maxPx = 16000; if ((h * dpi) / 72 > maxPx) dpi = Math.max(60, Math.floor((maxPx * 72) / h));
      }
      for (let i = 0; i < pages.length; i++) {
        status(`Đang chuyển trang ${pages[i] + 1} (${i + 1}/${pages.length})…`);
        const page = await pdf.getPage(pages[i] + 1), vp = page.getViewport({ scale: dpi / 72 });
        const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: x, viewport: vp }).promise; page.cleanup();
        if (long) canv.push(c);
        else {
          const b = await blobOf(c, type, 0.9); c.width = c.height = 0;
          st.imgs.push({ name: `${base}_trang_${pages[i] + 1}.${ext}`, blob: b, url: URL.createObjectURL(b) });
        }
        $("anBar").style.width = Math.round(((i + 1) / pages.length) * (long ? 80 : 100)) + "%";
      }
      if (long) {
        const gap = Math.round(dpi / 10), W = Math.max(...canv.map((c) => c.width)), H = canv.reduce((a, c) => a + c.height, 0) + gap * (canv.length - 1);
        const L = document.createElement("canvas"); L.width = W; L.height = H;
        const x = L.getContext("2d"); x.fillStyle = "#d9dde3"; x.fillRect(0, 0, W, H);
        let y = 0; for (const c of canv) { x.drawImage(c, Math.round((W - c.width) / 2), y); y += c.height + gap; c.width = c.height = 0; }
        const b = await blobOf(L, type, 0.88); L.width = L.height = 0;
        st.imgs.push({ name: `${base}_${pages.length}trang.${ext}`, blob: b, url: URL.createObjectURL(b) });
      }
      if (st.imgs.length === 1) { st.out = st.imgs[0].blob; st.outName = st.imgs[0].name; }
      else {
        const zip = new JSZip(); st.imgs.forEach((im) => zip.file(im.name, im.blob));
        st.out = await zip.generateAsync({ type: "blob", compression: "STORE" }); st.outName = `${base}_anh_${st.imgs.length}trang.zip`;
      }
      $("anGrid").classList.toggle("long", long);
      $("anGrid").innerHTML = st.imgs.map((im, i) => `<figure><a href="${im.url}" target="_blank" rel="noopener"><img src="${im.url}" alt="${esc(im.name)}"></a>
        <figcaption><span title="${esc(im.name)}">${esc(im.name)} · ${D.fmtMB(im.blob.size)}</span><button class="linkbtn" type="button" data-i="${i}">Tải</button></figcaption></figure>`).join("");
      $("anBar").style.width = "100%";
      D.trialUse("anh", st.imgs.length);
      status(`Xong: ${st.imgs.length} ảnh${long && dpi < +$("anDpi").value ? ` (đã giảm độ nét còn ${dpi} dpi vì ảnh quá dài)` : ""}. Bấm "Tải về"${st.imgs.length > 1 ? " để lưu file ZIP, hoặc Tải từng ảnh bên dưới" : ""}. Trên điện thoại: chạm giữ vào ảnh để lưu hoặc chia sẻ.`);
    } catch (e) { console.error(e); status("Lỗi khi chuyển: " + (e.message || e), true); }
    await task.destroy();
    lock(false);
  });
  $("anGrid").addEventListener("click", (e) => { const b = e.target.closest(".linkbtn"); if (b) { const im = st.imgs[+b.dataset.i]; D.offerSave(im.name, im.blob); } });
  $("anSave").addEventListener("click", () => st.out && D.offerSave(st.outName, st.out));
}
