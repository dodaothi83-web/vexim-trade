import type { DataStore } from "@/lib/db/types";
import type { Rfq, RfqMatch } from "@/lib/types";
import { rfqChannel } from "./channel";
import { rfqBuyerContact } from "./buyer-contact";

/**
 * A single, buyer-addressed RFQ may establish its supplier in Buyer CRM only AFTER
 * the invitation is persisted as sent. Never attach from a proposal, a sourcing RFQ,
 * a multiple-supplier request or a different supplier's match. No connection email:
 * the RFQ notification is the invitation, and must not be sent a second time.
 */
export async function attachBuyerAfterDirectRfqDelivery(store: DataStore, rfq: Rfq, matchId: string): Promise<boolean> {
  const ids = [...new Set(rfq.preferred_supplier_ids ?? [])];
  if (rfqChannel(rfq) !== "direct" || ids.length !== 1) return false;
  const match: RfqMatch | null = await store.getRfqMatch(matchId);
  if (!match || match.rfq_id !== rfq.id || match.supplier_id !== ids[0] ||
      !match.sent_to_supplier_at || match.status === "proposed" ||
      !rfqBuyerContact(rfq, match.supplier_id)) return false;
  const buyer = await store.getBuyer(rfq.buyer_id);
  if (!buyer) return false;
  // The legacy global CRM anonymity flag is deliberately NOT changed here:
  // consent for one RFQ does not authorize disclosing other CRM/stage data.
  if (buyer.supplier_id) return false;
  if (!await store.attachBuyerIfUnassigned(buyer.id, match.supplier_id)) return false;
  // Activity is audit/UX only; failure must not undo the successful atomic link or resend RFQ.
  await store.addActivity({
    buyer_id: buyer.id, type: "supplier_change",
    message: `Tự gắn nhà cung cấp sau khi gửi ${rfq.code} (không gửi email kết nối riêng)`,
    created_by: null,
  }).catch((error) => console.error("[rfq] Buyer linked but activity logging failed", error));
  return true;
}
