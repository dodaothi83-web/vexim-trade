import type { SupportConversation, SupportMessage, SupportSender } from "@/lib/types";
import { CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_MS, CHAT_RENOTIFY_MS } from "./core";

/**
 * Quy tắc thuần cho chat người mua ↔ đội Vexim, cùng ngưỡng với chat nhà cung cấp:
 * 20 tin mỗi 10 phút cho mỗi bên, email báo tin mới không quá một thư mỗi 6 giờ khi
 * bên nhận chưa mở lại.
 */
export function supportOtherSide(side: SupportSender): SupportSender {
  return side === "buyer" ? "staff" : "buyer";
}

type ReadFields = Pick<SupportConversation, "last_message_at" | "last_sender" | "buyer_last_read_at" | "staff_last_read_at">;

/** Bên `side` còn tin chưa đọc (tin mới nhất do bên kia gửi, sau mốc đã đọc). */
export function supportHasUnread(c: ReadFields, side: SupportSender): boolean {
  if (!c.last_message_at || c.last_sender !== supportOtherSide(side)) return false;
  const read = side === "buyer" ? c.buyer_last_read_at : c.staff_last_read_at;
  return !read || read < c.last_message_at;
}

type NotifyFields = Pick<SupportConversation, "buyer_last_read_at" | "staff_last_read_at" | "buyer_notified_at" | "staff_notified_at">;

export function supportShouldNotify(c: NotifyFields, recipient: SupportSender, nowMs = Date.now()): boolean {
  const notified = recipient === "buyer" ? c.buyer_notified_at : c.staff_notified_at;
  if (!notified) return true;
  const read = recipient === "buyer" ? c.buyer_last_read_at : c.staff_last_read_at;
  if (read && read >= notified) return true;
  return nowMs - Date.parse(notified) >= CHAT_RENOTIFY_MS;
}

export function supportRateLimited(messages: Pick<SupportMessage, "sender" | "created_at">[], sender: SupportSender, nowMs = Date.now()): boolean {
  return messages.filter((m) => m.sender === sender && nowMs - Date.parse(m.created_at) < CHAT_BURST_WINDOW_MS).length >= CHAT_BURST_LIMIT;
}

/** Chỉ giữ đường dẫn trong site (không lấy domain, không query dài) làm ngữ cảnh cho nhân viên. */
export function cleanPagePath(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value.split("#")[0].slice(0, 300) || null;
}

/** Nhân viên chỉ cần thấy tên gọi, không lộ họ đầy đủ cho người mua. */
export function staffDisplayName(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}
