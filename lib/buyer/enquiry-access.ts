import "server-only";

import { notFound } from "next/navigation";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { getStore } from "@/lib/db";

/** Both the new detail route and legacy tokens require a verified owner account. */
export async function requireOwnedBuyerEnquiry(input: { next: string } & ({ id: string; token?: never } | { token: string; id?: never })) {
  // Authenticate before looking up either ID or token: no anonymous existence oracle.
  const session = await requireBuyerSession(input.next);
  const store = getStore();
  const account = await store.getBuyerUserByEmail(session.email);
  if (!account?.verified_at || account.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) notFound();
  const rfq = input.id !== undefined ? await store.getRfq(input.id) : await store.getRfqByToken(input.token);
  if (!rfq?.buyer_id) notFound();
  const buyer = await store.getBuyer(rfq.buyer_id);
  if (!buyer?.email || buyer.email.trim().toLowerCase() !== account.email.trim().toLowerCase()) notFound();
  // Never infer ownership from company/contact name or attach a legacy record automatically.
  return { rfq, buyer };
}
