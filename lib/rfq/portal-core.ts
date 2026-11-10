import type { Rfq, RfqMatch, RfqQuoteVersion, RfqThreadMessage } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { rfqBuyerContact } from "./buyer-contact";
import { rfqChannel } from "./channel";

/** Only an invited party with an RFQ-specific consent grant may read this thread. */
export function canReadRfqThread(rfq: Rfq, match: RfqMatch): boolean {
  if (match.rfq_id !== rfq.id || !match.sent_to_supplier_at || rfqChannel(rfq) === "question" ||
      !rfqBuyerContact(rfq, match.supplier_id)) return false;
  // Vexim remains the intermediary for sourcing until staff presents this match.
  return rfqChannel(rfq) === "direct" || !!match.sent_to_buyer_at;
}

export function canUseRfqThread(rfq: Rfq, match: RfqMatch): boolean {
  return canReadRfqThread(rfq, match) && !["proposed", "declined", "not_selected"].includes(match.status) &&
    !["won", "lost", "spam"].includes(rfq.status);
}

/** A named supplier may auto-publish only if THIS supplier has the buyer's RFQ grant. */
export function canDirectPublishRfqQuote(rfq: Rfq, match: RfqMatch): boolean {
  return match.rfq_id === rfq.id && rfqChannel(rfq) === "direct" &&
    !!match.sent_to_supplier_at && !!rfqBuyerContact(rfq, match.supplier_id);
}

/** A buyer may see a published offer or the invited direct supplier's pre-quote thread. */
export function canBuyerOpenRfqMatch(rfq: Rfq, match: RfqMatch): boolean {
  return match.rfq_id === rfq.id && rfqChannel(rfq) !== "question" && (
    !!match.sent_to_buyer_at || (rfqChannel(rfq) === "direct" && canUseRfqThread(rfq, match))
  );
}

/** A seller cannot smuggle contact details into the offer's public conditions. */
export function cleanQuoteBuyerNote(raw: unknown): { ok: true; note: string } | { ok: false; error: "buyerNote" } {
  const note = String(raw ?? "").trim();
  if (note.length > 1000 || withoutDirectContacts(note) !== note) return { ok: false, error: "buyerNote" };
  return { ok: true, note };
}

export function cleanRfqMessage(raw: unknown): { ok: true; body: string } | { ok: false; error: "empty" | "too_long" } {
  const body = String(raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!body) return { ok: false, error: "empty" };
  if (body.length > 2000) return { ok: false, error: "too_long" };
  return { ok: true, body };
}

/** Cap bursts per participant / match; never rate-limit the other supplier's thread. */
export function rfqMessageRateLimited(messages: Pick<RfqThreadMessage, "sender" | "created_at">[],
  side: "buyer" | "supplier", now = Date.now()): boolean {
  return messages.filter((m) => m.sender === side && now - Date.parse(m.created_at) < 10 * 60_000).length >= 12;
}

export function lastPublishedQuote(versions: RfqQuoteVersion[], match: RfqMatch): RfqQuoteVersion | null {
  // Never fall back to the mutable match: an old sent_to_buyer_at can coexist with
  // a newer unpublished revision. Both stores backfill safe historical versions.
  return versions.filter((v) => v.match_id === match.id).sort((a, b) => b.version - a.version)[0] ?? null;
}

/** PostgreSQL stores microseconds. Date.parse rounds to milliseconds, which would leave
 * a real unread event unnoticed (or keep an email pending) when two events share a ms. */
export function rfqEventAfter(eventAt: string, readAt: string): boolean {
  const eventMs = Date.parse(eventAt);
  const readMs = Date.parse(readAt);
  if (!Number.isFinite(eventMs) || !Number.isFinite(readMs)) return false;
  if (eventMs !== readMs) return eventMs > readMs;
  const micros = (value: string) => Number((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(0, 6));
  return micros(eventAt) > micros(readAt);
}

/** Quote publication and a supplier reply are different badge labels for the buyer. */
export function buyerMatchHasNewQuote(m: Pick<RfqMatch, "sent_to_buyer_at" | "buyer_last_read_at">): boolean {
  return !!m.sent_to_buyer_at && (!m.buyer_last_read_at || rfqEventAfter(m.sent_to_buyer_at, m.buyer_last_read_at));
}

/** Distinguish the quote from messages; an unpresented sourcing draft is never an update. */
export function buyerMatchHasUpdate(m: Pick<RfqMatch, "sent_to_supplier_at" | "sent_to_buyer_at" |
  "buyer_last_read_at" | "last_thread_message_at" | "last_thread_sender" | "last_supplier_message_at">): boolean {
  const read = m.buyer_last_read_at ?? null;
  const published = buyerMatchHasNewQuote(m);
  const replyAt = m.last_supplier_message_at ?? (m.last_thread_sender === "supplier" ? m.last_thread_message_at : null);
  const reply = m.sent_to_supplier_at && replyAt && (!read || rfqEventAfter(replyAt, read));
  return !!(published || reply);
}

export function supplierMatchHasReply(m: Pick<RfqMatch, "last_thread_message_at" | "last_thread_sender" |
  "last_buyer_message_at" | "supplier_last_read_at">): boolean {
  const replyAt = m.last_buyer_message_at ?? (m.last_thread_sender === "buyer" ? m.last_thread_message_at : null);
  return !!replyAt && (!m.supplier_last_read_at || rfqEventAfter(replyAt, m.supplier_last_read_at));
}

/** Read markers may advance only through events actually rendered in a scoped thread. */
export function buyerSupplierThreadMessages(messages: RfqThreadMessage[]): Pick<RfqThreadMessage, "id" | "sender" | "body" | "created_at">[] {
  // Local storage returns sender_email; never serialize the other party's address
  // (or future audit fields) into either side's client component props.
  return messages.map(({ id, sender, body, created_at }) => ({ id, sender, body, created_at }));
}

export function lastVisibleEventAt(quote: RfqQuoteVersion | null, messages: Pick<RfqThreadMessage, "created_at">[]): string | null {
  const timestamps = [quote?.published_at, ...messages.map((m) => m.created_at)].filter((s): s is string => !!s);
  return timestamps.reduce<string | null>((last, at) => !last || rfqEventAfter(at, last) ? at : last, null);
}
