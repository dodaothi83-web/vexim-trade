import brandColors from "@/lib/brand/colors.json";
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
import { mailTopic, openThread } from "@/lib/email/threading";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import type { Rfq, Buyer } from "@/lib/types";
import { transport } from "./send";
import { buyerReplyAddress } from "@/lib/rfq/reply-routing";

const DESK_INBOX = process.env.RFQ_INTERNAL_EMAIL?.trim() || `hello@${MAIL_DOMAIN}`;

function rfqUrl(id: string) {
  return `${SITE_URL}/buyer/account/requests/${encodeURIComponent(id)}`;
}

function formatQuantity(rfq: Rfq): string {
  return rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "Not provided";
}

/* ---------------------------------------------------------------- */
/* 1) Ack cho buyer                                                 */
/* ---------------------------------------------------------------- */

export async function sendRfqAckBuyer(input: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  const { rfq, buyer } = input;
  const statusLink = rfqUrl(rfq.id);

  const title = `Sourcing request received, ${rfq.product_text} (Ref ${rfq.code})`;
  const hasPreferredSupplier = (rfq.preferred_supplier_ids ?? []).length > 0;
  const matchingStep = hasPreferredSupplier
    ? "Your request goes to your selected supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else."
    : "We will select verified suppliers that match your specs, quantity and market, and send you their quotes to compare.";
  const quoteStep = hasPreferredSupplier
    ? "If your selected supplier responds, we will send you the quote with MOQ, lead time, certification status and FOB reference where we are authorised to share it."
    : "You will receive a comparison with MOQ, lead time, certification status and FOB references where we are authorised to share them.";
  const body = `
    <p>Dear ${escapeHtml(buyer.contact_name?.split(" ")[0] ?? "there")},</p>
    <p>Thank you for reaching out to Vexim Trade. Your request <strong>${escapeHtml(rfq.code)}</strong>
    has been received by our Hanoi export desk and is being reviewed.</p>
    <p><strong>Quick summary of what you shared:</strong></p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:${brandColors.muted};width:140px;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Quantity</td><td>${escapeHtml(formatQuantity(rfq))}</td></tr>
      <tr><td style="color:${brandColors.muted};">Destination</td><td>${escapeHtml(rfq.destination_country ?? "Not provided")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Incoterm</td><td>${escapeHtml(rfq.incoterm ?? "Not provided")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Needed by</td><td>${escapeHtml(rfq.needed_by ?? "Not provided")}</td></tr>
    </table>
    <p><strong>What happens next?</strong></p>
    <ul>
      <li>We will assign your request to a desk specialist within 4 business hours (Asia/Ho_Chi_Minh time).</li>
      ${rfq.status === "needs_review"
        ? "<li>Your request is being reviewed manually to make sure it reaches the right desk. Expect a reply within one business day.</li>"
        : ""}
      <li>${matchingStep}</li>
      ${hasPreferredSupplier ? "" : "<li>Suppliers are matched on your requirements only. Paid listings never affect who we recommend.</li>"}
      <li>${quoteStep}</li>
      <li>Your contact details stay private until you agree to an introduction.</li>
      <li>You sign the contract directly with the supplier you choose. Vexim never holds your payment.</li>
      <li>Requesting a quote is free for buyers.</li>
    </ul>
    <p>View your request in your buyer account:<br/>
       <a href="${statusLink}">View enquiry</a>
    </p>
    <p>If you have additional details to share (specification sheets, labelling requirements, target price),
       simply reply to this email. It goes directly to the desk handling your request.</p>
    <p>Best regards,<br/>Export Department · ${escapeHtml(COMPANY.name)}</p>
  `;

  const html = wrapPlainEmail({ title, body });
  const cc = buyer.cc_emails ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean) : [];
  const mailThread = await openThread(mailTopic({ rfqCode: rfq.code, buyerId: rfq.buyer_id ?? buyer.id }));
  const text = stripHtml(body);
  const res = await transport({
    to: buyer.email ? [buyer.email] : [],
    cc: cc.length ? cc : undefined,
    // Người mua trả lời thư xác nhận (bổ sung thông số...) thì thư vào đúng timeline RFQ này.
    replyTo: buyerReplyAddress(rfq.code),
    subject: title,
    html,
    text,
    headers: { "X-RFQ-Code": rfq.code, ...mailThread.headers },
  });
  // Ghi lại để thư sau nối được In-Reply-To/References và để hộp thư CRM thấy thư này.
  await getStore()
    .addMessage({
      buyer_id: rfq.buyer_id ?? buyer.id,
      supplier_id: null,
      rfq_id: rfq.id,
      rfq_match_id: null,
      kind: "auto",
      stage: null,
      direction: "buyer",
      thread_id: `rfq-${rfq.id}-buyer`,
      subject: title,
      to_emails: buyer.email ? [buyer.email] : [],
      cc_emails: cc,
      bcc_emails: [],
      body_html: html,
      body_text: text,
      attachments: [],
      rfc_message_id: mailThread.messageId,
      status: res.status,
      provider: res.provider,
      error: res.error,
      created_by: null,
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    .catch(() => null);
}

/* ---------------------------------------------------------------- */
/* 2) Thông báo nội bộ                                              */
/* ---------------------------------------------------------------- */

/** Ô đích đến gồm cả cảng — port giúp desk chọn tuyến vận chuyển. */
function deskDestination(rfq: Rfq): string {
  const country = rfq.destination_country ?? "Not provided";
  const port = String((rfq.specs as Record<string, unknown> | null)?.destination_port ?? "").trim();
  return port ? `${country} · ${port}` : country;
}

/** Tháng giao hàng thay cho ngày chính xác; vẫn đọc needed_by của RFQ cũ. */
function deskDelivery(rfq: Rfq): string {
  const month = String((rfq.specs as Record<string, unknown> | null)?.shipment_month ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-");
    return `${m}/${y}`;
  }
  return rfq.needed_by ?? "Not provided";
}

/** Giá mục tiêu luôn hiện với desk, kèm nhãn cho biết NCC có thấy hay không. */
function deskTargetPrice(rfq: Rfq): string {
  if (!rfq.target_price) return "Not provided";
  const specs = (rfq.specs ?? {}) as Record<string, unknown>;
  const unit = String(specs.target_price_unit ?? "").trim();
  const shared = specs.share_target_price === true;
  return `${rfq.target_price} ${rfq.target_price_currency ?? ""}${unit ? ` / ${unit}` : ""}${shared ? "" : " (not shared with suppliers)"}`;
}

export async function sendRfqNewInternal(input: { rfq: Rfq; buyer: Buyer }): Promise<void> {
  const { rfq, buyer } = input;
  const adminUrl = `${SITE_URL}/crm/rfqs/${rfq.id}`;
  const isSpam = rfq.status === "spam";
  const isReview = rfq.status === "needs_review";

  const title = isSpam
    ? `RFQ ${rfq.code} quarantined as spam (score ${rfq.spam_score})`
    : isReview
      ? `RFQ ${rfq.code} needs manual review (score ${rfq.spam_score}): ${escapeHtml(buyer.company)}`
      : `New RFQ ${rfq.code}: ${escapeHtml(buyer.company)}`;

  const body = `
    ${isSpam
      ? `<p style="color:${brandColors.error};"><strong>This request was quarantined automatically as spam.</strong>
         Spam score: ${rfq.spam_score}. Flags: ${escapeHtml(rfq.spam_flags.join(", ") || "none")}.<br/>
         Buyer was NOT sent a confirmation email. Open CRM to delete or mark legitimate.</p>`
      : isReview
        ? `<p style="color:${brandColors.warning};"><strong>This request was flagged for manual review (score ${rfq.spam_score}).</strong>
           Flags: ${escapeHtml(rfq.spam_flags.join(", ") || "none")}.<br/>
           Buyer has already received a “we are reviewing” acknowledgement. Please triage within 4 business hours
           and either assign to a desk specialist or mark as spam.</p>`
        : `<p>A new sourcing request is ready for triage. Reply target: <strong>24h</strong>
           from receipt (Asia/Ho_Chi_Minh business hours). Assign within <strong>4 hours</strong>.</p>`}
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:${brandColors.muted};width:140px;">Company</td><td><strong>${escapeHtml(buyer.company)}</strong></td></tr>
      <tr><td style="color:${brandColors.muted};">Contact</td><td>${escapeHtml(buyer.contact_name ?? "")} · ${escapeHtml(buyer.email ?? "")} · ${escapeHtml(buyer.phone ?? "")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Country</td><td>${escapeHtml(buyer.country ?? "Not provided")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Website</td><td>${escapeHtml(buyer.website ?? "Not provided")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Quantity</td><td>${escapeHtml(formatQuantity(rfq))}</td></tr>
      <tr><td style="color:${brandColors.muted};">Destination</td><td>${escapeHtml(deskDestination(rfq))}</td></tr>
      <tr><td style="color:${brandColors.muted};">Incoterm</td><td>${escapeHtml(rfq.incoterm ?? "Not provided")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Delivery window</td><td>${escapeHtml(deskDelivery(rfq))}</td></tr>
      <tr><td style="color:${brandColors.muted};">Samples / Inspection / Video</td>
          <td>${rfq.wants_samples ? "samples " : ""}${rfq.wants_inspection ? "inspection " : ""}${rfq.wants_video_call ? "video" : ""}</td></tr>
      <tr><td style="color:${brandColors.muted};">Target price (internal)</td>
          <td>${escapeHtml(deskTargetPrice(rfq))}</td></tr>
      <tr><td style="color:${brandColors.muted};">Notes</td><td>${escapeHtml(String((rfq.specs as Record<string, unknown>)?.notes ?? buyer.notes ?? ""))}</td></tr>
    </table>
    <p><a href="${adminUrl}">Open in CRM</a></p>
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
    ? `RFQ ${rfq.code} unassigned 4h after receipt`
    : `RFQ ${rfq.code} first response due in about 4 hours`;
  const body = `
    <p>${isUnassigned
      ? `This RFQ has been waiting for an owner for <strong>4 business hours</strong>. Please assign it now.`
      : `First response SLA runs out in about <strong>4 hours</strong>. Make sure a shortlist is sent to the buyer in time.`}
    </p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:${brandColors.muted};width:140px;">Code</td><td>${escapeHtml(rfq.code)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Company</td><td>${escapeHtml(buyer.company)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Contact</td><td>${escapeHtml(buyer.email ?? "")}</td></tr>
      <tr><td style="color:${brandColors.muted};">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Status</td><td>${escapeHtml(rfq.status)}</td></tr>
      <tr><td style="color:${brandColors.muted};">Received</td><td>${escapeHtml(rfq.created_at)}</td></tr>
    </table>
    <p><a href="${adminUrl}">Open in CRM</a></p>
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
