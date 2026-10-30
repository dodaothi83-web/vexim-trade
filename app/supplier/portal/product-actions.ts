"use server";

import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import { categoryProposalOptions, parseProductCategoryProposal } from "@/lib/supplier-portal/category-proposals";
import {
  normalizeSupplierPriceCurrency,
  normalizeSupplierPriceIncoterm,
  normalizeSupplierPriceUnit,
  parseSupplierPriceTiersFormJson,
  validateSupplierPriceTiers,
} from "@/lib/supplier-portal/product-price-options";
import {
  attributesFromForm, mergeSupplierAttributePool, sanitizeSupplierAttributePool, saveProductAttributes,
  supplierAttributePoolSignature,
} from "@/lib/product-attributes";
import { notifyStaffProductSubmission } from "@/lib/supplier-portal/notify";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import {
  applyLeadTimeToSpecs,
  describePriceChangeForReview,
  hasProductPricingChanged,
  parseLeadTimeInput,
  standardGradesForCategory,
} from "@/lib/products/grade-pricing";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { nameContainsGrade, validateQuantityPricing } from "@/lib/products/quantity-pricing";
import { validateV2Form, v2StagingEnabled } from "@/lib/products/quantity-v2-validation";
import type { QuantityRevisionTierV2 } from "@/lib/products/quantity-revision-v2";
import { deleteObject } from "@/lib/media/storage";
import type { SupplierProduct, SupplierProductInput } from "@/lib/types";

type Result = { ok: boolean; message: string; id?: string; warning?: boolean };
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

function isMissingSchemaArtifact(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { code?: unknown; message?: unknown };
  const code = typeof rec.code === "string" ? rec.code : "";
  const message = typeof rec.message === "string" ? rec.message : "";
  return (
    code === "PGRST205" ||
    code === "PGRST202" ||
    code === "42P01" ||
    code === "42883" ||
    /could not find the (table|function)/i.test(message)
  );
}

