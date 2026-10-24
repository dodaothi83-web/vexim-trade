import { FROM_ADDRESS, MAIL_DOMAIN } from "@/lib/config";
import { getStore } from "@/lib/db";
import { htmlToText } from "@/lib/email/privacy";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { SITE_URL } from "@/lib/site";
import { canInviteSupplier } from "@/lib/supplier-portal/onboarding";
import type { Buyer, Rfq, Supplier } from "@/lib/types";

const DESK_INBOX = process.env.RFQ_INTERNAL_EMAIL?.trim() || `sales@${MAIL_DOMAIN}`;

/**
 * Supplier-first product question. Buyer explicitly shares name, company and
 * email with one supplier so the supplier can answer without a Vexim relay.
 */
export function buildSupplierQuestionEmail(input: {
  rfq: Rfq;
  buyer: Buyer;
  supplier: Supplier;
  productUrl?: string | null;
}) {
  const { rfq, buyer, supplier } = input;
  const product = withoutDirectContacts(rfq.product_text).replace(/[\r\n]+/g, " ").trim().slice(0, 180);
  const question = withoutDirectContacts(String(rfq.specs?.notes ?? "")).trim();
  const productUrl = input.productUrl?.startsWith(`${SITE_URL}/products/`) ? input.productUrl : null;
  const title = `Câu hỏi sản phẩm ${rfq.code}`;
  const body = `
    <p>Kính gửi Anh/Chị ${escapeHtml(supplier.contact_name ?? supplier.name)},</p>
    <p>Buyer đang xem sản phẩm của doanh nghiệp và gửi câu hỏi trực tiếp tới Anh/Chị.</p>
    <table cellpadding="7" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:130px;">Mã câu hỏi</td><td><strong>${escapeHtml(rfq.code)}</strong></td></tr>
      <tr><td style="color:#64748b;">Sản phẩm</td><td><strong>${escapeHtml(product)}</strong></td></tr>
      <tr><td style="color:#64748b;">Buyer</td><td>${escapeHtml(buyer.contact_name ?? "")}<br/>${escapeHtml(buyer.company)}</td></tr>
      <tr><td style="color:#64748b;">Email phản hồi</td><td><a href="mailto:${escapeHtml(buyer.email ?? "")}">${escapeHtml(buyer.email ?? "")}</a></td></tr>
    </table>
    ${productUrl ? `<p><a href="${escapeHtml(productUrl)}">Xem đúng sản phẩm buyer đang hỏi</a></p>` : ""}
    <div style="margin-top:18px;border-left:4px solid #0f766e;background:#f0fdfa;padding:12px 16px;">
      <div style="font-size:12px;font-weight:700;color:#0f766e;">CÂU HỎI CỦA BUYER</div>
      <div style="margin-top:6px;white-space:pre-wrap;">${escapeHtml(question)}</div>
    </div>
    <p style="margin-top:18px;"><strong>Vui lòng phản hồi trực tiếp email này.</strong>
      Địa chỉ Reply-To là email của buyer. Họ đã đồng ý chia sẻ tên, công ty và email với doanh nghiệp cho câu hỏi này.</p>
    <p style="color:#64748b;font-size:12.5px;">Vexim không phản hồi thay doanh nghiệp về thông số hoặc điều kiện thương mại.
      Không chia sẻ thông tin liên hệ của buyer cho bên thứ ba.</p>
  `;
  return {
    subject: `[${rfq.code}] Câu hỏi sản phẩm: ${product}`,
    html: wrapPlainEmail({ title, body, preheader: `Buyer hỏi về ${product}` }),
    text: htmlToText(body),
  };
}

/** Deliver only after the consent, spam and preferred-supplier checks in submitRfq. */
export async function deliverSupplierQuestion(input: {
  rfq: Rfq;
  buyer: Buyer;
  supplierId: string;
  productUrl?: string | null;
}): Promise<{ delivered: boolean; reason?: string }> {
  const { rfq, buyer, supplierId } = input;
  if (rfq.status !== "new") return { delivered: false, reason: "moderation_required" };
  if (rfq.buyer_id !== buyer.id) return { delivered: false, reason: "buyer_mismatch" };
  if (rfq.preferred_supplier_ids?.length !== 1 || rfq.preferred_supplier_ids[0] !== supplierId) {
    return { delivered: false, reason: "selected_supplier_required" };
  }
  if (rfq.specs?.inquiry_kind !== "supplier_question" || rfq.specs?.contact_share_consent !== true) {
    return { delivered: false, reason: "contact_consent_required" };
  }
  if (!buyer.email || !String(rfq.specs.notes ?? "").trim()) {
    return { delivered: false, reason: "missing_question_or_reply_email" };
  }

  const store = getStore();
  const match = (await store.listRfqMatches(rfq.id)).find((item) =>
    item.supplier_id === supplierId && item.status === "proposed" && !item.sent_to_supplier_at);
  if (!match) return { delivered: false, reason: "supplier_match_unavailable" };
  const supplier = await store.getSupplier(supplierId);
  if (!supplier?.email || !(await canInviteSupplier(supplier, store))) {
    return { delivered: false, reason: "supplier_unavailable" };
  }

  const email = buildSupplierQuestionEmail({ rfq, buyer, supplier, productUrl: input.productUrl });
  const delivery = await transport({
    to: [supplier.email],
    from: FROM_ADDRESS,
    replyTo: buyer.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Match": match.id, "X-Vexim-Contact-Consent": "buyer-approved" },
  });
  const now = new Date().toISOString();
  const delivered = delivery.ok && delivery.status === "sent";

  if (delivered) {
    await store.updateRfqMatch(match.id, { status: "sent_to_supplier", sent_to_supplier_at: now, response_due_at: null });
  }
  await store.addMessage({
    buyer_id: buyer.id,
    supplier_id: supplier.id,
    rfq_id: rfq.id,
    rfq_match_id: match.id,
    kind: "rfq_outreach",
    stage: null,
    direction: "supplier",
    thread_id: `rfq-${rfq.id}-match-${match.id}`,
    subject: email.subject,
    to_emails: [supplier.email],
    cc_emails: [],
    bcc_emails: [],
    body_html: email.html,
    body_text: email.text,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: delivery.status,
    provider: delivery.provider,
    error: delivery.error,
    created_by: null,
    sent_at: delivered ? now : null,
  });

  if (!delivered) return { delivered: false, reason: delivery.error ?? "email_not_delivered" };
  await store.updateRfq(rfq.id, { status: "matching" });
  return { delivered: true };
}

