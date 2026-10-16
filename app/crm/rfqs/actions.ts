"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";


import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import type { RfqStatus } from "@/lib/types";

async function enforce() {
  const g = await guard("suppliers.manage");
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
  const status = String(fd.get("status") || "new") as RfqStatus;
  const store = getStore();
  await store.updateRfq(id, { status });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  redirect(`/crm/rfqs/${id}`);
}

// Giữ lại các hàm cũ dùng ở page list (nơi gọi trực tiếp với tham số).
export async function assignRfqAction(id: string, userId: string | null) {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const store = getStore();
  await store.updateRfq(id, { assigned_to: userId || null });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}

export async function updateRfqStatusAction(id: string, status: string) {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const store = getStore();
  await store.updateRfq(id, { status: status as RfqStatus });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
  return { ok: true };
}
