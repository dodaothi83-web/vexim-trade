import type { EmailMessage } from "@/lib/types";

/**
 * "Version" rẻ tiền của hộp thư: số lượng + mốc thời gian mới nhất + số chưa đọc.
 * Trang /mail nhúng giá trị này khi render; component client hỏi lại API định kỳ,
 * thấy version khác là biết có thư mới / thay đổi mới và tự router.refresh().
 */
export function mailSyncVersion(messages: EmailMessage[]): string {
  let latest = "";
  let unread = 0;
  for (const m of messages) {
    if (m.created_at > latest) latest = m.created_at;
    if (m.kind === "inbound" && !m.read_at) unread += 1;
  }
  return `${messages.length}#${latest}#${unread}`;
}