/** Buyer acknowledgement uses question-specific copy, never the staffed RFQ promises. */
export async function sendSupplierQuestionAckBuyer(input: {
  rfq: Rfq;
  buyer: Buyer;
  delivered: boolean;
}): Promise<void> {
  const { rfq, buyer, delivered } = input;
  if (!buyer.email) return;
  const statusLink = `${SITE_URL}/rfq/status/${rfq.access_token}`;
  const review = rfq.status === "needs_review";
  const title = delivered
    ? `Your question ${rfq.code} was sent to the supplier`
    : `Your question ${rfq.code} was received`;
  const next = delivered
    ? "The supplier can reply directly to your email. Further replies are not shown on the status page."
    : review
      ? "Your question is being reviewed before it can be shared with the selected supplier."
      : "We saved your question but could not confirm delivery yet. Vexim will help with delivery.";
  const question = String(rfq.specs?.notes ?? "").trim();
  const body = `
    <p>Dear ${escapeHtml(buyer.contact_name?.split(" ")[0] ?? "there")},</p>
    <p>${escapeHtml(next)}</p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:110px;">Reference</td><td><strong>${escapeHtml(rfq.code)}</strong></td></tr>
      <tr><td style="color:#64748b;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:#64748b;">Question</td><td style="white-space:pre-wrap;">${escapeHtml(question)}</td></tr>
    </table>
    <p>You approved sharing your name, company and email with the selected supplier for this question, not with other suppliers.</p>
    <p>Private status link: <a href="${statusLink}">${statusLink}</a></p>
    <p>Best regards,<br/>Vexim Trade</p>
  `;
  await transport({
    to: [buyer.email],
    from: FROM_ADDRESS,
    subject: `[${rfq.code}] ${title}`,
    html: wrapPlainEmail({ title, body }),
    text: htmlToText(body),
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Kind": "supplier-question" },
  });
}

/** Internal alert is only for moderation or an unconfirmed direct delivery. */
export async function sendSupplierQuestionExceptionInternal(input: {
  rfq: Rfq;
  buyer: Buyer;
  reason?: string | null;
}): Promise<void> {
  const { rfq, buyer } = input;
  const review = rfq.status === "needs_review" || rfq.status === "spam";
  const title = review ? `Question ${rfq.code} requires moderation` : `Question ${rfq.code} needs delivery support`;
  const question = String(rfq.specs?.notes ?? "").trim();
  const adminUrl = `${SITE_URL}/crm/rfqs/${rfq.id}`;
  const body = `
    <p>${review
      ? "Review this question before sharing it with the selected supplier."
      : "Direct supplier delivery was not confirmed. Help deliver the original question to the selected supplier."}</p>
    <p>Do not treat this as a quote request or contact other suppliers without the buyer's consent.</p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#64748b;width:110px;">Company</td><td>${escapeHtml(buyer.company)}</td></tr>
      <tr><td style="color:#64748b;">Contact</td><td>${escapeHtml(buyer.contact_name ?? "")}<br/>${escapeHtml(buyer.email ?? "")}</td></tr>
      <tr><td style="color:#64748b;">Product</td><td>${escapeHtml(rfq.product_text)}</td></tr>
      <tr><td style="color:#64748b;">Question</td><td style="white-space:pre-wrap;">${escapeHtml(question)}</td></tr>
      <tr><td style="color:#64748b;">Status</td><td>${escapeHtml(rfq.status)}</td></tr>
      <tr><td style="color:#64748b;">Reason</td><td>${escapeHtml(input.reason || (review ? "manual review" : "delivery not confirmed"))}</td></tr>
    </table>
    <p><a href="${adminUrl}">Open the question in CRM</a></p>
  `;
  await transport({
    to: [DESK_INBOX],
    from: FROM_ADDRESS,
    subject: `[${review ? "Question review" : "Question delivery"}] ${rfq.code}`,
    html: wrapPlainEmail({ title, body }),
    text: htmlToText(body),
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Kind": "supplier-question", "X-RFQ-Status": rfq.status },
  });
}
