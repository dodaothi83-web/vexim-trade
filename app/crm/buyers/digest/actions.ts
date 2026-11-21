"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { previewDigest, setDigestPaused } from "@/lib/buyer/digest-server";
import type { DigestKind } from "@/lib/buyer/digest";
import { transport } from "@/lib/email/send";

/** Tạm dừng / chạy lại thư giới thiệu (chỉ dùng khi có sự cố). Ghi nhật ký. */
export async function setDigestPausedAction(paused: boolean): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("buyers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  try {
    await setDigestPaused(paused, session?.email ?? null);
    await getStore().addAuditLog({ actor_id: session?.uid ?? null, actor_email: session?.email ?? null, entity: "buyer", entity_id: "digest",
      action: paused ? "staff.buyer_digest_paused" : "staff.buyer_digest_resumed" }).catch(() => null);
    revalidatePath("/crm/buyers/digest");
    return { ok: true, message: paused ? "Đã tạm dừng. Không thư nào được gửi cho tới khi chạy lại." : "Đã chạy lại. Thư gửi theo lịch." };
  } catch (error) {
    console.error("[crm-digest] pause", error);
    return { ok: false, message: "Chưa lưu được. Thử lại sau ít phút." };
  }
}

/** Gửi thử thư của một ngành về email của nhân viên đang đăng nhập. */
export async function sendDigestTestAction(kind: DigestKind, categoryId: string): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("buyers.view");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session?.email) return { ok: false, message: "Không tìm thấy email của bạn." };
  try {
    const mail = await previewDigest(kind === "brief" ? "brief" : "products", categoryId);
    if (!mail) return { ok: false, message: "Ngành này tuần này chưa đủ nội dung để gửi." };
    const sent = await transport({ ...mail, to: [session.email], subject: `[Thử] ${mail.subject}` });
    return sent.ok ? { ok: true, message: `Đã gửi thử tới ${session.email}.` } : { ok: false, message: "Chưa gửi được thư thử." };
  } catch (error) {
    console.error("[crm-digest] test", error);
    return { ok: false, message: "Chưa gửi được thư thử." };
  }
}