function parseProduct(form: FormData, supplierId: string, existing: SupplierProduct | null = null): SupplierProductInput {
  const name = text(form, "name", 180);
  if (name.length < 3) throw new Error("Tên sản phẩm cần ít nhất 3 ký tự.");
  const daysRaw = text(form, "lead_time_days", 5);
  if (daysRaw && (!/^\d+$/.test(daysRaw) || Number(daysRaw) > 3650)) throw new Error("Thời gian giao hàng không hợp lệ.");
  const moqValue = form.has("moq") ? (text(form, "moq", 120) || null) : (existing?.moq ?? null);
  return {
    supplier_id: supplierId, name, slug: null, name_i18n: {}, category: null,
    description: text(form, "description", 1500) || null,
    description_detail: sanitizeProductDescriptionForSave(String(form.get("description_detail") ?? "")) || null,
    spec: text(form, "spec", 800) || null,
    specs: {}, unit: existing?.unit ?? null, moq: moqValue,
    moq_qty: existing?.moq_qty ?? null, moq_unit: existing?.moq_unit ?? null, monthly_capacity: text(form, "monthly_capacity", 180) || null,
    raw_material_region: text(form, "raw_material_region", 180) || null,
    input_material_origin: text(form, "input_material_origin", 300) || null,
    lead_time_days: daysRaw ? Number(daysRaw) : null, packaging: text(form, "packaging", 300) || null,
    oem: form.get("oem") === "yes", odm: form.get("odm") === "yes", samples: form.get("samples") === "yes",
    // Không còn ô chứng nhận tự khai ở trang sản phẩm: hồ sơ Giấy tờ L1 (AI quét đơn vị đứng tên
    // và ngày hết hạn) là nguồn duy nhất. Giữ giá trị cũ nếu đã được ghi trước đây.
    certifications: null, export_port: text(form, "export_port", 120) || null,
    ref_price: existing?.ref_price ?? null, ref_price_max: existing?.ref_price_max ?? null,
    price_publicly_visible: form.get("price_publicly_visible") === "yes", currency: existing?.currency ?? null,
    price_valid_until: existing?.price_valid_until ?? null, incoterm: existing?.incoterm ?? null,
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
  let createdId: string | undefined;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  try {
    const id = text(form, "product_id", 80);
    const store = access.store;
    const existing: SupplierProduct | null = id ? await store.getProduct(id) : null;
    if (id && (!existing || existing.supplier_id !== access.supplier.id)) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (form.has("grade_rows_json")) return { ok: false, message: "Bảng giá cũ không còn được lưu. Hãy tải lại trang và dùng bảng giá theo số lượng." };
    if (existing?.supplier_review_status === "pending") return { ok: false, message: "Sản phẩm đang chờ duyệt; chưa thể sửa." };
    const existingReview = existing ? existing.supplier_review_status ?? "approved" : "draft";
    const keepPublished = existingReview === "approved" && !!(existing?.supplier_originated || existing?.supplier_category_proposal);
    const keepPaused = existingReview === "paused";
    const keepReviewed = keepPublished || keepPaused;
    if (existing && existingReview === "approved" && !keepPublished)
      return { ok: false, message: "Sản phẩm này được quản lý từ trước. Hãy tạm ẩn rồi gửi duyệt lại để cập nhật, hoặc liên hệ bộ phận hỗ trợ." };

    const usesTieredForm = form.has("price_tiers_json");
    const hasStagedQuantityPayload = !usesTieredForm && Boolean(text(form, "quantity_creation_request_id", 80) || form.has("quantity_tiers_json"));

    const input = parseProduct(form, access.supplier.id, existing);
    // Không biến sản phẩm lịch sử do staff tạo thành nháp do NCC tạo khi sửa.
    if (existing) input.supplier_originated = existing.supplier_originated === true;
    if (existingReview === "changes_requested" && existing) {
      input.supplier_review_status = "changes_requested";
      input.supplier_review_note = existing.supplier_review_note ?? null;
    }
    // Sản phẩm đã có chứng nhận (nhập trước đây) không bị xoá trắng khi NCC lưu lại.
    input.certifications = existing?.certifications ?? null;
    const allCategories = await store.listCategories({ publishedOnly: true });
    const options = categoryProposalOptions(allCategories);
    input.supplier_category_proposal = parseProductCategoryProposal(form, options);
    input.category = input.supplier_category_proposal;
    if (keepReviewed && existing?.supplier_originated && !existing.reviewed_category_slug)
      return { ok: false, message: "Sản phẩm cần được duyệt danh mục trước khi tiếp tục quản lý." };
    if (keepReviewed && existing?.reviewed_category_slug && input.supplier_category_proposal !== existing.reviewed_category_slug)
      return { ok: false, message: "Danh mục đã được duyệt; vui lòng liên hệ bộ phận hỗ trợ nếu cần thay đổi." };
    if (keepReviewed && existing) {
      input.supplier_review_status = keepPaused ? "paused" : "approved";
      input.supplier_originated = existing.supplier_originated === true;
      input.supplier_review_note = existing.supplier_review_note ?? null;
      input.ready_for_buyer = keepPaused ? false : existing.ready_for_buyer;
      input.reviewed_category_slug = existing.reviewed_category_slug ?? null;
      input.category = existing.reviewed_category_slug ?? input.category;
    }
    let category = allCategories.find((c) => c.slug === input.category) ?? null;
    if (!usesTieredForm && existing && input.name !== existing.name && category && nameContainsGrade(input.name, standardGradesForCategory(category)))
      return { ok: false, message: "Không ghi grade trong tên sản phẩm tiếng Việt." };

    let newQuantity: { grade: string; incoterm: string; tiers: { minKg: number; priceUsdPerKg: number }[] | QuantityRevisionTierV2[]; warnings: unknown[]; requestId: string } | null = null;
    let consentSupplier = access.supplier;

    if (!existing && !usesTieredForm) {
      const strictAccess = await supplierPortalAccess(supabaseStore);
      if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id || strictAccess.user.id !== access.user.id || !getSupabaseClient() || !category)
        return { ok: false, message: "Không xác nhận được tài khoản, danh mục hoặc kết nối bảng giá mới." };
      consentSupplier = strictAccess.supplier;
      const strictCategory = input.category ? await supabaseStore.getCategoryBySlug(input.category) : null;
      if (!strictCategory || strictCategory.status !== "published" || !strictCategory.is_published)
        return { ok: false, message: "Danh mục không còn được xuất bản. Hãy tải lại trang." };
      category = strictCategory;
      const requestId = String(form.get("quantity_creation_request_id") ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { ok: false, message: "Phiên tạo sản phẩm không hợp lệ. Hãy tải lại trang." };
      if (input.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") return { ok: false, message: "Hãy xác nhận cam kết giá trước khi công khai." };
      if (input.price_publicly_visible && !supplierPriceConsentCurrent(consentSupplier) && form.get("confirm_supplier_price_consent") !== "yes") return { ok: false, message: "Hãy xác nhận đồng ý chia sẻ giá." };
      input.ref_price = null; input.ref_price_max = null; input.currency = null; input.unit = null;
      input.moq = null; input.moq_qty = null; input.moq_unit = null; input.incoterm = null; input.price_valid_until = null;
      const version = form.get("quantity_version");
      if (version !== null && version !== "1" && version !== "2") return { ok: false, message: "Phiên bản bảng giá không hợp lệ." };
      if (version === "2") {
        if (!v2StagingEnabled()) return { ok: false, message: "Đơn vị mới chưa sẵn sàng để sử dụng." };
        if (!input.incoterm_place?.trim()) return { ok: false, message: "Nhập địa điểm Incoterm." };
        const checked = validateV2Form(form, input.name, standardGradesForCategory(category), await readQuantityPricingPolicy(category.id), "quantity_");
        if (!checked.value) return { ok: false, message: checked.errors[0]?.message ?? "Bảng giá không hợp lệ." };
        newQuantity = { ...checked.value, warnings: checked.warnings, requestId };
      } else {
        const raw = form.get("quantity_tiers_json");
        if (typeof raw !== "string" || raw.length > 12000) return { ok: false, message: "Bảng giá không hợp lệ." };
        let rows: unknown;
        try { rows = JSON.parse(raw); } catch { return { ok: false, message: "Bảng giá không hợp lệ." }; }
        if (!Array.isArray(rows) || rows.length > 100 || rows.some((row) => !row || typeof row !== "object" ||
          typeof row.minKg !== "string" || typeof row.priceUsdPerKg !== "string" || row.minKg.length > 32 || row.priceUsdPerKg.length > 32))
          return { ok: false, message: "Bảng giá không hợp lệ." };
        const validation = validateQuantityPricing({ grade: text(form, "quantity_grade", 180), incoterm: text(form, "quantity_incoterm", 20),
          nameVi: input.name, nameEn: "", tiers: rows }, standardGradesForCategory(category), await readQuantityPricingPolicy(category.id));
        if (!validation.value) return { ok: false, message: validation.errors[0]?.message ?? "Bảng giá không hợp lệ." };
        newQuantity = { ...validation.value, warnings: validation.warnings, requestId };
      }
    }

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

    // 3-step supplier product form: validate & apply tiered quantity pricing + shared Currency / Unit / Incoterm.
    if (usesTieredForm) {
      const drafts = parseSupplierPriceTiersFormJson(form.get("price_tiers_json"));
      if (drafts === null) {
        return { ok: false, message: "Bảng bậc giá không hợp lệ." };
      }
      const rawCurrency = text(form, "currency", 12);
      const rawUnit = text(form, "unit", 24);
      const rawIncoterm = text(form, "incoterm", 24);
      const tierCheck = validateSupplierPriceTiers(drafts, {
        currency: rawCurrency,
        unit: rawUnit,
        incoterm: rawIncoterm,
      });
      if (!tierCheck.ok) {
        return { ok: false, message: tierCheck.message };
      }
      const mode = text(form, "price_tiers_mode", 32);
      if (tierCheck.tiers.length > 0) {
        input.ref_price = tierCheck.refPrice;
        input.ref_price_max = tierCheck.refPriceMax;
        input.currency = tierCheck.currency;
        input.unit = tierCheck.unit;
        input.incoterm = tierCheck.incoterm;
        input.specs = { ...(input.specs ?? {}), price_tiers: tierCheck.tiers };
        if (!input.moq && tierCheck.unit) {
          input.moq = `${tierCheck.tiers[0].min_qty} ${tierCheck.unit}`;
        }
      } else if (existing && mode === "preserve_legacy" && existing.ref_price != null) {
        input.ref_price = existing.ref_price;
        input.ref_price_max = existing.ref_price_max ?? null;
        input.currency = normalizeSupplierPriceCurrency(rawCurrency) || existing.currency || null;
        input.unit = normalizeSupplierPriceUnit(rawUnit) || existing.unit || null;
        input.incoterm = normalizeSupplierPriceIncoterm(rawIncoterm) || existing.incoterm || null;
        delete input.specs.price_tiers;
      } else {
        input.ref_price = null;
        input.ref_price_max = null;
        input.currency = tierCheck.currency;
        input.unit = tierCheck.unit;
        input.incoterm = tierCheck.incoterm;
        delete input.specs.price_tiers;
      }
      if (existing) {
        for (const key of ["grade_rows", "moq_unit_weight_kg"] as const) {
          if (Object.prototype.hasOwnProperty.call(existing.specs ?? {}, key) && tierCheck.tiers.length === 0 && mode === "preserve_legacy") {
            input.specs[key] = existing.specs![key];
          } else {
            delete input.specs[key];
          }
        }
      }
    } else if (existing) {
      // Keep historical buyer data byte-for-byte on non-tiered legacy saves.
      for (const key of ["grade", "product_type", "grade_rows", "moq_unit_weight_kg"] as const) {
        if (Object.prototype.hasOwnProperty.call(existing.specs ?? {}, key)) input.specs[key] = existing.specs![key];
        else delete input.specs[key];
      }
    }

    if (form.has("lead_time_unit") || form.has("lead_time_value")) {
      const parsedLeadTime = parseLeadTimeInput({
        valueRaw: form.get("lead_time_value"),
        unitRaw: form.get("lead_time_unit"),
        legacyDaysRaw: form.get("lead_time_days"),
      });
      if (!parsedLeadTime.ok) return { ok: false, message: parsedLeadTime.message };
      input.lead_time_days = parsedLeadTime.daysEquivalent;
      input.specs = applyLeadTimeToSpecs(input.specs ?? {}, parsedLeadTime);
    } else if (input.lead_time_days != null) {
      input.specs = applyLeadTimeToSpecs(input.specs ?? {}, { value: input.lead_time_days, unit: "days" });
    }

    const priceChangedOnApproved = keepPublished && existing && !hasStagedQuantityPayload
      ? hasProductPricingChanged(existing, input, category ?? { slug: input.category })
      : false;
    let priceReviewSummary: string | null = null;
    if (priceChangedOnApproved && existing) {
      priceReviewSummary = describePriceChangeForReview(existing, input, category ?? { slug: input.category });
      input.supplier_review_status = "pending";
      input.supplier_review_note = null;
      input.ready_for_buyer = false;
      input.specs = { ...(input.specs ?? {}), price_review_summary: priceReviewSummary };
    }
    let saved: SupplierProduct | null;
    if (existing) {
      saved = await store.updateSupplierProductIfState(existing.id, access.supplier.id,
        { review: existing.supplier_review_status ?? null, ready: existing.ready_for_buyer }, {
          ...input, slug: existing.slug, name_i18n: existing.name_i18n ?? {}, images: existing.images,
        });
    } else if (usesTieredForm) {
      saved = await store.createProduct(input);
      createdId = saved?.id;
    } else {
      if (!newQuantity) return { ok: false, message: "Chưa có bảng giá theo số lượng." };
      const db = getSupabaseClient();
      if (!db) return { ok: false, message: "Không kết nối được cơ sở dữ liệu bảng giá." };
      const { data, error } = await db.rpc("create_supplier_product_with_quantity", {
        p_request_id: newQuantity.requestId, p_supplier_id: access.supplier.id, p_product: input,
        p_grade: newQuantity.grade, p_incoterm: newQuantity.incoterm, p_tiers: newQuantity.tiers,
        p_warnings: newQuantity.warnings, p_english_name: null,
      });
      if (error || !data || typeof data.id !== "string") {
        console.error("[quantity-pricing] atomic product creation", error);
        return { ok: false, message: "Chưa xác nhận được việc tạo sản phẩm. Hãy thử lại với cùng nội dung hoặc kiểm tra danh sách sản phẩm." };
      }
      saved = data as SupplierProduct;
      createdId = saved.id;
    }
    if (!saved) return { ok: false, message: "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang trước khi lưu." };
    // Preserve the approved English name when Vietnamese content changes.
    // Name revisions are reviewed separately and must not be overwritten by AI here.
    const translationWarning = keepPublished && existing?.name !== saved.name
      ? " Tên tiếng Anh đã duyệt được giữ nguyên; quản trị viên sẽ rà soát bản dịch."
      : "";
    // Supplier-owned explicit consent is recorded only when the separate checkbox is checked.
    // A normal product save never silently refreshes the 180-day supplier consent.
    const confirmConsent = form.get("confirm_supplier_price_consent") === "yes";
    let consentWarning = "";
    if (confirmConsent && input.price_publicly_visible && (newQuantity || usesTieredForm || (input.ref_price && input.ref_price > 0)) &&
        !supplierPriceConsentCurrent(consentSupplier)) {
      const stamp = new Date().toISOString();
      const consentStore = newQuantity ? supabaseStore : store;
      try {
        await consentStore.updateSupplier(access.supplier.id, { fob_publicly_visible: true, fob_updated_at: stamp });
      } catch (error) {
        console.error("[supplier-product] consent update", error);
        consentWarning = "Chưa ghi nhận được xác nhận chia sẻ giá: giá vẫn ẩn, vui lòng thử lưu lại.";
      }
      if (!consentWarning) await consentStore.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
        entity: "supplier", entity_id: access.supplier.id, action: "supplier.price_consent_confirmed",
        before: { fob_publicly_visible: consentSupplier.fob_publicly_visible, fob_updated_at: consentSupplier.fob_updated_at },
        after: { fob_publicly_visible: true, fob_updated_at: stamp } }).catch((error) => console.error("[supplier-product] consent audit", error));
    }
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: saved.id,
      action: priceChangedOnApproved ? "supplier.product_price_review_requested" : existing ? "supplier.product_updated" : "supplier.product_created",
      before: existing ? { review: existing.supplier_review_status, ready: existing.ready_for_buyer, ref_price: existing.ref_price, ref_price_max: existing.ref_price_max } : null,
      after: { review: saved.supplier_review_status, ready: saved.ready_for_buyer, ref_price: saved.ref_price, ref_price_max: saved.ref_price_max, ...(priceReviewSummary ? { price_review_summary: priceReviewSummary } : {}) } }).catch((error) => console.error("[supplier-product] audit", error));
    if (priceChangedOnApproved) {
      const mail = await notifyStaffProductSubmission(access.supplier, saved).catch((error) => {
        console.error("[supplier-product] price review notify", error);
        return "failed" as const;
      });
      if (mail !== "sent") console.warn("[supplier-product] price review email not sent; CRM review queue remains pending", mail);
      revalidatePath("/crm", "layout");
      revalidatePath("/crm/products");
      revalidatePath("/products", "layout");
      revalidatePath("/suppliers", "layout");
      revalidatePath("/");
    }
    revalidatePath("/supplier/portal/products");
    revalidatePath("/supplier/portal");
    revalidatePath(`/supplier/portal/products/${saved.id}`);
    revalidatePath(`/crm/products/${saved.id}/edit`);
    if (keepPublished && saved.category) {
      revalidatePath(`/products/${saved.category}`);
      revalidatePath(`/products/${saved.category}/${saved.id}`);
    }
    return { ok: true, id: saved.id, message: keepPaused
      ? `Đã lưu thay đổi. Sản phẩm vẫn tạm ẩn; gửi duyệt khi muốn đăng lại.${consentWarning ? ` ${consentWarning}` : ""}`
      : priceChangedOnApproved
        ? `Đã lưu thay đổi. Vì thông tin giá đã cập nhật, sản phẩm đang chờ kiểm tra lại giá trước khi hiển thị công khai.${translationWarning}${consentWarning ? ` ${consentWarning}` : ""}`
        : keepPublished
          ? `Đã lưu thay đổi sản phẩm.${translationWarning}${consentWarning ? ` ${consentWarning}` : ""}`
          : existingReview === "changes_requested"
            ? `Đã lưu thay đổi. Hãy gửi duyệt lại khi hoàn tất.${consentWarning ? ` ${consentWarning}` : ""}`
            : `Đã lưu bản nháp. ${consentWarning || "Tải ảnh hoặc catalogue rồi gửi duyệt."}` };
  } catch (error) {
    if (createdId) return { ok: true, id: createdId, warning: true, message: "Đã tạo sản phẩm; một bước thông báo hoặc cập nhật phụ chưa hoàn tất. Hãy kiểm tra lại hồ sơ." };
    return { ok: false, message: error instanceof Error ? error.message : "Không lưu được sản phẩm." };
  }
}

