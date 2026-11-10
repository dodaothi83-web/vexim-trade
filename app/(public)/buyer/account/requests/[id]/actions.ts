"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";
import { getStore } from "@/lib/db";
import { canReadMediatedDesk, markMediatedRfqRead, sendMediatedRfqMessage, type MediatedError } from "@/lib/rfq/mediated";

export type BuyerDeskState = { error: MediatedError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function buyerVeximMessageAction(previous: BuyerDeskState, fd: FormData): Promise<BuyerDeskState> {
  const rfqId = String(fd.get("rfq_id") ?? "");
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id: rfqId,
    next: `/buyer/account/requests/${encodeURIComponent(rfqId)}` });
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  try {
    const result = await sendMediatedRfqMessage({ store: getStore(), rfq, match: null,
      sender: "buyer", email: buyer.email!, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-mediated] buyer message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/buyer/account/requests/${rfqId}`);
  revalidatePath("/buyer/account");
  revalidatePath(`/crm/rfqs/${rfqId}`);
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function buyerVeximReadAction(rfqId: string, visibleAt: string): Promise<void> {
  const { rfq } = await requireOwnedBuyerEnquiry({ id: rfqId,
    next: `/buyer/account/requests/${encodeURIComponent(rfqId)}` });
  if (!canReadMediatedDesk(rfq, null)) return;
  await markMediatedRfqRead({ store: getStore(), threadId: rfq.id, side: "party", visibleAt });
  revalidatePath("/buyer/account");
}
