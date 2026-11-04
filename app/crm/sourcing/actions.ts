"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingStatuses } from "@/lib/sourcing/status";
import { sourcingUuid } from "@/lib/sourcing/files";
import type { SourcingStatus } from "@/lib/types";
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
