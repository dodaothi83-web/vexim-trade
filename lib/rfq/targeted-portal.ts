import { buildRfqSupplierEmail } from "./outreach";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS } from "@/lib/config";
import { supplierReplyAddress } from "./reply-routing";
import type { DataStore } from "@/lib/db/types";
import { canInviteSupplier, portalApproved } from "@/lib/supplier-portal/onboarding";
import { SITE_URL } from "@/lib/site";
import type { Rfq } from "@/lib/types";
import { rfqBuyerContact } from "./buyer-contact";
import { attachBuyerAfterDirectRfqDelivery } from "./attach-buyer";

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
  // Cùng luật với câu hỏi trực tiếp: NCC đã mở cổng, hoặc hồ sơ Vexim tạo chưa có tài khoản cổng
  // (nhận qua email). Hồ sơ đang chờ duyệt / cần bổ sung thì không gửi.
  if (!supplier || supplier.status !== "published" || !(await canInviteSupplier(supplier, store))) return 0;
  // Old drafts were submitted under a promise of anonymity. Do not deliver them (or
  // add a CRM link) until this RFQ has a recipient-scoped contact-sharing grant.
  if (!rfqBuyerContact(rfq, supplier.id)) return 0;
  // Fail before publishing if the portal migration is unavailable.
  await store.listSupplierRfqInvitations(supplier.id);
  await store.listSupplierNoticeReads(supplier.id);
  const matches = await store.listRfqMatches(rfq.id);
  const match = matches.find((item) => item.supplier_id === supplier.id);
  if (!match || match.status !== "proposed" || match.sent_to_supplier_at) return 0;
  // "approved" alone is not a delivery channel: a staff-created supplier may
  // have no active portal login. For an email-only supplier, Resend must first
  // accept the email; otherwise there is no sent invitation or CRM link.
  const account = supplier.email ? await store.getUserByEmail(supplier.email) : null;
  const hasPortal = portalApproved(supplier) && account?.role === "supplier" &&
    account.supplier_id === supplier.id && account.is_active;
  if (!hasPortal && !supplier.email) return 0;
  const now = new Date();
  const deadline = new Date(now.getTime() + 3 * 86400_000);
  const email = supplier.email ? buildRfqSupplierEmail({ rfq, supplier, deadline,
    portalUrl: hasPortal ? `${SITE_URL}/supplier/portal/rfqs` : null }) : null;
  const send = () => transport({ to: [supplier.email!], from: FROM_ADDRESS,
    replyTo: supplierReplyAddress(rfq.code, match.id), subject: email!.subject, html: email!.html, text: email!.text,
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Match": match.id } });
  let delivery: Awaited<ReturnType<typeof transport>> | null = null;
  if (!hasPortal) {
    // Mail-only delivery: an error or simulated send cannot open portal/CRM access.
    delivery = await send();
    if (!delivery.ok || delivery.status !== "sent") {
      console.warn(`[rfq] email-only supplier ${supplier.id}: invitation not accepted; match remains proposed`);
      return 0;
    }
  }
  // For an approved supplier with an active portal account, the committed match
  // is the delivery. A subsequent notification-email failure does not revoke it.
  await store.updateRfqMatch(match.id, { status: "sent_to_supplier", sent_to_supplier_at: now.toISOString(),
    response_due_at: deadline.toISOString() });
  await attachBuyerAfterDirectRfqDelivery(store, rfq, match.id)
    .catch((error) => console.error("[rfq] invitation delivered but CRM attachment failed", error));
  await store.updateRfq(rfq.id, { status: "matching" });
  if (hasPortal && email) {
    try { delivery = await send(); }
    catch (error) { console.error(`[rfq] portal invitation ${rfq.id} published; email notification failed`, error); }
  }
  if (email && delivery) {
    await store.addMessage({ buyer_id: null, supplier_id: supplier.id, rfq_id: rfq.id, rfq_match_id: match.id,
      kind: "rfq_outreach", stage: null, direction: "supplier", thread_id: `rfq-${rfq.id}-match-${match.id}`,
      subject: email.subject, to_emails: [supplier.email!], cc_emails: [], bcc_emails: [], body_html: email.html,
      body_text: email.text, attachments: [], rfc_message_id: null, read_at: null, status: delivery.status,
      provider: delivery.provider, error: delivery.error ?? null, created_by: null,
      sent_at: delivery.ok && delivery.status === "sent" ? new Date().toISOString() : null })
      .catch((error) => console.error(`[rfq] delivered invitation ${rfq.id} could not log notification`, error));
    if (!delivery.ok || delivery.status !== "sent") console.warn(`[rfq] portal invitation ${rfq.id} published; email not confirmed sent`);
  }
  return 1;
}
