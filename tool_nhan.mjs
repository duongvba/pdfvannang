/* =====================================================================
   Tách PDF theo nhãn tự chọn: phiếu lương, giấy báo, chứng chỉ…
   Trang có nhãn (VD "Họ và tên:") bắt đầu một file mới, đặt tên theo giá trị sau nhãn.
   ===================================================================== */
const SUGGEST = ["Họ và tên", "Họ tên", "Mã nhân viên", "Mã NV", "Bộ phận", "Số hợp đồng", "Tên khách hàng", "Kính gửi"];

const HTML = `
<section class="panel" aria-label="Tách theo nhãn">
  <div class="drop" id="nhDrop" tabindex="0" role="button" aria-describedby="nhHint">
    <strong>Kéo thả một hoặc nhiều file PDF vào đây, hoặc bấm để chọn</strong>
    <small id="nhHint">Phiếu lương, giấy báo, giấy mời, chứng chỉ… in nối tiếp trong 1 file. Đọc được cả file scan.</small>
    <span class="file" id="nhFileName"></span>
    <input type="file" id="nhInput" accept="application/pdf,.pdf" multiple hidden>
  </div>
  <div class="namebox">
    <div class="namehead"><strong>Nhãn dùng để tách và đặt tên</strong><small>Gõ đúng chữ in trên giấy, ngay trước thông tin cần lấy. Không cần gõ dấu hai chấm.</small></div>
    <div class="lblgrid">
      <label for="nhLabel1">Nhãn chính (bắt buộc)</label><input type="text" id="nhLabel1" value="Họ và tên" spellcheck="false">
      <label for="nhLabel2">Nhãn phụ (không bắt buộc)</label><input type="text" id="nhLabel2" placeholder="VD: Mã nhân viên" spellcheck="false">
    </div>
    <div class="chips" id="nhSuggest" style="display:flex;flex-wrap:wrap;gap:6px"></div>
    <div class="lblgrid">
      <label for="nhTpl">Mẫu tên file</label><input type="text" id="nhTpl" value="{nhan1}" spellcheck="false">
    </div>
    <p class="note">Mã dùng được: <code>{nhan1}</code> nhãn chính, <code>{nhan2}</code> nhãn phụ, <code>{stt}</code> số thứ tự (001, 002…). VD: <code>{stt}_{nhan1}_{nhan2}</code> hoặc <code>PhieuLuong_T11_{nhan1}</code>.</p>
    <div class="preview"><span class="plabel">Tên file sẽ là</span><span class="pfile" id="nhPreview"></span><span class="psrc">ví dụ minh họa</span></div>
    <div class="optrow">
      <label><input type="checkbox" id="nhEach"> Mỗi trang là 1 file (không gộp trang tiếp theo)</label>
    </div>
  </div>
  <div class="actions">
    <button class="btn" id="nhTest" type="button" disabled>Thử 10 file đầu</button>
    <button class="btn primary" id="nhRun" type="button" disabled>Tách toàn bộ</button>
    <button class="btn" id="nhZip" type="button" disabled>Tải ZIP kết quả</button>
    <button class="btn" id="nhStop" type="button" hidden>Dừng</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="nhBar"></div></div>
  <div class="status" id="nhStatus" role="status">Chưa chọn file.</div>
</section>
<section aria-label="Kết quả tách theo nhãn" style="display:grid;gap:10px">
  <div class="summary" id="nhSummary"></div>
  <div class="tablewrap"><table>
    <thead><tr><th>#</th><th id="nhH1">Nhãn chính</th><th id="nhH2">Nhãn phụ</th><th>Trang</th><th>Tên file</th><th>Trạng thái</th><th></th></tr></thead>
    <tbody id="nhBody"><tr class="example"><td class="num">1</td><td>NGUYỄN VĂN AN</td><td>NV001</td><td class="num">1</td><td class="mono">NGUYỄN VĂN AN.pdf</td><td>Ví dụ</td><td></td></tr></tbody>
  </table></div>
</section>`;

