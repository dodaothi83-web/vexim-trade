import type { DataStore } from "@/lib/db/types";
import type { Rfq, RfqMatch, RfqMediatedMessage, RfqMediatedThread } from "@/lib/types";
import { sourcingInviteConsent } from "./buyer-contact";
import { rfqChannel } from "./channel";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { cleanRfqMessage, rfqEventAfter, rfqMessageRateLimited } from "./portal-core";

export type MediatedError = "unavailable" | "empty" | "too_long" | "rate_limited" | "contact";
export type SafeMediatedMessage = Pick<RfqMediatedMessage, "id" | "sender" | "body" | "created_at">;

/** A buyer sees one desk per sourcing RFQ; each invited supplier sees only its own desk. */
export function canUseMediatedDesk(rfq: Rfq, match: RfqMatch | null): boolean {
  if (rfqChannel(rfq) !== "sourcing" || ["won", "lost", "spam"].includes(rfq.status)) return false;
  if (!match) return true;
  return match.rfq_id === rfq.id && !!match.sent_to_supplier_at &&
    !["proposed", "declined", "not_selected"].includes(match.status) &&
    sourcingInviteConsent(rfq, match.supplier_id);
}

/** Read-only after closure; authorization still checks RFQ ownership and match scope in each action. */
export function canReadMediatedDesk(rfq: Rfq, match: RfqMatch | null): boolean {
  return rfqChannel(rfq) === "sourcing" && (!match ||
    (match.rfq_id === rfq.id && !!match.sent_to_supplier_at && match.status !== "proposed" &&
      sourcingInviteConsent(rfq, match.supplier_id)));
}

export function safeMediatedMessages(messages: RfqMediatedMessage[]): SafeMediatedMessage[] {
  return messages.map(({ id, sender, body, created_at }) => ({ id, sender, body, created_at }));
}

export function deskHasNewReply(thread: RfqMediatedThread | null | undefined, side: "party" | "staff"): boolean {
  const event = side === "party" ? thread?.last_staff_message_at : thread?.last_party_message_at;
  const read = side === "party" ? thread?.party_last_read_at : thread?.staff_last_read_at;
  return !!event && (!read || rfqEventAfter(event, read));
}

/** Authenticated caller must resolve buyer ownership, supplier match ownership or staff permission first. */
export async function sendMediatedRfqMessage(input: { store: DataStore; rfq: Rfq; match: RfqMatch | null;
  sender: "buyer" | "supplier" | "staff"; email: string; body: unknown,
}): Promise<{ ok: true; message: RfqMediatedMessage } | { ok: false; error: MediatedError }> {
  const { store, rfq, match, sender, email } = input;
  if ((match ? sender === "buyer" : sender === "supplier") || !canUseMediatedDesk(rfq, match)) {
    return { ok: false, error: "unavailable" };
  }
  const checked = cleanRfqMessage(input.body);
  if (!checked.ok) return { ok: false, error: checked.error };
  // A mediated supplier desk cannot be used to hand over buyer email, phone or
  // website. Staff must keep the buyer contact in the private buyer desk.
  if (match && sender === "staff" && withoutDirectContacts(checked.body) !== checked.body) {
    return { ok: false, error: "contact" };
  }
  const threadId = match?.id ?? rfq.id;
  const messages = await store.listRfqMediatedMessages(threadId);
  if (rfqMessageRateLimited(messages, sender)) return { ok: false, error: "rate_limited" };
  // Recheck before the write; the SQL RPC rechecks under row locks to close the race.
  const [fresh, current] = await Promise.all([match ? store.getRfqMatch(match.id) : null, store.getRfq(rfq.id)]);
  if (!current || (match && !fresh) || !canUseMediatedDesk(current, fresh)) return { ok: false, error: "unavailable" };
  try {
    const message = await store.postRfqMediatedMessage({ rfqId: rfq.id, matchId: match?.id ?? null,
      sender, email, body: checked.body });
    return { ok: true, message };
  } catch (error) {
    if (error instanceof Error && /RFQ desk rate limited/.test(error.message)) return { ok: false, error: "rate_limited" };
    if (error instanceof Error && /RFQ desk contact details not allowed/.test(error.message)) return { ok: false, error: "contact" };
    if (error instanceof Error && /Sourcing RFQ is not open|Supplier not invited to sourcing RFQ|RFQ consent missing|RFQ recipient not confirmed|Buyer desk only|Supplier desk only|RFQ thread scope mismatch/.test(error.message)) {
      return { ok: false, error: "unavailable" };
    }
    throw error;
  }
}

export async function markMediatedRfqRead(input: { store: DataStore; threadId: string;
  side: "party" | "staff"; visibleAt: string }): Promise<void> {
  const seen = Date.parse(input.visibleAt);
  if (!Number.isFinite(seen) || seen > Date.now()) return;
  const messages = await input.store.listRfqMediatedMessages(input.threadId);
  if (!messages.some((m) => m.created_at === input.visibleAt)) return;
  await input.store.markRfqMediatedRead(input.threadId, input.side, input.visibleAt);
}
