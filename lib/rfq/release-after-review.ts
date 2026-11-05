import type { DataStore } from "@/lib/db/types";
import type { Rfq } from "@/lib/types";
import { createPreferredSupplierMatches } from "./auto-match";
import { rfqChannel } from "./channel";
import { releaseTargetedQuoteToPortal } from "./targeted-portal";

/**
 * RFQ trực tiếp bị giữ lại lúc gửi (cần duyệt / cách ly) không có match và không được chuyển
 * tới nhà cung cấp. Khi nhân viên duyệt cho qua, chạy lại đúng bước lúc gửi: tạo match cho nhà
 * cung cấp người mua chọn rồi chuyển thẳng (một nhà cung cấp). Nhiều nhà cung cấp thì chỉ tạo
 * match để nhân viên bấm "Gửi yêu cầu báo giá".
 */
export async function releaseDirectRfqAfterReview(store: DataStore, rfq: Rfq): Promise<number> {
  const supplierIds = rfq.preferred_supplier_ids ?? [];
  if (rfqChannel(rfq) !== "direct" || supplierIds.length === 0) return 0;
  await createPreferredSupplierMatches(store, rfq.id, supplierIds);
  if (supplierIds.length !== 1) return 0;
  return releaseTargetedQuoteToPortal(store, { ...rfq, status: "new" });
}
