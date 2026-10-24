"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import { categoryProposalOptions, parseProductCategoryProposal } from "@/lib/supplier-portal/category-proposals";
import {
  attributesFromForm, mergeSupplierAttributePool, sanitizeSupplierAttributePool, saveProductAttributes,
  supplierAttributePoolSignature,
} from "@/lib/product-attributes";
import { notifyStaffProductSubmission } from "@/lib/supplier-portal/notify";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import type { SupplierProduct, SupplierProductInput } from "@/lib/types";

type Result = { ok: boolean; message: string; id?: string };
const text = (form: FormData, key: string, limit: number) => String(form.get(key) ?? "").trim().slice(0, limit);

/**
 * Thông số NCC tự thêm, gửi kèm form dưới dạng JSON. Server kiểm tra lại toàn bộ
 * (`sanitizeSupplierAttributePool`) chứ không tin nội dung client gửi lên.
 */
function attributePoolFromForm(form: FormData): unknown[] {
  const raw = String(form.get("attribute_pool") ?? "").slice(0, 8000);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function parseProduct(form: FormData, supplierId: string): SupplierProductInput {
  const name = text(form, "name", 180);
  if (name.length < 3) throw new Error("Tên sản phẩm cần ít nhất 3 ký tự.");
  const daysRaw = text(form, "lead_time_days", 5);
  if (daysRaw && (!/^\d+$/.test(daysRaw) || Number(daysRaw) > 3650)) throw new Error("Thời gian giao hàng không hợp lệ.");
  const priceRaw = text(form, "ref_price", 20);
  const priceMaxRaw = text(form, "ref_price_max", 20);
  if (priceRaw && (!/^\d+(?:\.\d{1,2})?$/.test(priceRaw) || Number(priceRaw) > 999999999999.99)) throw new Error("Giá tham khảo từ không hợp lệ.");
  if (priceMaxRaw && (!/^\d+(?:\.\d{1,2})?$/.test(priceMaxRaw) || Number(priceMaxRaw) > 999999999999.99 ||
      !priceRaw || Number(priceRaw) <= 0 || Number(priceMaxRaw) < Number(priceRaw))) {
    throw new Error("Giá đến phải lớn hơn hoặc bằng giá từ (> 0); bỏ trống nếu chỉ có một mức giá.");
  }
  const validUntil = text(form, "price_valid_until", 10);
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new Error("Ngày hết hạn giá không hợp lệ.");
  return {
    supplier_id: supplierId, name, slug: null, name_i18n: {}, category: null,
    description: text(form, "description", 1500) || null, description_detail: text(form, "description_detail", 6000) || null, spec: text(form, "spec", 800) || null,
    specs: {}, unit: text(form, "unit", 40) || null, moq: text(form, "moq", 180) || null,
    moq_qty: null, moq_unit: null, monthly_capacity: text(form, "monthly_capacity", 180) || null,
    lead_time_days: daysRaw ? Number(daysRaw) : null, packaging: text(form, "packaging", 300) || null,
    oem: form.get("oem") === "yes", odm: form.get("odm") === "yes", samples: form.get("samples") === "yes",
    // Không còn ô chứng nhận tự khai ở trang sản phẩm: hồ sơ Giấy tờ L1 (AI quét đơn vị đứng tên
    // và ngày hết hạn) là nguồn duy nhất. Giữ giá trị cũ nếu đã được ghi trước đây.
    certifications: null, export_port: text(form, "export_port", 120) || null,
    ref_price: priceRaw ? Number(priceRaw) : null, ref_price_max: priceMaxRaw ? Number(priceMaxRaw) : null,
    price_publicly_visible: form.get("price_publicly_visible") === "yes", currency: priceRaw ? (text(form, "currency", 10) || "USD") : null,
    price_valid_until: validUntil || null, incoterm: text(form, "incoterm", 20) || null,
    incoterm_place: text(form, "incoterm_place", 100) || null,
    payment_terms: text(form, "payment_terms", 200) || null,
    ready_for_buyer: false, supplier_review_status: "draft", supplier_review_note: null,
    supplier_originated: true, supplier_category_proposal: null, reviewed_category_slug: null, images: [],
  };
}

async function approvedAccess() {
  const access = await supplierPortalAccess();
  return access && portalApproved(access.supplier) ? access : null;
}

/** Supplier manages its own products. Drafts need Vexim review; an approved product stays on the marketplace while its owner updates it. */
export async function saveSupplierProductAction(form: FormData): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  try {
    const id = text(form, "product_id", 80);
    const store = access.store;
    const existing: SupplierProduct | null = id ? await store.getProduct(id) : null;
    if (id && (!existing || existing.supplier_id !== access.supplier.id)) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (existing?.supplier_review_status === "pending") return { ok: false, message: "Sản phẩm đang chờ duyệt; chưa thể sửa." };
    const keepPublished = existing?.supplier_review_status === "approved" && existing.supplier_originated === true;
    const input = parseProduct(form, access.supplier.id);
    // Sản phẩm đã có chứng nhận (nhập trước đây) không bị xoá trắng khi NCC lưu lại.
    input.certifications = existing?.certifications ?? null;
    const allCategories = await store.listCategories({ publishedOnly: true });
    const options = categoryProposalOptions(allCategories);
    // NCC có thể chọn danh mục gần nhất. Phạm vi đăng ký và gợi ý từ khóa
    // chỉ hỗ trợ kiểm tra; staff chốt danh mục khi duyệt.
    input.supplier_category_proposal = parseProductCategoryProposal(form, options);
    input.category = input.supplier_category_proposal;
    if (keepPublished && existing?.supplier_originated && !existing.reviewed_category_slug)
      return { ok: false, message: "Sản phẩm cần được duyệt danh mục trước khi tiếp tục quản lý." };
    if (keepPublished && existing?.reviewed_category_slug && input.supplier_category_proposal !== existing.reviewed_category_slug)
      return { ok: false, message: "Sản phẩm đã đăng; không thể tự đổi danh mục. Vui lòng liên hệ bộ phận hỗ trợ nếu cần thay đổi." };
    if (keepPublished && existing) {
      // An approved product remains approved and buyer-ready while the owner
      // updates ordinary product information. The reviewed category is locked.
      input.supplier_review_status = "approved";
      input.supplier_review_note = existing.supplier_review_note ?? null;
      input.ready_for_buyer = existing.ready_for_buyer;
      input.reviewed_category_slug = existing.reviewed_category_slug ?? null;
      input.category = existing.reviewed_category_slug ?? input.category;
    }
    const category = allCategories.find((c) => c.slug === input.category) ?? null;
    // Thông số NCC tự thêm: gộp vào pool của danh mục để NCC khác dùng lại ngay lần sau.
    // Lỗi ghi pool (ví dụ thiếu migration) không được làm hỏng việc lưu sản phẩm.
    const savedPool = sanitizeSupplierAttributePool(category?.supplier_product_fields);
    const pool = mergeSupplierAttributePool(savedPool, attributePoolFromForm(form));
    if (category && supplierAttributePoolSignature(pool) !== supplierAttributePoolSignature(savedPool)) {
      try {
        await store.updateCategory(category.id, { supplier_product_fields: pool });
      } catch (error) {
        console.warn("[supplier-product] attribute pool", error);
      }
    }
    input.specs = saveProductAttributes({ product_fields: category?.product_fields ?? [], supplier_product_fields: pool },
      attributesFromForm(form), existing?.supplier_category_proposal === input.category ? existing.specs : {});
    let saved = existing ? await store.updateProduct(existing.id, {
      ...input,
      slug: existing.slug, name_i18n: {}, images: existing.images,
    }) : await store.createProduct(input);
    let translationWarning = "";
    if (keepPublished) {
      // Approved content stays live, so refresh the buyer-facing English copy
      // after an owner edit instead of leaving the old translation in place.
      // Translation is best effort and must never undo or block the product save.
      try {
        const translation = await ensureProductEnglishTranslation(store, saved.id, { id: access.user.id, email: access.user.email });
        saved = translation.product;
        if (translation.status === "failed" || translation.status === "unconfigured")
          translationWarning = " Bản dịch tiếng Anh chưa cập nhật được. Thông tin sản phẩm đã được lưu.";
      } catch (error) {
        console.warn("[supplier-product] translation", error);
        translationWarning = " Bản dịch tiếng Anh chưa cập nhật được. Thông tin sản phẩm đã được lưu.";
      }
    }
    // Supplier-owned explicit consent is recorded only when the separate checkbox is checked.
    // A normal product save never silently refreshes the 180-day supplier consent.
    const confirmConsent = form.get("confirm_supplier_price_consent") === "yes";
    let consentWarning = "";
    if (confirmConsent && input.price_publicly_visible && input.ref_price && input.ref_price > 0 &&
        !supplierPriceConsentCurrent(access.supplier)) {
      const stamp = new Date().toISOString();
      try {
        await store.updateSupplier(access.supplier.id, { fob_publicly_visible: true, fob_updated_at: stamp });
      } catch (error) {
        console.error("[supplier-product] consent update", error);
        consentWarning = "Chưa ghi nhận được xác nhận chia sẻ giá: giá vẫn ẩn, vui lòng thử lưu lại.";
      }
      if (!consentWarning) await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
        entity: "supplier", entity_id: access.supplier.id, action: "supplier.price_consent_confirmed",
        before: { fob_publicly_visible: access.supplier.fob_publicly_visible, fob_updated_at: access.supplier.fob_updated_at },
        after: { fob_publicly_visible: true, fob_updated_at: stamp } }).catch((error) => console.error("[supplier-product] consent audit", error));
    }
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: saved.id, action: existing ? "supplier.product_updated" : "supplier.product_created",
      before: existing ? { review: existing.supplier_review_status, ready: existing.ready_for_buyer } : null,
      after: { review: saved.supplier_review_status, ready: saved.ready_for_buyer } }).catch((error) => console.error("[supplier-product] audit", error));
    revalidatePath("/supplier/portal/products");
    revalidatePath("/supplier/portal");
    revalidatePath(`/supplier/portal/products/${saved.id}`);
    revalidatePath(`/crm/products/${saved.id}/edit`);
    if (keepPublished && saved.category) {
      revalidatePath(`/products/${saved.category}`);
      revalidatePath(`/products/${saved.category}/${saved.id}`);
    }
    return { ok: true, id: saved.id, message: keepPublished
      ? `Đã lưu thay đổi sản phẩm.${translationWarning}${consentWarning ? ` ${consentWarning}` : ""}`
      : `Đã lưu bản nháp. ${consentWarning || "Tải ảnh hoặc catalogue rồi gửi duyệt."}` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không lưu được sản phẩm." }; }
}

