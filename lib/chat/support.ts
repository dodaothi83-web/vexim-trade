import "server-only";

import { MAIL_DOMAIN } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import type { SupportConversation, SupportMessage, SupportSender } from "@/lib/types";
import { chatPreview, cleanChatBody } from "./core";
import { presenceKey, readPresence } from "./presence";
import { cleanPagePath, staffDisplayName, supportHasUnread, supportRateLimited } from "./support-core";

/**
 * Chat người mua ↔ đội Vexim (thay WhatsApp "Chat with us").
 *
 * Mỗi người mua một cuộc trò chuyện. Nhân viên có quyền support.manage trả lời trong CRM;
 * trả lời lần đầu là tự nhận xử lý cuộc đó. Email chỉ để báo có tin mới: người mua nhận thư
 * khi nhân viên trả lời, nhân viên phụ trách (hoặc hộp thư chung nếu chưa ai nhận) nhận thư
 * khi người mua nhắn.
 */

export class SupportError extends Error {
  constructor(public code: "not_found" | "empty" | "too_long" | "rate_limited") { super(code); }
}

/** Tin nhắn như người đang xem thấy. Người mua thấy tên gọi nhân viên, không thấy email nội bộ. */
export interface SupportMessageView {
  id: string;
  mine: boolean;
  body: string;
  /** Tên hiển thị của người gửi khi không phải mình. */
  author: string | null;
  pagePath: string | null;
  createdAt: string;
}

export interface SupportConversationView {
  id: string;
  buyerEmail: string;
  buyerLabel: string;
  buyerCompany: string | null;
  buyerCrmId: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  preview: string | null;
  lastMessageAt: string | null;
  lastSender: SupportSender | null;
  unread: boolean;
  /** Người mua đã đọc tới mốc này (tin nhân viên gửi trước mốc là "đã xem"). */
  buyerReadAt: string | null;
  /** Lần cuối người mua còn mở Vexim. */
  buyerLastSeen: string | null;
}

/** Hộp thư chung khi chưa nhân viên nào nhận cuộc (cùng nơi nhận RFQ mới). */
export function deskInbox(): string {
  return process.env.RFQ_INTERNAL_EMAIL?.trim() || `hello@${MAIL_DOMAIN}`;
}

export function supportMessageViews(messages: SupportMessage[], viewer: SupportSender): SupportMessageView[] {
  return messages.map((m) => ({
    id: m.id, mine: m.sender === viewer, body: m.body, createdAt: m.created_at,
    // Người mua thấy tên gọi nhân viên; nhân viên thấy tên đầy đủ đồng nghiệp đã trả lời.
    author: viewer === "staff" ? (m.sender === "staff" ? m.staff_name : null)
      : m.sender === "staff" ? (staffDisplayName(m.staff_name) ? `${staffDisplayName(m.staff_name)} · Vexim Trade` : "Vexim Trade") : null,
    // Trang người mua đang xem chỉ hữu ích cho nhân viên.
    pagePath: viewer === "staff" ? m.page_path : null,
  }));
}

export async function supportConversationViews(store: DataStore, rows: SupportConversation[]): Promise<SupportConversationView[]> {
  const staffIds = [...new Set(rows.map((r) => r.assigned_to).filter((id): id is string => Boolean(id)))];
  const staff = new Map((await Promise.all(staffIds.map((id) => store.getUser(id).catch(() => null))))
    .filter((u): u is NonNullable<typeof u> => Boolean(u)).map((u) => [u.id, u.name || u.email]));
  const seen = await readPresence(store, rows.map((r) => presenceKey.buyer(r.buyer_email)));
  return Promise.all(rows.map(async (c) => {
    const account = await store.getBuyerUserByEmail(c.buyer_email).catch(() => null);
    const crm = typeof store.getBuyerByEmail === "function" ? await store.getBuyerByEmail(c.buyer_email).catch(() => null) : null;
    const company = account?.company_name?.trim() || crm?.company?.trim() || null;
    return {
      id: c.id, buyerEmail: c.buyer_email, buyerLabel: company ?? c.buyer_email, buyerCompany: company, buyerCrmId: crm?.id ?? null,
      assignedTo: c.assigned_to, assignedName: c.assigned_to ? staff.get(c.assigned_to) ?? null : null,
      preview: c.last_message_preview, lastMessageAt: c.last_message_at ?? c.created_at, lastSender: c.last_sender,
      unread: supportHasUnread(c, "staff"),
      buyerReadAt: c.buyer_last_read_at, buyerLastSeen: seen[presenceKey.buyer(c.buyer_email)] ?? null,
    };
  }));
}

/** Đánh dấu đã đọc tới tin mới nhất (lấy mốc lớn hơn để lệch đồng hồ không để sót tin). */
export async function markSupportRead(store: DataStore, c: SupportConversation, side: SupportSender): Promise<void> {
  if (!supportHasUnread(c, side)) return;
  const now = new Date().toISOString();
  const at = c.last_message_at && c.last_message_at > now ? c.last_message_at : now;
  await store.updateSupportConversation(c.id, side === "buyer" ? { buyer_last_read_at: at } : { staff_last_read_at: at });
}

async function post(store: DataStore, conversation: SupportConversation, input: {
  sender: SupportSender; senderEmail: string; body: string; pagePath?: unknown; staff?: { id: string; name: string } | null;
}): Promise<SupportMessage> {
  const checked = cleanChatBody(input.body);
  if (!checked.ok) throw new SupportError(checked.error);
  const recent = await store.listSupportMessages(conversation.id, 60);
  if (supportRateLimited(recent, input.sender)) throw new SupportError("rate_limited");
  const message = await store.addSupportMessage({
    conversation_id: conversation.id, sender: input.sender, sender_email: input.senderEmail.trim().toLowerCase(),
    staff_user_id: input.staff?.id ?? null, staff_name: input.staff?.name ?? null, body: checked.body,
    page_path: input.sender === "buyer" ? cleanPagePath(input.pagePath) : null,
  });
  const patch: Partial<SupportConversation> = {
    last_message_at: message.created_at, last_message_preview: chatPreview(checked.body), last_sender: input.sender,
    ...(input.sender === "buyer" ? { buyer_last_read_at: message.created_at } : { staff_last_read_at: message.created_at }),
    // Nhân viên trả lời cuộc chưa ai nhận thì tự nhận cuộc đó.
    ...(input.sender === "staff" && !conversation.assigned_to && input.staff ? { assigned_to: input.staff.id } : {}),
  };
  // Email báo tin gửi chậm và gộp qua lib/chat/notify.ts.
  await store.updateSupportConversation(conversation.id, patch);
  return message;
}

/** Người mua nhắn cho Vexim; cuộc trò chuyện được tạo ở tin đầu tiên. */
export async function postBuyerSupportMessage(input: { store: DataStore; buyerEmail: string; body: string; pagePath?: unknown }) {
  const conversation = await input.store.getSupportConversationByBuyer(input.buyerEmail)
    ?? await input.store.createSupportConversation(input.buyerEmail);
  const message = await post(input.store, conversation, { sender: "buyer", senderEmail: input.buyerEmail, body: input.body, pagePath: input.pagePath });
  return { conversation, message };
}

export async function postStaffSupportMessage(input: { store: DataStore; conversation: SupportConversation; staff: { id: string; name: string; email: string }; body: string }) {
  return post(input.store, input.conversation, {
    sender: "staff", senderEmail: input.staff.email, body: input.body, staff: { id: input.staff.id, name: input.staff.name || input.staff.email },
  });
}
