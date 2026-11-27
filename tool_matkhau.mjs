/* =====================================================================
   Mật khẩu PDF hàng loạt
   - Đặt: mật khẩu chung hoặc ngẫu nhiên từng file, có thể tách file (theo nhãn / mỗi trang / N trang),
          đặt tên theo mẫu, phân quyền in/sao chép/sửa. Xuất ZIP + Excel danh sách mật khẩu.
   - Gỡ: thử nhiều mật khẩu, hoặc lấy từ file Excel đã xuất; gỡ cả hạn chế in/sao chép.
   ===================================================================== */
import { encryptPdf, decryptPdf, isEncrypted, hasSignature, randomPassword } from "./pdfcrypt.mjs";
import { labelValue } from "./tool_nhan.mjs";
import { readXlsx } from "./tool_tron.mjs";

const HTML = `
<section class="panel" aria-label="Mật khẩu PDF">
  <div class="seg" role="radiogroup" aria-label="Chế độ">
    <label><input type="radio" name="mkMode" value="lock" checked><span>🔒 Đặt mật khẩu</span></label>
    <label><input type="radio" name="mkMode" value="unlock"><span>🔓 Gỡ mật khẩu</span></label>
  </div>
  <div class="drop" id="mkDrop" tabindex="0" role="button">
    <strong id="mkDropTitle">Kéo thả một hoặc nhiều file PDF vào đây, hoặc bấm để chọn</strong>
    <small id="mkDropHint">Mọi xử lý chạy trên máy bạn. Mật khẩu không được gửi đi đâu.</small>
    <span class="file" id="mkFileName"></span>
    <input type="file" id="mkInput" accept="application/pdf,.pdf,.xlsx" multiple hidden>
  </div>

  <div id="mkLock" class="namebox" style="gap:12px">
    <label class="optline"><input type="checkbox" id="mkSplit"> <b>Tách thành từng file PDF</b> rồi đặt mật khẩu cho từng file</label>
    <div id="mkSplitBox" hidden style="display:grid;gap:10px;padding-left:24px">
      <div class="lblgrid"><label for="mkHow">Cách tách</label>
        <select id="mkHow"><option value="label">Theo nhãn (VD: mỗi phiếu lương 1 file)</option><option value="each">Mỗi trang 1 file</option><option value="n">Cứ N trang 1 file</option></select></div>
      <div class="lblgrid" data-h="label"><label for="mkL1">Nhãn chính</label><input type="text" id="mkL1" value="Họ và tên" spellcheck="false"></div>
      <div class="lblgrid" data-h="label"><label for="mkL2">Nhãn phụ</label><input type="text" id="mkL2" placeholder="VD: Mã nhân viên (không bắt buộc)" spellcheck="false"></div>
      <div class="lblgrid" data-h="n" hidden><label for="mkN">Số trang mỗi file</label><input type="number" id="mkN" value="2" min="1"></div>
    </div>
    <div class="lblgrid"><label for="mkTpl">Mẫu tên file</label><input type="text" id="mkTpl" value="{tengoc}" spellcheck="false"></div>
    <p class="note" id="mkTplHint" style="margin:0">Mã dùng được: <code>{tengoc}</code> tên file gốc, <code>{stt}</code> số thứ tự.</p>
    <div class="preview"><span class="plabel">Tên file sẽ là</span><span class="pfile" id="mkPreview"></span></div>

    <div class="seg" role="radiogroup" aria-label="Kiểu mật khẩu">
      <label><input type="radio" name="mkPwKind" value="same" checked><span>Mật khẩu chung</span></label>
      <label><input type="radio" name="mkPwKind" value="rand"><span>Ngẫu nhiên từng file</span></label>
    </div>
    <div class="lblgrid" data-k="same"><label for="mkPw">Mật khẩu</label><span class="pwbox"><input type="password" id="mkPw" autocomplete="new-password" spellcheck="false"><button class="btn sm" type="button" id="mkEye" aria-label="Hiện mật khẩu">👁</button></span></div>
    <div data-k="rand" hidden style="display:grid;gap:10px">
      <div class="lblgrid"><label for="mkLen">Số ký tự</label><input type="number" id="mkLen" value="8" min="4" max="16"></div>
      <div class="lblgrid"><label for="mkChars">Loại ký tự</label>
        <select id="mkChars"><option value="num">Chỉ số (dễ gõ trên điện thoại)</option><option value="alnum" selected>Chữ và số</option><option value="sym">Chữ, số và ký tự đặc biệt</option></select></div>
      <p class="note" style="margin:0">Tự bỏ các ký tự dễ nhầm như 0/O, 1/l/I. Ví dụ: <code id="mkSample"></code></p>
    </div>

    <details class="perm"><summary>Phân quyền (không bắt buộc)</summary>
      <div class="optrow" style="margin-top:8px"><label><input type="checkbox" id="mkPrint" checked> Cho phép in</label><label><input type="checkbox" id="mkCopy" checked> Cho phép sao chép nội dung</label><label><input type="checkbox" id="mkEdit" checked> Cho phép chỉnh sửa</label></div>
      <div class="lblgrid" id="mkOwnRow" hidden><label for="mkOwn">Mật khẩu quản trị</label><input type="text" id="mkOwn" placeholder="Để trống: tự tạo, ghi vào file Excel" spellcheck="false"></div>
      <p class="note" style="margin:4px 0 0">Người có mật khẩu quản trị mới gỡ được các hạn chế này.</p>
    </details>
  </div>

  <div id="mkUnlock" class="namebox" hidden style="gap:10px">
    <div class="lblgrid"><label for="mkTry">Mật khẩu</label><textarea id="mkTry" rows="3" placeholder="Mỗi dòng một mật khẩu. App sẽ thử lần lượt cho từng file." spellcheck="false"></textarea></div>
    <div class="lblgrid"><label>Hoặc file Excel</label><span class="xlrow"><button class="btn sm" type="button" id="mkXlBtn">📋 Chọn file Excel danh sách mật khẩu</button><span id="mkXlInfo" class="note"></span><input type="file" id="mkXlIn" accept=".xlsx" hidden></span></div>
    <p class="note" style="margin:0">Excel cần có cột <b>Tên file</b> và cột <b>Mật khẩu</b> (như file DanhSach_MatKhau.xlsx app xuất ra). App tự lấy đúng mật khẩu cho từng file theo tên, không cần gõ. Cũng có thể thả file Excel chung với các file PDF.<br>File chỉ bị cấm in/sao chép (mở không cần mật khẩu) sẽ được gỡ hạn chế. Chỉ dùng với tài liệu bạn có quyền.</p>
  </div>

  <div class="actions">
    <button class="btn primary" id="mkRun" type="button" disabled>Đặt mật khẩu</button>
    <button class="btn" id="mkSave" type="button" disabled>Tải về</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="mkBar"></div></div>
  <div class="status" id="mkStatus" role="status">Chưa chọn file.</div>
</section>
<section aria-label="Kết quả" style="display:grid;gap:10px">
  <div class="summary" id="mkSummary"></div>
  <div class="tablewrap"><table><thead><tr><th>#</th><th>Tên file</th><th id="mkColPw">Mật khẩu</th><th>Trạng thái</th><th></th></tr></thead>
  <tbody id="mkBody"></tbody></table></div>
</section>`;

