"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";

/** Server action inline cho dropdown phân công ở trang danh sách — không redirect. */
export async function assignRfqInlineAction(fd: FormData) {
  const g = await guard("suppliers.manage");
  if (g) return;
  const id = String(fd.get("id"));
  const to = String(fd.get("to") || "");
  const store = getStore();
  await store.updateRfq(id, { assigned_to: to || null });
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
}
