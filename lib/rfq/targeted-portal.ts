import { buildRfqSupplierEmail } from "./outreach";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS } from "@/lib/config";
import { supplierReplyAddress } from "./reply-routing";
import type { DataStore } from "@/lib/db/types";
import type { Rfq } from "@/lib/types";

/** Publish a clean product-addressed quote to its supplier's private portal.
 * In-app delivery is durable; an optional system email is recorded separately.
 */
export async function releaseTargetedQuoteToPortal(store: DataStore, rfq: Rfq): Promise<number> {
  if (rfq.status !== "new" || rfq.specs?.inquiry_kind === "supplier_question" || rfq.source_page === "/rfq?intent=question") return 0;
  const supplierIds = [...new Set(rfq.preferred_supplier_ids ?? [])];
  // Sàn B2B: RFQ gửi từ trang sản phẩm hoặc trang của đúng một nhà cung cấp đi thẳng tới
  // nhà cung cấp đó. RFQ chung hoặc chọn nhiều nhà cung cấp vẫn do nhân viên xử lý.
  if (supplierIds.length !== 1) return 0;
  const supplier = await store.getSupplier(supplierIds[0]);
  if (!supplier || supplier.status !== "published" || supplier.onboarding_status !== "approved") return 0;
  // Fail before publishing if the portal migration is unavailable.
  await store.listSupplierRfqInvitations(supplier.id);
  await store.listSupplierNoticeReads(supplier.id);
  const matches = await store.listRfqMatches(rfq.id);
  const match = matches.find((item) => item.supplier_id === supplier.id);
  if (!match || match.status !== "proposed" || match.sent_to_supplier_at) return 0;
  const now = new Date();
  await store.updateRfqMatch(match.id, { status: "sent_to_supplier", sent_to_supplier_at: now.toISOString(),
    response_due_at: new Date(now.getTime() + 3 * 86400_000).toISOString() });
  await store.updateRfq(rfq.id, { status: "matching" });
  // The system sends an anonymised copy, never using a fabricated staff identity.
  // SMTP failure must not hide an invitation that is already available in the portal.
  if (supplier.email) {
    try {
      const email = buildRfqSupplierEmail({ rfq, supplier, deadline: new Date(now.getTime() + 3 * 86400_000) });
      const delivery = await transport({ to: [supplier.email], from: FROM_ADDRESS,
        replyTo: supplierReplyAddress(rfq.code, match.id), subject: email.subject, html: email.html, text: email.text,
        headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Match": match.id, "X-Vexim-Anonymous": "1" } });
      await store.addMessage({ buyer_id: null, supplier_id: supplier.id, rfq_id: rfq.id, rfq_match_id: match.id,
        kind: "rfq_outreach", stage: null, direction: "supplier", thread_id: `rfq-${rfq.id}-match-${match.id}`,
        subject: email.subject, to_emails: [supplier.email], cc_emails: [], bcc_emails: [], body_html: email.html,
        body_text: email.text, attachments: [], rfc_message_id: null, read_at: null, status: delivery.status,
        provider: delivery.provider, error: delivery.error ?? null, created_by: null,
        sent_at: delivery.ok && delivery.status === "sent" ? new Date().toISOString() : null });
      if (!delivery.ok || delivery.status !== "sent") console.warn(`[rfq] portal invitation ${rfq.id} published; email not confirmed sent`);
    } catch (error) { console.error(`[rfq] portal invitation ${rfq.id} published; email notification failed`, error); }
  }
  return 1;
}