export async function submitSupplierProductAction(form: FormData): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  const id = text(form, "product_id", 80);
  const store = access.store;
  try {
    const product = await store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (!["draft", "changes_requested", "paused"].includes(product.supplier_review_status ?? "")) return { ok: false, message: "Sản phẩm không ở trạng thái cho phép gửi duyệt." };
    if (!product.name || !(product.spec || product.description)) return { ok: false, message: "Cần tên và mô tả hoặc quy cách." };
    const publishedCategories = await store.listCategories({ publishedOnly: true });
    const options = categoryProposalOptions(publishedCategories);
    const proposal = product.supplier_review_status === "paused"
      ? product.reviewed_category_slug || product.supplier_category_proposal || product.category
      : product.supplier_category_proposal;
    if (!proposal || !options.some((c) => c.slug === proposal))
      return { ok: false, message: "Chọn và lưu danh mục đang xuất bản trước khi gửi duyệt." };
    const submissionCategory = publishedCategories.find((category) => category.slug === proposal);
    const media = await store.listMedia("product", id);
    if (!media.some((m) => m.kind === "image" && m.storage_path &&
      m.supplier_id === access.supplier.id && (m.created_by === access.user.id || m.audience === "buyer"))) {
      return { ok: false, message: "Cần ít nhất một ảnh sản phẩm trước khi gửi duyệt." };
    }
    let supplierNameSubmitted = false;
    let quantityCreated = false;
    const translationDb = getSupabaseClient();
    if (translationDb) {
      const strictAccess = await supplierPortalAccess(supabaseStore);
      if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.user.id !== access.user.id || strictAccess.supplier.id !== access.supplier.id)
        return { ok: false, message: "Không xác nhận được quyền gửi sản phẩm." };
      const strictProduct = await supabaseStore.getProduct(id);
      if (!strictProduct || strictProduct.supplier_id !== strictAccess.supplier.id || strictProduct.updated_at !== product.updated_at)
        return { ok: false, message: "Sản phẩm đã thay đổi hoặc không thuộc tài khoản của bạn." };
      const { data: names, error: namesError } = await translationDb.from("product_english_name_revisions")
        .select("id").eq("product_id", id).in("status", ["pending", "approved"]).limit(1);
      if (namesError && !isMissingSchemaArtifact(namesError))
        return { ok: false, message: "Chưa kiểm tra được bản tên tiếng Anh. Vui lòng thử lại." };
      supplierNameSubmitted = Array.isArray(names) && names.length > 0;
      const { data: requests, error: requestError } = await translationDb.from("quantity_product_creation_requests")
        .select("request_id").eq("product_id", id).limit(1);
      if (requestError && !isMissingSchemaArtifact(requestError))
        return { ok: false, message: "Chưa kiểm tra được luồng bảng giá sản phẩm. Vui lòng thử lại." };
      quantityCreated = Array.isArray(requests) && requests.length > 0;
    }
    if (quantityCreated) {
      const includedGrade = submissionCategory && standardGradesForCategory(submissionCategory).find((grade) => nameContainsGrade(product.name, [grade]));
      if (includedGrade) return { ok: false, message: `Bỏ grade (${includedGrade}) ra khỏi tên sản phẩm.` };
    }
    const previousReview = product.supplier_review_status ?? null;
    let submitted: SupplierProduct | null = null;
    if (translationDb) {
      const { data, error } = await translationDb.rpc("submit_supplier_product_with_quantity_guard", {
        p_product_id: id, p_supplier_id: access.supplier.id, p_expected_updated_at: product.updated_at,
        p_expected_review: previousReview, p_expected_ready: product.ready_for_buyer, p_proposal: proposal,
      });
      if (error && !quantityCreated && isMissingSchemaArtifact(error)) {
        submitted = await store.updateSupplierProductIfState(id, access.supplier.id,
          { review: previousReview, ready: product.ready_for_buyer }, {
            supplier_review_status: "pending", supplier_review_note: null, ready_for_buyer: false,
            ...(previousReview === "paused" ? { supplier_category_proposal: proposal } : {}),
          });
      } else {
        if (error || !data) return { ok: false, message: "Chưa kiểm tra được bảng giá hoặc trạng thái sản phẩm. Kiểm tra migration và thử lại." };
        if (data.status === "price_changed" || data.status === "price_missing")
          return { ok: false, message: "Bảng giá chưa có hoặc không còn khớp thông tin sản phẩm. Hãy gửi lại bảng giá trước khi gửi duyệt." };
        if (data.status !== "submitted" || !data.product) return { ok: false, message: "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang trước khi gửi duyệt." };
        submitted = data.product as SupplierProduct;
      }
    } else {
      submitted = await store.updateSupplierProductIfState(id, access.supplier.id,
        { review: previousReview, ready: product.ready_for_buyer }, {
          supplier_review_status: "pending", supplier_review_note: null, ready_for_buyer: false,
          ...(previousReview === "paused" ? { supplier_category_proposal: proposal } : {}),
        });
    }
    if (!submitted) return { ok: false, message: "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang trước khi gửi duyệt." };
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_submitted",
      before: { review: previousReview }, after: { review: "pending" } }).catch((error) => console.error("[supplier-product] audit", error));
    let translationNotice = "";
    const potentiallyPublished = previousReview !== "draft" && !(quantityCreated && previousReview === "changes_requested");
    const protectedEnglish = potentiallyPublished || supplierNameSubmitted || !!product.reviewed_category_slug || product.ready_for_buyer ||
      (!!product.name_i18n?.en?.trim() && product.translation_meta?.origin !== "ai");
    if (!protectedEnglish && translationDb && submitted.updated_at) {
      try {
        const category = await supabaseStore.getCategoryBySlug(proposal);
        if (!category) throw new Error("Không tải được danh mục để kiểm tra grade.");
        const result = await ensureProductEnglishTranslation(store, id, { id: access.user.id, email: access.user.email }, undefined, {
          forbiddenGrades: quantityCreated ? standardGradesForCategory(category) : [],
          saveIfUnchanged: async (loaded, patch) => {
            if (loaded.updated_at !== submitted!.updated_at) return null;
            const { data, error } = await translationDb.from("supplier_products").update({ ...patch, updated_at: new Date().toISOString() })
              .eq("id", id).eq("supplier_id", access.supplier.id).eq("updated_at", submitted!.updated_at)
              .eq("supplier_review_status", "pending").eq("ready_for_buyer", false).select().maybeSingle();
            if (error) throw new Error(error.message);
            return data as SupplierProduct | null;
          },
        });
        if (result.status === "unconfigured" || result.status === "failed")
          translationNotice = " Chưa tự dịch được; quản trị viên sẽ kiểm tra và nhập bản tiếng Anh khi duyệt.";
      } catch (error) {
        console.warn("[supplier-product] submission translation", error);
        translationNotice = " Chưa tự dịch được; quản trị viên sẽ kiểm tra và nhập bản tiếng Anh khi duyệt.";
      }
    } else if (protectedEnglish) {
      translationNotice = " Bản tên tiếng Anh hiện có được giữ nguyên để quản trị viên kiểm tra.";
    } else {
      translationNotice = " Chưa tự dịch được; quản trị viên sẽ kiểm tra và nhập bản tiếng Anh khi duyệt.";
    }
    const mail = await notifyStaffProductSubmission(access.supplier, product).catch((error) => {
      console.warn("[supplier-product] staff email", error); return "failed";
    });
    if (mail !== "sent") console.warn("[supplier-product] staff email not sent; CRM review queue remains pending", mail);
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, message: `Đã gửi duyệt. Bạn sẽ nhận thông báo khi sản phẩm được đăng.${translationNotice}` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Không nộp được sản phẩm." }; }
}

