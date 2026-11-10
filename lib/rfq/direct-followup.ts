import "server-only";

import { FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { EmailMessage, Rfq, RfqMatch } from "@/lib/types";
import { rfqBuyerContact } from "./buyer-contact";
import { rfqChannel } from "./channel";

/** Direct RFQs have no Vexim desk watching them. When the named supplier declines or
 * stays silent past the response date, the buyer must still learn the outcome, and the
 * supplier gets one reminder before the date. Emails are link-only; the account and the
 * portal remain the source of truth. No staff queue, no email fallback for the quote.
 */
export type DirectBuyerNotice = "declined" | "no_response";

const DAY = 86400_000;
/** Remind the supplier once, this long before the response date. */
export const DIRECT_REMINDER_LEAD_MS = DAY;
/** Bound the sweep: direct RFQs never close, so only recent ones are followed up. */
export const DIRECT_FOLLOWUP_RFQ_AGE_MS = 45 * DAY;
/** A failed buyer notice is retried while the outcome is still recent. */
export const DIRECT_NOTICE_RETRY_MS = 14 * DAY;

type Mail = { subject: string; html: string; text: string };
type NewMessage = Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null };

export function buildDirectBuyerNotice(kind: DirectBuyerNotice, rfq: Pick<Rfq, "id" | "code">): Mail {
  const subject = `${kind === "declined" ? "A supplier declined your request" : "No supplier reply yet for your request"} (Ref ${rfq.code})`;
  const link = `${SITE_URL}/buyer/account/requests/${encodeURIComponent(rfq.id)}`;
  const lead = kind === "declined"
    ? "A supplier you selected will not quote this request."
    : "A supplier you selected has not replied by the response date. The request stays open in their portal and they can still quote.";
  const body = `<p>${lead}</p>
    <p><a href="${escapeHtml(link)}">Sign in to view your request</a></p>
    <p>If you still need this product, you can submit a new general sourcing RFQ to Vexim. This email is a notification only; replies are not recorded.</p>`;
  return { subject, html: wrapPlainEmail({ title: escapeHtml(subject), body }),
    text: `${subject}\n${link}\nSign in for details. Email is a notification only.` };
}

export function buildDirectSupplierReminder(rfq: Pick<Rfq, "code">, matchId: string): Mail {
  const subject = `[${rfq.code}] Yêu cầu báo giá sắp đến hạn phản hồi`;
  const link = `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(matchId)}`;
  const body = `<p>Một yêu cầu báo giá trong cổng nhà cung cấp Vexim Trade chưa có phản hồi và sắp đến hạn.</p>
    <p><a href="${escapeHtml(link)}">Đăng nhập để báo giá hoặc từ chối</a></p>
    <p>Email này chỉ để thông báo, không nhận báo giá hay trả lời.</p>`;
  return { subject, html: wrapPlainEmail({ title: escapeHtml(subject), body }),
    text: `${subject}\n${link}\nĐăng nhập để báo giá hoặc từ chối. Email này chỉ thông báo.` };
}

/** Only a marked portal-direct RFQ whose buyer named and consented to THIS supplier. */
function followable(rfq: Rfq, match: RfqMatch): boolean {
  return match.rfq_id === rfq.id && rfqChannel(rfq) === "direct" && !!match.sent_to_supplier_at &&
    rfq.specs?.direct_delivery_version === "portal_direct_v2" && !!rfqBuyerContact(rfq, match.supplier_id);
}

/** One durable row per RFQ + stage reserves the send before talking to the mail
 * provider. Buyer notices use `buyer_status_update`, which has a unique index. */
async function sendOnce(store: DataStore, input: {
  rfq: Rfq; match: RfqMatch; kind: EmailMessage["kind"]; stage: string; direction: "buyer" | "supplier";
  to: string; mail: Mail; history?: EmailMessage[];
}): Promise<"sent" | "already" | "failed"> {
  const { rfq, match, kind, stage, mail } = input;
  const same = (m: EmailMessage) => m.kind === kind && m.stage === stage;
  const previous = (input.history ?? await store.listMessagesForRfq(rfq.id)).find(same);
  if (previous && previous.status !== "failed") return "already";
  let claim: EmailMessage;
  if (previous) {
    claim = await store.updateMessage(previous.id, { status: "draft", error: null });
  } else {
    try {
      claim = await store.addMessage({
        buyer_id: input.direction === "buyer" ? rfq.buyer_id : null,
        supplier_id: input.direction === "supplier" ? match.supplier_id : null,
        rfq_id: rfq.id, rfq_match_id: match.id, kind, stage, direction: input.direction,
        thread_id: input.direction === "buyer" ? `rfq-${rfq.id}-buyer` : `rfq-${rfq.id}-match-${match.id}`,
        subject: mail.subject, to_emails: [input.to], cc_emails: [], bcc_emails: [],
        body_html: mail.html, body_text: mail.text, attachments: [], rfc_message_id: null, read_at: null,
        status: "draft", provider: "resend", error: null, created_by: null,
      } as unknown as NewMessage);
    } catch (error) {
      // A concurrent run won the unique index: it owns this notice.
      if ((await store.listMessagesForRfq(rfq.id)).some(same)) return "already";
      throw error;
    }
  }
  const result = await transport({ to: [input.to], from: FROM_ADDRESS, subject: mail.subject,
    html: mail.html, text: mail.text, headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Notify": stage.split(":")[0] },
  }).catch((error) => { console.error("[rfq-direct] follow-up email failed", error); return null; });
  await store.updateMessage(claim.id, {
    status: result?.status ?? "failed", provider: result?.provider ?? "resend",
    error: result?.error ?? (result ? null : "Lỗi khi gọi dịch vụ gửi email"),
    sent_at: result?.ok ? new Date().toISOString() : null,
  });
  return result?.ok ? "sent" : "failed";
}

