"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { assignProductCategory } from "@/lib/public/category-assignment";

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
    let reviewedCategory: string | null = null;
    if (decision === "approved") {
      reviewedCategory = String(form.get("reviewed_category_slug") ?? "");
      const supplier = await store.getSupplier(product.supplier_id);
      if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
      const categories = await store.listCategories({ publishedOnly: false });
      const options = categoryProposalOptions(categories);
      const linked = supplier.requested_category_slugs?.length ? [] : await store.listSupplierCategories(supplier.id);
      if (!allowedSupplierCategories(supplier, options, linked).some((c) => c.slug === reviewedCategory) ||
          reviewedCategory !== product.supplier_category_proposal) {
        return { ok: false, message: "Danh mục sản phẩm phải đúng danh mục NCC đã chọn. Nếu mặt hàng khai sai, yêu cầu NCC chỉnh sửa trước khi duyệt." };
      }
      const inferred = assignProductCategory({ name: product.name, spec: product.spec, description: product.description, category: null }, categories);
      if (inferred && inferred.slug !== reviewedCategory)
        return { ok: false, message: `Tên/quy cách có vẻ thuộc ${inferred.name_i18n.vi || inferred.name_i18n.en || inferred.slug}, không phải danh mục NCC đã chọn. Hãy yêu cầu NCC chỉnh sửa trước khi duyệt.` };
      const media = await store.listMedia("product", id);
      if (!product.name || !(product.spec || product.description) ||
          !media.some((m) => (m.kind === "image" || m.kind === "catalogue") && m.storage_path && m.supplier_id === product.supplier_id)) {
        return { ok: false, message: "Cần mô tả/quy cách và ảnh hoặc catalogue đúng sản phẩm trước khi xác nhận." };
      }
    }
    await store.updateProduct(id, {
      supplier_review_status: decision as "approved" | "changes_requested",
      supplier_review_note: decision === "approved" ? null : note, ready_for_buyer: false,
      reviewed_category_slug: reviewedCategory, ...(reviewedCategory ? { category: reviewedCategory } : {}),
    });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "product", entity_id: id, action: decision === "approved" ? "supplier.product_approved" : "supplier.product_changes_requested",
      before: { review: product.supplier_review_status, category: product.reviewed_category_slug },
      after: { review: decision, category: reviewedCategory, note: decision === "approved" ? null : note, ready: false } })
      .catch((error) => console.error("[supplier-product-review] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    return { ok: true, message: decision === "approved" ? "Đã xác nhận nội dung. Cần Vexim chọn tệp chia sẻ buyer và bật Sẵn sàng gửi buyer để công khai." : "Đã yêu cầu NCC chỉnh sửa." };
  } catch (error) { console.error("[supplier-product-review]", error); return { ok: false, message: "Không lưu được quyết định." }; }
}

/** Staff may correct a reviewed product's category; buyer readiness must be rechecked separately. */
export async function correctSupplierProductCategoryAction(form: FormData): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "sourcing")) return { ok: false, message: "Chỉ Vexim được điều chỉnh danh mục đã duyệt." };
  const id = String(form.get("product_id") ?? "");
  const slug = String(form.get("reviewed_category_slug") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product || product.supplier_review_status !== "approved") return { ok: false, message: "Chỉ được sửa danh mục sản phẩm NCC đã duyệt." };
    const supplier = await store.getSupplier(product.supplier_id);
    if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
    const categories = await store.listCategories({ publishedOnly: false });
    const options = categoryProposalOptions(categories);
    const linked = supplier.requested_category_slugs?.length ? [] : await store.listSupplierCategories(supplier.id);
    if (!allowedSupplierCategories(supplier, options, linked).some((c) => c.slug === slug) ||
        (product.supplier_category_proposal && slug !== product.supplier_category_proposal))
      return { ok: false, message: "Danh mục phải thuộc phạm vi NCC và khớp mặt hàng NCC đã chọn; hãy yêu cầu NCC cập nhật trước." };
    const inferred = assignProductCategory({ name: product.name, spec: product.spec, description: product.description, category: null }, categories);
    if (inferred && inferred.slug !== slug) return { ok: false, message: "Tên/quy cách không khớp danh mục này; hãy yêu cầu NCC chỉnh sửa trước." };
    if (product.reviewed_category_slug === slug) return { ok: true, message: "Danh mục không thay đổi." };
    await store.updateProduct(id, { reviewed_category_slug: slug, category: slug, ready_for_buyer: false });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: id,
      action: "supplier.product_category_corrected", before: { category: product.reviewed_category_slug, ready: product.ready_for_buyer },
      after: { category: slug, ready: false } }).catch((error) => console.error("[supplier-product-review] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    return { ok: true, message: "Đã chốt danh mục mới; tạm tắt sẵn sàng gửi buyer để Vexim kiểm tra lại." };
  } catch (error) { console.error("[supplier-product-review] category", error); return { ok: false, message: "Không lưu được danh mục." }; }
}
