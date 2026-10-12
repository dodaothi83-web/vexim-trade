import type { EmailMessage } from "@/lib/types";

/**
 * Số bản ghi nạp về khi tính version. Phải dùng CHUNG ở trang /mail và /api/mail/sync:
 * hai bên từng dùng hai giới hạn khác nhau (500 và 300) nên version không bao giờ khớp,
 * MailLiveSync refresh lại trang 20 giây một lần vô hạn.
 */
export const MAIL_SYNC_LIMIT = 500;

/**
 * "Version" rẻ tiền của hộp thư: số lượng + mốc thời gian mới nhất + số chưa đọc.
 * Trang /mail nhúng giá trị này khi render; component client hỏi lại API định kỳ,
 * thấy version khác là biết có thư mới / thay đổi mới và tự router.refresh().
 * Hai phía phải tính trên CÙNG một tập thư (xem loadMailboxData) thì mới so được.
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
