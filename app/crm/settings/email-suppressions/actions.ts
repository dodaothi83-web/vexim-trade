"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { clearSuppression } from "@/lib/email/suppression-store";
import { normalizeEmail } from "@/lib/email/suppression";

export type AllowResendResult = { ok: boolean; message: string };

async function admin() {
  const session = await getSession();
  const db = getSupabaseClient();
  if (!session || session.role !== "admin" || !db) return null;
  // Quyền thay đổi trạng thái gửi thư luôn kiểm trên Supabase, không nhờ dữ liệu local.
  const user = await supabaseStore.getUser(session.uid);
  if (!user?.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
    return null;
  }
  return { db, user };
}

/** Gỡ một địa chỉ khỏi danh sách ngừng gửi, sau khi người nhận đã sửa hộp thư. */
export async function allowResendAction(
  _previous: AllowResendResult,
  fd: FormData,
): Promise<AllowResendResult> {
  const access = await admin();
  if (!access) return { ok: false, message: "Không xác nhận được quyền quản trị." };
  const email = normalizeEmail(fd.get("email"));
  if (!email.includes("@")) return { ok: false, message: "Địa chỉ không hợp lệ." };
  const cleared = await clearSuppression(email);
  revalidatePath("/crm/settings/email-suppressions");
  if (!cleared) return { ok: false, message: `Không gỡ được ${email}. Có thể dòng này đã được gỡ trước đó.` };
  const { error } = await access.db.from("audit_log").insert({
    actor_id: access.user.id,
    actor_email: access.user.email,
    entity: "email_suppression",
    entity_id: email,
    action: "email_suppression.cleared",
    before: { blocked: true },
    after: { blocked: false },
  });
  if (error) console.error("[email/suppression] không ghi được dấu vết kiểm toán:", error.message);
  return { ok: true, message: `Đã cho gửi lại tới ${email}.` };
}
