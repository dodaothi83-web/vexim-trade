"use server";

import { revalidatePath } from "next/cache";
import { supplierOfferAccess } from "@/lib/rfq/portal-access";
import { canReadRfqThread } from "@/lib/rfq/portal-core";
import { markVisibleRfqThreadRead, sendRfqThreadMessage, type RfqThreadError } from "@/lib/rfq/portal-conversation";

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
