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
    "W2 Tower, Hinode Royal Park, Kim Chung and Di Trach Communes, Hoai Duc District, Hanoi, Vietnam",
  tagline: "Vietnam Export Sourcing Partner",
};

/** Kiểu thông tin công ty – dùng khi truyền từ server xuống client */
export type CompanyInfo = typeof COMPANY;

/** Người gửi mặc định cho các email tự động */
export const FROM_ADDRESS = `${COMPANY.name} <${COMPANY.email}>`;

export function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Khi chưa có RESEND_API_KEY thì không gửi thật, chỉ ghi log để xem trước */
export function emailMode(): "resend" | "local" {
  return resendConfigured() ? "resend" : "local";
}
