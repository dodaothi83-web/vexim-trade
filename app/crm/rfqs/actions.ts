"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";

export async function assignRfqAction(id: string, userId: string | null) {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const store = getStore();
  await store.updateRfq(id, {
    assigned_to: userId || null,
    // Ghi nhận first_response_at không đặt ở đây — đặt khi buyer nhận được email phản hồi đầu tiên.
  });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}

export async function updateRfqStatusAction(id: string, status: string) {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const store = getStore();
  const patch: Record<string, unknown> = { status };
  if (status !== "new" && status !== "qualified" && status !== "matching") {
    // Không tự set first_response_at ở đây — sẽ set khi gửi email đầu tiên cho buyer.
  }
  await store.updateRfq(id, patch);
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}
