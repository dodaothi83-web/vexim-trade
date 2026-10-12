import type { EmailMessage } from "@/lib/types";

/**
 * Quy tắc "ai được thấy thư nào" trong Hộp thư — DÙNG CHUNG cho danh sách `/mail`,
 * trang chi tiết `/mail/[id]`, badge chưa đọc ở menu và endpoint đồng bộ `/api/mail/sync`.
 *
 * Vì sao phải gom về một chỗ: ba nơi từng tự viết ba điều kiện lọc khác nhau và đều
 * bỏ sót trường hợp thư KHÔNG gắn buyer_id/prospect_id (buyer mới toanh, chưa có trong
 * hệ thống). Hệ quả: nhân viên soạn gửi được, nhưng thư biến mất khỏi Hộp thư; buyer trả
 * lời thì có thông báo mà mở ra không thấy gì — chỉ admin (scope = null) đọc được.
 *
 * Nhân viên kinh doanh (role "sale") thấy một thư khi thoả MỘT trong bốn điều kiện:
 *  1. thư thuộc buyer/prospect do họ phụ trách (owner trùng tên hiển thị — cùng hệ
 *     quy chiếu với `ownerScopeOf`, vì `owner` trong DB là text chứ không phải khoá ngoại);
 *  2. chính họ là người soạn (created_by = tên hiển thị, do sendMailAction ghi);
 *  3. thư đến gửi về địa chỉ riêng của họ (to/cc chứa email đăng nhập hoặc sender_email
 *     — mỗi người gửi bằng địa chỉ theo tên mình, xem lib/email/sender.ts);
 *  4. thư thuộc CÙNG MẠCH (thread_id) với một thư họ đã thấy ở trên. Điều kiện 4 là chỗ
 *     sửa nốt phần "buyer trả lời mà mở ra không thấy": bản thân thư đến từ người lạ chưa
 *     có trong hệ thống không mang buyer_id, nhưng mạch thư thì có thư do chính họ gửi.
 *
 * Vai trò khác (admin) có scope = null => thấy toàn bộ, giữ nguyên hành vi cũ.
 */

export type MailViewer = {
  /** Tên hiển thị của người xem — dùng để so với created_by và owner */
  name: string | null;
  /** Email đăng nhập */
  email: string;
  /** Địa chỉ gửi riêng theo tên người (null nếu chưa có) */
  senderAddress: string | null;
  /** null = được xem tất cả */
  scope: string | null;
};

export type MailOwnership = {
  /** id các buyer thuộc phạm vi người xem */
  buyerIds: ReadonlySet<string>;
  /** id các prospect thuộc phạm vi người xem */
  prospectIds: ReadonlySet<string>;
};

/** Những cột cần cho việc lọc — mọi EmailMessage đều thoả */
export type MailVisibilityRow = Pick<
  EmailMessage,
  "id" | "buyer_id" | "prospect_id" | "created_by" | "kind" | "to_emails" | "cc_emails" | "thread_id"
>;

/** "Dũng Nguyễn <dung@veximtrade.com>" -> "dung@veximtrade.com"; tên -> chữ thường, một khoảng trắng */
function bareAddress(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim().toLowerCase();
}

function normaliseName(input: string | null | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Thư có phải "của tôi" không, xét theo người soạn hoặc địa chỉ nhận —
 * không cần biết buyer/prospect. Đây là hai điều kiện 2 và 3 ở đầu file.
 */
export function isMyMail(message: MailVisibilityRow, viewer: MailViewer): boolean {
  const me = new Set<string>();
  const name = normaliseName(viewer.name);
  if (name) me.add(name);
  const email = bareAddress(viewer.email);
  if (email) me.add(email);
  const sender = bareAddress(viewer.senderAddress);
  if (sender) me.add(sender);
  if (!me.size) return false;

  const author = normaliseName(message.created_by);
  // created_by của thư đi là tên người soạn; của thư đến là địa chỉ người ngoài
  const authorAddress = bareAddress(message.created_by);
  if ((author && me.has(author)) || (authorAddress && me.has(authorAddress))) return true;

  if (message.kind === "inbound") {
    const personal = [email, sender].filter(Boolean) as string[];
    if (personal.length) {
      const recipients = [...(message.to_emails ?? []), ...(message.cc_emails ?? [])].map(bareAddress);
      if (recipients.some((address) => personal.includes(address))) return true;
    }
  }
  return false;
}

/** Một thư có hiển thị với người xem không, chưa tính mạch thư (điều kiện 1 + 2 + 3). */
export function isMailVisibleTo(
  message: MailVisibilityRow,
  viewer: MailViewer,
  owned: MailOwnership,
): boolean {
  if (viewer.scope === null) return true;
  if (message.buyer_id && owned.buyerIds.has(message.buyer_id)) return true;
  if (message.prospect_id && owned.prospectIds.has(message.prospect_id)) return true;
  return isMyMail(message, viewer);
}

/**
 * Lọc danh sách thư theo người xem, MỞ RỘNG THEO MẠCH THƯ: nếu người xem thấy được
 * một thư trong mạch thì thấy được cả mạch (thứ tự giữ nguyên như đầu vào).
 */
export function visibleMailMessages<T extends MailVisibilityRow>(
  messages: T[],
  viewer: MailViewer,
  owned: MailOwnership,
): T[] {
  if (viewer.scope === null) return messages;
  const visibleIds = new Set<string>();
  const visibleThreads = new Set<string>();
  for (const message of messages) {
    if (!isMailVisibleTo(message, viewer, owned)) continue;
    visibleIds.add(message.id);
    if (message.thread_id) visibleThreads.add(message.thread_id);
  }
  if (!visibleThreads.size) return messages.filter((m) => visibleIds.has(m.id));
  return messages.filter((m) => (m.thread_id && visibleThreads.has(m.thread_id)) || visibleIds.has(m.id));
}

/** Tập id buyer/prospect thuộc phạm vi một người (scope = null thì không cần dùng đến). */
export function ownedIdSets<T extends { id: string; owner?: string | null }>(
  items: T[],
  scope: string | null,
): Set<string> {
  const needle = normaliseName(scope);
  if (!needle) return new Set();
  return new Set(items.filter((item) => normaliseName(item.owner) === needle).map((item) => item.id));
}
