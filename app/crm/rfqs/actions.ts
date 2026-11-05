"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";


import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import type { RfqStatus } from "@/lib/types";
import { MANUAL_RFQ_STATUSES } from "@/lib/rfq/workflow";
import { releaseDirectRfqAfterReview } from "@/lib/rfq/release-after-review";

// Trình người mua, gửi mẫu, thành công và thất bại phải đi qua nút nghiệp vụ
// để email, lựa chọn NCC và lý do mất đơn luôn khớp dữ liệu.
function validateRegularStatus(value: string): RfqStatus {
  if (!MANUAL_RFQ_STATUSES.includes(value as RfqStatus)) {
    throw new Error("Trạng thái này phải cập nhật bằng nút nghiệp vụ (Trình người mua, Gửi mẫu, Chốt, Đóng thất bại).");
  }
  return value as RfqStatus;
}

async function enforce() {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
}

export async function updateRfqStatusFormAction(fd: FormData) {
  await enforce();
  const id = String(fd.get("id"));
  const status = validateRegularStatus(String(fd.get("status") || ""));
  const store = getStore();
  const before = await store.getRfq(id);
  if (!before) throw new Error("RFQ không tồn tại.");
  const previousStatus = before.status;
  if (previousStatus !== status) {
    await store.updateRfq(id, { status });
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: id, action: `status.${status}`,
      before: { status: previousStatus }, after: { status },
    }).catch((err) => console.error("[rfq] audit status thất bại:", err));
  }
  // Duyệt cho qua một RFQ trực tiếp đã bị giữ lại: chuyển tiếp tới nhà cung cấp người mua chọn.
  let released = 0;
  if ((previousStatus === "needs_review" || previousStatus === "spam") && (status === "new" || status === "in_progress")) {
    released = await releaseDirectRfqAfterReview(store, { ...before, status })
      .catch((err) => { console.error("[rfq] phát hành lại RFQ trực tiếp thất bại:", err); return 0; });
  }
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  redirect(released ? `/crm/rfqs/${id}?outreach_sent=${released}&outreach_skipped=0` : `/crm/rfqs/${id}`);
}
