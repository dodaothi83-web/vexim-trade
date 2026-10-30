import { randomUUID } from "node:crypto";

import type { RfqMatch } from "@/lib/types";

/** Phần tầng dữ liệu mà việc tạo lượt khớp tự động cần; tách riêng để kiểm tra độc lập. */
export interface PreferredMatchStore {
  listRfqMatches(rfqId: string): Promise<Array<Pick<RfqMatch, "supplier_id">>>;
  createRfqMatch(input: Partial<RfqMatch>): Promise<unknown>;
}

/**
 * Tạo sẵn lượt khớp ở trạng thái đề xuất cho các nhà cung cấp mà buyer đã chỉ định
 * khi gửi RFQ từ trang sản phẩm hoặc trang nhà cung cấp. Chỉ tạo lượt khớp, tuyệt đối
 * không tự gửi email: nhân viên vẫn kiểm tra rồi mới gửi yêu cầu báo giá như thường lệ.
 * Trả về số lượt khớp mới tạo; nhà cung cấp đã có lượt khớp thì bỏ qua.
 */
export async function createPreferredSupplierMatches(
  store: PreferredMatchStore,
  rfqId: string,
  supplierIds: string[],
): Promise<number> {
  const unique = [...new Set((supplierIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (!rfqId || unique.length === 0) return 0;
  const existing = new Set((await store.listRfqMatches(rfqId)).map((m) => m.supplier_id));
  let created = 0;
  for (const supplierId of unique) {
    if (existing.has(supplierId)) continue;
    await store.createRfqMatch({
      id: randomUUID(),
      rfq_id: rfqId,
      supplier_id: supplierId,
      status: "proposed",
    });
    created += 1;
  }
  return created;
}
