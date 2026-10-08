import { COMPANY } from "@/lib/config";
import { escapeHtml } from "@/lib/email/templates";

/**
 * Chữ ký mặc định chèn vào email do đội ngũ tự soạn.
 * Cố ý gọn và trơn (không banner/footer): email tự soạn nhìn như thư trao đổi
 * thật giữa nhân viên và buyer, nhận diện công ty nằm ngay trong chữ ký.
 * Website để dạng chữ thường, KHÔNG lặp lại thành footer/link ở cuối thư.
 */
export function buildSignature(owner?: string | null): string {
  const name = escapeHtml(owner?.trim() || COMPANY.name);
  return [
    `<p style="font-size:14px;line-height:22px;margin:28px 0 0;">Best regards / Trân trọng,</p>`,
    `<p style="font-size:13px;line-height:20px;margin:6px 0 0;color:#475569;">`,
    `<strong style="font-size:14px;color:#0f172a;">${name}</strong><br/>`,
    `Export Department &middot; ${escapeHtml(COMPANY.name)}<br/>`,
    `${escapeHtml(COMPANY.phone)} &middot; ${escapeHtml(COMPANY.email)}<br/>`,
    `${escapeHtml(COMPANY.website)}</p>`,
  ].join("");
}
