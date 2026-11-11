/** RFQ email is a link-only notification. Quotes, instructions and replies live in
 * authenticated portals. Account recovery and non-RFQ email services are unchanged.
 */
import { COMPANY, FROM_ADDRESS, MAIL_DOMAIN } from "@/lib/config";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { rfqChannel } from "@/lib/rfq/channel";
import type { Rfq, Buyer } from "@/lib/types";
import { transport } from "./send";

const DESK_INBOX = process.env.RFQ_INTERNAL_EMAIL?.trim() || `hello@${MAIL_DOMAIN}`;
const buyerUrl = (id: string) => `${SITE_URL}/buyer/account/requests/${encodeURIComponent(id)}`;

export async function sendRfqAckBuyer({ rfq, buyer }: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  const direct = rfqChannel(rfq) === "direct";
  const title = `${direct ? "Direct RFQ saved" : "Sourcing request received"} (Ref ${rfq.code})`;
  const link = buyerUrl(rfq.id);
  const body = `<p>${direct ? (rfq.status === "new" ? "Your direct RFQ is saved; portal delivery is pending an automatic retry." : "Your RFQ is available in your selected supplier(s)' portals. You and the suppliers manage these transactions directly; Vexim Trade is not the intermediary.") :
    "We have received your sourcing request. Our team will invite suitable suppliers and present their quotes in your account."}</p>
    <p><a href="${escapeHtml(link)}">Sign in to view your request, quotes and conversations</a></p>
    <p>${direct ? "If a direct RFQ does not work out, submit a new general sourcing RFQ. " : ""}Do not reply to this notification: email replies do not update your request.</p>`;
  const html = wrapPlainEmail({ title: escapeHtml(title), body });
  const result = await transport({ to: buyer.email ? [buyer.email] : [], from: FROM_ADDRESS,
    subject: title, html, text: `${title}\n${link}\nSign in to manage this RFQ; this email is a notification only.` });
  await getStore().addMessage({
    buyer_id: rfq.buyer_id, supplier_id: null, rfq_id: rfq.id, rfq_match_id: null,
    kind: "auto", stage: null, direction: "buyer", thread_id: `rfq-${rfq.id}-buyer`,
    subject: title, to_emails: buyer.email ? [buyer.email] : [], cc_emails: [], bcc_emails: [],
    body_html: html, body_text: `${title}\n${link}`, attachments: [], rfc_message_id: null,
    status: result.status, provider: result.provider, error: result.error, created_by: null,
    sent_at: result.ok ? new Date().toISOString() : null,
  }).catch((error) => console.error("[rfq] buyer notice not logged", error));
}

/** Sourcing only: direct RFQs must not enter the staff intake/SLA queue. */
export async function sendRfqNewInternal({ rfq }: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  if (rfqChannel(rfq) !== "sourcing") return;
  const subject = `${rfq.status === "spam" ? "[SPAM]" : rfq.status === "needs_review" ? "[REVIEW]" : "[New sourcing RFQ]"} ${rfq.code}`;
  const link = `${SITE_URL}/crm/rfqs/${encodeURIComponent(rfq.id)}`;
  const html = wrapPlainEmail({ title: escapeHtml(subject), body:
    `<p>A sourcing request is available for staff triage in CRM.</p><p><a href="${escapeHtml(link)}">Open the RFQ in CRM</a></p><p>This email is a notification only.</p>` });
  await transport({ to: [DESK_INBOX], from: FROM_ADDRESS, subject, html, text: `${subject}\n${link}` });
}

export async function sendSlaAlert({ kind, rfq, assignedToEmail }: { kind: "unassigned_4h" | "response_due_4h";
  rfq: Rfq; buyer: Buyer; assignedToEmail?: string | null }): Promise<void> {
  if (rfqChannel(rfq) !== "sourcing") return;
  const subject = `${kind === "unassigned_4h" ? "Sourcing request unassigned" : "Sourcing response due soon"} (Ref ${rfq.code})`;
  const link = `${SITE_URL}/crm/rfqs/${encodeURIComponent(rfq.id)}`;
  const html = wrapPlainEmail({ title: escapeHtml(subject), body:
    `<p>A sourcing request needs attention in CRM.</p><p><a href="${escapeHtml(link)}">Open the request</a></p>` });
  const result = await transport({ to: [...new Set([DESK_INBOX, assignedToEmail].filter((s): s is string => !!s))],
    from: FROM_ADDRESS, subject, html, text: `${subject}\n${link}` });
  if (!result.ok || result.status !== "sent") throw new Error(`Cảnh báo SLA chưa được gửi: ${result.error ?? "Resend chưa gửi thật"}`);
}

export const __test = { FROM_ADDRESS, DESK_INBOX, COMPANY };
