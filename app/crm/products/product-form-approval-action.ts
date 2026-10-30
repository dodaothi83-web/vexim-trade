"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { approveProductFormAtomically } from "@/lib/products/product-form-atomic-approval";
import { isProductFormBuyerEnabled } from "@/lib/products/product-form-staging-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Result = { ok: boolean; message: string; requiresReload?: boolean };

/** Block approvals whenever the matching buyer projection is unavailable. */
export async function approveProductFormAction(form: FormData): Promise<Result> {
  const productId = String(form.get("product_id") ?? "").toLowerCase();
  const submissionId = String(form.get("submission_id") ?? "").toLowerCase();
  const englishName = String(form.get("english_name") ?? "");
  if (!isProductFormBuyerEnabled())
    return { ok: false, message: "Chức năng duyệt form mới chưa sẵn sàng." };
  if (!UUID.test(productId) || !UUID.test(submissionId) || !englishName.trim() || englishName.length > 180)
    return { ok: false, message: "Bản gửi hoặc tên tiếng Anh không hợp lệ." };
  try {
    const session = await getSession(), db = getSupabaseClient();
    if (!db || !session || !["admin", "reviewer"].includes(session.role))
      return { ok: false, message: "Không có quyền xét duyệt." };
    const actor = await supabaseStore.getUser(session.uid);
    if (!actor?.is_active || actor.role !== session.role || !UUID.test(actor.id) ||
        actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase())
      return { ok: false, message: "Không xác nhận được quyền xét duyệt." };
    const result = await approveProductFormAtomically({ db, productId, submissionId, actorId: actor.id, englishName });
    if (!result.ok) return result;
    revalidatePath("/products", "layout");
    revalidatePath("/crm/products");
    revalidatePath(`/crm/products/${productId}/edit`);
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/supplier/portal/products");
    return result;
  } catch (error) {
    console.error("[product-form] approve", error);
    return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả duyệt. Hãy tải lại trang để kiểm tra." };
  }
}
