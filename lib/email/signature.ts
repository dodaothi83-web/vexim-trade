import { COMPANY } from "@/lib/config";
import { escapeHtml } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";

/**
 * Chữ ký mặc định chèn vào email do đội ngũ tự soạn.
 * Cố ý gọn và trơn (không banner/footer/ảnh): email tự soạn nhìn như thư trao đổi
 * thật giữa nhân viên và buyer, nhận diện công ty nằm ngay trong chữ ký.
 * Không nhúng logo: mọi thứ đều là chữ thường, tránh email client chặn ảnh
 * từ domain ngoài và tránh chữ ký bị lệch cột khi trả lời/forward.
 * Địa chỉ công ty để dạng chữ thường, KHÔNG lặp lại thành footer/link ở cuối thư.
 * Thứ tự dòng (theo yêu cầu 12/10/2026): tên / phòng ban + thương hiệu /
 * số riêng + email riêng / website / PHÁP NHÂN / địa chỉ (ngắt 2 dòng cho dễ đọc).
 * Thư gửi buyer nước ngoài nên phần lời chào chỉ dùng tiếng Anh ("Best regards,"),
 * không kèm bản tiếng Việt.
 * Dòng email liên hệ dùng ĐỊA CHỈ RIÊNG của người ký (dung@veximtrade.com) — trùng
 * với địa chỉ ghi ở header From, để buyer trả lời là về đúng hộp người phụ trách.
 */
export function buildSignature(
  owner?: string | null,
  phone?: string | null,
  email?: string | null,
): string {
  const name = escapeHtml(owner?.trim() || COMPANY.name);
  // Số riêng của nhân viên; nếu chưa có thì bỏ qua, không dùng số tổng đài thay thế
  const personalPhone = phone?.trim() ? `${escapeHtml(phone.trim())} &middot; ` : "";
  const contactEmail = escapeHtml(email?.trim() || COMPANY.email);
  const websiteHost = SITE_URL.replace("https://", "");
  const legal = escapeHtml(COMPANY.legalName);
  return [
    `<p style="font-size:14px;line-height:22px;margin:28px 0 0;">Best regards,</p>`,
    `<p style="margin:10px 0 0;font-size:13px;line-height:20px;color:#475569;">`,
    `<strong style="font-size:14px;color:#0f172a;">${name}</strong><br/>`,
    `Export Department &middot; ${escapeHtml(COMPANY.name)}<br/>`,
    `${personalPhone}${contactEmail}<br/>`,
    `<a href="${SITE_URL}" style="color:#0f766e;text-decoration:none;">${websiteHost}</a><br/>`,
    // Pháp nhân đứng ngay trên địa chỉ: buyer cần đúng tên này khi ký hợp đồng và
    // khi tra hoá đơn, còn "Vexim Trade" ở trên chỉ là thương hiệu.
    `${legal}<br/>`,
    `${formatAddress(COMPANY.address)}`,
    `</p>`,
  ].join("");
}

/**
 * Địa chỉ dài sẽ thành một hàng rất khó đọc trên desktop client. Ngắt sau "Communes,"
 * đối với địa chỉ hiện tại của công ty; đổi COMPANY_ADDRESS sang địa chỉ khác (không có
 * "Communes,") thì để email client tự xuống dòng — không đoán chỗ ngắt.
 */
function formatAddress(address: string): string {
  const raw = address.trim();
  const marker = raw.toLowerCase().indexOf("communes,");
  if (marker < 0) return escapeHtml(raw);
  const first = raw.slice(0, marker + "communes,".length).trimEnd();
  const rest = raw.slice(marker + "communes,".length).trim();
  return rest ? `${escapeHtml(first)}<br/>${escapeHtml(rest)}` : escapeHtml(first);
}
