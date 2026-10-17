"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

type Result = { ok: boolean; message: string };

export async function decideSupplierProductAction(form: FormData): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "sourcing")) return { ok: false, message: "Chỉ Vexim quản trị/thu mua được xét sản phẩm NCC." };
  const id = String(form.get("product_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved", "changes_requested"].includes(decision)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  if (decision === "changes_requested" && !note) return { ok: false, message: "Cần ghi nội dung yêu cầu bổ sung." };
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product || product.supplier_review_status !== "pending") return { ok: false, message: "Sản phẩm không còn chờ Vexim kiểm tra." };
    if (decision === "approved") {
      const media = await store.listMedia("product", id);
      if (!product.name || !(product.spec || product.description) ||
          !media.some((m) => (m.kind === "image" || m.kind === "catalogue") && m.storage_path && m.supplier_id === product.supplier_id)) {
        return { ok: false, message: "Cần mô tả/quy cách và ảnh hoặc catalogue đúng sản phẩm trước khi xác nhận." };
      }
    }
    await store.updateProduct(id, {
      supplier_review_status: decision as "approved" | "changes_requested",
      supplier_review_note: decision === "approved" ? null : note, ready_for_buyer: false,
    });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "product", entity_id: id, action: decision === "approved" ? "supplier.product_approved" : "supplier.product_changes_requested",
      before: { review: product.supplier_review_status }, after: { review: decision, note: decision === "approved" ? null : note, ready: false } })
      .catch((error) => console.error("[supplier-product-review] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    return { ok: true, message: decision === "approved" ? "Đã xác nhận nội dung. Cần Vexim chọn tệp chia sẻ buyer và bật Sẵn sàng gửi buyer để công khai." : "Đã yêu cầu NCC chỉnh sửa." };
  } catch (error) { console.error("[supplier-product-review]", error); return { ok: false, message: "Không lưu được quyết định." }; }
}
