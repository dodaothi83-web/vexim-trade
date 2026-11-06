import type { ChatConversation, ChatMessage, ChatSender } from "@/lib/types";

/**
 * Quy tắc chat thuần (không đọc dữ liệu, không gửi thư) để kiểm thử bằng số.
 *
 * - Nội dung: cắt khoảng trắng, 1 đến 4.000 ký tự.
 * - Chống spam: mỗi bên tối đa 20 tin trong 10 phút trong một cuộc trò chuyện.
 * - Chưa đọc: tin của bên kia mới hơn mốc đã đọc của mình.
 * - Email báo tin mới: xem notificationDue (gửi chậm 10 phút, nhắc một lần sau 24 giờ).
 */
export const CHAT_MAX_LENGTH = 4000;
export const CHAT_BURST_LIMIT = 20;
export const CHAT_BURST_WINDOW_MS = 10 * 60_000;
/** Tin chưa đọc sau chừng này thời gian (và người nhận không online) mới gửi email đầu. */
export const CHAT_NOTIFY_DELAY_MS = 10 * 60_000;
/** Email đầu quá chừng này mà vẫn chưa đọc thì nhắc đúng một lần. */
export const CHAT_REMIND_AFTER_MS = 24 * 60 * 60_000;

export type NotifyKind = "first" | "reminder";

/**
 * Có gửi email báo tin cho người nhận lúc này không, và là email đầu hay lần nhắc.
 * - Không còn tin chưa đọc, hoặc người nhận đang online: không gửi (họ thấy ngay trên Vexim).
 * - Chưa từng báo, hoặc đã đọc từ lần báo trước: email đầu khi tin mới nhất đã quá 10 phút.
 * - Đã báo mà chưa đọc: nhắc một lần sau 24 giờ, rồi dừng tới khi người nhận đọc.
 */
export function notificationDue(s: {
  lastMessageAt: string | null; fromOtherSide: boolean; readAt: string | null;
  notifiedAt: string | null; remindedAt?: string | null;
}, online: boolean, nowMs = Date.now()): NotifyKind | null {
  if (!s.lastMessageAt || !s.fromOtherSide) return null;
  if (s.readAt && s.readAt >= s.lastMessageAt) return null;
  if (online) return null;
  if (!s.notifiedAt || (s.readAt && s.readAt >= s.notifiedAt)) {
    return nowMs - Date.parse(s.lastMessageAt) >= CHAT_NOTIFY_DELAY_MS ? "first" : null;
  }
  if (s.remindedAt && s.remindedAt >= s.notifiedAt) return null;
  return nowMs - Date.parse(s.notifiedAt) >= CHAT_REMIND_AFTER_MS ? "reminder" : null;
}
/** Một người mua mở tối đa chừng này cuộc trò chuyện MỚI trong 24 giờ. */
export const CHAT_NEW_PER_DAY = 20;

export function tooManyNewConversations(rows: Pick<ChatConversation, "created_at">[], nowMs = Date.now()): boolean {
  return rows.filter((c) => nowMs - Date.parse(c.created_at) < 24 * 60 * 60_000).length >= CHAT_NEW_PER_DAY;
}

export type ChatBodyCheck = { ok: true; body: string } | { ok: false; error: "empty" | "too_long" };

export function cleanChatBody(raw: unknown): ChatBodyCheck {
  const body = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[^\S\n]+\n/g, "\n").trim();
  if (!body) return { ok: false, error: "empty" };
  if (body.length > CHAT_MAX_LENGTH) return { ok: false, error: "too_long" };
  return { ok: true, body };
}

export function chatRateLimited(messages: Pick<ChatMessage, "sender" | "created_at">[], sender: ChatSender, nowMs = Date.now()): boolean {
  return messages.filter((m) => m.sender === sender && nowMs - Date.parse(m.created_at) < CHAT_BURST_WINDOW_MS).length >= CHAT_BURST_LIMIT;
}

export function otherSide(side: ChatSender): ChatSender {
  return side === "buyer" ? "supplier" : "buyer";
}

/** Bên `side` còn tin chưa đọc không (tin mới nhất do bên kia gửi, sau mốc đã đọc). */
export function hasUnread(conversation: Pick<ChatConversation, "last_message_at" | "last_sender" | "buyer_last_read_at" | "supplier_last_read_at">, side: ChatSender): boolean {
  if (!conversation.last_message_at || conversation.last_sender !== otherSide(side)) return false;
  const read = side === "buyer" ? conversation.buyer_last_read_at : conversation.supplier_last_read_at;
  return !read || read < conversation.last_message_at;
}


export function chatPreview(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
