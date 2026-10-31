"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import type { SupplierProduct } from "@/lib/types";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { productTranslationPatch } from "@/lib/ai/translate-content";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { nameContainsGrade } from "@/lib/products/quantity-pricing";
import { productPublicationMediaState } from "@/lib/media/readiness";
import { isTestOnlyProduct } from "@/lib/public/product-selection";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";

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
    moq: string;
    monthly_capacity: string;
    payment_terms: string;
    raw_material_region: string;
    input_material_origin: string;
    incoterm_place: string;
    export_port: string;
  };
};

export async function decideSupplierProductAction(form: FormData): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "reviewer")) return { ok: false, message: "Chỉ quản trị hoặc trưởng kiểm duyệt được xét sản phẩm của nhà cung cấp." };
  const id = String(form.get("product_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved", "changes_requested"].includes(decision)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  if (decision === "changes_requested" && !note) return { ok: false, message: "Cần ghi nội dung yêu cầu bổ sung." };
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
    if (decision === "approved") {
      const submittedCategory = String(form.get("reviewed_category_slug") ?? "").trim();
      reviewedCategory = retryApprovedPublication
        ? submittedCategory || product.reviewed_category_slug || product.supplier_category_proposal || ""
        : submittedCategory;
      const supplier = await store.getSupplier(product.supplier_id);
      if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
      if (supplier.status !== "published")
        return { ok: false, message: "Hồ sơ nhà cung cấp chưa được công khai. Cần công khai hồ sơ trước khi đăng sản phẩm." };
      if (isTestOnlyProduct(product.name) ||
          (isSyntheticSupplier(supplier) && !(supplier.is_demo && process.env.VEXIM_SHOW_DEMO === "true")))
        return { ok: false, message: "Không thể đăng sản phẩm hoặc hồ sơ dùng cho thử nghiệm." };
      const categories = await store.listCategories({ publishedOnly: false });
      const options = categoryProposalOptions(categories);
      // Scope and keyword matches are review hints, not extra publication gates.
      // The category selected by staff is the final decision.
      if (!options.some((c) => c.slug === reviewedCategory))
        return { ok: false, message: "Chọn danh mục đang xuất bản trước khi duyệt và đăng." };
      if (!product.name || !(product.spec || product.description)) {
        return { ok: false, message: "Cần tên và mô tả hoặc quy cách trước khi duyệt và đăng." };
      }
      const media = await store.listMedia("product", id);
      const mediaReview = productPublicationMediaState(media, id, product.supplier_id);
      // Một cổng duy nhất: phải có ảnh người mua thấy được. Không còn bước duyệt riêng cho từng ảnh.
      if (!mediaReview.buyerImages) {
        return { ok: false, message: "Mở mục Ảnh & tài liệu sản phẩm. Thêm ít nhất một ảnh chia sẻ cho người mua trước khi đăng." };
      }
    }
    const previous = { review: product.supplier_review_status ?? null, category: product.reviewed_category_slug, ready: product.ready_for_buyer };
    const cleanedSpecs = product.specs && typeof product.specs === "object" && "price_review_summary" in product.specs
      ? (() => {
          const rest = { ...product.specs };
          delete rest.price_review_summary;
          return rest;
        })()
      : undefined;
    const db = getSupabaseClient();
    let updated: SupplierProduct | null;
    if (db) {
      // The service-role RPC must never be authorized through a local fallback.
      const actor = await supabaseStore.getUser(session.uid);
      const strictProduct = await supabaseStore.getProduct(id);
      if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase() ||
          !strictProduct || strictProduct.supplier_id !== product.supplier_id || strictProduct.updated_at !== product.updated_at)
        return { ok: false, message: "Không xác nhận được quyền hoặc phiên bản sản phẩm." };
      const { data, error } = await db.rpc("decide_supplier_product_with_quantity_guard", {
        p_product_id: id, p_supplier_id: product.supplier_id, p_expected_updated_at: product.updated_at,
        p_expected_review: previous.review, p_expected_ready: previous.ready, p_decision: decision,
        p_category: reviewedCategory, p_note: note || null, p_actor_id: actor.id,
      });
      if (error || !data) return { ok: false, message: "Chưa kiểm tra được bảng giá trước khi đăng. Thử lại sau ít phút." };
      // Bảng giá đầu tiên được duyệt cùng sản phẩm; chỉ bảng giá cập nhật mới có bước duyệt riêng.
      if (data.status === "price_not_approved") return { ok: false, message: "Sản phẩm chưa có bảng giá nào để duyệt cùng. Yêu cầu nhà cung cấp gửi bảng giá trước khi đăng." };
      if (data.status === "price_changed") return { ok: false, message: "Thông tin sản phẩm đã đổi sau khi duyệt giá. Cần yêu cầu nhà cung cấp gửi lại bảng giá." };
      if (data.status === "category_changed") return { ok: false, message: "Danh mục khác với bảng giá đã gửi. Hãy yêu cầu nhà cung cấp cập nhật danh mục và bảng giá." };
      updated = data.status === "saved" && data.product ? data.product as SupplierProduct : null;
    } else {
      updated = await store.updateSupplierProductIfState(id, product.supplier_id,
        { review: previous.review, ready: previous.ready }, {
          supplier_review_status: decision as "approved" | "changes_requested",
          supplier_review_note: decision === "approved" ? null : note, ready_for_buyer: decision === "approved",
          reviewed_category_slug: decision === "approved" ? reviewedCategory : (product.reviewed_category_slug ?? null),
          ...(reviewedCategory ? { category: reviewedCategory } : {}),
          ...(decision === "approved" && cleanedSpecs ? { specs: cleanedSpecs } : {}),
        });
    }
    if (!updated) return { ok: false, message: "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang trước khi xét duyệt." };
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "product", entity_id: id, action: retryApprovedPublication ? "supplier.product_published" : decision === "approved" ? "supplier.product_approved" : "supplier.product_changes_requested",
      before: previous,
      after: { review: decision, category: reviewedCategory, note: decision === "approved" ? null : note, ready: decision === "approved" } })
      .catch((error) => console.error("[supplier-product-review] audit", error));
    const mail = await notifySupplierDecision({ supplierId: product.supplier_id, entityId: id, name: product.name,
      decision: decision === "approved" ? "product_approved" : "product_changes_requested", note });
    if (mail !== "sent") console.warn("[supplier-product-review] supplier email not sent; decision saved", mail);
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/supplier/portal/products");
    revalidatePath("/products", "layout");
    revalidatePath("/suppliers", "layout");
    revalidatePath("/");
    refreshCrmBadges();
    return { ok: true, message: (decision === "approved" ? "Đã duyệt và đăng sản phẩm." : "Đã yêu cầu nhà cung cấp chỉnh sửa.") + (mail === "sent" ? "" : " Chưa gửi được email cho nhà cung cấp. Sản phẩm vẫn được lưu theo trạng thái mới.") };
  } catch (error) { console.error("[supplier-product-review]", error); return { ok: false, message: "Không lưu được quyết định." }; }
}

