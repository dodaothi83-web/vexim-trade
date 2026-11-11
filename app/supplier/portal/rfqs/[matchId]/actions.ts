"use server";

import { revalidatePath } from "next/cache";
import { supplierOfferAccess } from "@/lib/rfq/portal-access";
import { canReadRfqThread } from "@/lib/rfq/portal-core";
import { markVisibleRfqThreadRead, sendRfqThreadMessage, type RfqThreadError } from "@/lib/rfq/portal-conversation";
import { canRateRfqLead, cleanLeadRating, type LeadRatingError } from "@/lib/rfq/lead-rating";
import { migrationHint } from "@/lib/db/migration-hints";
import { canReadMediatedDesk, markMediatedRfqRead, sendMediatedRfqMessage, type MediatedError } from "@/lib/rfq/mediated";

export type ThreadFormState = { error: RfqThreadError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function supplierRfqMessageAction(previous: ThreadFormState, fd: FormData): Promise<ThreadFormState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  try {
    const result = await sendRfqThreadMessage({ store: access.store, rfq: access.rfq, match: access.match,
      side: "supplier", email: access.user.email, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-portal] supplier message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath(`/buyer/account/requests/${access.rfq.id}/offers/${matchId}`);
  revalidatePath(`/buyer/account/requests/${access.rfq.id}`);
  revalidatePath("/buyer/account");
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function supplierRfqReadAction(matchId: string, visibleAt: string): Promise<void> {
  const access = await supplierOfferAccess(matchId);
  if (!canReadRfqThread(access.rfq, access.match)) return;
  await markVisibleRfqThreadRead({ store: access.store, matchId: access.match.id, side: "supplier", visibleAt });
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
}

export type SupplierDeskState = { error: MediatedError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function supplierVeximMessageAction(previous: SupplierDeskState, fd: FormData): Promise<SupplierDeskState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  try {
    const result = await sendMediatedRfqMessage({ store: access.store, rfq: access.rfq, match: access.match,
      sender: "supplier", email: access.user.email, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-mediated] supplier message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath(`/crm/rfqs/${access.rfq.id}`);
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function supplierVeximReadAction(matchId: string, visibleAt: string): Promise<void> {
  const access = await supplierOfferAccess(matchId);
  if (!canReadMediatedDesk(access.rfq, access.match)) return;
  await markMediatedRfqRead({ store: access.store, threadId: access.match.id, side: "party", visibleAt });
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
}

export type LeadRatingFormState = { error: LeadRatingError | "unknown" | null; saved: boolean; seq: number };

/** Optional and private. Saving it never touches a buyer-visible record or page: do not
 * add a buyer path to the revalidation list or notify the buyer from here. */
export async function supplierLeadRatingAction(previous: LeadRatingFormState, fd: FormData): Promise<LeadRatingFormState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  if (!canRateRfqLead(access.rfq, access.match)) return { error: "unavailable", saved: false, seq: previous.seq };
  const clean = cleanLeadRating({ rating: fd.get("rating"), reasons: fd.getAll("reasons"), note: fd.get("note") });
  if (!clean.ok) return { error: clean.error, saved: false, seq: previous.seq };
  try {
    await access.store.saveRfqLeadRating({ match_id: access.match.id, rfq_id: access.rfq.id,
      supplier_id: access.supplier.id, buyer_id: access.rfq.buyer_id, rating: clean.rating,
      reasons: clean.reasons, note: clean.note, rated_by_email: access.user.email });
  } catch (error) {
    console.error("[rfq-lead-rating] not saved", migrationHint(error) ?? error);
    return { error: "unknown", saved: false, seq: previous.seq };
  }
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath(`/crm/rfqs/${access.rfq.id}`);
  revalidatePath(`/crm/buyers/${access.rfq.buyer_id}`);
  return { error: null, saved: true, seq: previous.seq + 1 };
}
