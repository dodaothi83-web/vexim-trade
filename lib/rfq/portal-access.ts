import "server-only";

import { notFound, redirect } from "next/navigation";
import { getStore } from "@/lib/db";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { rfqChannel } from "./channel";
import { canBuyerOpenRfqMatch } from "./portal-core";

/** No client-provided buyer email, company, RFQ token or supplier ID grants access. */
export async function buyerOfferAccess(rfqId: string, matchId: string) {
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id: rfqId,
    next: `/buyer/account/requests/${encodeURIComponent(rfqId)}/offers/${encodeURIComponent(matchId)}` });
  const store = getStore();
  const match = await store.getRfqMatch(matchId);
  if (!match || !canBuyerOpenRfqMatch(rfq, match)) notFound();
  const supplier = await store.getSupplier(match.supplier_id);
  return { store, rfq, buyer, match, supplier };
}

/** A supplier cannot open a proposed, unsent, foreign or question-only invitation. */
export async function supplierOfferAccess(matchId: string) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/supplier/portal");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const match = await access.store.getRfqMatch(matchId);
  if (!match || match.supplier_id !== access.supplier.id || !match.sent_to_supplier_at || match.status === "proposed") notFound();
  const rfq = await access.store.getRfq(match.rfq_id);
  if (!rfq || rfqChannel(rfq) === "question") notFound();
  return { ...access, rfq, match };
}
