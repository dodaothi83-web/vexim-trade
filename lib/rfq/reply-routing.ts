import { MAIL_DOMAIN } from "@/lib/config";

/** Recognize legacy RFQ/sourcing Reply-To aliases so incoming mail can be
 * declined without modifying a request, quote, match or historical conversation.
 * No new RFQ email addresses are generated or advertised by the application.
 */
export type RfqReplyRoute =
  | { kind: "supplier"; rfqCode: string; matchId?: string | null }
  | { kind: "buyer"; rfqCode: string }
  | null;

export function parseRfqRoute(addrs: Iterable<string>): RfqReplyRoute {
  if (!addrs) return null;
  const domain = MAIL_DOMAIN.toLowerCase();
  const re = /^(?<box>rfq|buyer)\+(?<code>[a-z0-9-]+?)(?:-m(?<mid>[a-f0-9]{32}))?@(?<dom>[^@]+)$/i;
  for (const raw of addrs) {
    if (!raw) continue;
    const bracket = raw.match(/<([^>]+)>/);
    const addr = (bracket ? bracket[1] : raw).trim().toLowerCase();
    const g = addr.match(re);
    if (!g?.groups || g.groups.dom.toLowerCase() !== domain) continue;
    const code = g.groups.code.toUpperCase();
    if (g.groups.box === "buyer") return { kind: "buyer", rfqCode: code };
    const h = g.groups.mid;
    const matchId = h ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : null;
    return { kind: "supplier", rfqCode: code, matchId };
  }
  return null;
}

/** Historical email timeline identifier. Do not send or route replies into it. */
export function sourcingThreadId(requestId: string): string {
  return `sourcing-${requestId}`;
}

/** Old sourcing+uuid@domain reply aliases are refused by the inbound webhook. */
export function parseSourcingRoute(addrs: Iterable<string>): string | null {
  if (!addrs) return null;
  const domain = MAIL_DOMAIN.toLowerCase();
  for (const raw of addrs) {
    if (!raw) continue;
    const bracket = raw.match(/<([^>]+)>/);
    const addr = (bracket ? bracket[1] : raw).trim().toLowerCase();
    const g = addr.match(/^sourcing\+(?<hex>[a-f0-9]{32})@(?<dom>[^@]+)$/);
    if (!g?.groups || g.groups.dom !== domain) continue;
    const h = g.groups.hex;
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return null;
}
