"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { assignProductCategory } from "@/lib/public/category-assignment";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { productTranslationPatch } from "@/lib/ai/translate-content";
import { isExpired } from "@/lib/media/readiness";
import { isTestOnlyProduct } from "@/lib/public/product-selection";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import type { MediaAsset } from "@/lib/types";

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
  const promoted: MediaAsset[] = [];
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product || product.supplier_review_status !== "pending") return { ok: false, message: "Sản phẩm không còn chờ Vexim kiểm tra." };
    let reviewedCategory: string | null = null;
    let mediaToPublish: MediaAsset[] = [];
    if (decision === "approved") {
      reviewedCategory = String(form.get("reviewed_category_slug") ?? "");
      const supplier = await store.getSupplier(product.supplier_id);
      if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
      if (supplier.status !== "published")
        return { ok: false, message: "Hồ sơ NCC chưa được công khai. Vexim cần xuất bản hồ sơ NCC trước khi xác nhận đẩy sản phẩm lên sàn." };
      if (isTestOnlyProduct(product.name) ||
          (isSyntheticSupplier(supplier) && !(supplier.is_demo && process.env.VEXIM_SHOW_DEMO === "true")))
        return { ok: false, message: "Sản phẩm hoặc hồ sơ đang là dữ liệu thử nghiệm nên không thể đẩy lên sàn." };
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
      const supplierAccount = await store.getUserBySupplierId(product.supplier_id);
      if (!supplierAccount) return { ok: false, message: "NCC chưa có tài khoản cổng để nhận thông báo và quản lý sản phẩm." };
      // Only the supplier's own submitted files are promoted by this decision.
      // Staff-internal documents attached to the same product stay private.
      const publishable = media.filter((asset) => asset.owner_type === "product" && asset.product_id === id &&
        (asset.kind === "image" || asset.kind === "catalogue") && !!asset.storage_path &&
        asset.supplier_id === product.supplier_id && !isExpired(asset) &&
        (asset.audience === "buyer" || (asset.audience === "internal" && asset.created_by === supplierAccount.id)));
      if (!product.name || !(product.spec || product.description) || !publishable.length) {
        return { ok: false, message: "Cần mô tả/quy cách và ít nhất một ảnh hoặc catalogue hợp lệ do NCC tải lên trước khi đẩy sản phẩm lên sàn." };
      }
      mediaToPublish = publishable.filter((asset) => asset.audience === "internal");
    }
    try {
      // Publish the reviewed files before flipping the product switch. If the
      // product write fails, restore any files already promoted in this request.
      for (const asset of mediaToPublish) {
        // Snapshot before writing: local stores may return mutable rows.
        promoted.push({ ...asset });
        await store.updateMedia(asset.id, { audience: "buyer", status: "checked" });
      }
      await store.updateProduct(id, {
        supplier_review_status: decision as "approved" | "changes_requested",
        supplier_review_note: decision === "approved" ? null : note, ready_for_buyer: decision === "approved",
        reviewed_category_slug: reviewedCategory, ...(reviewedCategory ? { category: reviewedCategory } : {}),
      });
    } catch (error) {
      await Promise.all(promoted.map((asset) => store.updateMedia(asset.id, {
        audience: asset.audience, status: asset.status,
      }).catch((rollbackError) => console.error("[supplier-product-review] media rollback", rollbackError))));
      throw error;
    }
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "product", entity_id: id, action: decision === "approved" ? "supplier.product_approved" : "supplier.product_changes_requested",
      before: { review: product.supplier_review_status, category: product.reviewed_category_slug },
      after: { review: decision, category: reviewedCategory, note: decision === "approved" ? null : note, ready: decision === "approved" } })
      .catch((error) => console.error("[supplier-product-review] audit", error));
    const mail = await notifySupplierDecision({ supplierId: product.supplier_id, entityId: id, name: product.name,
      decision: decision === "approved" ? "product_approved" : "product_changes_requested", note });
    if (mail !== "sent") console.warn("[supplier-product-review] supplier email not sent; decision saved", mail);
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    refreshCrmBadges();
    return { ok: true, message: (decision === "approved" ? "Đã xác nhận và đẩy sản phẩm lên sàn; sản phẩm hiện hiển thị với buyer." : "Đã yêu cầu NCC chỉnh sửa.") + (mail === "sent" ? "" : " Email NCC chưa gửi được; quyết định đã lưu và thông báo trên cổng vẫn có hiệu lực.") };
  } catch (error) { console.error("[supplier-product-review]", error); return { ok: false, message: "Không lưu được quyết định." }; }
}

