import type { RfqMatchStatus, RfqStatus } from "@/lib/types";

/**
 * Luật chuyển trạng thái RFQ dùng chung cho trang CRM và server action.
 * Thứ tự nghiệp vụ: tiếp nhận → ghép NCC → trình người mua → (tuỳ chọn) gửi mẫu → thành công / thất bại.
 */

/** Trạng thái hành chính được đổi tay; các bước còn lại phải qua nút nghiệp vụ có email. */
export const MANUAL_RFQ_STATUSES: RfqStatus[] = ["new", "needs_review", "in_progress", "matching", "spam"];

/** RFQ đã đóng: không gửi mẫu, chốt NCC hay gửi thêm yêu cầu. */
export const CLOSED_RFQ_STATUSES: RfqStatus[] = ["won", "lost", "spam"];

/** Trạng thái NCC được ghi tay (không kèm email). */
export const MANUAL_MATCH_STATUSES: RfqMatchStatus[] = ["proposed", "sent_to_supplier", "declined", "no_response"];

/** Only buyer-visible published quotes may be selected; an unreviewed draft is not an offer. */
export const SELECTABLE_MATCH_STATUSES: RfqMatchStatus[] = ["presented_to_buyer", "selected"];

export function isSupplierQuestionRfq(rfq: { source_page?: string | null; specs?: unknown }) {
  return rfq.source_page === "/rfq?intent=question"
    || (rfq.specs as Record<string, unknown> | null)?.inquiry_kind === "supplier_question";
}
