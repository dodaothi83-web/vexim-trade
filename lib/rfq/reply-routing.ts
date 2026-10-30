/**
 * Build & parse Reply-To addresses used to route inbound replies back to the
 * correct RFQ / RFQ match.
 *
 * Format (all addresses are under MAIL_DOMAIN so Resend inbound can receive them):
 *
 *   rfq+{rfqCode}-m{matchId}@domain     Supplier replies on a specific match
 *                                       (e.g. outreach/follow-up email reply)
 *   rfq+{rfqCode}@domain                Generic RFQ mailbox (legacy / unknown match)
 *   buyer+{rfqCode}@domain              Buyer replies (shortlist/update emails)
 *
 * Local-part is ASCII alnum/hyphen/+ only. The full UUID without hyphens
 * identifies the match without collisions and fits the 64-character limit.
 */
import { MAIL_DOMAIN } from "@/lib/config";

export type RfqReplyRoute =
  | { kind: "supplier"; rfqCode: string; matchId?: string | null }
  | { kind: "buyer"; rfqCode: string }
  | null;

function normalizeCode(code: string) {
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) throw new Error("Invalid RFQ code for reply routing.");
  return normalized;
}

/** Address supplier replies should hit so we can attribute them to an exact match. */
export function supplierReplyAddress(rfqCode: string, matchId?: string | null): string {
  const code = normalizeCode(rfqCode);
  if (!code) throw new Error("rfqCode is required for reply-to routing.");
  if (matchId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(matchId)) {
    throw new Error("Invalid RFQ match id for reply routing.");
  }
  const mpart = matchId ? `-m${matchId.replace(/-/g, "").toLowerCase()}` : "";
  if (`rfq+${code}${mpart}`.length > 64) throw new Error("RFQ reply address exceeds 64 characters.");
  return `rfq+${code}${mpart}@${MAIL_DOMAIN}`;
}

/** Address buyer replies should hit (shortlist, status updates, intros). */
export function buyerReplyAddress(rfqCode: string): string {
  const code = normalizeCode(rfqCode);
  if (!code) throw new Error("rfqCode is required for reply-to routing.");
  return `buyer+${code}@${MAIL_DOMAIN}`;
}

/**
 * Inspect a list of recipient addresses (from To/Cc on an inbound email) and
 * return the first Vexim RFQ route found, if any.
 */
export function parseRfqRoute(addrs: Iterable<string>): RfqReplyRoute {
  if (!addrs) return null;
  const domain = MAIL_DOMAIN.toLowerCase();
  const re = /^(?<box>rfq|buyer)\+(?<code>[a-z0-9-]+?)(?:-m(?<mid>[a-f0-9]{32}))?@(?<dom>[^@]+)$/i;
  for (const raw of addrs) {
    if (!raw) continue;
    // Strip "Name <addr>" if needed
    const m1 = raw.match(/<([^>]+)>/);
    const addr = (m1 ? m1[1] : raw).trim().toLowerCase();
    if (!addr.includes("@")) continue;
    const g = addr.match(re);
    if (!g || !g.groups) continue;
    if (g.groups.dom.toLowerCase() !== domain) continue;
    const code = g.groups.code.toUpperCase();
    if (g.groups.box === "buyer") {
      return { kind: "buyer", rfqCode: code };
    }
    const midHex = g.groups.mid;
    let matchId: string | null = null;
    if (midHex && midHex.length === 32) {
      // Re-insert hyphens to get back a valid UUID.
      matchId = `${midHex.slice(0, 8)}-${midHex.slice(8, 12)}-${midHex.slice(12, 16)}-${midHex.slice(16, 20)}-${midHex.slice(20)}`;
    }
    return { kind: "supplier", rfqCode: code, matchId };
  }
  return null;
}
