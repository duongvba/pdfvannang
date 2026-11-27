/* =====================================================================
   Tách PDF theo trang: mỗi trang 1 file, cứ N trang 1 file, theo khoảng "1-3, 4-10", hoặc trích trang thành 1 file.
   ===================================================================== */
const HTML = `
<section class="panel" aria-label="Tách theo trang">
  <div class="drop" id="ttDrop" tabindex="0" role="button" aria-describedby="ttHint">
    <strong>Kéo thả file PDF cần tách vào đây, hoặc bấm để chọn</strong>
    <small id="ttHint">Tách theo số trang, không cần đọc nội dung. Chọn được nhiều file, mỗi file tách theo cùng một cách.</small>
    <span class="file" id="ttFileName"></span>
    <input type="file" id="ttInput" accept="application/pdf,.pdf" multiple hidden>
  </div>
  <div class="namebox">
    <div class="seg" role="radiogroup" aria-label="Cách tách" style="grid-auto-columns:1fr">
      <label><input type="radio" name="ttMode" value="each" checked><span>Mỗi trang 1 file</span></label>
      <label><input type="radio" name="ttMode" value="n"><span>Cứ N trang 1 file</span></label>
      <label><input type="radio" name="ttMode" value="ranges"><span>Theo khoảng trang</span></label>
      <label><input type="radio" name="ttMode" value="pick"><span>Trích trang</span></label>
    </div>
    <div class="lblgrid" data-m="n" hidden><label for="ttN">Số trang mỗi file</label><input type="number" id="ttN" value="2" min="1" max="9999"></div>
    <div class="lblgrid" data-m="ranges" hidden><label for="ttRanges">Các khoảng</label><input type="text" id="ttRanges" placeholder="VD: 1-3, 4-10, 11" spellcheck="false"></div>
    <p class="note" data-m="ranges" hidden>Mỗi khoảng ra 1 file. Dấu phẩy ngăn cách các file, dấu gạch là từ trang… đến trang….</p>
    <div class="lblgrid" data-m="pick" hidden><label for="ttPick">Các trang cần lấy</label><input type="text" id="ttPick" placeholder="VD: 1, 3, 5-7" spellcheck="false"></div>
    <p class="note" data-m="pick" hidden>Các trang được chọn gộp thành 1 file mới, theo đúng thứ tự bạn gõ.</p>
    <div class="preview"><span class="plabel">Kết quả</span><span class="pfile" id="ttPreview">Chọn file để xem trước</span></div>
  </div>
  <div class="actions">
    <button class="btn primary" id="ttRun" type="button" disabled>Tách file</button>
    <button class="btn" id="ttSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="ttBar"></div></div>
  <div class="status" id="ttStatus" role="status">Chưa chọn file.</div>
</section>
<section aria-label="Danh sách file" style="display:grid;gap:10px">
  <div class="tablewrap"><table><thead><tr><th>#</th><th>Tên file</th><th>Trang</th><th class="num">Số trang</th><th></th></tr></thead>
  <tbody id="ttBody"><tr class="example"><td class="num">1</td><td class="mono">HopDong_trang_1-3.pdf</td><td>1-3</td><td class="num">3</td><td>Ví dụ</td></tr></tbody></table></div>
</section>`;

/* "1-3, 5, 7-9" -> [[0,1,2],[4],[6,7,8]] (chỉ số 0), bỏ trang ngoài phạm vi */
export function parseRanges(spec, n) {
  const out = [];
  for (const part of String(spec || "").split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:[-–]\s*(\d+|cuối|cuoi|end))?$/i.exec(part); if (!m) continue;
    let a = +m[1], b = m[2] === undefined ? a : /^\d+$/.test(m[2]) ? +m[2] : n;
    const step = a <= b ? 1 : -1, pages = [];
    for (let i = a; step > 0 ? i <= b : i >= b; i += step) if (i >= 1 && i <= n) pages.push(i - 1);
    if (pages.length) out.push(pages);
  }
  return out;
}
const label = (pages) => { const a = pages[0] + 1, b = pages[pages.length - 1] + 1; return pages.length === 1 ? String(a) : pages.every((p, i) => i === 0 || p === pages[i - 1] + 1) ? `${a}-${b}` : pages.map((p) => p + 1).join(","); };

