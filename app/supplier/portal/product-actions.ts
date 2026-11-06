"use server";

import { stripEmptySpecLines } from "@/lib/products/spec-template";
import { revalidatePath } from "next/cache";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import { allowedSupplierCategories, categoryProposalOptions, parseProductCategoryProposal } from "@/lib/supplier-portal/category-proposals";
import {
  attributesFromForm, mergeSupplierAttributePool, sanitizeSupplierAttributePool, saveProductAttributes,
  supplierAttributePoolSignature,
} from "@/lib/product-attributes";
import { notifyStaffProductSubmission } from "@/lib/supplier-portal/notify";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import { productExtrasFromForm } from "@/lib/products/product-extras";
import {
  applyLeadTimeToSpecs,
  describePriceChangeForReview,
  hasProductPricingChanged,
  parseLeadTimeInput,
} from "@/lib/products/grade-pricing";
import { ensureProductEnglishTranslation } from "@/lib/ai/product-translation-service";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import {
  cleanSupplierGrade, mergeSupplierGradeOptions, standardGradesForCategory, SUPPLIER_GRADE_LIMIT, supplierGradeOptions,
} from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { entryCurrencyIssue, issueMessage, validateQuantityPricing } from "@/lib/products/quantity-pricing";
import { validateV2Form, v2StagingEnabled } from "@/lib/products/quantity-v2-validation";
import type { QuantityRevisionTierV2 } from "@/lib/products/quantity-revision-v2";
import { deleteObject } from "@/lib/media/storage";
import { moveBankImageIntoProduct, removeBankOriginals, repairAttachedBankMedia } from "@/lib/supplier-portal/bank-media";
import type { SupplierProduct, SupplierProductInput } from "@/lib/types";
import { getPortalMessages } from "@/lib/i18n/server";
import type { ProductEditorMessages } from "@/lib/i18n/portal/product-editor";
import { fill } from "@/lib/i18n/format";

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


function parseProduct(form: FormData, supplierId: string, existing: SupplierProduct | null = null,
  a: ProductEditorMessages["productActions"]): SupplierProductInput {
  const name = text(form, "name", 180);
  if (name.length < 3) throw new Error(a.nameTooShort);
  // Phase 2: từ khoá, giá mẫu và đóng gói có cấu trúc. Form cũ (không có ô) thì giữ
  // nguyên giá trị đã lưu, không xoá trắng dữ liệu.
  const extras = productExtrasFromForm(
    (name) => form.get(name),
    (name) => form.has(name),
    existing,
  );
  const daysRaw = text(form, "lead_time_days", 5);
  if (daysRaw && (!/^\d+$/.test(daysRaw) || Number(daysRaw) > 3650)) throw new Error(a.badLeadTime);
  return {
    supplier_id: supplierId, name, slug: null, name_i18n: {}, category: null,
    description: text(form, "description", 1500) || null,
    description_detail: sanitizeProductDescriptionForSave(String(form.get("description_detail") ?? "")) || null,
    // Dòng mẫu gợi ý chưa điền (vd. "Màu sắc: ") không được lưu ra trang công khai.
    spec: stripEmptySpecLines(text(form, "spec", 800)) || null,
    specs: {}, unit: existing?.unit ?? null, moq: existing?.moq ?? null,
    moq_qty: existing?.moq_qty ?? null, moq_unit: existing?.moq_unit ?? null, monthly_capacity: text(form, "monthly_capacity", 180) || null,
    raw_material_region: text(form, "raw_material_region", 180) || null,
    input_material_origin: text(form, "input_material_origin", 300) || null,
    lead_time_days: daysRaw ? Number(daysRaw) : null,
    packaging: form.has("packaging") ? text(form, "packaging", 300) || null : existing?.packaging ?? null,
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
    ...extras,
  };
}

async function approvedAccess() {
  const access = await supplierPortalAccess();
  return access && portalApproved(access.supplier) ? access : null;
}