/** Tell the buyer, once per supplier, that a named supplier declined or stayed silent. */
export async function notifyBuyerDirectMatch(store: DataStore, rfq: Rfq, match: RfqMatch,
  kind: DirectBuyerNotice, history?: EmailMessage[]): Promise<"sent" | "already" | "failed" | "skipped"> {
  if (!followable(rfq, match) || match.status !== kind || !!match.sent_to_buyer_at ||
      ["won", "lost", "spam"].includes(rfq.status)) return "skipped";
  const buyer = await store.getBuyer(rfq.buyer_id).catch(() => null);
  const to = buyer?.email?.trim();
  if (!to) return "skipped";
  return sendOnce(store, { rfq, match, kind: "buyer_status_update", stage: `direct_${kind}:${match.id}`,
    direction: "buyer", to, mail: buildDirectBuyerNotice(kind, rfq), history });
}

async function remindSupplier(store: DataStore, rfq: Rfq, match: RfqMatch, history: EmailMessage[]) {
  // Same recipient rule as the invitation: the active portal account, never a legacy address.
  const account = await store.getUserBySupplierId(match.supplier_id);
  if (!account?.is_active || account.role !== "supplier" || account.supplier_id !== match.supplier_id) return "skipped";
  return sendOnce(store, { rfq, match, kind: "rfq_followup", stage: `direct_due:${match.id}`,
    direction: "supplier", to: account.email.trim(), mail: buildDirectSupplierReminder(rfq, match.id), history });
}

/** Daily/hourly sweep (see /api/cron/rfq-sla). Idempotent: the status change is a
 * compare-and-set on the match and every email is claimed before it is sent. */
export async function runDirectRfqFollowUps(store: DataStore, options: { nowMs?: number } = {}) {
  const now = options.nowMs ?? Date.now();
  const report = { checked: 0, reminded: 0, noResponse: 0, buyerNotified: 0, failed: 0 };
  const rfqs = (await store.listRetryableDirectRfqs()).filter((rfq) =>
    rfqChannel(rfq) === "direct" && ["matching", "quoted"].includes(rfq.status) && rfq.spam_score < 40 &&
    rfq.specs?.direct_delivery_version === "portal_direct_v2" &&
    now - Date.parse(rfq.created_at) < DIRECT_FOLLOWUP_RFQ_AGE_MS);
  for (const rfq of rfqs) {
    try {
      report.checked++;
      let history: EmailMessage[] | null = null;
      const messages = async () => history ??= await store.listMessagesForRfq(rfq.id);
      const count = (outcome: string) => {
        if (outcome === "sent") report.buyerNotified++;
        else if (outcome === "failed") report.failed++;
      };
      for (const match of await store.listRfqMatches(rfq.id)) {
        if (!followable(rfq, match) || match.sent_to_buyer_at) continue;
        const recent = now - Date.parse(match.updated_at) < DIRECT_NOTICE_RETRY_MS;
        if (match.status === "declined" || match.status === "no_response") {
          // Also retries a notice whose first delivery failed.
          if (recent) count(await notifyBuyerDirectMatch(store, rfq, match, match.status, await messages()));
          continue;
        }
        if (match.status !== "sent_to_supplier" || !match.response_due_at) continue;
        // A supplier who already answered in the thread is engaged, not silent.
        if (match.supplier_replied_at || match.last_supplier_message_at) continue;
        const due = Date.parse(match.response_due_at);
        if (!Number.isFinite(due)) continue;
        if (now >= due) {
          const saved = await store.updateRfqMatchIfState(match.id, match.supplier_id, "sent_to_supplier",
            match.updated_at, { status: "no_response" });
          if (!saved) continue; // The supplier quoted or declined in the meantime.
          report.noResponse++;
          count(await notifyBuyerDirectMatch(store, rfq, saved, "no_response", await messages()));
        } else if (now >= due - DIRECT_REMINDER_LEAD_MS) {
          const outcome = await remindSupplier(store, rfq, match, await messages());
          if (outcome === "sent") report.reminded++;
          else if (outcome === "failed") report.failed++;
        }
      }
    } catch (error) { report.failed++; console.error("[rfq-direct] follow-up failed", rfq.id, error); }
  }
  return report;
}