export function initTachTrang(D) {
  const { $, esc } = D;
  $("viewTachTrang").innerHTML = HTML;
  const st = { files: [], out: null, outName: "", outType: "", busy: false, plan: [] };
  const status = (t, err) => { $("ttStatus").textContent = t; $("ttStatus").className = "status" + (err ? " err" : ""); };
  const mode = () => document.querySelector('input[name="ttMode"]:checked').value;
  const lock = (on) => { st.busy = on; $("ttRun").disabled = on || !st.files.length; $("ttSave").disabled = on || !st.out; };

  function groupsFor(n) {
    const m = mode();
    if (m === "each") return [...Array(n).keys()].map((i) => [i]);
    if (m === "n") { const k = Math.max(1, Math.floor(+$("ttN").value) || 1), g = []; for (let i = 0; i < n; i += k) g.push([...Array(Math.min(k, n - i)).keys()].map((j) => i + j)); return g; }
    if (m === "ranges") return parseRanges($("ttRanges").value, n);
    const all = parseRanges($("ttPick").value, n).flat(); return all.length ? [all] : [];
  }
  function planAll() {
    const multi = st.files.length > 1, plan = [];
    st.files.forEach((f, fi) => {
      const base = f.name.replace(/\.pdf$/i, "");
      for (const g of groupsFor(f.pages)) plan.push({ fi, pages: g, name: mode() === "pick" ? `${base}_trich_${label(g).replace(/,/g, "_")}.pdf` : `${base}_trang_${label(g)}.pdf`, src: multi ? `#${fi + 1}` : "" });
    });
    return plan;
  }
  function preview() {
    st.out = null; lock(false);
    if (!st.files.length) return;
    st.plan = planAll();
    $("ttPreview").textContent = st.plan.length ? `${st.plan.length} file · ${st.plan[0].name}${st.plan.length > 1 ? " …" : ""}` : "Chưa có trang nào hợp lệ – kiểm tra lại số trang";
    $("ttBody").innerHTML = st.plan.slice(0, 300).map((p, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${esc(p.name)}</td><td>${p.src ? p.src + ": " : ""}${esc(label(p.pages))}</td><td class="num">${p.pages.length}</td><td></td></tr>`).join("")
      + (st.plan.length > 300 ? `<tr><td colspan="5">… và ${st.plan.length - 300} file nữa</td></tr>` : "");
  }
  document.querySelectorAll('input[name="ttMode"]').forEach((r) => r.addEventListener("change", () => {
    document.querySelectorAll("#viewTachTrang [data-m]").forEach((e) => (e.hidden = e.dataset.m !== mode())); preview();
  }));
  ["ttN", "ttRanges", "ttPick"].forEach((id) => $(id).addEventListener("input", preview));

  async function pick(list) {
    const fs = [...(list || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!fs.length) { status("Không có file PDF nào.", true); return; }
    fs.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
    lock(true); st.files = [];
    try {
      for (const f of fs) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        st.files.push({ name: f.name, bytes, pages: doc.getPageCount() });
      }
    } catch (e) { console.error(e); status("Không đọc được file: " + (e.message || e), true); lock(false); return; }
    const tot = st.files.reduce((a, f) => a + f.pages, 0);
    $("ttFileName").innerHTML = (fs.length === 1 ? esc(fs[0].name) : `${fs.length} file PDF`) + ` <span class="sz">· ${tot} trang · ${D.fmtMB(fs.reduce((a, f) => a + f.size, 0))}</span>`;
    status(`Đã chọn ${fs.length === 1 ? "file" : fs.length + " file"} (${tot} trang). Chọn cách tách rồi bấm "Tách file".`);
    lock(false); preview();
  }
  const drop = $("ttDrop");
  drop.addEventListener("click", () => $("ttInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("ttInput").click(); } });
  $("ttInput").addEventListener("change", (e) => pick(e.target.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));

  $("ttRun").addEventListener("click", async () => {
    if (st.busy || !st.files.length) return;
    const plan = planAll();
    if (!plan.length) { status("Chưa có trang nào hợp lệ. Kiểm tra lại số trang bạn gõ.", true); return; }
    if (!(await D.trialAllow("tachtrang", status))) return;
    lock(true); $("ttBar").style.width = "0%";
    try {
      const srcs = new Map(), outs = [], used = new Map();
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        if (!srcs.has(p.fi)) srcs.set(p.fi, await PDFLib.PDFDocument.load(st.files[p.fi].bytes, { ignoreEncryption: true, updateMetadata: false }));
        const doc = await PDFLib.PDFDocument.create();
        (await doc.copyPages(srcs.get(p.fi), p.pages)).forEach((pg) => doc.addPage(pg));
        let name = p.name; const k = name.toLowerCase(), c = (used.get(k) || 0) + 1; used.set(k, c); if (c > 1) name = name.replace(/\.pdf$/i, ` (${c}).pdf`);
        outs.push({ name, bytes: await doc.save() });
        if (i % 10 === 0) { $("ttBar").style.width = Math.round(((i + 1) / plan.length) * 100) + "%"; status(`Đang tách ${i + 1}/${plan.length}…`); await new Promise((r) => setTimeout(r)); }
      }
      if (outs.length === 1) { st.out = outs[0].bytes; st.outName = outs[0].name; st.outType = "application/pdf"; }
      else {
        const zip = new JSZip(); outs.forEach((o) => zip.file(o.name, o.bytes, { binary: true }));
        st.out = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
        st.outName = (st.files.length === 1 ? st.files[0].name.replace(/\.pdf$/i, "") : "TachTrang") + `_${outs.length}file.zip`; st.outType = "application/zip";
      }
      st.outs = outs;
      $("ttBody").innerHTML = outs.map((o, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${esc(o.name)}</td><td>${esc(plan[i].src ? plan[i].src + ": " : "")}${esc(label(plan[i].pages))}</td><td class="num">${plan[i].pages.length}</td>
        <td style="white-space:nowrap"><button class="linkbtn" type="button" data-v="${i}">Xem</button><button class="linkbtn" type="button" data-d="${i}">Tải</button></td></tr>`).join("");
      $("ttBar").style.width = "100%";
      D.trialUse("tachtrang", outs.length);
      status(`Xong: ${outs.length} file. Bấm "Tải về" để lưu${outs.length > 1 ? " (file ZIP)" : ""}.`);
    } catch (e) { console.error(e); status("Lỗi khi tách: " + (e.message || e), true); }
    lock(false);
  });
  $("ttBody").addEventListener("click", (e) => {
    const b = e.target.closest(".linkbtn"); if (!b || !st.outs) return;
    const o = st.outs[+(b.dataset.v ?? b.dataset.d)], save = () => D.offerSave(o.name, new Blob([o.bytes], { type: "application/pdf" }));
    if (b.dataset.v !== undefined) D.openViewer(o.bytes, o.name, save); else save();
  });
  $("ttSave").addEventListener("click", () => st.out && D.offerSave(st.outName, new Blob([st.out], { type: st.outType })));
}
