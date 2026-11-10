"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { parseSupplierQuote, recordSupplierPortalQuote } from "@/lib/supplier-portal/quote";
import { getPortalMessages } from "@/lib/i18n/server";
import { runRfqPortalAlerts } from "@/lib/rfq/portal-alerts";

/** Khi lỗi, trả lại giá trị đã nhập vì React đặt lại form sau mỗi lần gửi. */
export type SupplierQuoteState = { error: string | null; values?: Record<string, string> };

const FIELDS = ["price", "currency", "unit", "incoterm", "lead_time_days", "valid_until", "buyer_note", "note"] as const;
const keep = (fd: FormData) => Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "").slice(0, 1000)]));

/** Nhà cung cấp gửi báo giá hoặc từ chối một lời mời của chính mình. */
export async function submitSupplierQuoteAction(_prev: SupplierQuoteState, fd: FormData): Promise<SupplierQuoteState> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) redirect("/supplier/portal");
  const errors = (await getPortalMessages()).m.rfqs.quote.errors;

  const parsed = parseSupplierQuote(fd);
  if (!parsed.ok) return { error: errors[parsed.error], values: keep(fd) };

  let result: Awaited<ReturnType<typeof recordSupplierPortalQuote>>;
  try {
    result = await recordSupplierPortalQuote({
      store: access.store,
      supplier: access.supplier,
      actorEmail: access.user.email,
      matchId: String(fd.get("match_id") ?? ""),
      quote: parsed.value,
    });
  } catch (error) {
    const key = error instanceof Error ? error.message : "";
    if (key !== "notFound" && key !== "closed") console.error("[supplier-portal] quote not saved", error);
    return { error: key === "notFound" || key === "closed" ? errors[key] : errors.unknown, values: keep(fd) };
  }
  // Direct RFQs publish the supplier's own snapshot immediately. Email is an independent
  // alert queued in the same publication transaction: an email failure cannot hide it.
  let published = false;
  if (result.intent === "quote" && result.direct) {
    try {
      published = (await access.store.publishRfqQuotes(result.rfqId, [result.matchId],
        { [result.matchId]: result.updatedAt })).length > 0;
      if (published) await runRfqPortalAlerts(access.store, { matchIds: [result.matchId] })
        .catch((error) => console.error("[supplier-portal] quote published; email alert will retry", error));
    } catch (error) {
      console.error(`[supplier-portal] quote saved but buyer publication failed for ${result.code}`, error);
    }
  }
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
  revalidatePath(`/crm/rfqs/${result.rfqId}`);
  revalidatePath(`/buyer/account/requests/${result.rfqId}`);
  revalidatePath("/buyer/account");
  const outcome = result.intent === "decline" ? "declined" : published ? "delivered" : result.direct ? "publish_pending" : "sent";
  redirect(`/supplier/portal/rfqs?quote=${outcome}&code=${encodeURIComponent(result.code)}`);
}
