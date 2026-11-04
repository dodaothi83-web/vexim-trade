/**
 * Đích quay lại sau khi đăng nhập.
 *
 * Chỉ nhận đường dẫn nội bộ: `//host` và `/\host` cũng là URL tuyệt đối ở trình duyệt
 * nên phải chặn cả hai, nếu không đây thành open redirect để kẻ lạ dùng domain của mình
 * gửi link "đăng nhập Vexim".
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // Product/supplier/grade context can exceed 500 characters. Keep a bounded URL
  // while rejecting characters browsers can normalize into a different origin.
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.length > 1500) return null;
  return value;
}
