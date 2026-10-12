import { getStore } from "@/lib/db";
import { hasPermission } from "@/lib/auth/permissions";
import { ownerScopeOf } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import { assignSenderEmails } from "@/lib/email/sender";
import { isBuyerMailMessage } from "@/lib/mail/buyer-only";
import { MAIL_SYNC_LIMIT } from "@/lib/mail/sync-version";
import { ownedIdSets, visibleMailMessages, type MailViewer } from "@/lib/mail/visibility";
import type { AppUser, Buyer, EmailMessage, Prospect } from "@/lib/types";

/**
 * "Hộp thư của tôi" — nạp và lọc MỘT LẦN cho mọi nơi cần hỏi câu hỏi đó:
 * danh sách `/mail`, trang chi tiết `/mail/[id]`, badge chưa đọc ở menu và
 * endpoint đồng bộ `/api/mail/sync`.
 *
 * Vì sao cần gộp: bốn nơi trước đây tự nạp rồi tự lọc (người 500 thư, người 300 thư,
 * người chỉ đếm buyer, người không lọc gì). Kết quả là hai lỗi thật:
 *  1. Thư soạn gửi cho buyer CHƯA có trong hệ thống (buyer_id = null, prospect_id = null)
 *     bị ẩn khỏi Hộp thư của nhân viên dù chính họ gửi — chỉ admin thấy;
 *  2. Badge chưa đọc đếm thư của cả đội nên báo "có thư mới", mở ra thì danh sách trống.
 * Dùng chung một hàm nạp + một bộ quy tắc (lib/mail/visibility.ts) thì hai chỗ không
 * thể lệch nhau nữa, và `version` so sánh ở /api/mail/sync luôn tính trên đúng tập dữ liệu
 * mà trang đã render.
 */
export type MailboxData = {
  /** Tên cần khớp trong `owner`; null = người xem được thấy toàn bộ (admin và vai trò khác) */
  scope: string | null;
  canManageProspects: boolean;
  viewer: MailViewer;
  /** Thư đã áp phạm vi + mạch thư */
  visibleMessages: EmailMessage[];
  /** visibleMessages theo quy tắc hiển thị của Hộp thư hiện hành (tạm ẩn thư NCC) */
  mailMessages: EmailMessage[];
  buyers: Buyer[];
  prospects: Prospect[];
  users: AppUser[];
};

export async function loadMailboxData(
  session: Pick<SessionUser, "email" | "name" | "role">,
  opts: {
    /** true = mất kết nối DB thì trả danh sách rỗng (badge, endpoint đồng bộ);
     *  false = để lỗi nổi lên (trang Hộp thư, trang chi tiết thư) */
    tolerateErrors?: boolean;
  } = {},
): Promise<MailboxData> {
  const store = getStore();
  const scope = ownerScopeOf(session);
  const canManageProspects = hasPermission(session.role, "prospects.manage");
  const tolerateErrors = opts.tolerateErrors !== false;
  const keep = <T,>(promise: Promise<T>, fallback: T): Promise<T> =>
    tolerateErrors ? promise.catch(() => fallback) : promise;

  const [messages, buyers, prospects, users] = await Promise.all([
    keep(store.listMessages(MAIL_SYNC_LIMIT), [] as EmailMessage[]),
    keep(store.listBuyers(), [] as Buyer[]),
    // Danh sách đầu mối chỉ cần cho người có quyền, nhưng phải nạp NHƯ NHAU ở mọi trang
    // (kể cả admin) vì nhãn mạch thư và bản lọc phạm vi cùng dựa vào nó.
    canManageProspects
      ? keep(store.listProspects(), [] as Prospect[])
      : Promise.resolve([] as Prospect[]),
    // Bảng tài khoản rất nhỏ; cần để suy ra địa chỉ gửi riêng (sender_email) của người xem.
    keep(store.listUsers(), [] as AppUser[]),
  ]);

  const assigned = assignSenderEmails(users);
  const me = users.find((u) => (u.email ?? "").trim().toLowerCase() === session.email.trim().toLowerCase());
  const viewer: MailViewer = {
    name: session.name,
    email: session.email,
    senderAddress: (me && assigned.get(me.id)) || null,
    scope,
  };

  const visibleMessages = visibleMailMessages(messages, viewer, {
    buyerIds: ownedIdSets(buyers, scope),
    prospectIds: ownedIdSets(prospects, scope),
  });

  return {
    scope,
    canManageProspects,
    viewer,
    visibleMessages,
    mailMessages: visibleMessages.filter(isBuyerMailMessage),
    buyers,
    prospects,
    users,
  };
}
