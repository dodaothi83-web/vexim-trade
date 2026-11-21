"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { inviteEligible } from "@/lib/buyer/introductions";
import { listVerifiedBuyerUsers, patchIntroductions, sendIntroMail } from "@/lib/buyer/introductions-server";

/**
 * Nhân viên gửi đợt thư mời chọn ngành hàng cho người mua đã có tài khoản: chỉ người đã xác thực,
 * chưa nhận giới thiệu, chưa từ chối, chưa được mời. Mỗi người chỉ nhận một lần (nhắc một lần sau 14
 * ngày do tác vụ hằng ngày gửi). Ghi nhật ký số thư.
 */
export async function sendIntroInvitesAction(): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("buyers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  try {
    const targets = (await listVerifiedBuyerUsers()).filter(inviteEligible).slice(0, 500);
    let sent = 0, failed = 0;
    for (const user of targets) {
      const result = await sendIntroMail("invite", user).catch(() => null);
      if (!result?.ok) { failed++; continue; }
      await patchIntroductions(user.id, (current) => ({ ...current, invite_sent_at: new Date().toISOString() }));
      sent++;
    }
    await getStore().addAuditLog({ actor_id: session?.uid ?? null, actor_email: session?.email ?? null, entity: "buyer", entity_id: "introductions",
      action: "staff.buyer_intro_invites_sent", before: { eligible: targets.length }, after: { sent, failed } }).catch(() => null);
    revalidatePath("/crm/buyers/introductions");
    return { ok: failed === 0, message: failed ? `Đã gửi ${sent} thư, ${failed} thư chưa gửi được (thử lại sau).` : `Đã gửi ${sent} thư mời.` };
  } catch (error) {
    console.error("[crm-buyer-intro] invites", error);
    return { ok: false, message: "Chưa gửi được thư mời. Thử lại sau ít phút." };
  }
}
