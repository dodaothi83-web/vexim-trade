import { getSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
import { loadMailboxData } from "@/lib/mail/mailbox-access";
import { mailSyncVersion } from "@/lib/mail/sync-version";

export const dynamic = "force-dynamic";

/**
 * Endpoint siêu nhẹ để trang Hộp thư tự đồng bộ: client poll định kỳ,
 * so version rồi mới router.refresh() — không cần tải lại trang thủ công.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !permissionsFor(session.role).includes("mail.view")) {
    return Response.json({ ok: false }, { status: 401 });
  }
  // Tập thư phải KHỚP HỆT với thứ trang /mail đã render (cùng giới hạn MAIL_SYNC_LIMIT,
  // cùng bộ lọc phạm vi, cùng quy tắc ẩn thư NCC). Trước đây một bên dùng 500 thư đã lọc,
  // một bên dùng 300 thư chưa lọc nên version không bao giờ bằng nhau và
  // MailLiveSync refresh lại trang 20 giây một lần mãi mãi.
  const mailbox = await loadMailboxData(session).catch(() => null);
  return Response.json({ ok: true, version: mailSyncVersion(mailbox?.mailMessages ?? []) });
}
