/* =====================================================================
   Đọc hóa đơn điện tử XML (chuẩn TT78 / NĐ123 – HDon/DLHDon) -> bảng kê Excel.
   Nhận nhiều file .xml hoặc file .zip chứa xml. Chính xác tuyệt đối vì lấy từ dữ liệu gốc.
   ===================================================================== */
const HTML = `
<section class="panel" aria-label="Đọc hóa đơn XML">
  <div class="drop" id="xmDrop" tabindex="0" role="button" aria-describedby="xmHint">
    <strong>Kéo thả các file hóa đơn XML (hoặc file ZIP) vào đây, hoặc bấm để chọn</strong>
    <small id="xmHint">File XML tải từ cổng thuế hoặc email nhà cung cấp gửi kèm hóa đơn. Lập bảng kê chính xác 100%, không cần đọc PDF.</small>
    <span class="file" id="xmFileName"></span>
    <input type="file" id="xmInput" accept=".xml,.zip,text/xml,application/xml,application/zip" multiple hidden>
  </div>
  <div class="actions">
    <button class="btn primary" id="xmRun" type="button" disabled>Lập bảng kê</button>
    <button class="btn" id="xmSave" type="button" disabled>Tải Excel</button>
  </div>
  <div class="progress" aria-hidden="true"><div id="xmBar"></div></div>
  <div class="status" id="xmStatus" role="status">Chưa chọn file.</div>
</section>
<section aria-label="Kết quả" style="display:grid;gap:10px">
  <div class="summary" id="xmSummary"></div>
  <div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Ký hiệu</th><th>Số HĐ</th><th>Ngày</th><th>Người bán</th><th>Người mua</th><th class="num">Tiền hàng</th><th class="num">Thuế</th><th class="num">Tổng cộng</th><th>Kiểm tra</th></tr></thead>
    <tbody id="xmBody"><tr class="example"><td class="num">1</td><td>1C26TAA</td><td class="mono">00000123</td><td>15/11/2026</td><td>CÔNG TY TNHH MẪU THỬ A</td><td>CỬA HÀNG VĂN PHÒNG PHẨM B</td><td class="num">12.500.000</td><td class="num">1.000.000</td><td class="num">13.500.000</td><td>Ví dụ</td></tr></tbody>
  </table></div>
</section>`;

