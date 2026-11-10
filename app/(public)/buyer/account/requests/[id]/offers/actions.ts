"use server";

import { revalidatePath } from "next/cache";
import { buyerOfferAccess } from "@/lib/rfq/portal-access";
import { canUseRfqThread } from "@/lib/rfq/portal-core";
import { markVisibleRfqThreadRead, sendRfqThreadMessage, type RfqThreadError } from "@/lib/rfq/portal-conversation";

export type ThreadFormState = { error: RfqThreadError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function buyerRfqMessageAction(previous: ThreadFormState, fd: FormData): Promise<ThreadFormState> {
  const rfqId = String(fd.get("rfq_id") ?? "");
  const matchId = String(fd.get("match_id") ?? "");
  const access = await buyerOfferAccess(rfqId, matchId);
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  try {
    const result = await sendRfqThreadMessage({ store: access.store, rfq: access.rfq, match: access.match,
      side: "buyer", email: access.buyer.email!, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-portal] buyer message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/buyer/account/requests/${rfqId}/offers/${matchId}`);
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function buyerRfqReadAction(rfqId: string, matchId: string, visibleAt: string): Promise<void> {
  const access = await buyerOfferAccess(rfqId, matchId);
  if (!canUseRfqThread(access.rfq, access.match) && !access.match.sent_to_buyer_at) return;
  await markVisibleRfqThreadRead({ store: access.store, matchId: access.match.id, side: "buyer", visibleAt });
  revalidatePath("/buyer/account");
  revalidatePath(`/buyer/account/requests/${rfqId}`);
}
