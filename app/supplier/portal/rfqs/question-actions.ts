"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { markSupplierQuestionAnswered } from "@/lib/supplier-portal/questions";

/** Nhà cung cấp đánh dấu đã trả lời câu hỏi của người mua qua email. */
export async function markQuestionAnsweredAction(fd: FormData): Promise<void> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) redirect("/supplier/portal");
  const { rfqId } = await markSupplierQuestionAnswered({
    store: access.store,
    supplierId: access.supplier.id,
    actorEmail: access.user.email,
    matchId: String(fd.get("match_id") ?? ""),
  });
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
