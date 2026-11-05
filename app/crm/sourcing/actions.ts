"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingStatuses } from "@/lib/sourcing/status";
import { sourcingUuid } from "@/lib/sourcing/files";
import type { SourcingStatus } from "@/lib/types";
import { getStore } from "@/lib/db";
import { startSourcingMatch } from "@/lib/sourcing/to-rfq";
export async function updateSourcingAction(fd: FormData) {
  await requirePagePermission("rfq.manage", "/crm/dashboard");
  const id = String(fd.get("id") ?? ""); const version = Number(fd.get("version"));
  const status = String(fd.get("status") ?? "") as SourcingStatus;
  const assigned = String(fd.get("assigned_to") ?? "");
  const note = String(fd.get("internal_note") ?? "").trim(); const reply = String(fd.get("buyer_reply") ?? "").trim();
  if (!sourcingUuid(id) || !Number.isSafeInteger(version) || version < 1 || !sourcingStatuses.includes(status) || note.length > 3000 || reply.length > 3000 || (status === "needs_info" && !reply)) redirect("/crm/sourcing?error=invalid");
  const store = sourcingStore();
  if (assigned) {
    const user = sourcingUuid(assigned) ? await store.getUser(assigned) : null;
    if (!user?.is_active || !hasPermission(user.role, "rfq.manage")) redirect("/crm/sourcing?error=assignee");
  }
  const result = await store.updateSourcingRequest(id, version, { status, assigned_to: assigned || null, internal_note: note || null, buyer_reply: reply || null });
  if (!result) redirect("/crm/sourcing?error=conflict");
  revalidatePath("/crm", "layout"); revalidatePath("/crm/sourcing"); revalidatePath("/buyer/account"); revalidatePath(`/buyer/account/sourcing/${id}`);
  redirect(`/crm/sourcing?saved=${id}`);
}

/** Bắt đầu ghép nhà cung cấp: tạo (hoặc mở lại) RFQ liên kết rồi chuyển sang trang ghép. */
export async function startSourcingMatchAction(fd: FormData) {
  const session = await requirePagePermission("rfq.manage", "/crm/dashboard");
  const id = String(fd.get("id") ?? "");
  if (!sourcingUuid(id)) redirect("/crm/sourcing?error=invalid");
  const store = sourcingStore();
  const request = await store.getSourcingRequest(id);
  if (!request) redirect("/crm/sourcing?error=invalid");
  let rfqId: string;
  try {
    const result = await startSourcingMatch({ store: getStore(), request, actor: { id: session.uid, email: session.email } });
    rfqId = result.rfq.id;
    // Ghi trạng thái và dấu vết ở yêu cầu tìm nguồn; xung đột phiên bản không làm mất RFQ đã tạo
    // (liên kết nằm ở RFQ nên trang vẫn nối đúng).
    if (result.created) {
      const note = [request.internal_note, `Đã tạo ${result.rfq.code} để ghép nhà cung cấp.`].filter(Boolean).join("\n");
      await store.updateSourcingRequest(id, request.version, {
        status: "in_progress", assigned_to: request.assigned_to ?? session.uid,
        internal_note: note.slice(0, 3000), buyer_reply: request.buyer_reply,
      }).catch((err) => console.error("[sourcing] linked RFQ created but request update failed", err));
    }
  } catch (error) {
    if (error instanceof Error && error.message === "closed") redirect("/crm/sourcing?status=closed&error=closed");
    throw error;
  }
  revalidatePath("/crm", "layout"); revalidatePath("/crm/sourcing"); revalidatePath("/buyer/account");
  redirect(`/crm/rfqs/${rfqId}`);
}
