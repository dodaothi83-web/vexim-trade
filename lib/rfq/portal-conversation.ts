import type { DataStore } from "@/lib/db/types";
import type { Rfq, RfqMatch, RfqThreadMessage } from "@/lib/types";
import { canUseRfqThread, cleanRfqMessage, rfqEventAfter, rfqMessageRateLimited } from "./portal-core";

export type RfqThreadError = "unavailable" | "empty" | "too_long" | "rate_limited";

export async function sendRfqThreadMessage(input: {
  store: DataStore; rfq: Rfq; match: RfqMatch;
  side: "buyer" | "supplier"; email: string; body: unknown;
}): Promise<{ ok: true; message: RfqThreadMessage } | { ok: false; error: RfqThreadError }> {
  if (!canUseRfqThread(input.rfq, input.match)) return { ok: false, error: "unavailable" };
  const checked = cleanRfqMessage(input.body);
  if (!checked.ok) return { ok: false, error: checked.error };
  const messages = await input.store.listRfqThreadMessages(input.match.id);
  if (rfqMessageRateLimited(messages, input.side)) return { ok: false, error: "rate_limited" };
  // Re-read the match: a staff member may have closed/presented it since this page loaded.
  const [fresh, rfq] = await Promise.all([input.store.getRfqMatch(input.match.id), input.store.getRfq(input.rfq.id)]);
  if (!fresh || !rfq || !canUseRfqThread(rfq, fresh)) return { ok: false, error: "unavailable" };
  try {
    const message = await input.store.addRfqThreadMessage({
      match_id: fresh.id, sender: input.side, sender_email: input.email.trim().toLowerCase(), body: checked.body,
    });
    return { ok: true, message };
  } catch (error) {
    // The SQL trigger rechecks availability and rate limits under a row lock, including
    // simultaneous tabs that passed the optimistic application-side check above.
    if (error instanceof Error && /RFQ thread rate limited/.test(error.message)) return { ok: false, error: "rate_limited" };
    if (error instanceof Error && /RFQ thread is not available|RFQ contact (consent missing|recipient not confirmed)|Direct RFQ supplier not named by buyer|Sourcing thread has not been presented/.test(error.message)) {
      return { ok: false, error: "unavailable" };
    }
    throw error;
  }
}

/** At is the latest event rendered to the user, never the entire future thread. */
export async function markVisibleRfqThreadRead(input: {
  store: DataStore; matchId: string; side: "buyer" | "supplier"; visibleAt: string;
}): Promise<void> {
  const seen = Date.parse(input.visibleAt);
  if (!Number.isFinite(seen)) return;
  const match = await input.store.getRfqMatch(input.matchId);
  if (!match) return;
  const latest = [match.last_thread_message_at, ...(input.side === "buyer" ? [match.sent_to_buyer_at] : [])]
    .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)));
  if (!latest.length) return;
  const latestAt = latest.reduce((last, at) => rfqEventAfter(at, last) ? at : last);
  // Preserve PostgreSQL microseconds for the visible event: rounding it to JS
  // milliseconds would leave its badge/email unread. Clamp forged future markers.
  const at = rfqEventAfter(input.visibleAt, latestAt) ? latestAt
    : seen > Date.now() ? new Date().toISOString() : input.visibleAt;
  await input.store.markRfqThreadRead(match.id, input.side, at);
}
