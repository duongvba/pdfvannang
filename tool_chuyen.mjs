/* =====================================================================
   PDF sang Word / PDF sang Excel – màn hình 2 cột: bản gốc | bản chuyển đổi (sửa được), rồi tải .docx / .xlsx
   ===================================================================== */
import { readPages, toWordModel, toTables, toNumber } from "./layout.mjs";

const CSS = `
.cvwrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 900px) { .cvwrap { grid-template-columns: 1fr; } .cvorig { display: none; } .cvwrap.showorig .cvorig { display: block; } }
.cvpane { border: 1px solid var(--line); border-radius: 10px; background: var(--paper); overflow: auto; max-height: 82vh; }
.cvpane h3 { position: sticky; top: 0; z-index: 2; margin: 0; padding: 8px 12px; font: 700 13px var(--font-body); background: var(--sheet); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.cvorig img { display: block; width: calc(100% - 24px); margin: 12px auto; box-shadow: 0 1px 4px rgba(0,0,0,.18); background: #fff; }
.cvdoc { margin: 12px; padding: 36px 34px; background: #fff; color: #111; box-shadow: 0 1px 4px rgba(0,0,0,.18); font-family: "Times New Roman", "Noto Serif", serif; font-size: 13pt; line-height: 1.32; outline: none; min-height: 400px; }
.cvdoc p { margin: 0; white-space: pre-wrap; tab-size: 4; }
.cvdoc table { border-collapse: collapse; width: 100%; min-width: 0 !important; table-layout: fixed; margin: 4px 0; }
.cvdoc table.bd td { border: 1px solid #333; padding: 2px 5px; }
.cvdoc table:not(.bd) td { padding: 0 3px; vertical-align: top; }
.cvdoc table:not(.bd) { outline: 1px dashed #c9d3e3; }
.cvdoc hr.pgbrk { border: none; border-top: 2px dashed #b9c3d0; margin: 18px -34px; }
.cvdoc:focus { box-shadow: 0 0 0 2px #1e63d6; }
.cvsheet { margin: 12px; background: #fff; color: #111; overflow: auto; }
.cvsheet table { border-collapse: collapse; font: 13px Arial, sans-serif; min-width: 0 !important; width: auto; }
.cvsheet td.span { white-space: normal; color: #555; font-style: italic; }
.cvsheet td, .cvsheet th { border: 1px solid #c8ccd2; padding: 3px 6px; white-space: nowrap; min-width: 40px; }
.cvsheet th { background: #eef1f5; color: #555; font-weight: 600; position: sticky; top: 0; }
.cvsheet tr.hd td { background: #fff4d6; font-weight: 700; }
.cvsheet td.n { text-align: right; font-variant-numeric: tabular-nums; }
.cvsheet td:focus { outline: 2px solid #1e63d6; }
.cvtools { display: flex; gap: 6px; flex-wrap: wrap; }
.cvtools button { min-width: 30px; }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const xesc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/* ---------- mô hình -> HTML sửa được ---------- */
function runsHtml(runs) {
  return runs.map((r) => {
    let t = esc(r.text);
    if (r.bold) t = `<b>${t}</b>`; if (r.italic) t = `<i>${t}</i>`;
    return `<span style="font-size:${r.size}pt">${t}</span>`;
  }).join("");
}
function paraHtml(p) {
  const al = p.align === "both" ? "justify" : p.align;
  return `<p style="text-align:${al};margin:${Math.round(p.before || 0)}pt 0 0 ${Math.round(p.left || 0)}pt;text-indent:${Math.round(p.first || 0)}pt">${runsHtml(p.runs) || "<br>"}</p>`;
}
function modelHtml(m) {
  return m.blocks.map((b) => {
    if (b.type === "break") return `<hr class="pgbrk" contenteditable="false">`;
    if (b.type === "p") return paraHtml(b);
    const tot = b.widths.reduce((a, x) => a + x, 0) || 1;
    return `<table class="${b.border ? "bd" : ""}" data-border="${b.border ? 1 : 0}"><colgroup>${b.widths.map((w) => `<col style="width:${((w / tot) * 100).toFixed(2)}%">`).join("")}</colgroup>` +
      b.rows.map((r) => `<tr>${r.map((cell) => `<td>${cell.map(paraHtml).join("") || "<p><br></p>"}</td>`).join("")}</tr>`).join("") + `</table>`;
  }).join("");
}

/* ---------- HTML -> DOCX ---------- */
function rprOf(st) {
  return `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>${st.b ? "<w:b/><w:bCs/>" : ""}${st.i ? "<w:i/><w:iCs/>" : ""}${st.u ? '<w:u w:val="single"/>' : ""}<w:sz w:val="${Math.round(st.size * 2)}"/><w:szCs w:val="${Math.round(st.size * 2)}"/></w:rPr>`;
}
function inlineRuns(node, st, out) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) {
      const parts = ch.nodeValue.replace(/\r?\n/g, " ").split("\t");
      parts.forEach((t, k) => { if (k) out.push(`<w:r>${rprOf(st)}<w:tab/></w:r>`); if (t) out.push(`<w:r>${rprOf(st)}<w:t xml:space="preserve">${xesc(t)}</w:t></w:r>`); });
      continue;
    }
    if (ch.nodeType !== 1) continue;
    const tag = ch.tagName, s2 = { ...st };
    if (tag === "BR") { if (ch.nextSibling) out.push(`<w:r>${rprOf(st)}<w:br/></w:r>`); continue; }   // <br> cuối đoạn chỉ là chỗ giữ của trình duyệt
    if (tag === "B" || tag === "STRONG") s2.b = true;
    if (tag === "I" || tag === "EM") s2.i = true;
    if (tag === "U") s2.u = true;
    const fw = ch.style && ch.style.fontWeight; if (fw && (fw === "bold" || +fw >= 600)) s2.b = true; if (fw === "normal" || fw === "400") s2.b = false;
    if (ch.style && ch.style.fontStyle === "italic") s2.i = true;
    const fs = ch.style && ch.style.fontSize; if (fs) { const v = parseFloat(fs); if (v) s2.size = /px$/.test(fs) ? v * 0.75 : v; }
    inlineRuns(ch, s2, out);
  }
}
const pt = (v) => { const x = parseFloat(v || 0); return /px$/.test(v || "") ? x * 0.75 : x || 0; };
function paraXml(el, baseSize) {
  const st = el.style || {}, runs = [];
  inlineRuns(el, { b: false, i: false, u: false, size: baseSize }, runs);
  const al = { center: "center", right: "right", justify: "both" }[st.textAlign] || "left";
  const ind = Math.round(pt(st.marginLeft) * 20), first = Math.round(pt(st.textIndent) * 20), before = Math.round(pt(st.marginTop) * 20);
  return `<w:p><w:pPr><w:spacing w:before="${Math.max(0, before)}" w:after="0" w:line="264" w:lineRule="auto"/>${ind || first ? `<w:ind w:left="${Math.max(0, ind)}" ${first >= 0 ? `w:firstLine="${first}"` : `w:hanging="${-first}"`}/>` : ""}<w:jc w:val="${al}"/></w:pPr>${runs.join("")}</w:p>`;
}
function blocksXml(container, baseSize, widthTw) {
  const out = [];
  for (const el of container.children) {
    const tag = el.tagName;
    if (tag === "HR") { out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue; }
    if (tag === "TABLE") {
      const bd = el.dataset.border === "1", cols = [...el.querySelectorAll(":scope > colgroup > col")].map((c) => parseFloat(c.style.width) || 0);
      const nCols = Math.max(cols.length, ...[...el.rows].map((r) => r.cells.length)), tot = cols.reduce((a, x) => a + x, 0) || nCols;
      const tw = [...Array(nCols).keys()].map((k) => Math.round(((cols[k] || tot / nCols) / tot) * widthTw));
      const B = (n) => `<w:${n} w:val="${bd ? "single" : "nil"}" w:sz="4" w:space="0" w:color="000000"/>`;
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="${widthTw}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(B).join("")}</w:tblBorders><w:tblCellMar><w:left w:w="${bd ? 80 : 30}" w:type="dxa"/><w:right w:w="${bd ? 80 : 30}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${tw.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`);
      for (const tr of el.rows) {
        out.push("<w:tr>");
        [...tr.cells].forEach((td, k) => {
          const inner = blocksXml(td.querySelector("p,div,table") ? td : wrapP(td), baseSize, tw[k] - 160);
          out.push(`<w:tc><w:tcPr><w:tcW w:w="${tw[k]}" w:type="dxa"/></w:tcPr>${inner || "<w:p/>"}</w:tc>`);
        });
        out.push("</w:tr>");
      }
      out.push("</w:tbl>");
      out.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>');
      continue;
    }
    if (tag === "P" || tag === "DIV" || /^H\d$/.test(tag) || tag === "LI") { if (el.querySelector(":scope > p, :scope > table, :scope > div")) out.push(blocksXml(el, baseSize, widthTw)); else out.push(paraXml(el, baseSize)); continue; }
    out.push(paraXml(el, baseSize));
  }
  return out.join("");
}
function wrapP(td) { const d = document.createElement("div"); const p = document.createElement("p"); p.innerHTML = td.innerHTML; d.appendChild(p); return d; }