/** Supplier manages its own products. Drafts need Vexim review; an approved product stays on the marketplace while its owner updates it. */
/** Mã ảnh trong kho ảnh gửi kèm khi lưu sản phẩm mới: tối đa 8, chỉ nhận UUID. */
function parseBankMediaIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function saveSupplierProductAction(form: FormData): Promise<Result> {
  let createdId: string | undefined;
  const { locale, m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: a.noAccess };
  try {
    const id = text(form, "product_id", 80);
    const store = access.store;
    const existing: SupplierProduct | null = id ? await store.getProduct(id) : null;
    if (id && (!existing || existing.supplier_id !== access.supplier.id)) return { ok: false, message: a.productNotYours };
    if (form.has("grade_rows_json")) return { ok: false, message: a.legacyGradeTable };
    if (existing?.supplier_review_status === "pending") return { ok: false, message: a.pendingReview };
    const existingReview = existing ? existing.supplier_review_status ?? "approved" : "draft";
    const keepPublished = existingReview === "approved" && !!(existing?.supplier_originated || existing?.supplier_category_proposal);
    const keepPaused = existingReview === "paused";
    const keepReviewed = keepPublished || keepPaused;
    if (existing && existingReview === "approved" && !keepPublished)
      return { ok: false, message: a.legacyManaged };
    const input = parseProduct(form, access.supplier.id, existing, a);
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
    // NCC có thể chọn danh mục gần nhất. Phạm vi đăng ký và gợi ý từ khóa
    // chỉ hỗ trợ kiểm tra; staff chốt danh mục khi duyệt.
    input.supplier_category_proposal = parseProductCategoryProposal(form, options);
    input.category = input.supplier_category_proposal;
    if (keepReviewed && existing?.supplier_originated && !existing.reviewed_category_slug)
      return { ok: false, message: a.categoryNotReviewed };
    if (keepReviewed && existing?.reviewed_category_slug && input.supplier_category_proposal !== existing.reviewed_category_slug)
      return { ok: false, message: a.categoryLocked };
    if (keepReviewed && existing) {
      // Lưu thông thường không được đăng lại sản phẩm đã tạm ẩn hoặc làm mất
      // quyết định danh mục trước đó; NCC phải gửi duyệt lại một cách tường minh.
      input.supplier_review_status = keepPaused ? "paused" : "approved";
      input.supplier_originated = existing.supplier_originated === true;
      input.supplier_review_note = existing.supplier_review_note ?? null;
      input.ready_for_buyer = keepPaused ? false : existing.ready_for_buyer;
      input.reviewed_category_slug = existing.reviewed_category_slug ?? null;
      input.category = existing.reviewed_category_slug ?? input.category;
    }
    let category = allCategories.find((c) => c.slug === input.category) ?? null;
    // New products and their private quantity table must be created together.
    // Validate everything against live category and policy, not client defaults.
    let newQuantity: { grade: string; incoterm: string; currency?: string; tiers: { minKg: number; priceUsdPerKg: number; incoterm?: string; currency?: string }[] | QuantityRevisionTierV2[]; warnings: unknown[]; requestId: string } | null = null;
    let consentSupplier = access.supplier;
    if (!existing) {
      const strictAccess = await supplierPortalAccess(supabaseStore);
      if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id || strictAccess.user.id !== access.user.id || !getSupabaseClient() || !category)
        return { ok: false, message: a.configCheck };
      consentSupplier = strictAccess.supplier;
      const strictCategory = input.category ? await supabaseStore.getCategoryBySlug(input.category) : null;
      if (!strictCategory || strictCategory.status !== "published" || !strictCategory.is_published)
        return { ok: false, message: a.categoryUnpublished };
      category = strictCategory;
      const requestId = String(form.get("quantity_creation_request_id") ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return { ok: false, message: a.badSession };
      if (input.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") return { ok: false, message: a.needQuantityConsent };
      if (input.price_publicly_visible && !supplierPriceConsentCurrent(consentSupplier) && form.get("confirm_supplier_price_consent") !== "yes") return { ok: false, message: a.needShareConsent };
      // Never copy a quantity-tier price into legacy public fields or infer units.
      input.ref_price = null; input.ref_price_max = null; input.currency = null; input.unit = null;
      input.moq = null; input.moq_qty = null; input.moq_unit = null; input.incoterm = null; input.price_valid_until = null;
      const version = form.get("quantity_version");
      if (version !== null && version !== "1" && version !== "2") return { ok: false, message: a.badPriceVersion };
      if (version === "2") {
        if (!v2StagingEnabled()) return { ok: false, message: a.v2NotReady };
        if (!input.incoterm_place?.trim()) return { ok: false, message: a.incotermPlace };
        const checked = validateV2Form(form, input.name, standardGradesForCategory(category), await readQuantityPricingPolicy(category.id), "quantity_");
        if (!checked.value) return { ok: false, message: checked.errors[0] ? issueMessage(checked.errors[0], locale) : a.priceInvalid };
        newQuantity = { ...checked.value, warnings: checked.warnings, requestId };
      } else {
        const raw = form.get("quantity_tiers_json");
        if (typeof raw !== "string" || raw.length > 12000) return { ok: false, message: a.priceInvalid };
        let rows: unknown;
        try { rows = JSON.parse(raw); } catch { return { ok: false, message: a.priceInvalid }; }
        if (!Array.isArray(rows) || rows.length > 100 || rows.some((row) => !row || typeof row !== "object" ||
          typeof (row as { minKg?: unknown }).minKg !== "string" || typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg !== "string" ||
          (row as { minKg: string }).minKg.length > 32 || (row as { priceUsdPerKg: string }).priceUsdPerKg.length > 32 ||
          ((row as { incoterm?: unknown }).incoterm !== undefined && (typeof (row as { incoterm?: unknown }).incoterm !== "string" ||
            (row as { incoterm: string }).incoterm.length > 20))))
          return { ok: false, message: a.priceInvalid };
        const currency = text(form, "quantity_currency", 3) || "USD";
        const currencyIssue = entryCurrencyIssue(currency);
        if (currencyIssue) return { ok: false, message: currencyIssue };
        const validation = validateQuantityPricing({ grade: text(form, "quantity_grade", 180), incoterm: text(form, "quantity_incoterm", 20),
          currency, nameVi: input.name, nameEn: "", tiers: rows },
          standardGradesForCategory(category), await readQuantityPricingPolicy(category.id));
        if (!validation.value) return { ok: false, message: validation.errors[0] ? issueMessage(validation.errors[0], locale) : a.priceInvalid };
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
    // Keep historical buyer data byte-for-byte while the old storefront is in use.
    // The supplier form can submit new prices only as quantity revisions.
    if (existing) {
      for (const key of ["grade", "product_type", "grade_rows", "moq_unit_weight_kg"] as const) {
        if (Object.prototype.hasOwnProperty.call(existing.specs ?? {}, key)) input.specs[key] = existing.specs![key];
        else delete input.specs[key];
      }
    }
    const priceChangedOnApproved = keepPublished && existing
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
    } else {
      if (!newQuantity) return { ok: false, message: a.noQuantity };
      const db = getSupabaseClient();
      if (!db) return { ok: false, message: a.dbPrice };
      const { data, error } = await db.rpc("create_supplier_product_with_quantity", {
        p_request_id: newQuantity.requestId, p_supplier_id: access.supplier.id, p_product: input,
        p_grade: newQuantity.grade, p_incoterm: newQuantity.incoterm, p_tiers: newQuantity.tiers,
        p_warnings: newQuantity.warnings, p_english_name: null,
      });
      if (error || !data || typeof data.id !== "string") {
        console.error("[quantity-pricing] atomic product creation", error);
        return { ok: false, message: a.createUnconfirmed };
      }
      saved = data as SupplierProduct;
      createdId = saved.id;
      // Ảnh trong kho ảnh được gắn vào sản phẩm vừa tạo, nên người bán tải ảnh
      // trước khi có sản phẩm mà không phải lưu nháp. Ảnh gắn vào là chung với người mua
      // (không còn bước duyệt ảnh); người mua chỉ thấy khi sản phẩm được đăng.
      const bankIds = parseBankMediaIds(form.get("bank_media_ids"));
      let bankOrder = 0;
      for (const mediaId of bankIds) {
        if (bankOrder >= 6) break;
        try {
          const asset = await store.getMedia(mediaId);
          if (!asset || asset.owner_type !== "supplier" || asset.supplier_id !== access.supplier.id ||
            asset.kind !== "image" || !asset.storage_path) continue;
          // Ảnh phải nằm trong thư mục sản phẩm mới đến được người mua; chép hỏng thì để nguyên trong kho.
          const moved = await moveBankImageIntoProduct(asset, saved.id);
          if (!moved) continue;
          await store.updateMedia(mediaId, { owner_type: "product", product_id: saved.id,
            supplier_id: access.supplier.id, audience: "buyer", sort_order: bankOrder,
            storage_path: moved.storage_path, thumb_path: moved.thumb_path });
          await removeBankOriginals(asset);
          bankOrder++;
        } catch (error) {
          console.error("[supplier-product] attach media bank", error);
        }
      }
    }
    if (!saved) return { ok: false, message: a.stateChangedSave };
    // Ảnh gắn từ kho bằng bản cũ bị mất chủ sở hữu và nằm sai namespace: sửa ngay lần lưu này.
    await repairAttachedBankMedia(store, access.supplier.id, await store.listMedia("product", saved.id));
    // Preserve the approved English name when Vietnamese content changes.
    // Name revisions are reviewed separately and must not be overwritten by AI here.
    const translationWarning = keepPublished && existing?.name !== saved.name
      ? a.translationKept
      : "";
    // Supplier-owned explicit consent is recorded only when the separate checkbox is checked.
    // A normal product save never silently refreshes the 180-day supplier consent.
    const confirmConsent = form.get("confirm_supplier_price_consent") === "yes";
    let consentWarning = "";
    if (confirmConsent && input.price_publicly_visible && (newQuantity || (input.ref_price && input.ref_price > 0)) &&
        !supplierPriceConsentCurrent(consentSupplier)) {
      const stamp = new Date().toISOString();
      const consentStore = newQuantity ? supabaseStore : store;
      try {
        await consentStore.updateSupplier(access.supplier.id, { fob_publicly_visible: true, fob_updated_at: stamp });
      } catch (error) {
        console.error("[supplier-product] consent update", error);
        consentWarning = a.consentWarning;
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
      ? `${a.savedPaused}${consentWarning ? fill(a.afterSentence, { warning: consentWarning }) : ""}`
      : priceChangedOnApproved
        ? `${a.savedReprice}${translationWarning}${consentWarning ? fill(a.afterSentence, { warning: consentWarning }) : ""}`
        : keepPublished
          ? `${a.savedPlain}${translationWarning}${consentWarning ? fill(a.afterSentence, { warning: consentWarning }) : ""}`
          : existingReview === "changes_requested"
            ? `${a.savedResubmit}${consentWarning ? fill(a.afterSentence, { warning: consentWarning }) : ""}`
            : `${a.savedDraft}${consentWarning ? fill(a.afterSentence, { warning: consentWarning }) : ""}` };
  } catch (error) {
    if (createdId) return { ok: true, id: createdId, warning: true, message: a.createdPartial };
    return { ok: false, message: error instanceof Error ? error.message : a.saveFailed };
  }
}

export type GradeOptionResult = { ok: boolean; message: string; grades?: string[] };

/**
 * Nhà cung cấp tự thêm một grade cho nhóm hàng ngay trong ô chọn grade.
 *
 * Danh sách grade chuẩn do Vexim khai, nhưng nhà máy có cách gọi quy cách riêng. Mục tự thêm
 * lưu ở cấp danh mục (`categories.supplier_grade_options`) nên mọi sản phẩm cùng nhóm hàng
 * dùng lại được ngay, và Vexim thấy khi duyệt. Không ghi đè danh sách chuẩn của Vexim.
 */
export async function addSupplierGradeOptionAction(input: { categorySlug?: unknown; grade?: unknown }): Promise<GradeOptionResult> {
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: a.noAccess };
  const slug = String(input?.categorySlug ?? "").trim().toLowerCase().slice(0, 80);
  const grade = cleanSupplierGrade(input?.grade);
  if (!slug) return { ok: false, message: a.chooseCategory };
  if (!grade) return { ok: false, message: a.badGrade };
  try {
    const store = access.store;
    const category = await store.getCategoryBySlug(slug);
    if (!category || category.status !== "published" || !category.is_published)
      return { ok: false, message: a.categoryClosed };
    // Chỉ nhóm hàng nằm trong phạm vi đăng bán của chính nhà cung cấp này.
    const published = await store.listCategories({ publishedOnly: true });
    const linked = access.supplier.requested_category_slugs?.length ? [] : await store.listSupplierCategories(access.supplier.id);
    const allowed = allowedSupplierCategories(access.supplier, categoryProposalOptions(published), linked);
    if (!allowed.some((option) => option.slug === slug))
      return { ok: false, message: a.gradeOutOfScope };
    const before = standardGradesForCategory(category);
    if (before.some((option) => option.trim().toLowerCase() === grade.toLowerCase()))
      return { ok: true, message: fill(a.gradeExists, { grade }), grades: before };
    const saved = supplierGradeOptions(category);
    if (saved.length >= SUPPLIER_GRADE_LIMIT)
      return { ok: false, message: fill(a.gradeLimit, { count: SUPPLIER_GRADE_LIMIT }) };
    const pool = mergeSupplierGradeOptions(category.supplier_grade_options, [...saved, grade]);
    const updated = await store.updateCategory(category.id, { supplier_grade_options: pool });
    const grades = standardGradesForCategory(updated);
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "category", entity_id: category.id, action: "supplier.grade_option_added",
      before: { supplier_grade_options: saved }, after: { supplier_grade_options: pool, grade },
    }).catch((error) => console.error("[supplier-product] grade option audit", error));
    revalidatePath("/supplier/portal/products", "layout");
    revalidatePath("/supplier/portal/products/new");
    revalidatePath("/crm/settings/quantity-pricing");
    revalidatePath("/rfq");
    return { ok: true, message: fill(a.gradeAdded, { grade }), grades };
  } catch (error) {
    console.error("[supplier-product] grade option", error);
    return { ok: false, message: a.gradeSaveFailed };
  }
}