/* lấy giá trị sau nhãn: cùng dòng, hoặc dòng kế tiếp nếu cùng dòng trống */
function labelRe(label, fold) {
  const f = fold(label.trim()).replace(/[:：]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp("(?:^|[^a-z0-9])" + f + "[ \\t]*[:;.]?[ \\t]*([^\\r\\n]*)(?:\\r?\\n[ \\t]*([^\\r\\n]*))?", "g");
}
export function labelValue(text, label, fold) {
  if (!label.trim()) return "";
  const t = text.normalize("NFC"), ft = fold(t);
  const re = labelRe(label, fold);
  let m;
  while ((m = re.exec(ft))) {
    for (const gi of [1, 2]) {
      if (m[gi] === undefined) continue;
      const start = ft.indexOf(m[gi], m.index + (gi === 2 ? m[0].length - m[gi].length : 0));
      let v = t.slice(start, start + m[gi].length);
      const p = v.indexOf("   "); if (p >= 0) v = v.slice(0, p);
      v = v.trim().replace(/^[:;.\-|_ ]+|[:;.\-|_ ]+$/g, "");
      if (v.length >= 2 && !/^\(.*\)$/.test(v)) return v;
    }
  }
  return "";
}


export function initNhan(D) {
  const { $, esc, fold } = D;
  $("viewNhan").innerHTML = HTML;
  const st = { files: [], results: [], zip: null, running: false, stop: false };
  const LS = (k) => "tachpdf_nh_" + k;
  for (const id of ["nhLabel1", "nhLabel2", "nhTpl"]) {
    try { const v = localStorage.getItem(LS(id)); if (v !== null) $(id).value = v; } catch {}
    $(id).addEventListener("input", () => { try { localStorage.setItem(LS(id), $(id).value); } catch {} preview(); });
  }
  $("nhSuggest").innerHTML = SUGGEST.map((s) => `<button class="chip" type="button" data-s="${esc(s)}">${esc(s)}</button>`).join("");
  $("nhSuggest").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const target = !$("nhLabel1").value.trim() || document.activeElement === $("nhLabel1") ? "nhLabel1"
      : document.activeElement === $("nhLabel2") ? "nhLabel2" : ($("nhLabel1").value.trim() ? "nhLabel2" : "nhLabel1");
    $(target).value = b.dataset.s; $(target).dispatchEvent(new Event("input"));
  });

  const status = (t, err) => { $("nhStatus").textContent = t; $("nhStatus").className = "status" + (err ? " err" : ""); };
  const lock = (on) => {
    st.running = on;
    $("nhTest").disabled = $("nhRun").disabled = on || !st.files.length;
    $("nhZip").disabled = on || !st.zip; $("nhStop").hidden = !on;
    ["nhLabel1", "nhLabel2", "nhTpl", "nhEach"].forEach((id) => ($(id).disabled = on));
  };
  function nameFrom(tpl, v) {
    let s = tpl.replace(/\{(nhan1|nhan2|stt)\}/gi, (_, k) => v[k.toLowerCase()] || "");
    s = s.replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().replace(/^[_\-. ]+|[_\-. ]+$/g, "").replace(/[_\- ]{2,}/g, (m) => m.trim()[0] || " ");
    if (s.length > 150) s = s.slice(0, 150).trim();
    return s;
  }
  function preview() {
    $("nhPreview").textContent = (nameFrom($("nhTpl").value || "{nhan1}", { nhan1: "NGUYỄN VĂN AN", nhan2: "NV001", stt: "001" }) || "KHONG_RO_TEN") + ".pdf";
    $("nhH1").textContent = $("nhLabel1").value.trim() || "Nhãn chính";
    $("nhH2").textContent = $("nhLabel2").value.trim() || "Nhãn phụ";
  }
  preview();

  async function pick(list) {
    const fs = [...(list || [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!fs.length) { status("Không có file PDF nào. Hãy chọn file .pdf.", true); return; }
    fs.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
    st.files = [];
    for (const f of fs) st.files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    st.zip = null; st.results = []; render();
    const mb = fs.reduce((a, f) => a + f.size, 0) / 1048576;
    $("nhFileName").innerHTML = (fs.length === 1 ? esc(fs[0].name) : `${fs.length} file PDF`) + ` <span class="sz">· ${mb.toFixed(1).replace(".", ",")} MB</span>`;
    status("Đã chọn file. Kiểm tra nhãn rồi bấm \"Thử 10 file đầu\".");
    lock(false);
  }
  const drop = $("nhDrop");
  drop.addEventListener("click", () => $("nhInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("nhInput").click(); } });
  $("nhInput").addEventListener("change", (e) => pick(e.target.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));

  const getValue = (text, label) => labelValue(text, label, fold);

  function render() {
    $("nhBody").innerHTML = st.results.map((r, i) => `<tr class="${r.ok ? "" : "check"}">
      <td class="num">${i + 1}</td><td>${esc(r.v1)}</td><td>${esc(r.v2)}</td><td class="num">${esc(r.trangHien)}</td>
      <td class="mono">${esc(r.file)}</td><td><span class="tag ${r.ok ? "ok" : "warn"}">${esc(r.msg)}</span></td>
      <td style="white-space:nowrap"><button class="linkbtn" type="button" data-view="${i}">Xem</button><button class="linkbtn" type="button" data-i="${i}">Tải</button></td></tr>`).join("");
    const n = st.results.length, bad = st.results.filter((r) => !r.ok).length;
    $("nhSummary").innerHTML = n ? `<span class="pill">${n} file</span><span class="pill ok">${n - bad} đạt</span>` + (bad ? `<span class="pill warn">${bad} cần kiểm tra</span>` : "") : "";
  }
  $("nhBody").addEventListener("click", (e) => {
    const b = e.target.closest(".linkbtn"); if (!b) return;
    const r = st.results[+(b.dataset.view ?? b.dataset.i)]; if (!r) return;
    const save = () => D.offerSave(r.file, new Blob([r.bytes], { type: "application/pdf" }));
    if (b.dataset.view !== undefined) D.openViewer(r.bytes, r.file, save); else save();
  });
  $("nhStop").addEventListener("click", () => { st.stop = true; status("Đang dừng…"); });
  $("nhZip").addEventListener("click", () => st.zip && D.offerSave((st.files.length === 1 ? st.files[0].name.replace(/\.pdf$/i, "") : "TachTheoNhan") + "_tach.zip", st.zip));
  $("nhTest").addEventListener("click", () => run(10));
  $("nhRun").addEventListener("click", () => run(0));

  async function run(limit) {
    if (!st.files.length || st.running) return;
    const l1 = $("nhLabel1").value.trim(), l2 = $("nhLabel2").value.trim(), tpl = $("nhTpl").value.trim() || "{nhan1}";
    if (!l1) { status("Hãy nhập nhãn chính, ví dụ \"Họ và tên\".", true); $("nhLabel1").focus(); return; }
    if (!(await D.trialAllow("nhan", status))) return;
    const each = $("nhEach").checked, left = D.trialLeft("nhan");
    if (left !== Infinity) limit = limit ? Math.min(limit, left) : left;
    st.stop = false; st.zip = null; st.results = []; render(); lock(true); $("nhBar").style.width = "0%";
    try {
      const groups = [];
      const t0 = Date.now();
      outer: for (let fi = 0; fi < st.files.length; fi++) {
        const task = D.pdfjsLib.getDocument({ data: st.files[fi].bytes.slice() });
        const pdf = await task.promise;
        for (let n = 1; n <= pdf.numPages; n++) {
          if (st.stop) { await task.destroy(); break outer; }
          const page = await pdf.getPage(n);
          let txt = await D.pageLines(page), ocr = false;
          if (D.isImagePage(txt)) {
            const ws = await D.getOcrWorkers();
            status(`Đang đọc trang ${n}/${pdf.numPages} (file scan, ${Math.round((Date.now() - t0) / 1000)}s)…`);
            txt = await D.ocrPage(ws[0], page, true); ocr = true;
          }
          page.cleanup();
          const v1 = getValue(txt, l1), v2 = l2 ? getValue(txt, l2) : "";
          const last = groups[groups.length - 1];
          const sameAsLast = last && last.fi === fi && v1 && last.v1 === v1;
          if (!last || last.fi !== fi || each || (v1 && !sameAsLast)) {
            if (limit && groups.length >= limit) { await task.destroy(); break outer; }
            groups.push({ fi, pages: [n - 1], v1, v2, ocr });
          } else {
            last.pages.push(n - 1);
            if (!last.v2 && v2) last.v2 = v2;
            if (ocr) last.ocr = true;
          }
          $("nhBar").style.width = Math.round(50 * (fi + n / pdf.numPages) / st.files.length) + "%";
          if (n % 5 === 0) { status(`Đang đọc trang ${n}/${pdf.numPages}…`); await new Promise((r) => setTimeout(r)); }
        }
        await task.destroy();
      }
      if (!groups.some((g) => g.v1)) {
        status(`Không tìm thấy nhãn "${l1}" trong file. Kiểm tra lại chữ của nhãn (gõ đúng như in trên giấy).`, true);
        lock(false); return;
      }
      status("Đang tách file…");
      const srcs = new Map(), used = new Map(), zip = new JSZip();
      const rows = [];
      for (let i = 0; i < groups.length; i++) {
        if (st.stop) break;
        const g = groups[i];
        if (!srcs.has(g.fi)) srcs.set(g.fi, await PDFLib.PDFDocument.load(st.files[g.fi].bytes, { ignoreEncryption: true, updateMetadata: false }));
        const doc = await PDFLib.PDFDocument.create();
        (await doc.copyPages(srcs.get(g.fi), g.pages)).forEach((p) => doc.addPage(p));
        const bytes = await doc.save();
        let name = nameFrom(tpl, { nhan1: g.v1, nhan2: g.v2, stt: String(i + 1).padStart(3, "0") }) || `KHONG_RO_TEN_${String(i + 1).padStart(3, "0")}`;
        const k = name.toLowerCase(), c = (used.get(k) || 0) + 1; used.set(k, c);
        if (c > 1) name += ` (${c})`;
        const ok = !!g.v1 && !g.ocr;
        const msg = !g.v1 ? `Không thấy nhãn "${l1}"` : g.ocr ? "OK (file scan) – nên kiểm tra tên" : "OK";
        const p = g.pages, trang = p.length > 1 ? `${p[0] + 1}-${p[p.length - 1] + 1}` : String(p[0] + 1);
        const r = { v1: g.v1, v2: g.v2, file: name + ".pdf", bytes, ok, msg, trang, nguon: st.files[g.fi].name,
          trangHien: st.files.length > 1 ? `#${g.fi + 1}: ${trang}` : trang };
        rows.push(r); zip.file(r.file, bytes, { binary: true });
        if (i % 10 === 0 || i === groups.length - 1) {
          $("nhBar").style.width = Math.round(50 + 45 * (i + 1) / groups.length) + "%";
          status(`Đang tách ${i + 1}/${groups.length}…`); await new Promise((r) => setTimeout(r));
        }
      }
      const xlsx = await D.buildXlsx([{ name: "Danh sách", cols: [
        { header: "STT", width: 6, type: "int" }, { header: l1, width: 32 }, { header: l2 || "Nhãn phụ", width: 18, type: "text" },
        { header: "File gốc", width: 28 }, { header: "Trang", width: 8, type: "text" }, { header: "Tên file", width: 40 }, { header: "Trạng thái", width: 28 }],
        rows: rows.map((r, i) => [i + 1, r.v1, r.v2, r.nguon, r.trang, r.file, r.msg]) }]);
      zip.file("DanhSach.xlsx", xlsx);
      st.zip = await zip.generateAsync({ type: "blob", compression: "STORE" });
      st.results = rows; render(); D.trialUse("nhan", rows.length);
      $("nhBar").style.width = "100%";
      const bad = rows.filter((r) => !r.ok).length;
      status(`${st.stop ? "Đã dừng. " : ""}Xong ${rows.length} file${limit && limit === left ? " (đã dùng hết lượt dùng thử, kích hoạt bản quyền để tách hết)" : limit ? " (chạy thử)" : ""}.${bad ? ` ${bad} dòng cần kiểm tra.` : ""} Bấm "Tải ZIP kết quả" để lưu (kèm DanhSach.xlsx).`);
    } catch (err) {
      console.error(err);
      status("Lỗi khi xử lý: " + (err && err.message ? err.message : err), true);
    }
    lock(false);
  }
}
