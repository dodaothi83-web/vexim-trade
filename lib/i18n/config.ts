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

/** Mã ngôn ngữ cho `Intl` (số, ngày). Không dùng locale của máy chủ: nó đổi theo môi trường. */
const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", vi: "vi-VN" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

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

/**
 * Cổng nhà cung cấp đã chuyển đa ngôn ngữ theo từng cụm (giai đoạn 2).
 *
 * Cả cổng nằm trong danh sách này vì khung (menu, thanh trên) đã chuyển cùng cụm đầu:
 * để riêng từng trang sẽ ra cảnh menu tiếng Anh mà nội dung tiếng Việt. Trang nào chưa
 * chuyển nội dung thì vẫn đọc tiếng Việt như trước, chỉ khung là đổi theo cookie.
 */
export function isLocalizedPortalPath(pathname: string): boolean {
  return /^\/supplier\/portal(?:\/|$)/.test(pathname);
}

/** Mọi khu vực đọc ngôn ngữ từ cookie. */
export function isLocalizedPath(pathname: string): boolean {
  return isLocalizedAuthPath(pathname) || isLocalizedPortalPath(pathname);
}