export async function submitSupplierProductAction(form: FormData): Promise<Result> {
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: a.noAccess };
  const id = text(form, "product_id", 80);
  const store = access.store;
  try {
    const product = await store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: a.productNotYours };
    if (!["draft", "changes_requested", "paused"].includes(product.supplier_review_status ?? "")) return { ok: false, message: a.notSubmittable };
    if (!product.name || !(product.spec || product.description)) return { ok: false, message: a.submitNeedNameSpec };
    const publishedCategories = await store.listCategories({ publishedOnly: true });
    const options = categoryProposalOptions(publishedCategories);
    // Sản phẩm đã tạm ẩn giữ danh mục Vexim từng duyệt; sản phẩm lịch sử có thể
    // dùng danh mục cũ, hoặc NCC chọn và lưu danh mục trước khi gửi duyệt lại.
    const proposal = product.supplier_review_status === "paused"
      ? product.reviewed_category_slug || product.supplier_category_proposal || product.category
      : product.supplier_category_proposal;
    if (!proposal || !options.some((c) => c.slug === proposal))
      return { ok: false, message: a.submitNeedCategory };
    const media = await store.listMedia("product", id);
    if (!media.some((m) => m.kind === "image" && m.storage_path &&
      m.supplier_id === access.supplier.id && (m.created_by === access.user.id || m.audience === "buyer"))) {
      return { ok: false, message: a.submitNeedImage };
    }
    // Preserve any historical name revision; the supplier can no longer create one.
    let supplierNameSubmitted = false;
    let quantityCreated = false;
    const translationDb = getSupabaseClient();
    if (translationDb) {
      const strictAccess = await supplierPortalAccess(supabaseStore);
      if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.user.id !== access.user.id || strictAccess.supplier.id !== access.supplier.id)
        return { ok: false, message: a.submitNoPermission };
      const strictProduct = await supabaseStore.getProduct(id);
      if (!strictProduct || strictProduct.supplier_id !== strictAccess.supplier.id || strictProduct.updated_at !== product.updated_at)
        return { ok: false, message: a.submitProductChanged };
      const { data: names, error: namesError } = await translationDb.from("product_english_name_revisions")
        .select("id").eq("product_id", id).in("status", ["pending", "approved"]).limit(1);
      if (namesError || !names) return { ok: false, message: a.submitNamesFailed };
      supplierNameSubmitted = names.length > 0;
      const { data: requests, error: requestError } = await translationDb.from("quantity_product_creation_requests")
        .select("request_id").eq("product_id", id).limit(1);
      if (requestError || !requests) return { ok: false, message: a.submitFlowFailed };
      quantityCreated = requests.length > 0;
    }
    const previousReview = product.supplier_review_status ?? null;
    let submitted: SupplierProduct | null = null;
    if (translationDb) {
      const { data, error } = await translationDb.rpc("submit_supplier_product_with_quantity_guard", {
        p_product_id: id, p_supplier_id: access.supplier.id, p_expected_updated_at: product.updated_at,
        p_expected_review: previousReview, p_expected_ready: product.ready_for_buyer, p_proposal: proposal,
      });
      if (error || !data) return { ok: false, message: a.submitPriceCheckFailed };
      // Hai nguyên nhân khác hẳn nhau nên phải nói khác nhau: thiếu bảng giá (chưa gửi,
      // hoặc bảng bị trả lại) khác với thông tin sản phẩm đổi sau khi đã gửi giá.
      if (data.status === "price_missing")
        return { ok: false, message: a.submitNoPendingPrice };
      if (data.status === "price_changed")
        return { ok: false, message: a.submitPriceStale };
      if (data.status !== "submitted" || !data.product) return { ok: false, message: a.submitStateChanged };
      submitted = data.product as SupplierProduct;
    } else {
      submitted = await store.updateSupplierProductIfState(id, access.supplier.id,
        { review: previousReview, ready: product.ready_for_buyer }, {
          supplier_review_status: "pending", supplier_review_note: null, ready_for_buyer: false,
          ...(previousReview === "paused" ? { supplier_category_proposal: proposal } : {}),
        });
    }
    if (!submitted) return { ok: false, message: a.submitStateChanged };
    await store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_submitted",
      before: { review: previousReview }, after: { review: "pending" } }).catch((error) => console.error("[supplier-product] audit", error));
    // Only translate a never-published product without a separate historical name
    // revision. Conditional save prevents an AI response racing staff review.
    let translationNotice = "";
    const potentiallyPublished = previousReview !== "draft" && !(quantityCreated && previousReview === "changes_requested");
    const protectedEnglish = potentiallyPublished || supplierNameSubmitted || !!product.reviewed_category_slug || product.ready_for_buyer ||
      (!!product.name_i18n?.en?.trim() && product.translation_meta?.origin !== "ai");
    if (!protectedEnglish && translationDb && submitted.updated_at) {
      try {
        const category = await supabaseStore.getCategoryBySlug(proposal);
        if (!category) throw new Error(a.submitCategoryGrades);
        const result = await ensureProductEnglishTranslation(store, id, { id: access.user.id, email: access.user.email }, undefined, {
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
          translationNotice = a.translationFailed;
      } catch (error) {
        console.warn("[supplier-product] submission translation", error);
        translationNotice = a.translationFailed;
      }
    } else if (protectedEnglish) {
      translationNotice = a.translationExistingKept;
    } else {
      translationNotice = a.translationFailed;
    }
    const mail = await notifyStaffProductSubmission(access.supplier, product).catch((error) => {
      console.warn("[supplier-product] staff email", error); return "failed";
    });
    if (mail !== "sent") console.warn("[supplier-product] staff email not sent; CRM review queue remains pending", mail);
    revalidatePath("/supplier/portal/products");
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, message: `${a.submitted}${translationNotice}` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : a.submitFailed }; }
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
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: a.noAccess };
  if (!PRODUCT_ID.test(id)) return { ok: false, message: a.badProductId };
  try {
    const product = await access.store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: a.productNotYours };
    if (product.supplier_review_status !== "draft" || product.supplier_originated !== true ||
        product.ready_for_buyer || product.reviewed_category_slug != null)
      return { ok: false, message: a.draftNotAllowed };
    // Thao tác CSDL khóa và kiểm tra lại trạng thái + các liên kết trong một giao dịch.
    const result = await access.store.deleteSupplierDraftProduct(id, access.supplier.id);
    if (result.status !== "deleted") return { ok: false, message: result.status === "has_links"
      ? a.draftBlockedRelated
      : a.draftStateChanged };

    const pendingPaths: string[] = [];
    await Promise.all(result.paths.map(async (path) => {
      try {
        // Chỉ dọn tệp trong thư mục của chính sản phẩm, và không xóa tệp còn
        // được một media khác tham chiếu. Dữ liệu lạ được để lại cho staff xử lý.
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
      ? a.deletedWithLeftovers
      : a.deleted };
  } catch (error) {
    console.error("[supplier-product] delete draft", error);
    return { ok: false, message: a.deleteFailed };
  }
}

/** Tạm ẩn mà không xóa sản phẩm, tệp, RFQ hay lịch sử. Đăng lại cần gửi Vexim duyệt. */
export async function pauseSupplierProductAction(id: string): Promise<Result> {
  const { m } = await getPortalMessages();
  const a = m.productEditor.productActions;
  const access = await approvedAccess();
  if (!access) return { ok: false, message: a.noAccess };
  if (!PRODUCT_ID.test(id)) return { ok: false, message: a.badProductId };
  try {
    const product = await access.store.getProduct(id);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: a.productNotYours };
    if ((product.supplier_review_status ?? "approved") !== "approved")
      return { ok: false, message: a.pauseNotApproved };
    const previous = { review: product.supplier_review_status ?? null, ready: product.ready_for_buyer };
    const paused = await access.store.updateSupplierProductIfState(id, access.supplier.id, previous,
      { supplier_review_status: "paused", ready_for_buyer: false });
    if (!paused) return { ok: false, message: a.draftStateChanged };
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "product", entity_id: id, action: "supplier.product_paused",
      before: { review: previous.review ?? "approved", ready: previous.ready },
      after: { review: "paused", ready: false } }).catch((error) => console.error("[supplier-product] audit", error));
    revalidateProductManagement(id);
    return { ok: true, message: a.paused };
  } catch (error) {
    console.error("[supplier-product] pause", error);
    return { ok: false, message: a.pauseFailed };
  }
}
