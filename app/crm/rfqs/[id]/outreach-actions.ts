"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession, guard } from "@/lib/auth/session";
import { dispatchRfqToSuppliers, selectSupplier } from "@/lib/rfq/outreach";
import { runRfqPortalAlerts } from "@/lib/rfq/portal-alerts";
import { getStore } from "@/lib/db";

async function enforce() {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
}

export async function sendRfqToSuppliersAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const matchIds = fd.getAll("match_ids").map(String);
  const deadlineDaysRaw = Number(fd.get("deadline_days") ?? 3);
  const deadlineDays = Number.isFinite(deadlineDaysRaw) && deadlineDaysRaw > 0 ? deadlineDaysRaw : 3;
  const session = await getSession();
  const result = await dispatchRfqToSuppliers({ rfqId, matchIds, deadlineDays, actorId: session?.uid ?? "" });
  revalidatePath(`/crm/rfqs/${rfqId}`);
  redirect(`/crm/rfqs/${rfqId}?outreach_sent=${result.sent}&outreach_skipped=${result.skipped}`);
}

export async function presentShortlistAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const store = getStore();
  // Only publish exact draft revisions that staff saw on the confirmation page.
  // A quote edited in another tab between review and submit is skipped, not disclosed.
  const review = new Map(fd.getAll("publish_version").slice(0, 101).map((value) => {
    const entry = String(value);
    const divider = entry.indexOf(":");
    return [entry.slice(0, divider), entry.slice(divider + 1)] as const;
  }).filter(([id, stamp]) => !!id && !!stamp));
  if (!review.size || review.size > 100) throw new Error("Không có bản báo giá đã xem để công bố. Tải lại RFQ.");
  const ready = (await store.listRfqMatches(rfqId)).filter((m) => m.status === "quoted" &&
    m.quote_price != null && review.has(m.id));
  const published = await store.publishRfqQuotes(rfqId, ready.map((m) => m.id),
    Object.fromEntries(ready.map((m) => [m.id, review.get(m.id)!])));
  if (published.length) await runRfqPortalAlerts(store, { matchIds: published.map((v) => v.match_id) })
    .catch((error) => console.error("[rfq] quotes published; email alert will retry", error));
  revalidatePath(`/crm/rfqs/${rfqId}`);
  revalidatePath(`/buyer/account/requests/${rfqId}`);
  revalidatePath("/buyer/account");
  redirect(`/crm/rfqs/${rfqId}?published=${published.length}&publish_skipped=${Math.max(0, review.size - published.length)}`);
}

export async function selectSupplierAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const matchId = String(fd.get("match_id"));
  const session = await getSession();
  const result = await selectSupplier({ rfqId, matchId, actorId: session?.uid ?? "" });
  revalidatePath(`/crm/rfqs/${rfqId}`);
  redirect(`/crm/rfqs/${rfqId}?selection_email=${result.email}`);
}
