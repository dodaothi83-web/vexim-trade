"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supplierOfferAccess } from "@/lib/rfq/portal-access";
import { canSupplierChatAboutRfq } from "@/lib/rfq/portal-core";
import { rfqBuyerContact } from "@/lib/rfq/buyer-contact";
import { ChatError, startSupplierRfqConversation } from "@/lib/chat/service";
import { canRateRfqLead, cleanLeadRating, type LeadRatingError } from "@/lib/rfq/lead-rating";
import { migrationHint } from "@/lib/db/migration-hints";
import { canReadMediatedDesk, markMediatedRfqRead, sendMediatedRfqMessage, type MediatedError } from "@/lib/rfq/mediated";

export type RfqChatState = { error: "unavailable" | "empty" | "too_long" | "rate_limited" | "unknown" | null; body: string };

/**
 * Nhà cung cấp hỏi lại người mua trước khi báo giá: tin đi vào Tin nhắn (chat chung), không còn
 * khung trao đổi riêng theo RFQ. Chỉ RFQ trực tiếp có tên nhà cung cấp này và người mua đã đồng ý
 * chia sẻ liên hệ với họ; gửi xong mở ngay cuộc trò chuyện.
 */
export async function supplierRfqChatAction(_previous: RfqChatState, fd: FormData): Promise<RfqChatState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  if (!canSupplierChatAboutRfq(access.rfq, access.match)) return { error: "unavailable", body };
  let conversationId: string;
  try {
    const buyer = await access.store.getBuyer(access.rfq.buyer_id).catch(() => null);
    const buyerEmail = buyer?.email?.trim() || rfqBuyerContact(access.rfq, access.supplier.id)?.email || "";
    if (!buyerEmail) return { error: "unavailable", body };
    const conversation = await startSupplierRfqConversation({ store: access.store, supplierId: access.supplier.id,
      supplierEmail: access.user.email, buyerEmail, label: [access.rfq.code, access.rfq.product_text?.trim()].filter(Boolean).join(" · ").slice(0, 120), body });
    conversationId = conversation.id;
  } catch (error) {
    if (error instanceof ChatError && (error.code === "empty" || error.code === "too_long" || error.code === "rate_limited")) return { error: error.code, body };
    console.error("[rfq-chat] supplier message not saved", error);
    return { error: "unknown", body };
  }
  redirect(`/supplier/portal/messages?c=${encodeURIComponent(conversationId)}`);
}

export type SupplierDeskState = { error: MediatedError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function supplierVeximMessageAction(previous: SupplierDeskState, fd: FormData): Promise<SupplierDeskState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  try {
    const result = await sendMediatedRfqMessage({ store: access.store, rfq: access.rfq, match: access.match,
      sender: "supplier", email: access.user.email, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-mediated] supplier message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath(`/crm/rfqs/${access.rfq.id}`);
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function supplierVeximReadAction(matchId: string, visibleAt: string): Promise<void> {
  const access = await supplierOfferAccess(matchId);
  if (!canReadMediatedDesk(access.rfq, access.match)) return;
  await markMediatedRfqRead({ store: access.store, threadId: access.match.id, side: "party", visibleAt });
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
}

export type LeadRatingFormState = { error: LeadRatingError | "unknown" | null; saved: boolean; seq: number };

/** Optional and private. Saving it never touches a buyer-visible record or page: do not
 * add a buyer path to the revalidation list or notify the buyer from here. */
export async function supplierLeadRatingAction(previous: LeadRatingFormState, fd: FormData): Promise<LeadRatingFormState> {
  const matchId = String(fd.get("match_id") ?? "");
  const access = await supplierOfferAccess(matchId);
  if (!canRateRfqLead(access.rfq, access.match)) return { error: "unavailable", saved: false, seq: previous.seq };
  const clean = cleanLeadRating({ rating: fd.get("rating"), reasons: fd.getAll("reasons"), note: fd.get("note") });
  if (!clean.ok) return { error: clean.error, saved: false, seq: previous.seq };
  try {
    await access.store.saveRfqLeadRating({ match_id: access.match.id, rfq_id: access.rfq.id,
      supplier_id: access.supplier.id, buyer_id: access.rfq.buyer_id, rating: clean.rating,
      reasons: clean.reasons, note: clean.note, rated_by_email: access.user.email });
  } catch (error) {
    console.error("[rfq-lead-rating] not saved", migrationHint(error) ?? error);
    return { error: "unknown", saved: false, seq: previous.seq };
  }
  revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  revalidatePath(`/crm/rfqs/${access.rfq.id}`);
  revalidatePath(`/crm/buyers/${access.rfq.buyer_id}`);
  return { error: null, saved: true, seq: previous.seq + 1 };
}