/** AI dịch (lại) nội dung sản phẩm sang tiếng Anh; dùng khi nhà cung cấp nộp mà chưa dịch được hoặc vừa sửa nội dung gốc. */
export async function translateProductEnglishAction(productId: string): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session) return { ok: false, message: "Vui lòng đăng nhập." };
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  try {
    const store = getStore();
    const product = await store.getProduct(productId);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = slug ? await store.getCategoryBySlug(slug) : null;
    const result = await ensureProductEnglishTranslation(store, productId, { id: session.uid, email: session.email }, undefined,
      { forbiddenGrades: category ? standardGradesForCategory(category) : [] });
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
        moq: saved.translation_meta?.fields?.moq ?? "",
        monthly_capacity: saved.translation_meta?.fields?.monthly_capacity ?? "",
        payment_terms: saved.translation_meta?.fields?.payment_terms ?? "",
        raw_material_region: saved.translation_meta?.fields?.raw_material_region ?? "",
        input_material_origin: saved.translation_meta?.fields?.input_material_origin ?? "",
        incoterm_place: saved.translation_meta?.fields?.incoterm_place ?? "",
        export_port: saved.translation_meta?.fields?.export_port ?? "",
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
  let descriptionDetail: string;
  try {
    descriptionDetail = sanitizeProductDescriptionForSave(String(form.get("description_detail_en") ?? ""), { maxTextLength: 12000 });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Mô tả chi tiết không hợp lệ." };
  }
  const translation = {
    name: read("name_en", 180),
    description: read("description_en", 3000),
    spec: read("spec_en", 1600),
    description_detail: descriptionDetail,
    packaging: read("packaging_en", 600),
    certifications: read("certifications_en", 600),
    moq: read("moq_en", 360),
    monthly_capacity: read("monthly_capacity_en", 360),
    payment_terms: read("payment_terms_en", 400),
    raw_material_region: read("raw_material_region_en", 360),
    input_material_origin: read("input_material_origin_en", 600),
    incoterm_place: read("incoterm_place_en", 360),
    export_port: read("export_port_en", 360),
  };
  if (!translation.name) return { ok: false, message: "Cần ít nhất tên sản phẩm bằng tiếng Anh." };
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = slug ? await store.getCategoryBySlug(slug) : null;
    if (category && nameContainsGrade(translation.name, standardGradesForCategory(category)))
      return { ok: false, message: "Không ghi grade trong tên sản phẩm tiếng Anh." };
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
  if (!session || (session.role !== "admin" && session.role !== "reviewer")) return { ok: false, message: "Chỉ Vexim được điều chỉnh danh mục đã duyệt." };
  const id = String(form.get("product_id") ?? "");
  const slug = String(form.get("reviewed_category_slug") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  try {
    const store = getStore();
    const product = await store.getProduct(id);
    if (!product || product.supplier_review_status !== "approved") return { ok: false, message: "Chỉ được sửa danh mục sản phẩm đã duyệt." };
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
