/**
 * Email templates cho luồng RFQ (GĐ2):
 *   - rfqAckBuyer: xác nhận cho buyer kèm link theo dõi trạng thái.
 *   - rfqNewInternal: báo cho đội nội bộ có RFQ mới.
 *   - rfqSpamQuarantine: cảnh báo RFQ bị cách ly do điểm spam cao.
 *
 * Các email này DÙNG CHUNG wrapPlainEmail (không tự viết văn phong thương hiệu
 * theo chỉ thị; body có cấu trúc rõ, copywriter có thể tinh chỉnh sau).
 */
import { COMPANY, FROM_ADDRESS, MAIL_DOMAIN } from "@/lib/config";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { Rfq, Buyer } from "@/lib/types";
import { transport } from "./send";

const DESK_INBOX = process.env.RFQ_INTERNAL_EMAIL?.trim() || `sales@${MAIL_DOMAIN}`;

function rfqUrl(token: string) {
  return `${SITE_URL}/rfq/status/${token}`;
}

function formatQuantity(rfq: Rfq): string {
  return rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—";
}

/* ---------------------------------------------------------------- */
/* 1) Ack cho buyer                                                 */
/* ---------------------------------------------------------------- */

export async function sendRfqAckBuyer(input: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  const { rfq, buyer } = input;
  const statusLink = rfqUrl(rfq.access_token);

  const title = `Your sourcing request ${rfq.code} has been received`;
  const body = `
    <p>Dear ${escapeHtml(buyer.contact_name?.split(" ")[0] ?? "there")},</p>
    <p>Thank you for reaching out to Vexim Trade. Your request <strong>${escapeHtml(rfq.code)}</strong>
    has been received by our Hanoi export desk and is being reviewed.</p>
    <p><strong>Quick summary of what you shared:</strong></p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:140px;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:#64748b;">Quantity</td><td>${escapeHtml(formatQuantity(rfq))}</td></tr>
      <tr><td style="color:#64748b;">Destination</td><td>${escapeHtml(rfq.destination_country ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Incoterm</td><td>${escapeHtml(rfq.incoterm ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Needed by</td><td>${escapeHtml(rfq.needed_by ?? "—")}</td></tr>
    </table>
    <p><strong>What happens next?</strong></p>
    <ul>
      <li>We will assign your request to a desk specialist within 4 business hours (Asia/Ho_Chi_Minh time).</li>
      ${rfq.status === "needs_review"
        ? "<li>Your request is being reviewed manually to make sure it reaches the right desk — expect a reply within one business day.</li>"
        : "<li>We screen and shortlist 2–4 suitable suppliers within 24 hours.</li>"}
      <li>You will receive a comparison with MOQ, lead time, certification status and FOB references where we are authorised to share them.</li>
    </ul>
    <p>You can check progress any time without logging in using this private link:<br/>
       <a href="${statusLink}">${statusLink}</a>
    </p>
    <p>If you have additional details to share (specification sheets, labelling requirements, target price),
       simply reply to this email — it goes directly to the desk handling your request.</p>
    <p>Best regards,<br/>Export Department · ${escapeHtml(COMPANY.name)}</p>
  `;

  const html = wrapPlainEmail({ title, body });
  await transport({
    to: buyer.email ? [buyer.email] : [],
    cc: buyer.cc_emails ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
    subject: `[${rfq.code}] Your sourcing request has been received – ${escapeHtml(COMPANY.name)}`,
    html,
    text: stripHtml(body),
    headers: { "X-RFQ-Code": rfq.code },
  });
}

/* ---------------------------------------------------------------- */
/* 2) Thông báo nội bộ                                              */
/* ---------------------------------------------------------------- */