const PRODUCT_ID = /^[0-9a-f-]{36}$/i;

function revalidateProductManagement(id: string) {
  revalidatePath("/supplier/portal");
  revalidatePath("/supplier/portal/products");
  revalidatePath(`/supplier/portal/products/${id}`);
  revalidatePath("/crm/products");
  revalidatePath(`/crm/products/${id}/edit`);
  revalidatePath("/products", "layout");
  revalidatePath("/suppliers", "layout");
  revalidatePath("/");
}

/** Xóa hẳn nháp do NCC tạo; không được xóa sản phẩm đã duyệt hoặc có lịch sử liên quan. */
export async function deleteSupplierDraftProductAction(id: string): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  if (!PRODUCT_ID.test(id)) return { ok: false, message: "Mã sản phẩm không hợp lệ." };
  try {
    const product = await access.store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if (product.supplier_review_status !== "draft" || product.supplier_originated !== true ||
        product.ready_for_buyer || product.reviewed_category_slug != null)
      return { ok: false, message: "Chỉ xóa được bản nháp do bạn tạo và chưa có quyết định duyệt." };
    const result = await access.store.deleteSupplierDraftProduct(id, access.supplier.id);
    if (result.status !== "deleted") return { ok: false, message: result.status === "has_links"
      ? "Sản phẩm đã có dữ liệu liên quan cần giữ. Vui lòng liên hệ bộ phận hỗ trợ để xử lý."
      : "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang." };

    const pendingPaths: string[] = [];
    await Promise.all(result.paths.map(async (path) => {
      try {
        const prefix = `products/${id}/`;
        if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(path.slice(prefix.length)) ||
            await access.store.getMediaByPath(path)) {
          pendingPaths.push(path);
          return;
        }
        await deleteObject(path);
      } catch (error) {
        pendingPaths.push(path);
        console.error("[supplier-product] draft storage cleanup", path, error);
      }
    }));
    if (pendingPaths.length) console.warn("[supplier-product] draft files pending cleanup", id, pendingPaths);
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_draft_deleted",
      before: { name: product.name, review: product.supplier_review_status },
      after: { deleted: true, files_pending_cleanup: pendingPaths.length, pending_cleanup_paths: pendingPaths } })
      .catch((error) => console.error("[supplier-product] audit", error));
    revalidateProductManagement(id);
    return { ok: true, warning: pendingPaths.length > 0, message: pendingPaths.length
      ? "Đã xóa bản nháp khỏi hệ thống. Một số tệp chưa dọn được khỏi kho; vui lòng liên hệ bộ phận hỗ trợ để hoàn tất."
      : "Đã xóa bản nháp và các tệp của sản phẩm." };
  } catch (error) {
    console.error("[supplier-product] delete draft", error);
    return { ok: false, message: "Không xóa được bản nháp. Vui lòng thử lại hoặc liên hệ bộ phận hỗ trợ." };
  }
}

