/**
 * Xét nhanh chứng từ xuất khẩu (hiển thị là cấp L2, mã lưu trữ target_level = 3).
 *
 * Chủ dự án yêu cầu 11/2026: người vận hành không rành công nghệ vẫn xét được trong một trang.
 * Bỏ bảng kiểm chi tiết; chỉ còn ba câu Có/Không, hai nút Duyệt / Trả lại, và câu công khai
 * do hệ thống tự viết theo mẫu. File này không import mã máy chủ nên dùng được ở cả hai phía.
 */

export const EXPORT_REVIEW_QUESTIONS = [
  { key: "company_match", text: "Tên công ty trên chứng từ khớp với nhà cung cấp này?" },
  { key: "shipment_info", text: "Chứng từ có ngày xuất hàng và nước nhận hàng?" },
  { key: "readable", text: "Chứng từ rõ, đọc được, không có dấu hiệu sửa chữa?" },
] as const;

export type ExportReviewQuestionKey = typeof EXPORT_REVIEW_QUESTIONS[number]["key"];

/** Lý do trả lại hay gặp; người vận hành bấm chọn thay vì phải tự gõ. */
export const EXPORT_RETURN_REASONS = [
  "Tệp bị mờ hoặc không mở được. Vui lòng tải lại bản rõ hơn.",
  "Tên công ty trên chứng từ không khớp với hồ sơ. Vui lòng gửi chứng từ đúng tên công ty.",
  "Thiếu ngày xuất hàng hoặc nước nhận hàng. Vui lòng bổ sung chứng từ có các thông tin này.",
  "Thiếu trang hoặc thiếu chứng từ của lô hàng. Vui lòng tải đủ các trang.",
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Nơi đến chỉ giữ chữ cái, dấu cách và dấu phẩy: không lọt số, email hay đường dẫn ra công khai. */
function cleanDestination(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/[^\p{L}\s,.'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/[,.\s-]+$/, "");
}

/**
 * Câu công khai cho người mua, viết theo mẫu (tiếng Anh, vì trang người mua là tiếng Anh).
 * Không chứa mã đơn, số điện thoại hay tên người mua; chỉ nước đến và tháng xuất nếu có.
 */
export function exportPublicSummary(input: { destination?: string | null; shippedOn?: string | null }): string {
  const destination = cleanDestination(input.destination);
  const match = /^(\d{4})-(\d{2})/.exec(input.shippedOn ?? "");
  const month = match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
  const scope = [destination ? ` to ${destination}` : "", month ? `, shipped in ${month}` : ""].join("");
  return `Vexim staff reviewed export documents for one shipment by this supplier${scope}. ` +
    "The documents carry the supplier's company name. " +
    "This does not prove the end buyer received the goods or guarantee future shipments.";
}
