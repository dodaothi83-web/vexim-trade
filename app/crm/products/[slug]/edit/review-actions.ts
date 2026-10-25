"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { productTranslationPatch } from "@/lib/ai/translate-content";
import { isExpired } from "@/lib/media/readiness";
import { isTestOnlyProduct } from "@/lib/public/product-selection";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import type { MediaAsset } from "@/lib/types";

type Result = {
  ok: boolean;
  message: string;
  english?: {
    name: string;
    description: string;
    spec: string;
    description_detail: string;
    packaging: string;
    certifications: string;
  };
};

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
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    // Products approved before approval became the marketplace transition need
    // a safe retry. Do not require staff to reset review or find a second flag.
    const retryApprovedPublication = decision === "approved" && product.supplier_review_status === "approved" &&
      !product.ready_for_buyer && !!(product.supplier_originated || product.supplier_category_proposal);
    if (product.supplier_review_status !== "pending" && !retryApprovedPublication)
      return { ok: false, message: "Sản phẩm không còn chờ duyệt hoặc đã được đăng." };
    let reviewedCategory: string | null = null;
    let mediaToPublish: MediaAsset[] = [];
    if (decision === "approved") {
      const submittedCategory = String(form.get("reviewed_category_slug") ?? "").trim();
      reviewedCategory = retryApprovedPublication
        ? submittedCategory || product.reviewed_category_slug || product.supplier_category_proposal || ""
        : submittedCategory;
      const supplier = await store.getSupplier(product.supplier_id);
      if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
      if (supplier.status !== "published")
        return { ok: false, message: "Hồ sơ NCC chưa được công khai. Cần công khai hồ sơ NCC trước khi đăng sản phẩm." };
      if (isTestOnlyProduct(product.name) ||
          (isSyntheticSupplier(supplier) && !(supplier.is_demo && process.env.VEXIM_SHOW_DEMO === "true")))
        return { ok: false, message: "Không thể đăng sản phẩm hoặc hồ sơ dùng cho thử nghiệm." };
      const categories = await store.listCategories({ publishedOnly: false });
      const options = categoryProposalOptions(categories);
      // Scope and keyword matches are review hints, not extra publication gates.
      // The category selected by staff is the final decision.
      if (!options.some((c) => c.slug === reviewedCategory))
        return { ok: false, message: "Chọn danh mục đang xuất bản trước khi duyệt và đăng." };
      const media = await store.listMedia("product", id);
      // A missing portal account must not block publication. Without an account,
      // only files already shared with buyers can be verified as supplier-owned.
      const supplierAccount = await store.getUserBySupplierId(product.supplier_id);
      // Only the supplier's own submitted files are promoted by this decision.
      // Staff-internal documents attached to the same product stay private.
      const publishable = media.filter((asset) => asset.owner_type === "product" && asset.product_id === id &&
        (asset.kind === "image" || asset.kind === "catalogue") && !!asset.storage_path &&
        asset.supplier_id === product.supplier_id && !isExpired(asset) &&
        (asset.audience === "buyer" || (asset.audience === "internal" && !!supplierAccount && asset.created_by === supplierAccount.id)));
      if (!product.name || !(product.spec || product.description) || !publishable.length) {
        return { ok: false, message: "Cần tên, mô tả hoặc quy cách và ít nhất một ảnh hoặc catalogue hợp lệ do NCC tải lên." };
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
      entity: "product", entity_id: id, action: retryApprovedPublication ? "supplier.product_published" : decision === "approved" ? "supplier.product_approved" : "supplier.product_changes_requested",
      before: { review: product.supplier_review_status, category: product.reviewed_category_slug, ready: product.ready_for_buyer },
      after: { review: decision, category: reviewedCategory, note: decision === "approved" ? null : note, ready: decision === "approved" } })
      .catch((error) => console.error("[supplier-product-review] audit", error));
    const mail = await notifySupplierDecision({ supplierId: product.supplier_id, entityId: id, name: product.name,
      decision: decision === "approved" ? "product_approved" : "product_changes_requested", note });
    if (mail !== "sent") console.warn("[supplier-product-review] supplier email not sent; decision saved", mail);
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    refreshCrmBadges();
    return { ok: true, message: (decision === "approved" ? "Đã duyệt và đăng sản phẩm." : "Đã yêu cầu NCC chỉnh sửa.") + (mail === "sent" ? "" : " Chưa gửi được email cho NCC. Sản phẩm vẫn được lưu theo trạng thái mới.") };
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
    const saved = await store.getProduct(productId);
    if (!saved) return { ok: false, message: "Không tìm thấy sản phẩm sau khi dịch." };
    revalidatePath(`/crm/products/${productId}/edit`);
    return {
      ok: true,
      message: result.status === "current" ? "Bản dịch tiếng Anh đã khớp nội dung gốc hiện tại." : "Đã dịch nội dung sang tiếng Anh bằng AI. Hãy đọc lại trước khi công khai.",
      english: {
        name: saved.name_i18n?.en ?? "",
        description: saved.description_i18n?.en ?? "",
        spec: saved.spec_i18n?.en ?? "",
        description_detail: saved.description_detail_i18n?.en ?? "",
        packaging: saved.packaging_i18n?.en ?? "",
        certifications: saved.certifications_i18n?.en ?? "",
      },
    };
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
    if (!options.some((c) => c.slug === slug))
      return { ok: false, message: "Chọn danh mục đang xuất bản." };
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