/** Tạm ẩn mà không xóa sản phẩm, tệp, RFQ hay lịch sử. Đăng lại cần gửi Vexim duyệt. */
export async function pauseSupplierProductAction(id: string): Promise<Result> {
  const access = await approvedAccess();
  if (!access) return { ok: false, message: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng." };
  if (!PRODUCT_ID.test(id)) return { ok: false, message: "Mã sản phẩm không hợp lệ." };
  try {
    const product = await access.store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    if ((product.supplier_review_status ?? "approved") !== "approved")
      return { ok: false, message: "Chỉ có thể tạm ẩn sản phẩm đã được duyệt." };
    const previous = { review: product.supplier_review_status ?? null, ready: product.ready_for_buyer };
    const paused = await access.store.updateSupplierProductIfState(id, access.supplier.id, previous,
      { supplier_review_status: "paused", ready_for_buyer: false });
    if (!paused) return { ok: false, message: "Trạng thái sản phẩm đã thay đổi. Hãy tải lại trang." };
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_paused",
      before: { review: previous.review ?? "approved", ready: previous.ready },
      after: { review: "paused", ready: false } }).catch((error) => console.error("[supplier-product] audit", error));
    revalidateProductManagement(id);
    return { ok: true, message: "Đã tạm ẩn sản phẩm. Lịch sử được giữ; hãy gửi duyệt lại khi muốn đăng." };
  } catch (error) {
    console.error("[supplier-product] pause", error);
    return { ok: false, message: "Không tạm ẩn được sản phẩm. Vui lòng thử lại hoặc liên hệ bộ phận hỗ trợ." };
  }
}
