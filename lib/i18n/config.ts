/**
 * Ngôn ngữ hiển thị của khu vực tài khoản.
 *
 * Chọn cookie thay vì tiền tố URL (`/en/...`, `/vi/...`) vì các trang này đều `noindex`
 * và nằm sau đăng nhập: đổi URL chỉ làm hỏng link cũ, không mang lại lợi ích SEO nào.
 * Trang công khai giữ nguyên tiếng Anh và không phụ thuộc cookie này.
 */
export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];

/** Mặc định tiếng Anh: người mua quốc tế và doanh nghiệp FDI gặp cửa vào bằng tiếng Anh. */
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "vexim_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Đọc giá trị thô (cookie hoặc tham số) và luôn trả về một locale hợp lệ. */
export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Các đường dẫn dùng bộ từ điển đa ngôn ngữ: cửa vào tài khoản (đăng nhập, chọn loại tài
 * khoản, quên/đặt lại mật khẩu, đăng ký NCC bước 1).
 *
 * Cổng NCC (`/supplier/...` trừ `/supplier/register`) chưa chuyển — đó là giai đoạn 2 — nên
 * không nằm trong danh sách này.
 */
export function isLocalizedAuthPath(pathname: string): boolean {
  return /^\/(?:login|register|auth|supplier\/register)(?:\/|$)/.test(pathname);
}