export async function sendRfqNewInternal(input: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  const { rfq, buyer } = input;
  const adminUrl = `${SITE_URL}/crm/rfqs/${rfq.id}`;
  const isSpam = rfq.status === "spam";
  const isReview = rfq.status === "needs_review";

  const title = isSpam
    ? `🚫 Spam quarantined — RFQ ${rfq.code} (score ${rfq.spam_score})`
    : isReview
      ? `⚠ RFQ ${rfq.code} flagged for manual review (score ${rfq.spam_score}) — ${escapeHtml(buyer.company)}`
      : `New RFQ ${rfq.code} — ${escapeHtml(buyer.company)}`;

  const body = `
    ${isSpam
      ? `<p style="color:#b91c1c;"><strong>This request was quarantined automatically as spam.</strong>
         Spam score: ${rfq.spam_score}. Flags: ${escapeHtml(rfq.spam_flags.join(", ") || "none")}.<br/>
         Buyer was NOT sent a confirmation email. Open CRM to delete or mark legitimate.</p>`
      : isReview
        ? `<p style="color:#b45309;"><strong>This request was flagged for manual review (score ${rfq.spam_score}).</strong>
           Flags: ${escapeHtml(rfq.spam_flags.join(", ") || "none")}.<br/>
           Buyer has already received a “we are reviewing” acknowledgement. Please triage within 4 business hours
           and either assign to a desk specialist or mark as spam.</p>`
        : `<p>A new sourcing request is ready for triage. Reply target: <strong>24h</strong>
           from receipt (Asia/Ho_Chi_Minh business hours). Assign within <strong>4 hours</strong>.</p>`}
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:140px;">Company</td><td><strong>${escapeHtml(buyer.company)}</strong></td></tr>
      <tr><td style="color:#64748b;">Contact</td><td>${escapeHtml(buyer.contact_name ?? "")} · ${escapeHtml(buyer.email ?? "")} · ${escapeHtml(buyer.phone ?? "")}</td></tr>
      <tr><td style="color:#64748b;">Country</td><td>${escapeHtml(buyer.country ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Website</td><td>${escapeHtml(buyer.website ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:#64748b;">Quantity</td><td>${escapeHtml(formatQuantity(rfq))}</td></tr>
      <tr><td style="color:#64748b;">Destination</td><td>${escapeHtml(rfq.destination_country ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Incoterm</td><td>${escapeHtml(rfq.incoterm ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Needed by</td><td>${escapeHtml(rfq.needed_by ?? "—")}</td></tr>
      <tr><td style="color:#64748b;">Samples / Inspection / Video</td>
          <td>${rfq.wants_samples ? "samples " : ""}${rfq.wants_inspection ? "inspection " : ""}${rfq.wants_video_call ? "video" : ""}</td></tr>
      <tr><td style="color:#64748b;">Target price</td>
          <td>${rfq.target_price ? `${rfq.target_price} ${rfq.target_price_currency ?? ""}` : "—"}</td></tr>
      <tr><td style="color:#64748b;">Notes</td><td>${escapeHtml(String((rfq.specs as Record<string, unknown>)?.notes ?? buyer.notes ?? ""))}</td></tr>
    </table>
    <p><a href="${adminUrl}">Open in CRM →</a></p>
  `;

  const html = wrapPlainEmail({ title, body });
  await transport({
    to: [DESK_INBOX],
    subject: isSpam
      ? `[SPAM] ${title}`
      : isReview
        ? `[REVIEW] ${title}`
        : `[New RFQ] ${title}`,
    html,
    text: stripHtml(body),
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Status": rfq.status },
  });
}

/* ---------------------------------------------------------------- */
/* 3) Cảnh báo SLA                                                  */
/* ---------------------------------------------------------------- */

export async function sendSlaAlert(input: {
  kind: "unassigned_4h" | "response_due_4h";
  rfq: Rfq;
  buyer: Buyer;
  assignedToEmail?: string | null;
}): Promise<void> {
  const { kind, rfq, buyer, assignedToEmail } = input;
  const adminUrl = `${SITE_URL}/crm/rfqs/${rfq.id}`;
  const isUnassigned = kind === "unassigned_4h";
  const title = isUnassigned
    ? `⏰ RFQ ${rfq.code} unassigned 4h after receipt`
    : `⏰ RFQ ${rfq.code} first response due in ~4 hours`;
  const body = `
    <p>${isUnassigned
      ? `This RFQ has been waiting for an owner for <strong>4 business hours</strong>. Please assign it now.`
      : `First response SLA runs out in about <strong>4 hours</strong>. Make sure a shortlist is sent to the buyer in time.`}
    </p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:140px;">Code</td><td>${escapeHtml(rfq.code)}</td></tr>
      <tr><td style="color:#64748b;">Company</td><td>${escapeHtml(buyer.company)}</td></tr>
      <tr><td style="color:#64748b;">Contact</td><td>${escapeHtml(buyer.email ?? "")}</td></tr>
      <tr><td style="color:#64748b;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:#64748b;">Status</td><td>${escapeHtml(rfq.status)}</td></tr>
      <tr><td style="color:#64748b;">Received</td><td>${escapeHtml(rfq.created_at)}</td></tr>
    </table>
    <p><a href="${adminUrl}">Open in CRM →</a></p>
  `;
  const html = wrapPlainEmail({ title, body });
  const to = [DESK_INBOX];
  if (assignedToEmail) to.push(assignedToEmail);
  const delivery = await transport({
    to,
    subject: title,
    html,
    text: stripHtml(body),
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-SLA": kind },
  });
  // Cron must not mark an alert as sent when Resend failed (or mail was only simulated).
  if (!delivery.ok || delivery.status !== "sent") throw new Error(`Cảnh báo SLA chưa được gửi: ${delivery.error ?? "Resend chưa gửi thật"}`);
}

/* ---------------- Helpers ---------------- */

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const __test = { FROM_ADDRESS, DESK_INBOX };
