import { COMPANY } from "@/lib/config";
import { escapeHtml } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";

/**
 * Chữ ký mặc định chèn vào email do đội ngũ tự soạn.
 * Cố ý gọn và trơn (không banner/footer): email tự soạn nhìn như thư trao đổi
 * thật giữa nhân viên và buyer, nhận diện công ty nằm ngay trong chữ ký.
 * Địa chỉ công ty để dạng chữ thường, KHÔNG lặp lại thành footer/link ở cuối thư.
 */
export function buildSignature(owner?: string | null, phone?: string | null): string {
  const name = escapeHtml(owner?.trim() || COMPANY.name);
  // Số riêng của nhân viên; nếu chưa có thì bỏ qua, không dùng số tổng đài thay thế
  const personalPhone = phone?.trim() ? `${escapeHtml(phone.trim())} &middot; ` : "";
  // Logo đặt bên trái, dùng bảng và width/height để email client hiển thị ổn định.
  // Logo lấy từ domain gửi thư (www.veximtrade.com), không nhúng base64.
  const websiteHost = SITE_URL.replace("https://", "");
  return [
    `<p style="font-size:14px;line-height:22px;margin:28px 0 0;">Best regards / Trân trọng,</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;"><tr>`,
    `<td style="vertical-align:top;padding:0 16px 0 0;">`,
    `<img src="${SITE_URL}/email-logo.png" width="96" height="61" alt="Vexim Trade" style="display:block;border:0;width:96px;height:auto;" />`,
    `</td>`,
    `<td style="vertical-align:top;font-size:13px;line-height:20px;color:#475569;">`,
    `<strong style="font-size:14px;color:#0f172a;">${name}</strong><br/>`,
    `Export Department &middot; ${escapeHtml(COMPANY.name)}<br/>`,
    `${personalPhone}${escapeHtml(COMPANY.email)}<br/>`,
    `<a href="${SITE_URL}" style="color:#0f766e;text-decoration:none;">${websiteHost}</a><br/>`,
    `${escapeHtml(COMPANY.address)}`,
    `</td>`,
    `</tr></table>`,
  ].join("");
}