export async function submitSupplierProductAction(form: FormData): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  const id = text(form, "product_id", 80);
  const store = access.store;
  try {
    const product = await store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (product.supplier_review_status !== "draft" && product.supplier_review_status !== "changes_requested") return { ok: false, message: "Sản phẩm không ở trạng thái cho phép gửi duyệt." };
    if (!product.name || !(product.spec || product.description)) return { ok: false, message: "Cần tên và mô tả hoặc quy cách." };
    const options = categoryProposalOptions(await store.listCategories({ publishedOnly: true }));
    if (!product.supplier_category_proposal || !options.some((c) => c.slug === product.supplier_category_proposal))
      return { ok: false, message: "Chọn danh mục đang xuất bản trước khi gửi duyệt." };
    const media = await store.listMedia("product", id);
    if (!media.some((m) => (m.kind === "image" || m.kind === "catalogue") && m.storage_path &&
      m.supplier_id === access.supplier.id && (m.created_by === access.user.id || m.audience === "buyer"))) {
      return { ok: false, message: "Cần ít nhất một ảnh hoặc catalogue trước khi gửi duyệt." };
    }
    await store.updateProduct(id, { supplier_review_status: "pending", supplier_review_note: null, ready_for_buyer: false });
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_submitted",
      before: { review: product.supplier_review_status }, after: { review: "pending" } }).catch((error) => console.error("[supplier-product] audit", error));
    const mail = await notifyStaffProductSubmission(access.supplier, product);
    if (mail !== "sent") console.warn("[supplier-product] staff email not sent; CRM review queue remains pending", mail);
    // Dịch tự động để hỗ trợ duyệt. Kết quả dịch không chặn gửi hoặc đăng sản phẩm.
    try {
      await ensureProductEnglishTranslation(store, id, { id: access.user.id, email: access.user.email });
    } catch (error) {
      console.warn("[supplier-product] submission translation", error);
    }
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, message: "Đã gửi duyệt. Bạn sẽ nhận thông báo khi sản phẩm được đăng." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không nộp được sản phẩm." }; }
}
