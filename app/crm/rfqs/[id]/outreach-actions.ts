"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { guard } from "@/lib/auth/session";
import { dispatchRfqToSuppliers, presentShortlistToBuyer, selectSupplier } from "@/lib/rfq/outreach";

async function enforce() {
  const g = await guard("suppliers.manage");
  if (g) redirect("/crm/dashboard");
}

export async function sendRfqToSuppliersAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const matchIds = fd.getAll("match_ids").map(String);
  const deadlineDaysRaw = Number(fd.get("deadline_days") ?? 3);
  const deadlineDays = Number.isFinite(deadlineDaysRaw) && deadlineDaysRaw > 0 ? deadlineDaysRaw : 3;
  await dispatchRfqToSuppliers({ rfqId, matchIds, deadlineDays });
  revalidatePath(`/crm/rfqs/${rfqId}`);
  redirect(`/crm/rfqs/${rfqId}`);
}

export async function presentShortlistAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  await presentShortlistToBuyer({ rfqId });
  revalidatePath(`/crm/rfqs/${rfqId}`);
  redirect(`/crm/rfqs/${rfqId}`);
}

export async function selectSupplierAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const matchId = String(fd.get("match_id"));
  await selectSupplier({ rfqId, matchId });
  revalidatePath(`/crm/rfqs/${rfqId}`);
  redirect(`/crm/rfqs/${rfqId}`);
}
