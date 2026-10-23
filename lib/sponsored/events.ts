import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isPushId(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}

/**
 * Ghi một lượt hiển thị hoặc một lượt mở thẻ.
 *
 * Cơ sở dữ liệu kiểm lại gói còn hiệu lực tại đúng thời điểm ghi, nên gói vừa hết
 * hạn thì sự kiện đến muộn bị bỏ qua thay vì cộng vào báo cáo của tuần sau. Chạy
 * ở kho local thì không có bảng nào để ghi, và điều đó không phải lỗi.
 */
export async function recordPushEvent(pushId: string, event: "impression" | "click"): Promise<void> {
  if (!isPushId(pushId)) return;
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.rpc("record_sponsored_push_event", { p_push_id: pushId, p_event_type: event });
  if (error) throw new Error(`sponsored push event write: ${error.message}`);
}
