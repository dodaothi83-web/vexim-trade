"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isSupplierServiceStatus } from "@/lib/supplier-services";

/** Nhân viên đổi trạng thái yêu cầu tư vấn; nhà cung cấp thấy trạng thái mới trong cổng. */
export async function updateServiceRequestStatusAction(form: FormData): Promise<void> {
  const gate = await guard("suppliers.manage");
  if (gate) return;
  const session = await getSession();
  const id = String(form.get("id") ?? "");
  const status = form.get("status");
  if (!id || !isSupplierServiceStatus(status) || !session) return;

  const store = getStore();
  const before = (await store.listSupplierServiceRequests({ limit: 500 })).find((request) => request.id === id);
  if (!before || before.status === status) return;
  const updated = await store.updateSupplierServiceRequest(id, { status, handled_by: session.uid });
  if (!updated) return;
  await store.addAuditLog({
    actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: before.supplier_id,
    action: "supplier.service_request_status",
    before: { request_id: id, status: before.status }, after: { request_id: id, status },
  }).catch((error) => console.error("[service-request] audit", error));
  revalidatePath("/crm/service-requests");
  revalidatePath("/supplier/portal/services");
}