/* ---------- đọc XML ---------- */
const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] || null;
function find(el, name) { if (!el) return null; const all = el.getElementsByTagNameNS("*", name); return all.length ? all[0] : null; }
const txt = (el) => (el ? el.textContent.trim() : "");
const num = (s) => { s = String(s || "").trim(); if (!s) return null; const v = Number(s.replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
const fmt = (v) => (v == null ? "" : Math.round(v).toLocaleString("vi-VN"));
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : s || ""; };

export function parseInvoiceXml(xmlText, fileName) {
  const doc = new DOMParser().parseFromString(xmlText.replace(/^﻿/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return { ok: false, file: fileName, msg: "File XML hỏng hoặc không đúng định dạng" };
  const dl = find(doc, "DLHDon");
  if (!dl) return { ok: false, file: fileName, msg: "Không phải hóa đơn điện tử theo TT78 (không có DLHDon)" };
  const tt = kid(dl, "TTChung"), nd = kid(dl, "NDHDon"), nb = kid(nd, "NBan"), nm = kid(nd, "NMua"), toan = kid(nd, "TToan");
  const items = kids(kid(nd, "DSHHDVu"), "HHDVu").map((h) => ({
    stt: txt(kid(h, "STT")), tchat: txt(kid(h, "TChat")), ma: txt(kid(h, "MHHDVu")), ten: txt(kid(h, "THHDVu")), dvt: txt(kid(h, "DVTinh")),
    sl: num(txt(kid(h, "SLuong"))), dg: num(txt(kid(h, "DGia"))), ck: num(txt(kid(h, "STCKhau"))), tt: num(txt(kid(h, "ThTien"))), ts: txt(kid(h, "TSuat")),
  }));
  const rates = kids(kid(toan, "THTTLTSuat"), "LTSuat").map((l) => ({ ts: txt(kid(l, "TSuat")), tien: num(txt(kid(l, "ThTien"))), thue: num(txt(kid(l, "TThue"))) }));
  const tienHang = num(txt(kid(toan, "TgTCThue"))), thue = num(txt(kid(toan, "TgTThue"))), tong = num(txt(kid(toan, "TgTTTBSo")));
  const ts = [...new Set(rates.map((r) => r.ts).filter(Boolean).concat(rates.length ? [] : items.map((i) => i.ts).filter(Boolean)))].join(", ");
  const r = {
    ok: true, file: fileName,
    mau: txt(kid(tt, "KHMSHDon")), kh: txt(kid(tt, "KHHDon")), so: txt(kid(tt, "SHDon")), ngay: txt(kid(tt, "NLap")),
    tien_te: txt(kid(tt, "DVTTe")) || "VND", ty_gia: num(txt(kid(tt, "TGia"))), httt: txt(kid(tt, "HTTToan")),
    banTen: txt(kid(nb, "Ten")), banMst: txt(kid(nb, "MST")), banDc: txt(kid(nb, "DChi")),
    muaTen: txt(kid(nm, "Ten")) || txt(kid(nm, "HVTNMHang")), muaMst: txt(kid(nm, "MST")), muaDc: txt(kid(nm, "DChi")), muaNguoi: txt(kid(nm, "HVTNMHang")),
    tienHang, thue, tong, ts, chu: txt(kid(toan, "TgTTTBChu")), cqt: txt(find(doc, "MCCQT")), items, rates, notes: [],
  };
  // kiểm tra số liệu
  const sumItems = items.filter((i) => i.tt != null && !/^(3|4)$/.test(i.tchat)).reduce((a, i) => a + i.tt, 0)
    - items.filter((i) => i.tt != null && i.tchat === "3").reduce((a, i) => a + i.tt, 0);
  if (tienHang != null && items.length && Math.abs(sumItems - tienHang) > 1) r.notes.push(`Tổng dòng hàng ${fmt(sumItems)} ≠ tiền hàng ${fmt(tienHang)}`);
  if (tienHang != null && thue != null && tong != null && Math.abs(tienHang + thue - tong) > 1) {
    const ttckm = num(txt(kid(toan, "TTCKTMai"))) || 0;
    if (Math.abs(tienHang + thue - ttckm - tong) > 1) r.notes.push("Tiền hàng + thuế ≠ tổng thanh toán");
  }
  if (!r.cqt) r.notes.push("Không có mã cơ quan thuế");
  if (!r.so) r.notes.push("Thiếu số hóa đơn");
  return r;
}

export function initXml(D) {
  const { $, esc } = D;
  const style = document.createElement("style");
  style.textContent = "#viewXml table { min-width: 1000px; } #viewXml td:nth-child(5), #viewXml td:nth-child(6) { min-width: 210px; } #viewXml td.num, #viewXml td:nth-child(4) { white-space: nowrap; } #viewXml td:last-child { min-width: 160px; }";
  document.head.appendChild(style);
  $("viewXml").innerHTML = HTML;
  const st = { files: [], rows: [], xlsx: null, busy: false };
  const status = (t, err) => { $("xmStatus").textContent = t; $("xmStatus").className = "status" + (err ? " err" : ""); };
  const lock = (on) => { st.busy = on; $("xmRun").disabled = on || !st.files.length; $("xmSave").disabled = on || !st.xlsx; };

  async function pick(list) {
    const fs = [...(list || [])].filter((f) => /\.(xml|zip)$/i.test(f.name));
    if (!fs.length) { status("Hãy chọn file .xml hoặc .zip.", true); return; }
    st.files = fs; st.xlsx = null; st.rows = [];
    $("xmFileName").innerHTML = (fs.length === 1 ? esc(fs[0].name) : `${fs.length} file`) + ` <span class="sz">· ${D.fmtMB(fs.reduce((a, f) => a + f.size, 0))}</span>`;
    status('Đã chọn file. Bấm "Lập bảng kê".'); lock(false);
  }
  const drop = $("xmDrop");
  drop.addEventListener("click", () => $("xmInput").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("xmInput").click(); } });
  $("xmInput").addEventListener("change", (e) => pick(e.target.files));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files));

  async function readAll() {
    const out = [];
    for (const f of st.files) {
      if (/\.zip$/i.test(f.name)) {
        const z = await JSZip.loadAsync(await f.arrayBuffer());
        const names = Object.keys(z.files).filter((n) => /\.xml$/i.test(n) && !z.files[n].dir).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
        for (const n of names) out.push({ name: n.split("/").pop(), text: await z.files[n].async("string") });
      } else out.push({ name: f.name, text: await f.text() });
    }
    return out;
  }

  $("xmRun").addEventListener("click", async () => {
    if (st.busy || !st.files.length) return;
    lock(true); $("xmBar").style.width = "0%";
    try {
      const all = await readAll();
      if (!all.length) { status("Không tìm thấy file XML nào (kể cả trong file ZIP).", true); lock(false); return; }
      if (!(await D.trialAllow("xml", status))) { lock(false); return; }
      let rows = [], cut = 0; const bad = [];
      all.forEach((x, i) => { const r = parseInvoiceXml(x.text, x.name); (r.ok ? rows : bad).push(r); if (i % 20 === 0) $("xmBar").style.width = Math.round(((i + 1) / all.length) * 90) + "%"; });
      // trùng hóa đơn
      const seen = new Map();
      for (const r of rows) {
        const k = [r.banMst, r.mau, r.kh, r.so].join("|");
        if (seen.has(k)) { r.notes.push(`Trùng với file ${seen.get(k)}`); r.dup = true; } else seen.set(k, r.file);
      }
      const left = D.trialLeft("xml");
      if (rows.length > left) { cut = rows.length - left; rows = rows.slice(0, left); }
      rows.sort((a, b) => (a.ngay || "").localeCompare(b.ngay || "") || a.kh.localeCompare(b.kh) || a.so.localeCompare(b.so, undefined, { numeric: true }));
      st.rows = rows;
      // Excel
      const sumTien = rows.filter((r) => !r.dup).reduce((a, r) => a + (r.tienHang || 0), 0), sumThue = rows.filter((r) => !r.dup).reduce((a, r) => a + (r.thue || 0), 0), sumTong = rows.filter((r) => !r.dup).reduce((a, r) => a + (r.tong || 0), 0);
      const sheets = [
        { name: "Bảng kê", cols: [
          { header: "STT", width: 6, type: "int" }, { header: "Mẫu số", width: 8, type: "text" }, { header: "Ký hiệu", width: 11, type: "text" }, { header: "Số HĐ", width: 11, type: "text" },
          { header: "Ngày lập", width: 11 }, { header: "MST người bán", width: 15, type: "text" }, { header: "Tên người bán", width: 36 }, { header: "MST người mua", width: 15, type: "text" },
          { header: "Tên người mua", width: 36 }, { header: "Tiền hàng", width: 15, type: "money" }, { header: "Thuế suất", width: 10 }, { header: "Tiền thuế", width: 14, type: "money" },
          { header: "Tổng thanh toán", width: 16, type: "money" }, { header: "Tiền tệ", width: 7 }, { header: "Mã CQT", width: 36, type: "text" }, { header: "Tên file", width: 30 }, { header: "Ghi chú", width: 34 }],
          rows: rows.map((r, i) => [i + 1, r.mau, r.kh, r.so, ymd(r.ngay), r.banMst, r.banTen, r.muaMst, r.muaTen, r.tienHang, r.ts, r.thue, r.tong, r.tien_te, r.cqt, r.file, r.notes.join("; ")]),
          totals: [9, 11, 12] },
        { name: "Chi tiết hàng hóa", cols: [
          { header: "Số HĐ", width: 11, type: "text" }, { header: "Ký hiệu", width: 11, type: "text" }, { header: "Ngày", width: 11 }, { header: "Người bán", width: 30 }, { header: "STT", width: 5 },
          { header: "Mã hàng", width: 12, type: "text" }, { header: "Tên hàng hóa, dịch vụ", width: 44 }, { header: "ĐVT", width: 8 }, { header: "Số lượng", width: 10, type: "money" },
          { header: "Đơn giá", width: 14, type: "money" }, { header: "Thành tiền", width: 15, type: "money" }, { header: "Thuế suất", width: 9 }],
          rows: rows.flatMap((r) => r.items.map((it) => [r.so, r.kh, ymd(r.ngay), r.banTen, it.stt, it.ma, it.ten, it.dvt, it.sl, it.dg, it.tt, it.ts])) },
      ];
      if (bad.length) sheets.push({ name: "File lỗi", cols: [{ header: "Tên file", width: 40 }, { header: "Lý do", width: 60 }], rows: bad.map((b) => [b.file, b.msg]) });
      st.xlsx = await D.buildXlsx(sheets);
      // bảng trên trang
      $("xmBody").innerHTML = rows.map((r, i) => `<tr class="${r.dup ? "bad" : r.notes.length ? "check" : ""}">
        <td class="num">${i + 1}</td><td class="mono">${esc(r.kh)}</td><td class="mono">${esc(r.so)}</td><td>${esc(ymd(r.ngay))}</td>
        <td>${esc(r.banTen)}<br><small class="mono">${esc(r.banMst)}</small></td><td>${esc(r.muaTen)}<br><small class="mono">${esc(r.muaMst)}</small></td>
        <td class="num">${fmt(r.tienHang)}</td><td class="num">${fmt(r.thue)}</td><td class="num"><b>${fmt(r.tong)}</b></td>
        <td>${r.notes.length ? `<span class="tag ${r.dup ? "bad" : "warn"}">${esc(r.notes.join("; "))}</span>` : '<span class="tag ok">OK</span>'}</td></tr>`).join("")
        + bad.map((b) => `<tr class="bad"><td></td><td colspan="8">${esc(b.file)}</td><td><span class="tag bad">${esc(b.msg)}</span></td></tr>`).join("");
      const dups = rows.filter((r) => r.dup).length, warn = rows.filter((r) => !r.dup && r.notes.length).length;
      $("xmSummary").innerHTML = `<span class="pill">${rows.length} hóa đơn</span><span class="pill">Tiền hàng ${fmt(sumTien)}</span><span class="pill">Thuế ${fmt(sumThue)}</span><span class="pill ok">Tổng ${fmt(sumTong)}</span>`
        + (dups ? `<span class="pill warn">${dups} trùng</span>` : "") + (warn ? `<span class="pill warn">${warn} cần xem</span>` : "") + (bad.length ? `<span class="pill warn">${bad.length} file lỗi</span>` : "");
      $("xmBar").style.width = "100%";
      D.trialUse("xml", rows.length);
      status(`Xong ${rows.length} hóa đơn${bad.length ? `, ${bad.length} file không đọc được` : ""}. Bấm "Tải Excel" để lưu bảng kê (kèm sheet chi tiết hàng hóa).` + (cut ? ` Bản dùng thử chỉ còn đủ lượt cho ${rows.length} hóa đơn, ${cut} hóa đơn còn lại chưa xử lý – kích hoạt bản quyền để xử lý hết.` : ""), !!cut);
    } catch (e) { console.error(e); status("Lỗi khi đọc: " + (e.message || e), true); }
    lock(false);
  });
  $("xmSave").addEventListener("click", () => {
    if (!st.xlsx) return;
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    D.offerSave(`BangKe_HoaDonXML_${stamp}.xlsx`, st.xlsx);
  });
}
