/* =====================================================================
   CẤU HÌNH BẢN QUYỀN – chỉ cần sửa file này.
   Để trống cả 2 dòng: app chạy như cũ (đếm dùng thử ngay trên máy, không cần đăng nhập).
   Điền đủ 2 dòng: bắt buộc đăng nhập Google, lượt dùng thử và bản quyền do máy chủ quản lý.
   ===================================================================== */

// Địa chỉ ứng dụng web Apps Script (dạng https://script.google.com/macros/s/AKfy..../exec)
export const SERVER_URL = "https://script.google.com/macros/s/AKfycbzt6JF1GjKl7Q_8o2kZwyI_LsvpmFu7bDlo5Y6aPOesKrxK8k5aW9Ffv3ZDYry3OxBKuQ/exec";

// OAuth Client ID (dạng 1234567890-abc...xyz.apps.googleusercontent.com), giống CONFIG.CLIENT_ID trong Code.gs
export const GOOGLE_CLIENT_ID = "367300860883-gcohu46egem8vfv5rj4u4p564mts78un.apps.googleusercontent.com";

// Vẫn nhận mã kích hoạt kiểu cũ (gắn Mã máy) cho khách đã mua trước đây. Đặt false để tắt hẳn.
export const ALLOW_OFFLINE_KEY = true;

// Khách PRO mất mạng vẫn dùng được trong số ngày này kể từ lần kiểm tra gần nhất
export const OFFLINE_GRACE_DAYS = 7;
