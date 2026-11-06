import "server-only";

import brandColors from "@/lib/brand/colors.json";
import { FROM_ADDRESS, MAIL_DOMAIN, SERVICE_FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { notificationOrigin } from "@/lib/supplier-portal/notify";
import { SITE_URL } from "@/lib/site";
import type { SupportConversation, SupportMessage, SupportSender } from "@/lib/types";
import { chatPreview, cleanChatBody } from "./core";
import { presenceKey, readPresence } from "./presence";
import { cleanPagePath, staffDisplayName, supportHasUnread, supportRateLimited, supportShouldNotify } from "./support-core";

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
function deskInbox(): string {
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
  const latest = { ...conversation, ...patch };
  const recipient: SupportSender = input.sender === "buyer" ? "staff" : "buyer";
  if (supportShouldNotify(latest, recipient)) {
    const sent = await notify(store, latest, recipient, checked.body)
      .catch((error) => { console.error("[support] new-message email failed", error); return false; });
    if (sent) Object.assign(patch, recipient === "buyer" ? { buyer_notified_at: message.created_at } : { staff_notified_at: message.created_at });
  }
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

async function notify(store: DataStore, c: SupportConversation, recipient: SupportSender, body: string): Promise<boolean> {
  const preview = chatPreview(body, 600);
  const quote = `<div style="margin:14px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};white-space:pre-wrap;">${escapeHtml(preview)}</div>`;
  const button = (href: string, label: string) => `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${brandColors.primary};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${escapeHtml(label)}</a></p>`;
  if (recipient === "staff") {
    const assignee = c.assigned_to ? await store.getUser(c.assigned_to).catch(() => null) : null;
    const to = assignee?.is_active && assignee.email ? assignee.email : deskInbox();
    const [view] = await supportConversationViews(store, [c]);
    const link = `${notificationOrigin()}/crm/support?c=${encodeURIComponent(c.id)}`;
    const title = `Người mua nhắn Vexim: ${view?.buyerLabel ?? c.buyer_email}`;
    const html = `<p>Có tin nhắn mới từ người mua trong mục Chat với người mua.</p>${quote}${button(link, "Trả lời trong CRM")}
      <p style="color:${brandColors.muted};font-size:12.5px;">Vui lòng trả lời trong CRM để người mua thấy ngay trên trang Vexim.</p>`;
    const res = await transport({ to: [to], from: SERVICE_FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body: html }),
      text: `${title}\n\n${preview}\n\nTrả lời trong CRM: ${link}`, headers: { "X-Vexim-Support": c.id } });
    return res.ok;
  }
  const link = `${SITE_URL}/?support=1`;
  const title = "New message from Vexim Trade";
  const html = `<p>The Vexim Trade team replied to your message.</p>${quote}${button(link, "Reply on Vexim")}
    <p style="color:${brandColors.muted};font-size:12.5px;">Please do not reply to this email. Open Vexim and click Chat with Vexim to continue the conversation.</p>`;
  const res = await transport({ to: [c.buyer_email], from: FROM_ADDRESS, subject: title, html: wrapPlainEmail({ title: escapeHtml(title), body: html }),
    text: `${title}\n\n${preview}\n\nReply on Vexim: ${link}\nPlease do not reply to this email.`, headers: { "X-Vexim-Support": c.id } });
  return res.ok;
}