const CSS = `
.pwbox { display: flex; gap: 6px; } .pwbox input { flex: 1; min-width: 0; }
#viewMatKhau textarea { width: 100%; font: 14px var(--font-mono); padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); resize: vertical; }
#viewMatKhau textarea:focus-visible { outline: 2px solid var(--stamp); outline-offset: 1px; }
.xlrow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .xlrow .note { margin: 0; }
.optline { display: block; font-size: 14px; padding: 10px 12px; border: 1px solid var(--line, #d8dde6); border-radius: 10px; background: var(--card, #fff); cursor: pointer; }
.optline:has(input:checked) { border-color: var(--accent, #c0392b); } .optline input { margin-right: 6px; vertical-align: -2px; }
#viewMatKhau > section { min-width: 0; } #viewMatKhau select, #viewMatKhau input, #viewMatKhau textarea { min-width: 0; max-width: 100%; }
#viewMatKhau .tablewrap { max-width: 100%; overflow-x: auto; } #viewMatKhau table { min-width: 560px; }
details.perm > summary { cursor: pointer; font: 600 14px var(--font-body); }
#mkBody .pw { font-family: ui-monospace, Consolas, monospace; letter-spacing: .04em; }
`;

export function initMatKhau(D) {
  const { $, esc, fold } = D;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  $("viewMatKhau").innerHTML = HTML;
  const st = { files: [], xlsxMap: null, outs: [], out: null, outName: "", outType: "", busy: false };
  const status = (t, err) => { $("mkStatus").textContent = t; $("mkStatus").className = "status" + (err ? " err" : ""); };
  const mode = () => document.querySelector('input[name="mkMode"]:checked').value;
  const pwKind = () => document.querySelector('input[name="mkPwKind"]:checked').value;
  const lock = (on) => { st.busy = on; $("mkRun").disabled = on || !st.files.length; $("mkSave").disabled = on || !st.out; };
  const reset = () => {
    const had = !!st.out; st.out = null; st.outs = []; $("mkBody").innerHTML = ""; $("mkSummary").innerHTML = ""; $("mkBar").style.width = "0%";
    if (had && st.files.length) status(mode() === "lock" ? 'Đã đổi tùy chọn. Bấm "Đặt mật khẩu" để làm lại.' : 'Đã đổi tùy chọn. Bấm "Gỡ mật khẩu" để làm lại.');
    lock(false);
  };

  /* ---------- giao diện ---------- */
  function syncUi() {
    const m = mode(), split = $("mkSplit").checked, how = $("mkHow").value;
    $("mkLock").hidden = m !== "lock"; $("mkUnlock").hidden = m !== "unlock";
    $("mkRun").textContent = m === "lock" ? "Đặt mật khẩu" : "Gỡ mật khẩu";
    $("mkDropTitle").textContent = m === "lock" ? "Kéo thả một hoặc nhiều file PDF vào đây, hoặc bấm để chọn" : "Kéo thả các file PDF cần gỡ (kèm file Excel nếu có), hoặc bấm để chọn";
    $("mkDropHint").textContent = m === "lock" ? "Mọi xử lý chạy trên máy bạn. Mật khẩu không được gửi đi đâu." : "Thả các file PDF cần gỡ (có thể kèm file Excel danh sách mật khẩu).";
    $("mkSplitBox").hidden = !split;
    document.querySelectorAll("#mkSplitBox [data-h]").forEach((e) => (e.hidden = e.dataset.h !== how));
    document.querySelectorAll("#mkLock [data-k]").forEach((e) => (e.hidden = e.dataset.k !== pwKind()));
    $("mkOwnRow").hidden = $("mkPrint").checked && $("mkCopy").checked && $("mkEdit").checked;
    const codes = ["{tengoc}", "{stt}"].concat(split && how === "label" ? ["{nhan1}", "{nhan2}"] : split ? ["{trang}"] : []);
    $("mkTplHint").innerHTML = "Mã dùng được: " + codes.map((c) => `<code>${c}</code>`).join(" ") + (split && how === "label" ? " – nhãn chính, nhãn phụ" : "");
    $("mkColPw").textContent = m === "lock" ? "Mật khẩu" : "Mật khẩu đúng";
    $("mkSample").textContent = randomPassword(Math.min(16, Math.max(4, +$("mkLen").value || 8)), $("mkChars").value);
    preview(); reset();
  }
  document.querySelectorAll('input[name="mkMode"], input[name="mkPwKind"]').forEach((r) => r.addEventListener("change", syncUi));
  // mật khẩu riêng từng file mà chỉ có 1 file nhiều trang -> gần như chắc chắn cần tách (VD: phiếu lương mỗi người 1 trang)
  document.querySelector('input[name="mkPwKind"][value="rand"]').addEventListener("change", () => autoSplit(true));
  async function autoSplit(fromKind) {
    if (mode() !== "lock" || pwKind() !== "rand" || $("mkSplit").checked || st.files.length !== 1) return false;
    try {
      const n = (await PDFLib.PDFDocument.load(st.files[0].bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
      if (n < 2) return false;
      $("mkSplit").checked = true; $("mkSplit").dispatchEvent(new Event("change"));
      status(`File có ${n} trang nên app đã bật "Tách thành từng file PDF" để mỗi người một file, một mật khẩu riêng. Bỏ tick nếu chỉ muốn khóa nguyên file.`);
      return true;
    } catch {}
  }
  ["mkSplit", "mkHow", "mkLen", "mkChars", "mkPrint", "mkCopy", "mkEdit"].forEach((id) => $(id).addEventListener("change", syncUi));
  ["mkTpl", "mkL1", "mkL2", "mkN", "mkPw", "mkOwn", "mkTry"].forEach((id) => $(id).addEventListener("input", () => { preview(); reset(); }));
  $("mkSplit").addEventListener("change", () => { if ($("mkSplit").checked && $("mkTpl").value === "{tengoc}") $("mkTpl").value = $("mkHow").value === "label" ? "{nhan1}" : "{tengoc}_{trang}"; else if (!$("mkSplit").checked && /\{nhan|\{trang/.test($("mkTpl").value)) $("mkTpl").value = "{tengoc}"; syncUi(); });
  $("mkHow").addEventListener("change", () => { $("mkTpl").value = $("mkHow").value === "label" ? "{nhan1}" : "{tengoc}_{trang}"; syncUi(); });
  $("mkEye").addEventListener("click", () => { const i = $("mkPw"); i.type = i.type === "password" ? "text" : "password"; });

  function nameFrom(tpl, v) {
    let s = tpl.replace(/\{(tengoc|stt|nhan1|nhan2|trang)\}/gi, (_, k) => v[k.toLowerCase()] ?? "");
    s = s.replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().replace(/^[_\-. ]+|[_\-. ]+$/g, "");
    return (s || "file_" + (v.stt || "1")).slice(0, 150);
  }
  function preview() {
    const ten = st.files[0] ? st.files[0].name.replace(/\.pdf$/i, "") : "HopDong";
    $("mkPreview").textContent = nameFrom($("mkTpl").value || "{tengoc}", { tengoc: ten, stt: "001", nhan1: "NGUYỄN VĂN AN", nhan2: "NV001", trang: "1-2" }) + ".pdf";
  }

  /* ---------- chọn file ---------- */
  const keyOf = (n) => String(n).trim().normalize("NFC").toLowerCase().replace(/\.pdf$/, "");
  async function loadXlsx(xl) {
    try {
      const rows = await readXlsx(await xl.arrayBuffer());
      const hr = rows.findIndex((r) => r.some((h) => /ten file|^file$/.test(fold(String(h)).trim())));
      const head = (rows[hr] || []).map((h) => fold(String(h)).trim());
      const ci = head.findIndex((h) => /ten file|^file$/.test(h)), pi = head.findIndex((h) => /^(mat khau|password|pass)$/.test(h)), oi = head.findIndex((h) => /quan tri/.test(h));
      if (hr < 0 || ci < 0 || pi < 0) { st.xlsxMap = null; $("mkXlInfo").textContent = "File Excel cần có cột \"Tên file\" và cột \"Mật khẩu\"."; return false; }
      st.xlsxMap = new Map();
      rows.slice(hr + 1).forEach((r) => { if (r[ci] && r[pi] !== "" && r[pi] != null) st.xlsxMap.set(keyOf(r[ci]), [r[pi], oi >= 0 ? r[oi] : ""].filter((x) => x !== "" && x != null).map(String)); });
      $("mkXlInfo").textContent = `✓ ${xl.name}: ${st.xlsxMap.size} mật khẩu`;
      return true;
    } catch (e) { console.error(e); st.xlsxMap = null; $("mkXlInfo").textContent = "Không đọc được file Excel."; return false; }
  }
  $("mkXlBtn").addEventListener("click", () => $("mkXlIn").click());
  $("mkXlIn").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (await loadXlsx(f)) { reset(); status(st.files.length ? `Đã nạp danh sách mật khẩu. ${matchInfo()} Bấm "Gỡ mật khẩu".` : "Đã nạp danh sách mật khẩu. Giờ chọn các file PDF cần gỡ."); }
  });
  const matchInfo = () => { if (!st.xlsxMap || !st.files.length) return ""; const n = st.files.filter((f) => st.xlsxMap.has(keyOf(f.name))).length; return `Khớp tên ${n}/${st.files.length} file.`; };
  async function pick(list) {
    const all = [...(list || [])];
    const pdfs = all.filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf"), xl = all.find((f) => /\.xlsx$/i.test(f.name));
    if (xl) await loadXlsx(xl);
    if (!pdfs.length) { status(xl && st.xlsxMap ? (st.files.length ? `Đã nạp danh sách mật khẩu. ${matchInfo()}` : "Đã nạp danh sách mật khẩu. Giờ chọn các file PDF cần gỡ.") : "Hãy chọn file PDF.", !(xl && st.xlsxMap)); return; }
    pdfs.sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
    st.files = []; for (const f of pdfs) st.files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    const enc = st.files.filter((f) => isEncrypted(f.bytes)).length, sig = st.files.filter((f) => hasSignature(f.bytes)).length;
    $("mkFileName").innerHTML = (pdfs.length === 1 ? esc(pdfs[0].name) : `${pdfs.length} file PDF`) + (st.xlsxMap ? ` + danh sách ${st.xlsxMap.size} mật khẩu` : "") + ` <span class="sz">· ${D.fmtMB(pdfs.reduce((a, f) => a + f.size, 0))}</span>`;
    if (mode() === "lock" && enc === st.files.length) { document.querySelector('input[name="mkMode"][value="unlock"]').checked = true; }
    syncUi();
    const notes = [];
    if (mode() === "lock" && enc) notes.push(`${enc} file đang có mật khẩu, cần gỡ trước (chuyển sang "Gỡ mật khẩu")`);
    if (mode() === "lock" && sig) notes.push(`⚠ ${sig} file có chữ ký số: đặt mật khẩu sẽ làm chữ ký mất hiệu lực`);
    if (mode() === "unlock" && enc < st.files.length) notes.push(`${st.files.length - enc} file không có mật khẩu`);
    if (mode() === "unlock" && st.xlsxMap) notes.push(matchInfo().replace(/\.$/, ""));
    const auto = pwKind() === "rand" && (await autoSplit());
    if (!auto) status((mode() === "lock" ? "Đã chọn file. Chọn kiểu mật khẩu rồi bấm \"Đặt mật khẩu\"." : (st.xlsxMap ? "Đã chọn file, mật khẩu lấy từ file Excel. Bấm \"Gỡ mật khẩu\"." : "Đã chọn file. Nhập mật khẩu hoặc chọn file Excel danh sách mật khẩu, rồi bấm \"Gỡ mật khẩu\".")) + (notes.length ? " " + notes.join(". ") + "." : ""), !!(mode() === "lock" && sig));
    lock(false);
  }
  const drop = $("mkDrop");
  drop.addEventListener("click", () => $("mkInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("mkInput").click(); } });
  $("mkInput").addEventListener("change", (e) => pick(e.target.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));

  /* ---------- tách file ---------- */
  async function planSplit() {
    const how = $("mkHow").value, groups = [];
    for (let fi = 0; fi < st.files.length; fi++) {
      const f = st.files[fi];
      if (!$("mkSplit").checked) { groups.push({ fi, pages: null }); continue; }
      const doc = await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false }), n = doc.getPageCount();
      if (how === "each") { for (let i = 0; i < n; i++) groups.push({ fi, pages: [i] }); continue; }
      if (how === "n") { const k = Math.max(1, +$("mkN").value || 1); for (let i = 0; i < n; i += k) groups.push({ fi, pages: [...Array(Math.min(k, n - i)).keys()].map((j) => i + j) }); continue; }
      // theo nhãn
      const l1 = $("mkL1").value.trim(), l2 = $("mkL2").value.trim();
      const task = D.pdfjsLib.getDocument({ data: f.bytes.slice() }), pdf = await task.promise;
      let cur = null;
      for (let p = 1; p <= pdf.numPages; p++) {
        status(`Đang đọc ${f.name} – trang ${p}/${pdf.numPages}…`);
        const page = await pdf.getPage(p); let txt = await D.pageLines(page);
        if (D.isImagePage(txt)) txt = await D.ocrPage((await D.getOcrWorkers())[0], page, true);
        page.cleanup();
        const v1 = l1 ? labelValue(txt, l1, fold) : "", v2 = l2 ? labelValue(txt, l2, fold) : "";
        if (!cur || (v1 && v1 !== cur.v1)) { cur = { fi, pages: [p - 1], v1, v2 }; groups.push(cur); }
        else { cur.pages.push(p - 1); if (!cur.v2 && v2) cur.v2 = v2; }
      }
      await task.destroy();
    }
    return groups;
  }
  const rangeTxt = (pages) => (!pages ? "" : pages.length === 1 ? String(pages[0] + 1) : `${pages[0] + 1}-${pages[pages.length - 1] + 1}`);

  /* ---------- chạy ---------- */
  $("mkRun").addEventListener("click", async () => {
    if (st.busy || !st.files.length) return;
    if (mode() === "lock") return runLock();
    return runUnlock();
  });

  async function runLock() {
    const same = pwKind() === "same", pw = $("mkPw").value;
    if (same && !pw) { status("Hãy nhập mật khẩu.", true); $("mkPw").focus(); return; }
    const todo = st.files.filter((f) => !isEncrypted(f.bytes));
    if (!todo.length) { status("Các file đều đang có mật khẩu. Hãy gỡ mật khẩu trước.", true); return; }
    const paid = !same || $("mkSplit").checked;
    if (!(await D.trialAllow(paid ? "matkhau" : "free", status))) return;
    reset(); lock(true); $("mkBar").style.width = "0%";
    try {
      const perms = { print: $("mkPrint").checked, copy: $("mkCopy").checked, modify: $("mkEdit").checked };
      const restricted = !(perms.print && perms.copy && perms.modify);
      st.files = st.files.filter((f) => !isEncrypted(f.bytes));
      let groups = await planSplit();
      if ($("mkSplit").checked && $("mkHow").value === "label" && !groups.some((g) => g.v1)) { status(`Không tìm thấy nhãn "${$("mkL1").value}" trong file. Kiểm tra lại chữ của nhãn.`, true); lock(false); return; }
      const left = paid ? D.trialLeft("matkhau") : Infinity, total = groups.length;
      if (groups.length > left) groups = groups.slice(0, left);
      const srcs = new Map(), used = new Map(), rows = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i], f = st.files[g.fi];
        let bytes = f.bytes;
        if (g.pages) {
          if (!srcs.has(g.fi)) srcs.set(g.fi, await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false }));
          const d = await PDFLib.PDFDocument.create(); (await d.copyPages(srcs.get(g.fi), g.pages)).forEach((p) => d.addPage(p)); bytes = await d.save();
        }
        const userPw = same ? pw : randomPassword(Math.min(16, Math.max(4, +$("mkLen").value || 8)), $("mkChars").value);
        const ownerPw = restricted ? ($("mkOwn").value.trim() || randomPassword(12, "alnum")) : "";
        const out = await encryptPdf(bytes, { userPw, ownerPw, perms }, PDFLib);
        let name = nameFrom($("mkTpl").value || "{tengoc}", { tengoc: f.name.replace(/\.pdf$/i, ""), stt: String(i + 1).padStart(3, "0"), nhan1: g.v1 || "", nhan2: g.v2 || "", trang: rangeTxt(g.pages) });
        const k = name.toLowerCase(), c = (used.get(k) || 0) + 1; used.set(k, c); if (c > 1) name += ` (${c})`;
        rows.push({ name: name + ".pdf", bytes: out, plain: bytes, pw: userPw, own: ownerPw, src: f.name, pages: g.pages ? rangeTxt(g.pages) : "Tất cả", v1: g.v1 || "", v2: g.v2 || "", warn: $("mkSplit").checked && $("mkHow").value === "label" && !g.v1 ? "Không thấy nhãn" : "" });
        $("mkBar").style.width = Math.round(((i + 1) / groups.length) * 95) + "%";
        if (i % 5 === 0) { status(`Đang đặt mật khẩu ${i + 1}/${groups.length}…`); await new Promise((r) => setTimeout(r)); }
      }
      // Excel danh sách
      const split = $("mkSplit").checked, lbl = split && $("mkHow").value === "label";
      const cols = [{ header: "STT", width: 6, type: "int" }, { header: "Tên file", width: 40 }, { header: "Mật khẩu", width: 18, type: "text" }];
      const lbl2 = lbl && !!$("mkL2").value.trim();
      if (lbl) cols.push({ header: $("mkL1").value || "Nhãn chính", width: 28 });
      if (lbl2) cols.push({ header: $("mkL2").value, width: 16, type: "text" });
      cols.push({ header: "File gốc", width: 30 }, { header: "Trang", width: 9, type: "text" });
      if (restricted) cols.push({ header: "Mật khẩu quản trị", width: 18, type: "text" });
      const xrows = rows.map((r, i) => [i + 1, r.name, r.pw].concat(lbl ? [r.v1] : [], lbl2 ? [r.v2] : [], [r.src, r.pages], restricted ? [r.own] : []));
      const xlsx = await D.buildXlsx([{ name: "Mật khẩu", cols, rows: xrows }]);
      const zip = new JSZip(); rows.forEach((r) => zip.file(r.name, r.bytes, { binary: true }));
      zip.file("DanhSach_MatKhau.xlsx", xlsx);
      st.out = await zip.generateAsync({ type: "blob", compression: "STORE" }); st.outType = "application/zip";
      st.outName = (st.files.length === 1 ? st.files[0].name.replace(/\.pdf$/i, "") : "PDF") + "_mat_khau.zip";
      st.outs = rows; st.xlsx = xlsx;
      renderLock(rows);
      $("mkBar").style.width = "100%";
      if (paid) D.trialUse("matkhau", rows.length);
      const cut = total - rows.length;
      status(`Xong ${rows.length} file. Bấm "Tải về": file ZIP gồm các PDF đã khóa và DanhSach_MatKhau.xlsx. ⚠ Không gửi file Excel kèm các file PDF – gửi mật khẩu cho từng người qua kênh khác (Zalo, tin nhắn).` + (cut ? ` Bản dùng thử chỉ đủ lượt cho ${rows.length}/${total} file – kích hoạt bản quyền để làm hết.` : ""), !!cut);
    } catch (e) { console.error(e); status("Lỗi khi đặt mật khẩu: " + (e.message || e), true); }
    lock(false);
  }
  let showPw = false;
  function renderLock(rows) {
    $("mkSummary").innerHTML = `<span class="pill">${rows.length} file đã khóa</span><span class="pill ok">AES-256</span><button class="btn sm" type="button" id="mkShow">${showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}</button><button class="btn sm" type="button" id="mkXlsx">Tải riêng file Excel</button>`;
    $("mkBody").innerHTML = rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td class="mono">${esc(r.name)}</td><td class="pw">${showPw ? esc(r.pw) : "••••••••"}</td><td>${r.warn ? `<span class="tag warn">${esc(r.warn)}</span>` : '<span class="tag ok">Đã khóa</span>'}</td><td><button class="linkbtn" type="button" data-p="${i}">Xem</button> <button class="linkbtn" type="button" data-d="${i}">Tải</button></td></tr>`).join("");
    $("mkShow").addEventListener("click", () => { showPw = !showPw; renderLock(rows); });
    $("mkXlsx").addEventListener("click", () => D.offerSave("DanhSach_MatKhau.xlsx", st.xlsx));
  }

  async function runUnlock() {
    const list = $("mkTry").value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!(await D.trialAllow("free", status))) return;
    reset(); lock(true); $("mkBar").style.width = "0%";
    const rows = [];
    try {
      for (let i = 0; i < st.files.length; i++) {
        const f = st.files[i];
        status(`Đang gỡ ${i + 1}/${st.files.length}: ${f.name}…`);
        const fromX = st.xlsxMap ? st.xlsxMap.get(keyOf(f.name)) || [] : [];
        try {
          const r = await decryptPdf(f.bytes, [...fromX.map(String), ...list], PDFLib);
          rows.push({ name: f.name, bytes: r.bytes, ok: true, msg: r.password ? (r.owner ? "Đã gỡ (mật khẩu quản trị)" : fromX.includes(r.password) ? "Đã gỡ (mật khẩu từ Excel)" : "Đã gỡ") : "Đã gỡ hạn chế", pw: r.password });
        } catch (e) {
          rows.push({ name: f.name, ok: false, code: e.code, msg: e.code === "password" ? (list.length || fromX.length ? "Sai mật khẩu" : "Cần mật khẩu") : e.code === "notenc" ? "Không có mật khẩu" : e.message, pw: "" });
          if (!["password", "notenc", "unsupported"].includes(e.code)) console.error(e);
        }
        $("mkBar").style.width = Math.round(((i + 1) / st.files.length) * 100) + "%";
        await new Promise((r) => setTimeout(r));
      }
      const ok = rows.filter((r) => r.ok);
      st.outs = ok;
      if (ok.length === 1) { st.out = new Blob([ok[0].bytes], { type: "application/pdf" }); st.outName = ok[0].name.replace(/\.pdf$/i, "") + "_da_go.pdf"; }
      else if (ok.length) { const zip = new JSZip(); ok.forEach((r) => zip.file(r.name, r.bytes, { binary: true })); st.out = await zip.generateAsync({ type: "blob", compression: "STORE" }); st.outName = "PDF_da_go_mat_khau.zip"; }
      $("mkSummary").innerHTML = `<span class="pill ok">${ok.length} file đã gỡ</span>` + (rows.length - ok.length ? `<span class="pill warn">${rows.length - ok.length} file chưa gỡ được</span>` : "");
      $("mkBody").innerHTML = rows.map((r, i) => `<tr class="${r.ok || r.code === "notenc" ? "" : "check"}"><td class="num">${i + 1}</td><td class="mono">${esc(r.name)}</td><td class="pw">${r.pw ? esc(r.pw) : r.ok ? "(không cần)" : ""}</td><td><span class="tag ${r.ok ? "ok" : r.code === "notenc" ? "" : "warn"}">${esc(r.msg)}</span></td><td>${r.ok ? `<button class="linkbtn" type="button" data-v="${i}">Xem</button>` : ""}</td></tr>`).join("");
      st.unlockRows = rows;
      const bad = rows.some((r) => r.code === "password" || r.code === "unsupported");
      status(ok.length ? `Xong: gỡ được ${ok.length}/${rows.length} file. Bấm "Tải về".` + (rows.some((r) => r.code === "password") ? " File sai mật khẩu: nhập thêm mật khẩu (mỗi dòng một) rồi bấm lại." : "") : rows.some((r) => r.code === "password") ? "Chưa gỡ được file nào. Kiểm tra lại mật khẩu." : "Các file không có mật khẩu, không cần gỡ.", bad);
    } catch (e) { console.error(e); status("Lỗi khi gỡ mật khẩu: " + (e.message || e), true); }
    lock(false);
  }
  $("mkBody").addEventListener("click", (e) => {
    const b = e.target.closest(".linkbtn"); if (!b) return;
    if (b.dataset.d !== undefined) { const r = st.outs[+b.dataset.d]; D.offerSave(r.name, new Blob([r.bytes], { type: "application/pdf" })); }
    if (b.dataset.p !== undefined) { const r = st.outs[+b.dataset.p]; D.openViewer(r.plain, `${r.name} · mật khẩu: ${r.pw}`, () => D.offerSave(r.name, new Blob([r.bytes], { type: "application/pdf" }))); }
    if (b.dataset.v !== undefined) { const r = st.unlockRows[+b.dataset.v]; D.openViewer(r.bytes, r.name, () => D.offerSave(r.name, new Blob([r.bytes], { type: "application/pdf" }))); }
  });
  $("mkSave").addEventListener("click", () => st.out && D.offerSave(st.outName, st.out));
  syncUi();
}
