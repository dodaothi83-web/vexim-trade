import type { DataStore } from "@/lib/db/types";
import type { SupplierRfqInvitation } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";

/**
 * Câu hỏi "Ask supplier" của người mua trên cổng nhà cung cấp.
 *
 * Câu hỏi đi thẳng tới một nhà cung cấp bằng email, Reply-To là email người mua, và
 * người mua đã đồng ý chia sẻ tên, công ty, email với đúng nhà cung cấp đó. Cổng chỉ
 * hiện lại đúng những gì email đã gửi, để nhà cung cấp không bỏ sót. Không có form báo
 * giá: nhà cung cấp trả lời trực tiếp người mua.
 */
export interface PortalQuestion {
  matchId: string;
  code: string;
  product: string;
  question: string;
  buyerName: string;
  buyerCompany: string;
  buyerEmail: string;
  sentAt: string;
  answeredAt: string | null;
  /** Cùng tiêu đề với email đã gửi để thư trả lời nằm cùng mạch. */
  replySubject: string;
}

const QUESTION_PAGE = "/rfq?intent=question";

/** Lời mời là câu hỏi đã gửi thật cho đúng nhà cung cấp này. */
export function isDeliveredQuestion(m: SupplierRfqInvitation, supplierId: string): boolean {
  return m.supplier_id === supplierId && !!m.sent_to_supplier_at && m.status !== "proposed" &&
    !!m.rfq && m.rfq.source_page === QUESTION_PAGE;
}

export function questionSubject(code: string, product: string): string {
  return `Re: [${code}] Câu hỏi sản phẩm: ${product}`;
}

/**
 * Đọc nội dung câu hỏi và thông tin người mua. Chỉ trả về câu hỏi người mua đã đồng ý
 * chia sẻ liên hệ và chỉ chọn đúng nhà cung cấp này; câu hỏi bị cách ly thì bỏ qua.
 */
export async function listSupplierQuestions(store: DataStore, supplierId: string, invites: SupplierRfqInvitation[]): Promise<PortalQuestion[]> {
  const delivered = invites.filter((m) => isDeliveredQuestion(m, supplierId));
  const rows = await Promise.all(delivered.map(async (m): Promise<PortalQuestion | null> => {
    const rfq = await store.getRfq(m.rfq_id);
    if (!rfq || rfq.status === "spam" || rfq.specs?.inquiry_kind !== "supplier_question" || rfq.specs?.contact_share_consent !== true) return null;
    if (rfq.preferred_supplier_ids?.length !== 1 || rfq.preferred_supplier_ids[0] !== supplierId) return null;
    const buyer = await store.getBuyer(rfq.buyer_id);
    if (!buyer?.email) return null;
    const product = withoutDirectContacts(rfq.product_text).replace(/[\r\n]+/g, " ").trim().slice(0, 180);
    return {
      matchId: m.id,
      code: rfq.code,
      product,
      question: withoutDirectContacts(String(rfq.specs?.notes ?? "")).trim(),
      buyerName: buyer.contact_name ?? "",
      buyerCompany: buyer.company ?? "",
      buyerEmail: buyer.email,
      sentAt: m.sent_to_supplier_at!,
      answeredAt: m.supplier_replied_at ?? null,
      replySubject: questionSubject(rfq.code, product),
    };
  }));
  return rows.filter((row): row is PortalQuestion => row !== null).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/**
 * Nhà cung cấp tự đánh dấu đã trả lời người mua qua email. Chỉ ghi mốc phản hồi của
 * câu hỏi thuộc chính họ; không đổi trạng thái RFQ, không gửi email.
 */
export async function markSupplierQuestionAnswered(input: { store: DataStore; supplierId: string; actorEmail: string; matchId: string }): Promise<{ rfqId: string }> {
  const { store, supplierId } = input;
  const match = await store.getRfqMatch(input.matchId);
  if (!match || match.supplier_id !== supplierId || !match.sent_to_supplier_at) throw new Error("notFound");
  const rfq = await store.getRfq(match.rfq_id);
  if (!rfq || rfq.source_page !== QUESTION_PAGE) throw new Error("notFound");
  if (match.supplier_replied_at) return { rfqId: rfq.id };
  const now = new Date().toISOString();
  await store.updateRfqMatch(match.id, { supplier_replied_at: now });
  await store.addAuditLog({
    actor_id: null, actor_email: input.actorEmail,
    entity: "rfq_match", entity_id: match.id, action: "supplier_portal.question_answered",
    before: { supplier_replied_at: null }, after: { supplier_replied_at: now },
  }).catch((err) => console.error("[supplier-portal] question answered audit failed", err));
  return { rfqId: rfq.id };
}
