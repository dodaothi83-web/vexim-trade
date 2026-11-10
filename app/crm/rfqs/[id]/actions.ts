"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { randomUUID } from "crypto";

import { getStore } from "@/lib/db";
import { assertStaffMayProcessRfq } from "@/lib/rfq/staff-access";
import { canInviteSupplier } from "@/lib/supplier-portal/onboarding";
import { guard } from "@/lib/auth/session";
import type { RfqMatchStatus } from "@/lib/types";
import { MANUAL_MATCH_STATUSES } from "@/lib/rfq/workflow";

// Chỉ ghi tay các trạng thái không kèm email: liên hệ ngoài hệ thống, NCC từ chối hoặc im lặng.
// "Đã có báo giá" ghi khi lưu giá; "Đã trình người mua" / "Người mua chọn" / "Không được chọn" do nút nghiệp vụ ghi.
const MATCH_STATUS_VALUES = MANUAL_MATCH_STATUSES;

async function enforce() {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
}

export async function addMatchAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const supplierId = String(fd.get("supplier_id"));
  if (!rfqId || !supplierId) return;
  const store = getStore();
  const rfq = await assertStaffMayProcessRfq(store, rfqId);
  const supplier = await store.getSupplier(supplierId);
  if (!supplier || !(await canInviteSupplier(supplier, store))) {
    throw new Error("Chỉ thêm nhà cung cấp đã công bố, có cổng RFQ được duyệt và tài khoản đang hoạt động.");
  }
  const existing = await store.listRfqMatches(rfqId);
  if (existing.some((m) => m.supplier_id === supplierId)) {
    revalidatePath(`/crm/rfqs/${rfqId}`);
    return;
  }
  await store.createRfqMatch({
    id: randomUUID(),
    rfq_id: rfqId,
    supplier_id: supplierId,
    status: "proposed",
  });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

export async function removeMatchAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  if (!matchId || !rfqId) return;
  const store = getStore();
  await assertStaffMayProcessRfq(store, rfqId);
  const match = await store.getRfqMatch(matchId);
  if (!match || match.rfq_id !== rfqId) throw new Error("Nhà cung cấp không thuộc RFQ này.");
  if (match.sent_to_supplier_at || match.sent_to_buyer_at) {
    throw new Error("Lời mời đã gửi; không thể xoá lịch sử báo giá và trao đổi. Hãy cập nhật trạng thái thay thế.");
  }
  await store.deleteRfqMatch(matchId);
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

/** Legacy endpoint: only the invited supplier may submit or revise a quote in
 * their authenticated portal. Staff may review and publish immutable snapshots.
 */
export async function updateMatchQuoteAction(_fd: FormData) {
  await enforce();
  throw new Error("Nhà cung cấp tự nộp giá trên cổng. Vexim chỉ duyệt và công bố, không nhập hoặc sửa thay họ.");
}

export async function updateMatchStatusAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  const status = String(fd.get("status") || "proposed") as RfqMatchStatus;
  if (!matchId || !rfqId) return;
  // Selection is a business event: use selectSupplierAction so the portal and email stay in sync.
  if (!MATCH_STATUS_VALUES.includes(status)) throw new Error("Trạng thái này do nút nghiệp vụ cập nhật: lưu giá, Trình người mua hoặc Chốt nhà cung cấp.");
  const store = getStore();
  await assertStaffMayProcessRfq(store, rfqId);
  const match = await store.getRfqMatch(matchId);
  if (!match || match.rfq_id !== rfqId || !!match.sent_to_buyer_at ||
      (match.sent_to_supplier_at ? status === "proposed" : status !== "proposed")) {
    throw new Error("Trạng thái lời mời đã thay đổi. Tải lại RFQ trước khi tiếp tục.");
  }
  await store.updateRfqMatch(matchId, { status });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
