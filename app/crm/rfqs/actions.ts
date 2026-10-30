"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";


import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import type { RfqStatus } from "@/lib/types";

// Sampling/lost must use the dedicated actions that require a reason / notify buyer.
function validateRegularStatus(value: string): RfqStatus {
  const allowed: RfqStatus[] = ["new", "needs_review", "in_progress", "matching", "quoted", "won", "spam"];
  if (!allowed.includes(value as RfqStatus)) {
    throw new Error("Sampling / lost phải dùng form Chốt giai đoạn (lost cần lý do).");
  }
  return value as RfqStatus;
}

async function enforce() {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
}

export async function assignRfqFormAction(fd: FormData) {
  await enforce();
  const id = String(fd.get("id"));
  const to = String(fd.get("to") || "");
  const store = getStore();
  await store.updateRfq(id, { assigned_to: to || null });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  redirect(`/crm/rfqs/${id}`);
}

export async function updateRfqStatusFormAction(fd: FormData) {
  await enforce();
  const id = String(fd.get("id"));
  const status = validateRegularStatus(String(fd.get("status") || ""));
  const store = getStore();
  const before = await store.getRfq(id);
  if (!before) throw new Error("RFQ không tồn tại.");
  if (before.status !== status) {
    await store.updateRfq(id, { status });
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: id, action: `status.${status}`,
      before: { status: before.status }, after: { status },
    }).catch((err) => console.error("[rfq] audit status thất bại:", err));
  }
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  redirect(`/crm/rfqs/${id}`);
}

// Giữ lại các hàm cũ dùng ở page list (nơi gọi trực tiếp với tham số).
export async function assignRfqAction(id: string, userId: string | null) {
  const gate = await guard("rfq.manage");
  if (gate) return gate;
  const store = getStore();
  await store.updateRfq(id, { assigned_to: userId || null });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}

export async function updateRfqStatusAction(id: string, status: string) {
  const gate = await guard("rfq.manage");
  if (gate) return gate;
  const store = getStore();
  await store.updateRfq(id, { status: validateRegularStatus(status) });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}