/** AI dịch (lại) nội dung sản phẩm sang tiếng Anh; dùng khi NCC nộp mà chưa dịch được hoặc vừa sửa nội dung gốc. */
export async function translateProductEnglishAction(productId: string): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session) return { ok: false, message: "Vui lòng đăng nhập." };
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  try {
    const store = getStore();
    const result = await ensureProductEnglishTranslation(store, productId, { id: session.uid, email: session.email });
    if (result.status === "unconfigured") return { ok: false, message: "Chức năng AI chưa được cấu hình trên máy chủ. Bạn vẫn có thể tự nhập bản dịch tiếng Anh rồi lưu." };
    if (result.status === "failed") return { ok: false, message: result.message };
    revalidatePath(`/crm/products/${productId}/edit`);
    return { ok: true, message: result.status === "current" ? "Bản dịch tiếng Anh đã khớp nội dung gốc hiện tại." : "Đã dịch nội dung sang tiếng Anh bằng AI. Hãy đọc lại trước khi công khai." };
  } catch (error) {
    console.error("[product-translation-action]", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không dịch được nội dung." };
  }
}

/** Nhân viên chốt tay bản dịch tiếng Anh; ghi nguồn "staff" để phân biệt với bản AI trong dấu vết bản dịch. */
export async function saveProductEnglishAction(form: FormData): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session) return { ok: false, message: "Vui lòng đăng nhập." };
  const id = String(form.get("product_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  const read = (key: string, limit: number) => String(form.get(key) ?? "").trim().slice(0, limit);
  const translation = {
    name: read("name_en", 180),
    description: read("description_en", 3000),
    spec: read("spec_en", 1600),
    description_detail: read("description_detail_en", 12000),
    packaging: read("packaging_en", 600),
    certifications: read("certifications_en", 600),
  };
  if (!translation.name) return { ok: false, message: "Cần ít nhất tên sản phẩm bằng tiếng Anh." };
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    const saved = await store.updateProduct(id, productTranslationPatch(translation, product, "staff"));
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: id,
      action: "product.translation_staff_saved",
      before: { translated_at: product.translation_meta?.translated_at ?? null, origin: product.translation_meta?.origin ?? null },
      after: { translated_at: saved.translation_meta?.translated_at ?? null, origin: "staff" } })
      .catch((error) => console.error("[product-translation] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, message: "Đã lưu bản dịch tiếng Anh." };
  } catch (error) {
    console.error("[product-translation-save]", error);
    return { ok: false, message: "Không lưu được bản dịch." };
  }
}

/** Staff may correct a reviewed product's category without changing its current publication decision. */
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
    await store.updateProduct(id, { reviewed_category_slug: slug, category: slug, ready_for_buyer: product.ready_for_buyer });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: id,
      action: "supplier.product_category_corrected", before: { category: product.reviewed_category_slug, ready: product.ready_for_buyer },
      after: { category: slug, ready: product.ready_for_buyer } }).catch((error) => console.error("[supplier-product-review] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    return { ok: true, message: "Đã chốt danh mục mới cho sản phẩm." };
  } catch (error) { console.error("[supplier-product-review] category", error); return { ok: false, message: "Không lưu được danh mục." }; }
}
