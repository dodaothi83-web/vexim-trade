"use server";

import { revalidatePath } from "next/cache";
import { buyerOfferAccess } from "@/lib/rfq/portal-access";
import { markVisibleRfqThreadRead } from "@/lib/rfq/portal-conversation";

/** Người mua đã thấy báo giá đã công bố: tắt nhãn "Báo giá mới". Hỏi đáp đi qua Tin nhắn. */
export async function buyerRfqReadAction(rfqId: string, matchId: string, visibleAt: string): Promise<void> {
  const access = await buyerOfferAccess(rfqId, matchId);
  if (!access.match.sent_to_buyer_at) return;
  await markVisibleRfqThreadRead({ store: access.store, matchId: access.match.id, side: "buyer", visibleAt });
  revalidatePath("/buyer/account");
  revalidatePath(`/buyer/account/requests/${rfqId}`);
}