async function buildDocx(editor, page, L, R, top) {
  const pw = Math.round(page.w * 20), ph = Math.round(page.h * 20);
  const ml = Math.round(Math.max(36, L) * 20), mr = Math.round(Math.max(36, page.w - R) * 20), mt = Math.round(Math.max(36, top - 6) * 20);
  const widthTw = pw - ml - mr;
  const body = blocksXml(editor, 13, widthTw);
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"/><w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="1134" w:left="${ml}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file("word/document.xml", doc); z.file("word/styles.xml", styles);
  return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
}

/* ---------- giao diện chung ---------- */
export function initChuyen(D, mode) {
  const { $ } = D, P = mode === "word" ? "cw" : "cx", V = mode === "word" ? "viewWord" : "viewExcel";
  if (!document.getElementById("cvCss")) { const s = document.createElement("style"); s.id = "cvCss"; s.textContent = CSS; document.head.appendChild(s); }
  const isW = mode === "word";
  $(V).innerHTML = `
<section class="panel" aria-label="PDF sang ${isW ? "Word" : "Excel"}">
  <div class="drop" id="${P}Drop" tabindex="0" role="button">
    <strong>Kéo thả file PDF vào đây, hoặc bấm để chọn</strong>
    <small>${isW ? "Văn bản hành chính, hợp đồng, công văn… Giữ căn lề, chữ đậm nghiêng, bảng biểu. Đọc được cả file scan." : "Sao kê ngân hàng, bảng kê, bảng giá, báo cáo… Tự chia cột, đổi số kiểu 1.234.567 thành số để tính toán."}</small>
    <span class="file" id="${P}Name"></span>
    <input type="file" id="${P}Input" accept="application/pdf,.pdf" hidden>
  </div>
  ${isW ? "" : `<div class="optrow"><label><input type="radio" name="${P}Merge" value="1" checked> Gộp các trang vào 1 sheet (bỏ dòng tiêu đề lặp lại)</label><label><input type="radio" name="${P}Merge" value="0"> Mỗi trang 1 sheet</label></div>`}
  <div class="actions">
    <button class="btn primary" id="${P}Run" type="button" disabled>Chuyển đổi</button>
    <button class="btn" id="${P}Save" type="button" disabled>Tải file ${isW ? "Word" : "Excel"}</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="${P}Bar"></div></div>
  <div class="status" id="${P}Status" role="status">Chưa chọn file.</div>
</section>
<section id="${P}Work" hidden>
  <div class="cvwrap" id="${P}Wrap">
    <div class="cvpane cvorig"><h3>Bản gốc</h3><div id="${P}Orig"></div></div>
    <div class="cvpane"><h3><span>Bản chuyển đổi – bấm vào để sửa</span><span class="cvtools">${isW ? `<button class="btn sm" type="button" data-cmd="bold" title="Đậm"><b>B</b></button><button class="btn sm" type="button" data-cmd="italic" title="Nghiêng"><i>I</i></button><button class="btn sm" type="button" data-cmd="justifyLeft" title="Căn trái">⇤</button><button class="btn sm" type="button" data-cmd="justifyCenter" title="Căn giữa">↔</button><button class="btn sm" type="button" data-cmd="justifyRight" title="Căn phải">⇥</button><button class="btn sm" type="button" data-cmd="justifyFull" title="Căn đều">☰</button>` : ""}<button class="btn sm orig" type="button" id="${P}Toggle">Xem bản gốc</button></span></h3>
      <div id="${P}Out"></div></div>
  </div>
</section>`;
  const st = { file: null, bytes: null, pages: null, model: null, out: null, busy: false, n: 0 };
  const status = (t, err) => { $(P + "Status").textContent = t; $(P + "Status").className = "status" + (err ? " err" : ""); };
  const lock = (on) => { st.busy = on; $(P + "Run").disabled = on || !st.bytes; $(P + "Save").disabled = on || !st.pages; };

  async function pick(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { status("Hãy chọn file PDF.", true); return; }
    st.file = f; st.bytes = new Uint8Array(await f.arrayBuffer()); st.pages = null; $(P + "Work").hidden = true;
    try { const tk = D.pdfjsLib.getDocument({ data: st.bytes.slice() }); st.n = (await tk.promise).numPages; tk.destroy(); }
    catch (e) { status("Không đọc được file PDF: " + (e.message || e), true); st.bytes = null; lock(false); return; }
    $(P + "Name").innerHTML = `${esc(f.name)} <span class="sz">· ${st.n} trang · ${D.fmtMB(f.size)}</span>`;
    status('Đã chọn file. Bấm "Chuyển đổi".'); lock(false);
  }
  const drop = $(P + "Drop");
  drop.addEventListener("click", () => $(P + "Input").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $(P + "Input").click(); } });
  $(P + "Input").addEventListener("change", (e) => pick(e.target.files[0]));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));
  $(P + "Toggle").addEventListener("click", () => $(P + "Wrap").classList.toggle("showorig"));
  $(V).querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); document.execCommand(b.dataset.cmd, false); }));

  async function renderOrig(limit) {
    const box = $(P + "Orig"); box.innerHTML = "";
    const tk = D.pdfjsLib.getDocument({ data: st.bytes.slice() }), pdf = await tk.promise;
    for (let n = 1; n <= Math.min(pdf.numPages, limit); n++) {
      const page = await pdf.getPage(n), v = page.getViewport({ scale: 1.6 }), c = document.createElement("canvas");
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: x, viewport: v }).promise;
      const im = document.createElement("img"); im.alt = "Trang " + n; im.src = c.toDataURL("image/jpeg", 0.8); c.width = c.height = 0; box.appendChild(im);
    }
    tk.destroy();
  }

  $(P + "Run").addEventListener("click", async () => {
    if (st.busy || !st.bytes) return;
    if (!(await D.trialAllow(mode, status))) return;
    const limit = Math.min(st.n, D.trialLeft(mode));
    lock(true); $(P + "Bar").style.width = "0%";
    try {
      // chỉ đọc số trang còn lượt
      let bytes = st.bytes;
      if (limit < st.n) {
        const src = await PDFLib.PDFDocument.load(st.bytes, { ignoreEncryption: true }), d = await PDFLib.PDFDocument.create();
        (await d.copyPages(src, [...Array(limit).keys()])).forEach((p) => d.addPage(p)); bytes = await d.save();
      }
      st.pages = await readPages(D.pdfjsLib, bytes, {
        onProgress: (t, f) => { status(t); $(P + "Bar").style.width = Math.round(f * 85) + "%"; },
        getOcr: async () => (await D.getOcrWorkers())[0],
      });
      const out = $(P + "Out");
      if (isW) {
        st.model = toWordModel(st.pages);
        out.innerHTML = `<div class="cvdoc" contenteditable="true" spellcheck="false" id="${P}Doc">${modelHtml(st.model)}</div>`;
      } else {
        const merge = document.querySelector(`input[name="${P}Merge"]:checked`).value === "1";
        st.tables = toTables(st.pages, { merge });
        out.innerHTML = st.tables.map((t, ti) => `${st.tables.length > 1 ? `<p class="note" style="margin:10px 12px 0"><b>${esc(t.name)}</b></p>` : ""}<div class="cvsheet"><table data-t="${ti}"><thead><tr><th></th>${[...Array(t.cols).keys()].map((k) => `<th>${String.fromCharCode(65 + (k % 26))}</th>`).join("")}</tr></thead><tbody>` +
          t.rows.map((r, ri) => { const only = !r.table && !r.head && r.cells.slice(1).every((v) => !v);
            return `<tr class="${r.head ? "hd" : ""}"><th>${ri + 1}</th>${only ? `<td contenteditable="true" class="span" colspan="${t.cols}">${esc(r.cells[0])}</td>` : r.cells.map((v) => `<td contenteditable="true" class="${toNumber(v) != null ? "n" : ""}">${esc(v)}</td>`).join("")}</tr>`; }).join("") + `</tbody></table></div>`).join("");
      }
      $(P + "Work").hidden = false;
      await renderOrig(limit);
      $(P + "Bar").style.width = "100%";
      D.trialUse(mode, st.pages.length);
      const ocr = st.pages.filter((p) => p.ocr).length;
      status(`Xong ${st.pages.length} trang${ocr ? ` (có ${ocr} trang scan – nên rà lại chữ)` : ""}. Xem lại bên phải, sửa nếu cần, rồi bấm "Tải file ${isW ? "Word" : "Excel"}".` + (limit < st.n ? ` Bản dùng thử chỉ còn đủ lượt cho ${limit}/${st.n} trang – kích hoạt bản quyền để chuyển hết.` : ""), limit < st.n);
      $(P + "Work").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { console.error(e); status("Lỗi khi chuyển đổi: " + (e.message || e), true); st.pages = null; }
    lock(false);
  });

  $(P + "Save").addEventListener("click", async () => {
    if (!st.pages) return;
    const base = st.file.name.replace(/\.pdf$/i, "");
    try {
      if (isW) {
        const m = st.model, blob = await buildDocx($(P + "Doc"), m.page, m.L, m.R, m.top);
        D.offerSave(base + ".docx", blob);
      } else {
        const sheets = [], info = [];
        [...$(P + "Out").querySelectorAll("table[data-t]")].forEach((tb, ti) => {
          const trs = [...tb.tBodies[0].rows];
          let rows = trs.map((tr) => [...tr.cells].slice(1).map((td) => td.textContent.replace(/\s+/g, " ").trim()));
          const h = trs.findIndex((tr) => tr.classList.contains("hd"));
          if (h > 0) { rows.slice(0, h).forEach((r) => { const t = r.filter(Boolean).join(" "); if (t) info.push([st.tables[ti].name, t]); }); rows = rows.slice(h); }
          const head = h >= 0 ? rows.shift() : rows[0].map((_, k) => String.fromCharCode(65 + (k % 26)));
          const ncol = head.length;
          const isNum = [...Array(ncol).keys()].map((k) => { const v = rows.map((r) => r[k]).filter(Boolean); return v.length && v.filter((x) => toNumber(x) != null).length >= v.length * 0.6; });
          const width = (k) => Math.min(60, Math.max(8, ...[head[k] || "", ...rows.map((r) => r[k] || "")].map((s) => s.length + 2)));
          sheets.push({
            name: st.tables[ti].name.slice(0, 31), cols: head.map((hh, k) => ({ header: hh || "", width: width(k), type: isNum[k] ? "money" : undefined })),
            rows: rows.map((r) => r.map((v, k) => (isNum[k] && toNumber(v) != null ? toNumber(v) : v))),
          });
        });
        if (info.length) sheets.push({ name: "Thông tin chung", cols: [{ header: "Trang", width: 12 }, { header: "Nội dung", width: 90 }], rows: info });
        D.offerSave(base + ".xlsx", await D.buildXlsx(sheets));
      }
    } catch (e) { console.error(e); status("Lỗi khi tạo file: " + (e.message || e), true); }
  });
}
