import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { permissionsFor } from "@/lib/auth/permissions";
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
  const messages = await getStore()
    .listMessages(300)
    .catch(() => []);
  return Response.json({ ok: true, version: mailSyncVersion(messages) });
}
