import "server-only";
import type { DataStore } from "@/lib/db/types";
import { rfqChannel } from "./channel";
import { createPreferredSupplierMatches } from "./auto-match";
import { releaseTargetedQuoteToPortal } from "./targeted-portal";
import { canDirectPublishRfqQuote } from "./portal-core";

/** Recover a saved direct RFQ after a transient portal error, without any staff
 * triage, email fallback or conversion into sourcing. Idempotent per match.
 */
export async function retryPendingDirectRfqs(store: DataStore): Promise<{ checked: number; released: number; published: number }> {
  const rfqs = (await store.listRetryableDirectRfqs()).filter((rfq) =>
    rfqChannel(rfq) === "direct" && ["new", "matching", "quoted"].includes(rfq.status) &&
    rfq.spam_score < 40 && rfq.specs?.direct_delivery_version === "portal_direct_v2" &&
    rfq.specs?.buyer_contact_policy_version === "rfq_contact_v2" && !!rfq.preferred_supplier_ids?.length);
  let released = 0, published = 0;
  for (const rfq of rfqs) {
    try {
      await createPreferredSupplierMatches(store, rfq.id, rfq.preferred_supplier_ids);
      released += await releaseTargetedQuoteToPortal(store, rfq);
      // If the supplier saved a quote but the publication RPC was temporarily down,
      // retry from the exact saved revision. Only NEW portal-only RFQs carry this
      // marker: never auto-publish a historical staff-entered/email quote.
      if (rfq.specs?.direct_delivery_version === "portal_direct_v2") {
        for (const match of await store.listRfqMatches(rfq.id)) {
          if (match.status !== "quoted" || match.quote_price == null || !canDirectPublishRfqQuote(rfq, match)) continue;
          published += (await store.publishRfqQuotes(rfq.id, [match.id], { [match.id]: match.updated_at })).length;
        }
      }
    } catch (error) { console.error("[rfq] automatic direct portal retry failed", rfq.id, error); }
  }
  return { checked: rfqs.length, released, published };
}
