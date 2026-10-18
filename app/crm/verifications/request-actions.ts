"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";

/** Staff records the actual outreach; a request never creates an approval or an evidence file. */
export async function markVerificationRequestContactedAction(form: FormData) {
  const denied = await guard("verifications.inspect");
  if (denied) return denied;
  const session = await getSession();
  const supplierId = String(form.get("supplier_id") ?? "");
  const level = Number(form.get("target_level"));
  if (!session || !/^[\da-f-]{36}$/i.test(supplierId) || (level !== 2 && level !== 3)) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  const store = getStore();
  const before = (await store.listSupplierVerificationRequests(supplierId)).find((r) => r.target_level === level);
  if (!before) return { ok: false, message: "Không tìm thấy yêu cầu." };
  if (before.status !== "requested") return { ok: true, message: "Yêu cầu đã được liên hệ." };
  await store.markSupplierVerificationContacted(supplierId, level, session.uid);
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: supplierId,
    action: `verification.request.contact.l${level}`, before: { status: before.status },
    after: { status: "contacted", contacted_by: session.uid } });
  revalidatePath("/crm/verifications");
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath("/supplier/portal");
  return { ok: true, message: "Đã ghi nhận liên hệ. Hãy mở trang đánh giá để lên kế hoạch và tải bằng chứng." };
}
