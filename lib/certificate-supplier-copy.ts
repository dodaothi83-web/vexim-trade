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
): string {
  if (certificate.superseded_by_certificate_id) return "Bản cũ, đã thay bằng bản gia hạn mới hơn.";
  if (certificate.staff_hidden) return "Nhân viên đang tạm ẩn giấy này. Liên hệ hỗ trợ nếu cần làm rõ.";
  const expired = Boolean(certificate.valid_until && certificate.valid_until < today);
  if (certificate.review_status === "rejected") {
    return "Chưa được duyệt. Tải bản rõ hơn hoặc liên hệ hỗ trợ.";
  }
  if (certificate.review_status === "approved") {
    if (expired) return "Đã hết hạn nên tạm không hiện với người mua. Tải bản gia hạn để hiện lại.";
    if (!certificate.publicly_visible) return "Đã duyệt, chờ chọn phạm vi danh mục để hiện với người mua.";
    return "Đã duyệt và đang hiện với người mua.";
  }
  if (expired) return "Đã hết hạn. Tải bản gia hạn để chờ duyệt.";
  return "Đang chờ nhân viên đối chiếu.";
}
