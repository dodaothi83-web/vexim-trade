import type { Rfq, RfqLeadRating, RfqLeadRatingLevel, RfqLeadRatingReason, RfqMatch } from "@/lib/types";
import { rfqBuyerContact } from "./buyer-contact";
import { rfqChannel } from "./channel";

/**
 * Supplier lead ratings: an optional, private signal for Vexim staff.
 *
 * - The buyer never sees a rating, its existence or its effect: nothing here may be read
 *   from a buyer route, written to a buyer-visible table or used to revalidate a buyer page.
 * - A rating changes nothing by itself. There is no automatic score, block or RFQ status
 *   change; staff read each one in the CRM and decide.
 */
export const LEAD_RATING_LEVELS = ["good", "normal", "poor"] as const satisfies readonly RfqLeadRatingLevel[];

/** Ordinary B2B friction: worth a look only when it repeats across suppliers. */
export const LEAD_RATING_MINOR_REASONS = ["no_reply", "incomplete", "unrealistic"] as const satisfies readonly RfqLeadRatingReason[];
/** Staff should look at these even when a single supplier reports them. */
export const LEAD_RATING_SERIOUS_REASONS = ["fake_identity", "spam", "abusive"] as const satisfies readonly RfqLeadRatingReason[];
export const LEAD_RATING_REASONS: readonly RfqLeadRatingReason[] = [...LEAD_RATING_MINOR_REASONS, ...LEAD_RATING_SERIOUS_REASONS];
export const LEAD_RATING_NOTE_MAX = 500;

export function leadRatingSerious(rating: Pick<RfqLeadRating, "rating" | "reasons">): boolean {
  return rating.rating === "poor" &&
    rating.reasons.some((reason) => (LEAD_RATING_SERIOUS_REASONS as readonly string[]).includes(reason));
}

/**
 * Only a direct RFQ can be rated, and only by a supplier who actually dealt with the buyer:
 * a quote was sent or the conversation has at least one message. A supplier who merely
 * received an invitation has no basis for an assessment. Sourcing RFQs are excluded because
 * the supplier talks to Vexim there, not to the buyer.
 */
export function canRateRfqLead(rfq: Rfq, match: RfqMatch): boolean {
  if (match.rfq_id !== rfq.id || rfqChannel(rfq) !== "direct" || rfq.status === "spam" ||
      !match.sent_to_supplier_at || match.status === "proposed" || !rfqBuyerContact(rfq, match.supplier_id)) return false;
  return match.quote_price != null || !!match.sent_to_buyer_at || !!match.last_thread_message_at;
}

export type LeadRatingError = "unavailable" | "rating" | "reasons" | "note";

export function cleanLeadRating(input: { rating: unknown; reasons: unknown[]; note: unknown }):
  { ok: true; rating: RfqLeadRatingLevel; reasons: RfqLeadRatingReason[]; note: string | null } | { ok: false; error: LeadRatingError } {
  const rating = String(input.rating ?? "") as RfqLeadRatingLevel;
  if (!(LEAD_RATING_LEVELS as readonly string[]).includes(rating)) return { ok: false, error: "rating" };
  const picked = new Set(input.reasons.map((value) => String(value)));
  // A reason left ticked after switching back to "good" / "normal" is dropped, not stored.
  const reasons = rating === "poor" ? LEAD_RATING_REASONS.filter((reason) => picked.has(reason)) : [];
  if (rating === "poor" && !reasons.length) return { ok: false, error: "reasons" };
  const note = String(input.note ?? "").replace(/\r\n?/g, "\n").trim();
  if (note.length > LEAD_RATING_NOTE_MAX) return { ok: false, error: "note" };
  return { ok: true, rating, reasons, note: note || null };
}
