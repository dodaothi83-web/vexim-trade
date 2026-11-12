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

/** Người mua nhắn mà nhà cung cấp chưa trả lời sau chừng này thời gian thì chuyển cho Vexim. */
export const CHAT_UNANSWERED_AFTER_MS = 48 * 60 * 60_000;
/** Chỉ chuyển tin còn mới: lúc bật tính năng không dội thư cho các cuộc bỏ lửng từ lâu. */
export const CHAT_UNANSWERED_MAX_AGE_MS = 14 * 24 * 60 * 60_000;

type UnansweredState = Pick<ChatConversation, "last_message_at" | "last_sender" | "unanswered_escalated_at" | "unanswered_handled_at">;

/**
 * Cuộc đã được chuyển cho Vexim và nhà cung cấp vẫn chưa trả lời. Nhà cung cấp trả lời, hoặc
 * người mua nhắn thêm tin mới, thì mốc chuyển cũ hết hiệu lực (đồng hồ 48 giờ tính lại).
 */
export function unansweredEscalated(c: UnansweredState): boolean {
  return c.last_sender === "buyer" && !!c.last_message_at && !!c.unanswered_escalated_at && c.unanswered_escalated_at >= c.last_message_at;
}

/**
 * Đến lúc chuyển cho Vexim chưa: tin cuối là của người mua, đã quá 48 giờ không ai trả lời,
 * chưa chuyển cho chính tin này. Tính theo "chưa trả lời" chứ không theo "chưa đọc": nhà cung
 * cấp mở xem rồi bỏ đó thì người mua vẫn đang chờ.
 */
export function unansweredEscalationDue(c: UnansweredState, nowMs = Date.now()): boolean {
  if (c.last_sender !== "buyer" || !c.last_message_at || unansweredEscalated(c)) return false;
  const age = nowMs - Date.parse(c.last_message_at);
  return age >= CHAT_UNANSWERED_AFTER_MS && age <= CHAT_UNANSWERED_MAX_AGE_MS;
}

/** Còn là việc của nhân viên: đã chuyển, nhà cung cấp chưa trả lời, chưa ai ghi "đã liên hệ". */
export function unansweredNeedsStaff(c: UnansweredState): boolean {
  return unansweredEscalated(c) && !(c.unanswered_handled_at && c.unanswered_handled_at >= c.unanswered_escalated_at!);
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
