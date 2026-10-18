/**
 * Đọc biến môi trường an toàn cho cả server lẫn client bundle.
 * Ở server: lấy từ process.env. Ở browser bundle: process.env không có giá trị
 * thật nên mọi thứ rơi về mặc định trong file này.
 */
const env: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? process.env : {};

/** Thông tin công ty – dùng cho chữ ký email và footer giao diện */
export const COMPANY = {
  name: env.EMAIL_FROM_NAME?.trim() || "Vexim Trade",
  email: env.EMAIL_FROM?.trim() || "sales@veximtrade.com",
  website: env.COMPANY_WEBSITE?.trim() || "https://veximtrade.com",
  phone: env.COMPANY_PHONE?.trim() || "+84373685634",
  address:
    env.COMPANY_ADDRESS?.trim() ||
    "Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam",
  /**
   * Tên pháp nhân in hoa (VEXIM GLOBAL CO., LTD) — dùng ở chữ ký email, nơi buyer
   * cần đúng tên đăng ký chứ không phải thương hiệu "Vexim Trade". Đổi qua COMPANY_LEGAL_NAME.
   */
  legalName: env.COMPANY_LEGAL_NAME?.trim() || "VEXIM GLOBAL CO., LTD",
  /** Người đại diện theo pháp luật, công khai trên trang thông tin chủ quản nền tảng */
  legalRepresentative: env.COMPANY_LEGAL_REPRESENTATIVE?.trim() || "Lương Văn Học",
  /** Mã số doanh nghiệp, đồng thời là mã số thuế của công ty */
  taxCode: env.COMPANY_TAX_CODE?.trim() || "0111040294",
  /** Ngày cấp đăng ký doanh nghiệp lần đầu */
  registrationDate: env.COMPANY_REGISTRATION_DATE?.trim() || "29/04/2025",
  tagline: "Vietnam Export Sourcing Partner",
};

/** Kiểu thông tin công ty – dùng khi truyền từ server xuống client */
export type CompanyInfo = typeof COMPANY;

/**
 * Domain DÙNG CHUNG cho mọi địa chỉ gửi của hệ thống — phải là domain đã verify
 * trong Resend (Resend cho phép gửi từ bất kỳ local-part nào của domain đã verify,
 * không cần tạo mailbox). Mặc định MAIL_DOMAIN = domain của EMAIL_FROM; chỉ đặt
 * MAIL_DOMAIN khi muốn tách domain gửi khỏi địa chỉ chức năng.
 * Đây cũng là domain nhận thư (catch-all) của Resend Inbound: thư buyer trả lời
 * dung@veximtrade.com chảy về đúng webhook /api/webhooks/resend đang dùng.
 */
export const MAIL_DOMAIN: string = (
  env.MAIL_DOMAIN?.trim() ||
  COMPANY.email.split("@")[1]?.trim() ||
  "veximtrade.com"
)
  .replace(/^@/, "")
  .toLowerCase();

/** Địa chỉ chức năng (role address) – dùng cho thư hệ thống và thư NCC */
export const ROLE_ADDRESS = COMPANY.email;

/** Người gửi mặc định cho các email tự động không gắn với người cụ thể */
export const FROM_ADDRESS = `${COMPANY.name} <${COMPANY.email}>`;

export function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Khi chưa có RESEND_API_KEY thì không gửi thật, chỉ ghi log để xem trước */
export function emailMode(): "resend" | "local" {
  return resendConfigured() ? "resend" : "local";
}
