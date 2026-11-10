import type { DataStore } from "@/lib/db/types";
import { rfqChannel } from "./channel";

/** CRM may read direct RFQs for support/disputes, never process them. Keep this
 * check inside every staff action: hiding controls alone is not authorization.
 */
export async function assertStaffMayProcessRfq(store: DataStore, rfqId: string) {
  const rfq = await store.getRfq(rfqId);
  if (!rfq) throw new Error("RFQ không tồn tại.");
  if (rfqChannel(rfq) !== "sourcing") {
    throw new Error("Chỉ Vexim mới xử lý RFQ tìm nguồn; RFQ đích danh và câu hỏi NCC cũ chỉ được xem trong CRM.");
  }
  return rfq;
}
