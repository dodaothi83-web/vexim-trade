import type { Certificate } from "@/lib/types";

/**
 * Một câu trạng thái cho nhà cung cấp đọc trên thẻ chứng nhận.
 *
 * `review_note` do nhân viên soạn cho người duyệt: có mã bước xác thực, lý do kỹ thuật
 * và tên đơn vị, nên không đưa nguyên văn ra cổng nhà cung cấp. Ở đây chỉ nói giấy đang
 * ở đâu trong luồng duyệt và cần làm gì tiếp, cùng một câu cho mọi giấy.
 */
export function supplierCertificateNote(
  certificate: Pick<Certificate,
    "review_status" | "publicly_visible" | "staff_hidden" | "valid_until" | "superseded_by_certificate_id">,
  today = new Date().toISOString().slice(0, 10),
  language: "en" | "vi" = "vi",
): string {
  const en = language === "en";
  if (certificate.superseded_by_certificate_id) {
    return en ? "Older copy, replaced by a newer renewal." : "Bản cũ, đã thay bằng bản gia hạn mới hơn.";
  }
  if (certificate.staff_hidden) {
    return en ? "Staff have hidden this certificate for now. Contact support if you need to clarify."
      : "Nhân viên đang tạm ẩn giấy này. Liên hệ hỗ trợ nếu cần làm rõ.";
  }
  const expired = Boolean(certificate.valid_until && certificate.valid_until < today);
  if (certificate.review_status === "rejected") {
    return en ? "Not approved. Upload a clearer copy or contact support." : "Chưa được duyệt. Tải bản rõ hơn hoặc liên hệ hỗ trợ.";
  }
  if (certificate.review_status === "approved") {
    if (expired) {
      return en ? "Expired, so it is hidden from buyers for now. Upload a renewal to show it again."
        : "Đã hết hạn nên tạm không hiện với người mua. Tải bản gia hạn để hiện lại.";
    }
    if (!certificate.publicly_visible) {
      return en ? "Approved, waiting for a category scope before it shows to buyers."
        : "Đã duyệt, chờ chọn phạm vi danh mục để hiện với người mua.";
    }
    return en ? "Approved and showing to buyers." : "Đã duyệt và đang hiện với người mua.";
  }
  if (expired) {
    return en ? "Expired. Upload a renewal to send it for review." : "Đã hết hạn. Tải bản gia hạn để chờ duyệt.";
  }
  return en ? "Waiting for a staff check." : "Đang chờ nhân viên đối chiếu.";
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Ngày trên giấy cho nhà cung cấp đọc: "06/11/2025" (vi) hoặc "6 Nov 2025" (en). Giữ nguyên chuỗi lạ. */
export function formatCertificateDate(iso: string | null | undefined, language: "en" | "vi" = "vi"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return iso ?? "";
  const [, year, month, day] = match;
  return language === "en" ? `${Number(day)} ${MONTHS_EN[Number(month) - 1] ?? month} ${year}` : `${day}/${month}/${year}`;
}

/** Hết hạn theo đúng mốc của bộ lọc công khai: ngày hết hạn trước hôm nay. */
export function certificateExpired(validUntil: string | null | undefined, today = new Date().toISOString().slice(0, 10)): boolean {
  return Boolean(validUntil && validUntil < today);
}
