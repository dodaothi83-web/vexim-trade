"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { isSyntheticProductFormStaging } from "@/lib/products/product-form-staging-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: boolean; message: string };

/** Reject a submitted form without changing an existing approved listing. */
export async function requestProductFormChangesAction(form: FormData): Promise<Result> {
  if (!isSyntheticProductFormStaging()) return { ok: false, message: "Chức năng xét duyệt form mới chưa sẵn sàng." };
  const productId = String(form.get("product_id") ?? "");
  const submissionId = String(form.get("submission_id") ?? "");
  const updatedAt = String(form.get("product_updated_at") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!UUID.test(productId) || !UUID.test(submissionId) || !Number.isFinite(Date.parse(updatedAt)) || !note || note.length > 1000)
    return { ok: false, message: "Yêu cầu không hợp lệ. Hãy nhập lý do cần chỉnh sửa." };
  try {
    const session = await getSession();
    if (!session || !["admin", "reviewer"].includes(session.role)) return { ok: false, message: "Chỉ quản trị hoặc trưởng kiểm duyệt được xét duyệt." };
    const db = getSupabaseClient();
    if (!db) return { ok: false, message: "Không kết nối được cơ sở dữ liệu." };
    // Reconfirm against the same database used for the service-role RPC.
    const actor = await supabaseStore.getUser(session.uid);
    if (!actor?.is_active || actor.role !== session.role || !UUID.test(actor.id) ||
        actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase())
      return { ok: false, message: "Không xác nhận được quyền xét duyệt." };
    const { data, error } = await db.rpc("request_product_form_changes", {
      p_product_id: productId, p_submission_id: submissionId, p_actor_id: actor.id,
      p_expected_product_updated_at: updatedAt, p_note: note,
    });
    if (error) throw new Error(error.message);
    if (data?.status !== "changes_requested") return { ok: false, message: data?.status === "product_changed"
      ? "Sản phẩm đã thay đổi sau khi gửi. Hãy tải lại và kiểm tra trước khi xử lý."
      : "Bản gửi hoặc trạng thái sản phẩm đã thay đổi. Hãy tải lại trang." };
    if (!data.already_decided) await supabaseStore.addAuditLog({ actor_id: actor.id, actor_email: actor.email,
      entity: "product", entity_id: productId, action: "product_form.changes_requested",
      before: { submission_id: submissionId, status: "pending" },
      after: { submission_id: submissionId, status: "changes_requested", note },
    }).catch((error) => console.error("[product-form] review audit", error));
    revalidatePath(`/crm/products/${productId}/edit`);
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/crm/products");
    revalidatePath("/supplier/portal/products");
    return { ok: true, message: "Đã yêu cầu chỉnh sửa. Nội dung đã công khai không thay đổi." };
  } catch (error) {
    console.error("[product-form] request changes", error);
    return { ok: false, message: "Không xác nhận được quyết định. Hãy tải lại trang và kiểm tra." };
  }
}
