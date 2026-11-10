import type { Rfq } from "@/lib/types";

/**
 * Vexim là sàn B2B: RFQ gửi từ trang sản phẩm / trang nhà cung cấp đi thẳng tới đúng nhà cung cấp
 * đó ("direct"); câu hỏi RFQ cũ chỉ giữ lịch sử ("question", câu hỏi mới dùng chat).
 * Yêu cầu không chọn nhà cung cấp hoặc chuyển từ form tìm nguồn cần Vexim điều phối
 * và trình báo giá trong khu riêng ("sourcing"). Không dùng email để giao dịch RFQ.
 */
export type RfqChannel = "direct" | "question" | "sourcing";

type ChannelFields = Pick<Rfq, "source_page" | "specs" | "preferred_supplier_ids" | "source_product_id">;

export function rfqChannel(rfq: ChannelFields): RfqChannel {
  const specs = (rfq.specs ?? {}) as Record<string, unknown>;
  if (rfq.source_page === "/rfq?intent=question" || specs.inquiry_kind === "supplier_question") return "question";
  if (typeof specs.sourcing_request_id === "string" && specs.sourcing_request_id) return "sourcing";
  if (rfq.source_product_id || (rfq.preferred_supplier_ids ?? []).length > 0) return "direct";
  return "sourcing";
}

/** Yêu cầu tìm nguồn đã được chuyển thành RFQ để ghép nhà cung cấp (nếu có). */
export function linkedSourcingRequestId(rfq: Pick<Rfq, "specs">): string | null {
  const id = ((rfq.specs ?? {}) as Record<string, unknown>).sourcing_request_id;
  return typeof id === "string" && id ? id : null;
}

/** RFQ đang chờ xử lý (dùng cho huy hiệu menu). */
export const PENDING_RFQ_STATUSES: Rfq["status"][] = ["new", "needs_review", "in_progress", "matching"];
/** RFQ chưa có người tiếp nhận: đếm vào hàng "cần tiếp nhận" của Tìm nguồn. */
export const UNCLAIMED_RFQ_STATUSES: Rfq["status"][] = ["new", "needs_review"];
