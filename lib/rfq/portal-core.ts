import type { Rfq, RfqMatch, RfqQuoteVersion } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { rfqBuyerContact } from "./buyer-contact";
import { rfqChannel } from "./channel";

/** Only an invited party with an RFQ-specific consent grant may see this match's read markers. */
export function canReadRfqThread(rfq: Rfq, match: RfqMatch): boolean {
  if (match.rfq_id !== rfq.id || !match.sent_to_supplier_at || rfqChannel(rfq) === "question" ||
      !rfqBuyerContact(rfq, match.supplier_id)) return false;
  // Vexim remains the intermediary for sourcing until staff presents this match.
  return rfqChannel(rfq) === "direct" || !!match.sent_to_buyer_at;
}

/**
 * Người mua và nhà cung cấp chỉ còn một kênh nhắn tin: Tin nhắn (chat chung). Khung trao đổi
 * riêng theo RFQ đã bỏ. Nhà cung cấp được người mua chọn đích danh trong RFQ trực tiếp (đã
 * đồng ý chia sẻ liên hệ với đúng nhà cung cấp này) được mở chat để hỏi lại trước khi báo giá;
 * RFQ đã chốt, bị từ chối hay spam thì không.
 */
export function canSupplierChatAboutRfq(rfq: Rfq, match: RfqMatch): boolean {
  return rfqChannel(rfq) === "direct" && canReadRfqThread(rfq, match) &&
    !["proposed", "declined", "not_selected"].includes(match.status) &&
    !["won", "lost", "spam"].includes(rfq.status);
}

/** A named supplier may auto-publish only if THIS supplier has the buyer's RFQ grant. */
export function canDirectPublishRfqQuote(rfq: Rfq, match: RfqMatch): boolean {
  return match.rfq_id === rfq.id && rfqChannel(rfq) === "direct" &&
    !!match.sent_to_supplier_at && !!rfqBuyerContact(rfq, match.supplier_id);
}

/** A buyer may open a published offer. Before a quote there is nothing to open: questions go to Messages. */
export function canBuyerOpenRfqMatch(rfq: Rfq, match: RfqMatch): boolean {
  return match.rfq_id === rfq.id && rfqChannel(rfq) !== "question" && !!match.sent_to_buyer_at;
}

/** What a buyer should be told when a direct RFQ has no published quote: every named
 * supplier declined, or the remaining ones are past their response date. Null while any
 * supplier may still be preparing a quote or once a quote has been published. */
export function buyerDirectOutcome(matches: Pick<RfqMatch, "status" | "sent_to_supplier_at" | "sent_to_buyer_at">[]): "declined" | "no_response" | null {
  const sent = matches.filter((m) => !!m.sent_to_supplier_at && m.status !== "proposed");
  if (!sent.length || sent.some((m) => !!m.sent_to_buyer_at)) return null;
  if (sent.every((m) => m.status === "declined")) return "declined";
  return sent.every((m) => m.status === "declined" || m.status === "no_response") ? "no_response" : null;
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
export function rfqMessageRateLimited(messages: Array<{ sender: "buyer" | "supplier" | "staff"; created_at: string }>,
  side: "buyer" | "supplier" | "staff", now = Date.now()): boolean {
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

/** A published quote the buyer has not opened yet. */
export function buyerMatchHasNewQuote(m: Pick<RfqMatch, "sent_to_buyer_at" | "buyer_last_read_at">): boolean {
  return !!m.sent_to_buyer_at && (!m.buyer_last_read_at || rfqEventAfter(m.sent_to_buyer_at, m.buyer_last_read_at));
}
