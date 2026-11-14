/**
 * Lý do nhân viên từ chối một chứng nhận, và câu nhà cung cấp đọc được.
 *
 * Lưu ở cột `certificates.rejection_reason`: mã lý do có sẵn ("holder_without_contract"…)
 * hoặc "other:<câu nhân viên viết cho nhà cung cấp>". Tách khỏi `review_note` (ghi chú nội
 * bộ, không đưa ra cổng). Câu theo mã được dịch theo ngôn ngữ cổng; câu "khác" gửi nguyên văn.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
export const CERTIFICATE_REJECTION_REASONS = [
  {
    code: "holder_without_contract",
    staff: "Giấy đứng tên đơn vị khác, chưa có hợp đồng",
    vi: "Giấy đứng tên đơn vị khác. Tải kèm hợp đồng hoặc giấy ủy quyền với đơn vị đứng tên giấy.",
    en: "The certificate is in another company's name. Upload your contract or authorisation with that company.",
  },
  {
    code: "unreadable",
    staff: "Không đọc được / không phải chứng nhận",
    vi: "Tệp không đọc được hoặc không phải giấy chứng nhận. Tải bản chụp rõ của giấy chứng nhận.",
    en: "The file is unreadable or is not a certificate. Upload a clear copy of the certificate.",
  },
  {
    code: "duplicate",
    staff: "Trùng giấy đã có trên hồ sơ",
    vi: "Giấy này trùng với một chứng nhận đã có trên hồ sơ.",
    en: "This certificate duplicates one already on your profile.",
  },
] as const;

export type CertificateRejectionCode = (typeof CERTIFICATE_REJECTION_REASONS)[number]["code"] | "other";

/** Câu "khác" nhân viên tự viết: một dòng, tối đa 300 ký tự. */
export const REJECTION_OTHER_MAX = 300;

/** Giá trị lưu vào cột; null khi đầu vào không hợp lệ (mã lạ hoặc "khác" để trống). */
export function encodeRejectionReason(code: string, otherText = ""): string | null {
  if (code === "other") {
    const text = otherText.replace(/\s+/g, " ").trim().slice(0, REJECTION_OTHER_MAX);
    return text ? `other:${text}` : null;
  }
  return CERTIFICATE_REJECTION_REASONS.some((reason) => reason.code === code) ? code : null;
}

/** Câu cho nhà cung cấp; giá trị cũ/trống thì dùng câu chung, không bao giờ lộ ghi chú nội bộ. */
export function supplierRejectionMessage(stored: string | null | undefined, language: "en" | "vi" = "vi"): string {
  const value = (stored ?? "").trim();
  if (value.startsWith("other:") && value.length > 6) return value.slice(6);
  const reason = CERTIFICATE_REJECTION_REASONS.find((item) => item.code === value);
  if (reason) return language === "en" ? reason.en : reason.vi;
  return language === "en" ? "Upload a correct copy, or contact support if you need help."
    : "Tải lại bản đúng, hoặc liên hệ hỗ trợ nếu cần giúp.";
}

/** Nhãn ngắn cho nhân viên trong CRM và nhật ký. */
export function staffRejectionLabel(stored: string | null | undefined): string {
  const value = (stored ?? "").trim();
  if (value.startsWith("other:")) return `Khác: ${value.slice(6)}`;
  return CERTIFICATE_REJECTION_REASONS.find((item) => item.code === value)?.staff ?? "Không rõ lý do";
}
