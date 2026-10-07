/** Thông tin công ty – dùng cho chữ ký email và footer giao diện */
export const COMPANY = {
  name: process.env.EMAIL_FROM_NAME?.trim() || "Vexim Trade",
  email: process.env.EMAIL_FROM?.trim() || "sales@veximtrade.com",
  website: process.env.COMPANY_WEBSITE?.trim() || "https://veximtrade.com",
  phone: process.env.COMPANY_PHONE?.trim() || "+84 28 3822 0000",
  address:
    process.env.COMPANY_ADDRESS?.trim() ||
    "Ho Chi Minh City, Vietnam",
  tagline: "Vietnam Export Sourcing Partner",
};

/** Người gửi mặc định cho các email tự động */
export const FROM_ADDRESS = `${COMPANY.name} <${COMPANY.email}>`;

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Khi chưa có RESEND_API_KEY thì không gửi thật, chỉ ghi log để xem trước */
export function emailMode(): "resend" | "local" {
  return resendConfigured() ? "resend" : "local";
}
