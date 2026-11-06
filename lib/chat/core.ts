import type { ChatConversation, ChatMessage, ChatSender } from "@/lib/types";

/**
 * Quy tắc chat thuần (không đọc dữ liệu, không gửi thư) để kiểm thử bằng số.
 *
 * - Nội dung: cắt khoảng trắng, 1 đến 4.000 ký tự.
 * - Chống spam: mỗi bên tối đa 20 tin trong 10 phút trong một cuộc trò chuyện.
 * - Chưa đọc: tin của bên kia mới hơn mốc đã đọc của mình.
 * - Email báo tin mới: chỉ gửi khi bên nhận đã đọc hết từ lần báo trước, hoặc lần báo
 *   trước đã quá 6 giờ. Một loạt tin liên tiếp chỉ ra một email.
 */
export const CHAT_MAX_LENGTH = 4000;
export const CHAT_BURST_LIMIT = 20;
export const CHAT_BURST_WINDOW_MS = 10 * 60_000;
export const CHAT_RENOTIFY_MS = 6 * 60 * 60_000;
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

/** Có nên gửi email báo tin mới cho bên `recipient` không. */
export function shouldNotify(conversation: Pick<ChatConversation, "buyer_last_read_at" | "supplier_last_read_at" | "buyer_notified_at" | "supplier_notified_at">, recipient: ChatSender, nowMs = Date.now()): boolean {
  const notified = recipient === "buyer" ? conversation.buyer_notified_at : conversation.supplier_notified_at;
  if (!notified) return true;
  const read = recipient === "buyer" ? conversation.buyer_last_read_at : conversation.supplier_last_read_at;
  if (read && read >= notified) return true;
  return nowMs - Date.parse(notified) >= CHAT_RENOTIFY_MS;
}

export function chatPreview(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
