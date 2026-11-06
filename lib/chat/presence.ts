import type { DataStore } from "@/lib/db/types";

/**
 * Trạng thái online cho chat. Mỗi lần một bên gọi API chat (khung chat, thanh công cụ, menu cổng
 * nhà cung cấp, hộp chat CRM đều tự hỏi lại khi tab đang mở) là ghi "lần cuối thấy". Còn thấy
 * trong 2 phút thì coi là online. Ghi tối đa 30 giây một lần cho mỗi khoá để đỡ tải.
 * Lỗi đọc ghi (ví dụ chưa chạy migration) không bao giờ làm hỏng chat: chỉ là không có trạng thái.
 */
export const PRESENCE_ONLINE_MS = 2 * 60_000;
const WRITE_THROTTLE_MS = 30_000;
const lastWrite = new Map<string, number>();

export const presenceKey = {
  buyer: (email: string) => `buyer:${email.trim().toLowerCase()}`,
  supplier: (supplierId: string) => `supplier:${supplierId}`,
  /** Cả đội Vexim là một bên với người mua. */
  staff: () => "staff:vexim",
};

export async function touchPresence(store: DataStore, key: string, nowMs = Date.now()): Promise<void> {
  if (nowMs - (lastWrite.get(key) ?? 0) < WRITE_THROTTLE_MS) return;
  lastWrite.set(key, nowMs);
  if (lastWrite.size > 5000) lastWrite.clear();
  try { await store.touchChatPresence(key, new Date(nowMs).toISOString()); } catch { lastWrite.delete(key); }
}

export async function readPresence(store: DataStore, keys: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(keys)];
  if (!unique.length) return {};
  try { return await store.getChatPresence(unique); } catch { return {}; }
}

export function isOnline(lastSeenAt: string | null | undefined, nowMs = Date.now()): boolean {
  return Boolean(lastSeenAt) && nowMs - Date.parse(lastSeenAt!) < PRESENCE_ONLINE_MS;
}
