/* Service worker: cho phép mở và dùng tool khi không có mạng.
   Đổi VERSION mỗi khi cập nhật file để máy người dùng lấy bản mới. */
const VERSION = "tachpdf-v14";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./pdf.min.mjs", "./pdf.worker.min.mjs", "./pdf-lib.min.js", "./jszip.min.js", "./parser.mjs", "./xlsx.mjs", "./compress.mjs", "./tool_nhan.mjs", "./tool_che.mjs", "./tool_sosanh.mjs", "./tool_chup.mjs", "./config.mjs", "./cloud.mjs",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // File của chính tool: lấy bản mới trên mạng trước, mất mạng thì dùng bản đã lưu
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Bộ OCR (Tesseract.js) tải từ CDN: lưu lại sau lần đầu để dùng offline
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.open(VERSION + "-ocr").then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
  }
});
