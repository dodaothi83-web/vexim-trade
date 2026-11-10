import type { DataStore } from "@/lib/db/types";
import type { Rfq, SourcingRequest } from "@/lib/types";
import { generateAccessToken, generateRfqCode, rfqDayKey } from "@/lib/rfq";
import { linkedSourcingRequestId } from "@/lib/rfq/channel";
import { buyerContactConsentSpec, snapshotBuyerContact } from "@/lib/rfq/buyer-contact";

/** Dòng đầu (rút gọn) của nội dung tự do làm tên yêu cầu trong RFQ. */
export function sourcingSummary(content: string): string {
  const first = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first || "Yêu cầu tìm nguồn";
}

export function findLinkedRfq(rfqs: Rfq[], sourcingId: string): Rfq | null {
  return rfqs.find((r) => linkedSourcingRequestId(r) === sourcingId) ?? null;
}

/**
 * Bắt đầu ghép nhà cung cấp cho một yêu cầu tìm nguồn: tạo một RFQ liên kết để dùng lại
 * công cụ ghép (shortlist, lời mời có liên hệ được đồng ý, báo giá, trình người mua). Không gửi email nào,
 * không liên hệ nhà cung cấp; nhân viên vẫn tự chọn và gửi trong trang RFQ.
 * Gọi lại với cùng yêu cầu trả về RFQ đã có, không tạo trùng.
 */
export async function startSourcingMatch(input: {
  store: DataStore;
  request: SourcingRequest;
  actor: { id: string; email: string };
}): Promise<{ rfq: Rfq; created: boolean }> {
  const { store, request, actor } = input;
  const rfqs = await store.listRfqs();
  const existing = findLinkedRfq(rfqs, request.id);
  if (existing) return { rfq: existing, created: false };
  if (request.status === "closed") throw new Error("closed");

  const email = request.buyer_email.trim().toLowerCase();
  // Legacy sourcing requests were private. A later CRM profile is NOT permission to
  // disclose it. Only the consented snapshot captured on this request can be shared.
  const contact = request.buyer_contact_consent_at && request.buyer_contact?.email?.toLowerCase() === email
    ? snapshotBuyerContact(request.buyer_contact) : null;
  const consentSpec = contact?.company && contact.email && request.buyer_contact_consent_at
    ? buyerContactConsentSpec(contact, request.buyer_contact_consent_at, "sourcing_form", true) : null;
  let buyer = await store.getBuyerByEmail(email);
  if (!buyer) {
    const account = await store.getBuyerUserByEmail(email).catch(() => null);
    const domain = email.split("@")[1] ?? null;
    buyer = await store.createBuyer({
      company: contact?.company || account?.company_name?.trim() || domain || email,
      contact_name: contact?.contact_name ?? null, email, email_domain: domain, cc_emails: null,
      phone: contact?.phone ?? null, country: contact?.country ?? null,
      website: contact?.website ?? null, linkedin: null, instagram: null, product: sourcingSummary(request.content), spec: null,
      quantity: null, target_price: null, payment_method: null, payment_terms: null, incoterm: null, port: null,
      expected_ship_date: null, deal_value: null, supplier_id: null, hide_buyer_from_supplier: true,
      stage: "lead", owner: null, source: "sourcing_request", priority: "normal", next_action: null,
      next_action_date: null, notes: null, is_blocked: false,
    } as Parameters<DataStore["createBuyer"]>[0]);
  }

  const dayKey = rfqDayKey();
  const prefix = `RFQ-${dayKey}-`;
  const taken = new Set(rfqs.map((r) => r.code));
  let seq = rfqs.reduce((max, r) => {
    if (!r.code.startsWith(prefix)) return max;
    const n = Number.parseInt(r.code.slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0) + 1;
  let code = generateRfqCode(seq, dayKey);
  while (taken.has(code)) code = generateRfqCode(++seq, dayKey);

  const rfq = await store.createRfq({
    code,
    buyer_id: buyer.id,
    category_id: null,
    product_text: sourcingSummary(request.content),
    specs: {
      sourcing_request_id: request.id,
      notes: request.content,
      // Tệp đính kèm nằm ở yêu cầu tìm nguồn (kho riêng tư), không sao chép.
      sourcing_attachment_count: request.attachments.length,
      share_target_price: false,
      ...(consentSpec ?? {}),
    },
    quantity: null, unit: null, frequency: null, destination_country: null, incoterm: null, needed_by: null,
    target_price: null, target_price_currency: null,
    wants_samples: false, wants_inspection: false, wants_video_call: false,
    preferred_supplier_ids: [], source_product_id: null,
    source_page: "/sourcing", utm: {}, referrer: null, spam_score: 0, spam_flags: [],
    status: "in_progress", assigned_to: request.assigned_to ?? actor.id,
    first_response_at: null, lost_reason: null, closed_reason: null,
    access_token: generateAccessToken(),
  });

  await store.addAuditLog({
    actor_id: actor.id, actor_email: actor.email, entity: "sourcing_request", entity_id: request.id,
    action: "sourcing.start_match", before: { status: request.status }, after: { rfq_id: rfq.id, rfq_code: rfq.code },
  }).catch((err) => console.error("[sourcing] audit start_match failed", err));

  return { rfq, created: true };
}
