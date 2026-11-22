import type { DataStore } from "@/lib/db/types";
import { rfqEventAfter } from "./portal-core";

/*
 * Khung trao đổi riêng theo RFQ giữa người mua và nhà cung cấp đã bỏ: hai bên nhắn qua Tin
 * nhắn (lib/chat). Chỉ còn mốc đã đọc, dùng cho nhãn "Báo giá mới" và thông báo trong cổng.
 */

/** At is the latest event rendered to the user, never the entire future thread. */
export async function markVisibleRfqThreadRead(input: {
  store: DataStore; matchId: string; side: "buyer" | "supplier"; visibleAt: string;
}): Promise<void> {
  const seen = Date.parse(input.visibleAt);
  if (!Number.isFinite(seen)) return;
  const match = await input.store.getRfqMatch(input.matchId);
  if (!match) return;
  const latest = [match.last_thread_message_at, ...(input.side === "buyer" ? [match.sent_to_buyer_at] : [])]
    .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)));
  if (!latest.length) return;
  const latestAt = latest.reduce((last, at) => rfqEventAfter(at, last) ? at : last);
  // Preserve PostgreSQL microseconds for the visible event: rounding it to JS
  // milliseconds would leave its badge/email unread. Clamp forged future markers.
  const at = rfqEventAfter(input.visibleAt, latestAt) ? latestAt
    : seen > Date.now() ? new Date().toISOString() : input.visibleAt;
  await input.store.markRfqThreadRead(match.id, input.side, at);
}
