"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ImageIcon, Loader2, Save } from "lucide-react";

import { createProductAction, updateProductAction } from "@/app/actions";
import type { Category, Supplier, SupplierProduct } from "@/lib/types";
import { assignProductCategory } from "@/lib/public/category-assignment";
import { isTestOnlyProduct, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import { Button, Field, cx } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProductAttributeInputs } from "@/components/product-attribute-inputs";
import { RawMaterialRegionInput } from "@/components/raw-material-region-input";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { GradePricingTable } from "@/components/products/grade-pricing-table";
import { QuantityPricingInline } from "@/components/products/quantity-pricing-inline";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import {
  CUSTOM_GRADE_OPTION,
  LEAD_TIME_UNIT_OPTIONS,
  categoryMarketPriceUnit,
  formatGradeRowPriceVi,
  hydrateGradeRowsDraft,
  nonGradeProductFields,
  parseLeadTimeInput,
  readProductLeadTime,
  reconcileGradeRowsForCategory,
  summarizeGradeRowsForProduct,
  validateGradeRowsDraft,
  type LeadTimeUnit,
  type ProductGradeRowDraft,
} from "@/lib/products/grade-pricing";
import { effectiveFieldsFor } from "@/lib/product-attributes";
import { gradeKey, resolveGrade } from "@/lib/public/grade-resolution";
import { composeDisplayName, isPlaceholderDisplayName } from "@/lib/public/display-name";
import { useRegisterProductEditDirty } from "@/app/crm/products/[slug]/edit/edit-workspace";

type FormState = Record<string, string | number | boolean>;
type ProductTab = "info" | "spec" | "trade";
type ProductSnapshot = {
  form: FormState;
  attributes: Record<string, string>;
  category: string;
  gradeRows: ProductGradeRowDraft[];
};

const ORIGINAL_TEXT_KEYS = [
  "name", "description", "spec", "description_detail", "packaging", "certifications",
  "raw_material_region", "input_material_origin",
] as const;

function init(p?: SupplierProduct | null): FormState {
  const lt = p ? readProductLeadTime(p) : { value: null, unit: "days" as LeadTimeUnit, daysEquivalent: null };
  return {
    name: p?.name ?? "",
    display_name: p?.display_name ?? "",
    category: p?.category ?? "",
    description: p?.description ?? "",
    description_detail: p?.description_detail ?? "",
    spec: p?.spec ?? "",
    unit: p?.unit ?? "MT",
    moq: p?.moq ?? "",
    monthly_capacity: p?.monthly_capacity ?? "",
    raw_material_region: p?.raw_material_region ?? "",
    input_material_origin: p?.input_material_origin ?? "",
    lead_time_days: lt.daysEquivalent ?? "",
    lead_time_value: lt.value ?? "",
    lead_time_unit: lt.unit,
    packaging: p?.packaging ?? "",
    oem: p?.oem ?? false,
    odm: p?.odm ?? false,
    samples: p?.samples ?? false,
    ready_for_buyer: p?.ready_for_buyer ?? false,
    certifications: p?.certifications ?? "",
    export_port: p?.export_port ?? "",
    ref_price: p?.ref_price ?? "",
    ref_price_max: p?.ref_price_max ?? "",
    price_publicly_visible: p?.price_publicly_visible ?? false,
    currency: p?.currency ?? "USD",
    price_valid_until: p?.price_valid_until ?? "",
    incoterm: p?.incoterm ?? "FOB",
    incoterm_place: p?.incoterm_place ?? "",
    payment_terms: p?.payment_terms ?? "",
  };
}

function initAttributes(p?: SupplierProduct | null): Record<string, string> {
  return Object.fromEntries(
    Object.entries(p?.specs ?? {}).filter(([, value]) => typeof value === "string") as [string, string][],
  );
}

const TABS: Array<{ key: ProductTab; label: string; hint: string }> = [
  { key: "info", label: "Thông tin & mô tả", hint: "Tên, danh mục, mô tả cho người mua" },
  { key: "spec", label: "Quy cách & năng lực", hint: "Bảng Grade & giá, thông số, năng lực, đóng gói" },
  { key: "trade", label: "Giá & thương mại", hint: "Công khai giá, hiệu lực giá, địa điểm Incoterm, thanh toán" },
];

export function ProductForm({
  supplier,
  product,
  categories,
  supplierCategories = [],
  mediaState,
  savedPrice,
  previewImage = null,
  savedTranslationCurrent = true,
  quantityEditor,
}: {
  supplier: Supplier;
  product?: SupplierProduct | null;
  quantityEditor?: QuantityEditorData | null;
  categories: Pick<Category, "id" | "slug" | "name_i18n" | "price_unit" | "moq_units" | "product_fields" | "supplier_product_fields">[];
  supplierCategories?: string[];
  /** Trạng thái media cho sản phẩm do staff quản lý. */
  mediaState?: { ready: boolean; shareable: number };
  /** Server projection of the SAVED product, never inferred from unsaved checkbox edits. */
  savedPrice?: { buyerPrice: string | null; blockers: string[]; publicProduct: boolean };
  /** Ảnh đại diện đã lưu, dùng cho preview trực tiếp trong form. */
  previewImage?: string | null;
  /** Trạng thái bản dịch đã lưu, để cảnh báo khi thao tác lưu có thể kích hoạt dịch lại. */
  savedTranslationCurrent?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const supplierReviewedListing = !!(product?.supplier_originated || product?.supplier_category_proposal);
  const initialCategorySlug = product?.reviewed_category_slug ?? product?.category ?? "";
  const initialCategoryObj = categories.find((c) => c.slug === initialCategorySlug)
    ?? assignProductCategory(
      { name: product?.name ?? "", spec: product?.spec ?? null, description: product?.description ?? null, category: product?.category ?? null },
      categories,
      supplierCategories,
    )
    ?? null;
  const [form, setForm] = useState<FormState>(() => init(product));
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<ProductTab>("info");
  const [nameError, setNameError] = useState<string | null>(null);
  const [showGradeErrors, setShowGradeErrors] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(initialCategorySlug);
  const [attributes, setAttributes] = useState<Record<string, string>>(() => initAttributes(product));
  const [gradeRows, setGradeRows] = useState<ProductGradeRowDraft[]>(() => hydrateGradeRowsDraft(product, initialCategoryObj));
  const [savedSnapshot, setSavedSnapshot] = useState<ProductSnapshot>(() => ({
    form: init(product),
    attributes: initAttributes(product),
    category: initialCategorySlug,
    gradeRows: hydrateGradeRowsDraft(product, initialCategoryObj),
  }));

  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const v = (k: string) => String(form[k] ?? "");
  const currentSnapshot: ProductSnapshot = { form, attributes, category: selectedCategory, gradeRows };
  const dirty = JSON.stringify(currentSnapshot) !== JSON.stringify(savedSnapshot);
  const sourceDirty = ORIGINAL_TEXT_KEYS.some((key) => form[key] !== savedSnapshot.form[key]);
  useRegisterProductEditDirty("product", dirty);
  useRegisterProductEditDirty("source", sourceDirty);
  const assignedCategory = assignProductCategory({
    name: v("name"), spec: v("spec"), description: v("description"), category: product?.category ?? null,
  }, categories, supplierCategories);

  // Danh mục đang có hiệu lực: người dùng chọn thì theo người dùng, chưa chọn thì
  // theo gợi ý từ tên/quy cách. Hiện gợi ý ra cho thấy, thay vì để nó chạy ngầm.
  const activeCategory = categories.find((c) => c.slug === (selectedCategory || assignedCategory?.slug)) ?? null;
  const activeCategorySource = activeCategory ?? (selectedCategory ? { slug: selectedCategory } : null);
  const unitMeta = categoryMarketPriceUnit(activeCategory?.slug ?? selectedCategory, activeCategory?.price_unit);
  const suggestedCategory = !selectedCategory && assignedCategory &&
    (!supplierCategories.length || supplierCategories.includes(assignedCategory.slug)) ? assignedCategory : null;

  function onCategoryChange(nextSlug: string) {
    setSelectedCategory(nextSlug);
    const nextCat = categories.find((c) => c.slug === nextSlug) ?? (nextSlug ? { slug: nextSlug } : assignedCategory);
    setGradeRows((current) => reconcileGradeRowsForCategory(current, nextCat));
  }

  const standardDraftGrades = product ? (quantityEditor?.grade ? [quantityEditor.grade] : []) : gradeRows
    .filter((row) => row.selectedGrade && row.selectedGrade !== CUSTOM_GRADE_OPTION)
    .map((row) => row.selectedGrade.trim())
    .filter(Boolean);
  const primaryDraftGrade = standardDraftGrades[0] ?? null;

  const grade = resolveGrade({
    name: v("name"),
    spec: v("spec"),
    categorySlug: activeCategory?.slug ?? "",
    attributes: primaryDraftGrade ? { ...attributes, grade: primaryDraftGrade } : attributes,
  });

  // Tên hiển thị cho khách mua: soạn từ danh mục, quy cách, tỉnh và thuộc tính còn lại.
  const attributeLabels = Object.fromEntries(nonGradeProductFields(effectiveFieldsFor(activeCategory)).map((f) => [f.key, f.label]));
  const attributeInputFields = nonGradeProductFields(effectiveFieldsFor(activeCategory))
    .map((field) => field.supplier_added ? { ...field, label: `${field.label} (nhà cung cấp tự thêm)` } : field);
  const suggestedDisplayName = composeDisplayName({
    categoryLabel: activeCategory ? activeCategory.name_i18n.en || activeCategory.slug : null,
    grade: primaryDraftGrade ?? grade.value,
    province: supplier.province,
    attributes,
    attributeLabels,
  });
  const displayNamePlaceholder = isPlaceholderDisplayName(v("display_name"));
  const displayNameGrade = resolveGrade({
    name: v("display_name"), spec: "", categorySlug: activeCategory?.slug ?? "", attributes: {},
  }).fromName;
  const displayNameConflict = !!standardDraftGrades.length && !!displayNameGrade &&
    !standardDraftGrades.some((item) => gradeKey(item) === gradeKey(displayNameGrade));
  const previewName = (displayNamePlaceholder ? "" : v("display_name").trim()) || v("name").trim() || "Chưa có tên sản phẩm";

  const gradeValidation = validateGradeRowsDraft(gradeRows, activeCategorySource);
  const priceRangeError = product || gradeValidation.valid ? null : (gradeValidation.message ?? "Kiểm tra lại bảng Grade & giá.");
  const draftSummary = gradeValidation.valid ? summarizeGradeRowsForProduct(gradeValidation.rows, activeCategorySource) : null;
  const previewPrice = priceRangeError
    ? "Kiểm tra bảng Grade & giá"
    : form.price_publicly_visible && draftSummary?.ref_price != null
      ? `USD ${draftSummary.ref_price}${draftSummary.ref_price_max != null && draftSummary.ref_price_max > draftSummary.ref_price ? `-${draftSummary.ref_price_max}` : ""}/${draftSummary.unit || unitMeta.tradeUnit}`
      : "On request";
  const previewMoq = draftSummary?.moq || gradeRows.find((r) => r.moq.trim())?.moq.trim() || "On request";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (product && !dirty)) return;
    if (!v("name").trim()) {
      setNameError("Hãy nhập tên sản phẩm.");
      setTab("info");
      requestAnimationFrame(() => document.getElementById("product-name")?.focus());
      toast.push({ kind: "error", title: "Chưa nhập tên sản phẩm." });
      return;
    }
    if (priceRangeError) {
      setShowGradeErrors(true);
      setTab("spec");
      requestAnimationFrame(() => document.getElementById("grade-pricing-table")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      toast.push({ kind: "error", title: priceRangeError });
      return;
    }
    const leadTimeCheck = parseLeadTimeInput({
      valueRaw: v("lead_time_value"),
      unitRaw: v("lead_time_unit"),
      legacyDaysRaw: v("lead_time_days"),
    });
    if (!leadTimeCheck.ok) {
      setTab("spec");
      toast.push({ kind: "error", title: leadTimeCheck.message });
      return;
    }
    const mayAutoTranslate = !!product && !supplierReviewedListing && Boolean(form.ready_for_buyer) &&
      (sourceDirty || !savedTranslationCurrent);
    if (mayAutoTranslate && product?.name_i18n?.en?.trim() &&
      !window.confirm("Lưu thay đổi này có thể kích hoạt AI dịch lại và thay thế bản tiếng Anh đã lưu. Tiếp tục?")) return;
    setNameError(null);
    setBusy(true);
    const summary = summarizeGradeRowsForProduct(gradeValidation.rows, activeCategorySource);
    const payload = {
      ...form,
      ...(product ? {} : { grade_rows: gradeValidation.rows }),
      product_attributes: attributes,
      category: selectedCategory || assignedCategory?.slug || null,
      supplier_id: supplier.id,
      lead_time_days: leadTimeCheck.daysEquivalent,
      lead_time_value: leadTimeCheck.value,
      lead_time_unit: leadTimeCheck.unit,
      ref_price: summary.ref_price,
      ref_price_max: summary.ref_price_max,
      currency: summary.currency,
      unit: summary.unit,
      incoterm: summary.incoterm,
      moq: summary.moq,
      moq_qty: summary.moq_qty,
      moq_unit: summary.moq_unit,
    };
    try {
      const res = product
        ? await updateProductAction(product.id, payload)
        : await createProductAction(payload);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
        setShowGradeErrors(false);
        setSavedSnapshot(currentSnapshot);
        if (!product && res.id) router.push(`/crm/products/${res.id}/edit`);
        else router.refresh(); // Stay here and show the persisted public-price diagnostics.
      }
    } catch (err) {
      toast.push({ kind: "error", title: "Lỗi khi lưu", lines: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusy(false);
    }
  }

  function resetChanges() {
    if (!dirty || !window.confirm("Hoàn tác toàn bộ thay đổi chưa lưu trong hồ sơ sản phẩm?")) return;
    setForm(savedSnapshot.form);
    setAttributes(savedSnapshot.attributes);
    setSelectedCategory(savedSnapshot.category);
    setGradeRows(savedSnapshot.gradeRows);
    setShowGradeErrors(false);
    setNameError(null);
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: ProductTab) {
    const index = TABS.findIndex((item) => item.key === current);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const key = TABS[next].key;
    setTab(key);
    document.getElementById(`product-tab-${key}`)?.focus();
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {/* Thanh hành động dính trên cùng — nơi duy nhất chứa nút Lưu */}
      <div className="sticky top-2 z-20 rounded-2xl border border-ink-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
          <Link href={product ? `/crm/products/${product.id}` : `/crm/suppliers/${supplier.id}`} className="btn btn-ghost px-2.5 py-1.5 text-[13px]">
            <ArrowLeft className="h-4 w-4" /> {product ? "Chi tiết" : "Hồ sơ nhà cung cấp"}
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black tracking-tight text-ink-900">{v("name") || (product ? product.name : "Sản phẩm mới")}</p>
            <p className="hidden truncate text-[11.5px] text-ink-500 sm:block">Nhà cung cấp: {supplier.name}</p>
          </div>
          {dirty
            ? <span className="text-xs font-bold text-amber-600">● Chưa lưu thay đổi</span>
            : product ? <span className="text-xs font-medium text-ink-400">Đã lưu</span> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {product && (
              <Button type="button" size="sm" disabled={!dirty || busy} onClick={resetChanges}>
                Hoàn tác
              </Button>
            )}
            <Button type="submit" size="sm" variant="primary" disabled={busy || (!!product && !dirty)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {product ? "Lưu thay đổi" : "Thêm sản phẩm"}
            </Button>
          </div>
        </div>
        {/* Tab điều hướng */}
        <div className="flex gap-1 overflow-x-auto border-t border-ink-100 px-2.5 py-2" role="tablist" aria-label="Mục hồ sơ sản phẩm">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`product-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`product-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(event) => handleTabKeyDown(event, t.key)}
              className={`shrink-0 rounded-xl px-3 py-2 text-left transition ${tab === t.key ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-ink-50"}`}
            >
              <span className="block text-[13px] font-semibold leading-tight text-ink-900">{t.label}</span>
              <span className="hidden text-[11px] leading-tight text-ink-500 sm:block">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <fieldset disabled={busy} className="min-w-0 space-y-4 border-0 p-0">
      {tab === "info" && (
        <section id="product-panel-info" role="tabpanel" aria-labelledby="product-tab-info" className="card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-bold text-ink-900">Nhận diện sản phẩm</h2>
            <p className="mt-0.5 text-xs text-ink-500">Tên gốc được giữ riêng; tên hiển thị cho người mua có thể chỉnh bên dưới.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tên gốc của sản phẩm" required className="sm:col-span-2 lg:col-span-3">
              <input
                id="product-name"
                required
                className={`input ${nameError ? "border-rose-400 bg-rose-50/40" : ""}`}
                value={v("name")}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "product-name-error" : undefined}
                onChange={(e) => { set("name", e.target.value); setNameError(null); }}
                placeholder="VD: Gạo Jasmine 5% tấm"
                autoFocus={!product}
              />
              {nameError && <p id="product-name-error" className="mt-1 text-xs font-semibold text-rose-600">{nameError}</p>}
            </Field>
            {suggestedCategory && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs sm:col-span-2 lg:col-span-3">
                <span className="font-semibold text-ink-700">Danh mục gợi ý:</span>
                <span className="font-bold text-brand-800">{suggestedCategory.name_i18n.en || suggestedCategory.slug}</span>
                <span className="text-ink-500">theo tên sản phẩm</span>
                <button
                  type="button"
                  onClick={() => onCategoryChange(suggestedCategory.slug)}
                  className="btn btn-primary btn-sm ml-auto"
                >
                  Dùng danh mục này
                </button>
              </div>
            )}
            {isTestOnlyProduct(v("name")) && <p className="text-xs font-semibold text-amber-800 sm:col-span-2 lg:col-span-3">Tên bắt đầu bằng TEST ONLY: sản phẩm sẽ không xuất hiện công khai.</p>}
            <Field label="Mô tả ngắn" className="sm:col-span-2 lg:col-span-3">
              <input
                className="input"
                value={v("description")}
                onChange={(e) => set("description", e.target.value)}
                placeholder="VD: Gạo thơm xay xát trong ngày, đánh bóng nhẹ"
              />
            </Field>
            <Field label="Mô tả chi tiết" hint="Dùng tiêu đề, in đậm, in nghiêng và danh sách để nội dung dễ đọc trên trang sản phẩm." className="sm:col-span-2 lg:col-span-3">
              <ProductDescriptionEditor id="product-description-detail" value={v("description_detail")}
                onChange={(html) => set("description_detail", html)} disabled={busy} minHeight="lg" />
            </Field>
          </div>

          {supplierCategories.length > 0 && (
            <Field label="Danh mục cho sản phẩm" hint={"Chỉ chọn trong phạm vi nhà cung cấp đã đăng ký. Đổi danh mục thì danh sách grade đổi theo." + " Nếu tên, quy cách cho thấy ngành khác, hệ thống ưu tiên nhận diện từ sản phẩm; chọn không tự duyệt."}>
              <select className="input mt-1" value={selectedCategory} onChange={(e) => onCategoryChange(e.target.value)}>
                <option value="">Tự nhận diện theo tên/quy cách</option>
                {categories.filter((category) => supplierCategories.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{category.name_i18n.en || category.slug}</option>)}
              </select>
            </Field>
          )}
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <Field
              label="Tên hiển thị cho người mua"
              hint="Trang người mua đọc tên này. Để trống thì dùng tên sản phẩm ở trên; tên gốc không đổi."
            >
              <input
                className={`input ${displayNamePlaceholder ? "border-amber-400 bg-amber-50/40" : ""}`}
                maxLength={120}
                value={v("display_name")}
                onChange={(e) => set("display_name", e.target.value)}
                placeholder={suggestedDisplayName || "VD: Pepper 550 g/l, Dak Lak"}
              />
            </Field>
            {displayNamePlaceholder && (
              <p className="mt-1 text-xs font-semibold text-amber-800">“Chưa xác định” không phải tên hiển thị. Để trống để dùng tên gốc.</p>
            )}
            {suggestedDisplayName && v("display_name").trim() !== suggestedDisplayName && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-ink-500">Gợi ý:</span>
                <span className="font-semibold text-ink-800">{suggestedDisplayName}</span>
                <button
                  type="button"
                  onClick={() => set("display_name", suggestedDisplayName)}
                  className="btn btn-primary btn-sm ml-auto"
                >
                  Dùng tên này
                </button>
              </div>
            )}
            {!product && displayNameConflict && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Tên hiển thị ghi <strong>{displayNameGrade}</strong> nhưng bảng Grade &amp; giá đang là <strong>{standardDraftGrades.join(", ")}</strong>. Buyer sẽ đọc hai mức khác nhau. Sửa lại tên hiển thị hoặc bảng Grade &amp; giá.
              </p>
            )}
            <p className="mt-2 text-xs leading-5 text-ink-500">
              Buyer sẽ thấy: <strong className="text-ink-800">{previewName}</strong>
            </p>
          </div>
        </section>
      )}

      {tab === "spec" && (
        <section id="product-panel-spec" role="tabpanel" aria-labelledby="product-tab-spec" className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-ink-900">Quy cách &amp; năng lực</h2>
          <div className="mb-5 space-y-4">
            {product && <div className="space-y-3 rounded-xl border border-brand-200 bg-white p-4">
              <h3 className="text-sm font-bold text-ink-900">Giá theo số lượng</h3>
              {quantityEditor ? <QuantityPricingInline key={`${quantityEditor.productId}:${quantityEditor.updatedAt}`}
                data={quantityEditor} actor="staff" disabled={busy} dirty={dirty} publishPreview />
                : <p role="alert" className="text-xs text-rose-700">Chưa tải được bảng giá mới. Kiểm tra kết nối và danh mục đã xuất bản; dữ liệu giá cũ không bị thay đổi.</p>}
            </div>}
            {!product && <GradePricingTable rows={gradeRows} onChange={setGradeRows} category={activeCategorySource} disabled={busy} showErrors={showGradeErrors} />}
            {attributeInputFields.length > 0 && (
              <ProductAttributeInputs fields={attributeInputFields} values={attributes} onChange={setAttributes} />
            )}
            {!product && grade.fromName && standardDraftGrades.length > 0 && !standardDraftGrades.some((item) => gradeKey(item) === gradeKey(grade.fromName!)) && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Tên gốc ghi <strong>{grade.fromName}</strong> nhưng bảng Grade &amp; giá đang là{" "}
                <strong>{standardDraftGrades.join(", ")}</strong>. Khi công khai, hệ thống lấy theo bảng Grade &amp; giá. Sửa lại nếu cần khớp.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Thông tin kỹ thuật bổ sung" hint="Nhập thông tin chưa có trường cấu trúc ở trên." className="sm:col-span-2">
              <input
                className="input"
                value={v("spec")}
                onChange={(e) => set("spec", e.target.value)}
                placeholder="VD: 25kg PP bag, moisture <= 14%"
              />
            </Field>
            <Field label="Vùng nguyên liệu" hint="Chọn tỉnh/thành hoặc nhập vùng cụ thể; có thể ghi nhiều vùng cho sản phẩm này.">
              <RawMaterialRegionInput
                value={v("raw_material_region")}
                onChange={(e) => set("raw_material_region", e.target.value)}
              />
            </Field>
            <Field label="Xuất xứ nguyên liệu đầu vào" hint="Nguồn trong nước, nhập khẩu hoặc kết hợp của sản phẩm này.">
              <input
                className="input"
                maxLength={300}
                value={v("input_material_origin")}
                onChange={(e) => set("input_material_origin", e.target.value)}
                placeholder="Ví dụ: Việt Nam, Campuchia hoặc nguồn kết hợp"
              />
            </Field>
            <Field label="Công suất / tháng">
              <input
                className="input"
                value={v("monthly_capacity")}
                onChange={(e) => set("monthly_capacity", e.target.value)}
                placeholder="VD: 2.000 MT / tháng"
              />
            </Field>
            <Field label="Thời gian giao hàng">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={v("lead_time_unit") === "weeks" ? 52 : 365}
                  disabled={v("lead_time_unit") === "on_request"}
                  className="input w-24 shrink-0 font-mono tabular-nums disabled:bg-ink-50 disabled:text-ink-400"
                  value={v("lead_time_unit") === "on_request" ? "" : v("lead_time_value")}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    const unit = (v("lead_time_unit") || "days") as LeadTimeUnit;
                    const num = /^\d+$/.test(rawVal.trim()) ? Number(rawVal.trim()) : null;
                    setForm((prev) => ({
                      ...prev,
                      lead_time_value: rawVal,
                      lead_time_days: num && num > 0 ? (unit === "weeks" ? num * 7 : num) : "",
                    }));
                  }}
                  placeholder={v("lead_time_unit") === "on_request" ? "-" : v("lead_time_unit") === "weeks" ? "VD: 2" : "VD: 15"}
                />
                <select
                  aria-label="Đơn vị thời gian giao hàng"
                  className="input min-w-0 flex-1"
                  value={v("lead_time_unit") || "days"}
                  onChange={(e) => {
                    const nextUnit = e.target.value as LeadTimeUnit;
                    const rawVal = nextUnit === "on_request" ? "" : v("lead_time_value");
                    const num = /^\d+$/.test(rawVal.trim()) ? Number(rawVal.trim()) : null;
                    setForm((prev) => ({
                      ...prev,
                      lead_time_unit: nextUnit,
                      lead_time_value: rawVal,
                      lead_time_days: nextUnit !== "on_request" && num && num > 0 ? (nextUnit === "weeks" ? num * 7 : num) : "",
                    }));
                  }}
                >
                  {LEAD_TIME_UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.viLabel}</option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="Cảng xuất hàng">
              <input
                className="input"
                value={v("export_port")}
                onChange={(e) => set("export_port", e.target.value)}
                placeholder="VD: Cát Lái"
              />
            </Field>
            <Field label="Bao bì / đóng gói" className="sm:col-span-2">
              <input
                className="input"
                value={v("packaging")}
                onChange={(e) => set("packaging", e.target.value)}
                placeholder="VD: Bao PP 25kg, thùng carton 5 lớp"
              />
            </Field>
            <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0f766e]"
                  checked={Boolean(form.oem)}
                  onChange={(e) => set("oem", e.target.checked)}
                />
                Nhận làm nhãn riêng / OEM
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0f766e]"
                  checked={Boolean(form.samples)}
                  onChange={(e) => set("samples", e.target.checked)}
                />
                Có thể gửi mẫu
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
                <input type="checkbox" className="h-4 w-4 accent-[#0f766e]" checked={Boolean(form.odm)} onChange={(e) => set("odm", e.target.checked)} /> Thiết kế & sản xuất theo yêu cầu / ODM
              </label>
              {mediaState && !supplierReviewedListing && (
                <label
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold",
                    mediaState.ready
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-900",
                  )}
                  title={
                    mediaState.ready
                      ? "Khách đã có ảnh/catalogue để xem"
                      : "Cần ít nhất 1 ảnh hoặc catalogue ở chế độ Chia sẻ cho người mua"
                  }
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#0f766e]"
                    disabled={!mediaState.ready && !form.ready_for_buyer}
                    checked={Boolean(form.ready_for_buyer)}
                    onChange={(e) => set("ready_for_buyer", e.target.checked)}
                  />
                  Sẵn sàng gửi người mua
                  {!mediaState.ready && !form.ready_for_buyer && (
                    <span className="font-normal">(cần thêm ảnh/catalogue)</span>
                  )}
                </label>
              )}
            </div>
            <Field label="Chứng nhận / tiêu chuẩn (tự khai; không tự tạo nhãn cho người mua)" hint="Nhãn chứng nhận lấy từ tệp nhà cung cấp nộp. Vexim kiểm rồi công bố ở mục Chứng nhận." className="sm:col-span-2 lg:col-span-3">
              <input
                className="input"
                value={v("certifications")}
                onChange={(e) => set("certifications", e.target.value)}
                placeholder="VD: HACCP, ISO 22000, BRC, EU code"
              />
            </Field>
          </div>
        </section>
      )}

      {tab === "trade" && (
        <section id="product-panel-trade" role="tabpanel" aria-labelledby="product-tab-trade" className="card p-5">
          <h2 className="text-sm font-bold text-ink-900">Điều kiện thương mại tham khảo</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-600">
            Quyền chia sẻ giá là đồng ý chung của nhà cung cấp, hiệu lực 180 ngày. Giá chỉ hiện khi <strong>riêng sản phẩm này</strong> cũng được chọn, có giá hợp lệ và đủ điều kiện công bố; đây không phải báo giá RFQ.
          </p>
          {product ? <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 text-xs">
            <p className="font-bold text-ink-900">Grade, Incoterm và bảng giá theo số lượng nằm tại mục Quy cách &amp; năng lực.</p>
            <button type="button" onClick={() => setTab("spec")} className="mt-2 font-bold text-brand-700 underline">Mở bảng giá theo số lượng</button>
          </div> : <>          <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50/50 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-ink-900">Grade, giá ({unitMeta.unitLabel}), Incoterm và MOQ nằm tại mục Quy cách &amp; năng lực</p>
              <button
                type="button"
                onClick={() => setTab("spec")}
                className="font-bold text-brand-700 underline"
              >
                Mở bảng Grade &amp; giá ({gradeRows.length} dòng)
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-ink-700">
              {gradeRows.map((row) => {
                const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
                const label = (isCustom ? row.customGrade : row.selectedGrade).trim() || "Chưa chọn grade";
                const minNum = row.priceMin.trim() ? Number(row.priceMin.trim()) : null;
                const maxNum = row.priceMax.trim() ? Number(row.priceMax.trim()) : null;
                const validPrice = minNum !== null && maxNum !== null && Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum > 0 && maxNum >= minNum;
                return (
                  <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-ink-900">{label}{isCustom && row.customGrade.trim() ? " (Tự nhập)" : ""}</span>
                    <span>
                      <span className={validPrice ? "font-mono font-semibold tabular-nums text-ink-900" : "text-ink-500"}>
                        {validPrice ? formatGradeRowPriceVi(minNum, maxNum, unitMeta.unitLabel) : "Báo giá theo yêu cầu"}
                      </span>
                      {" | "}
                      {row.incoterm || "FOB"}
                      {row.moq.trim() ? ` | MOQ ${row.moq.trim()}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
</>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {!product && <Field label="Giá hiệu lực đến">
              <input type="date" className="input" value={v("price_valid_until")} onChange={(e) => set("price_valid_until", e.target.value)} />
            </Field>}
            <Field label="Địa điểm Incoterm" hint="VD: FOB Cát Lái, Incoterms 2020">
              <input
                className="input"
                value={v("incoterm_place")}
                onChange={(e) => set("incoterm_place", e.target.value)}
                placeholder="Cát Lái"
              />
            </Field>
            <Field label="Điều khoản thanh toán tham khảo">
              <input
                className="input"
                value={v("payment_terms")}
                onChange={(e) => set("payment_terms", e.target.value)}
                placeholder="30% cọc, 70% khi có B/L"
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-sm">
              <label className="flex items-start gap-2 font-semibold text-ink-800"><input type="checkbox" checked={form.price_publicly_visible === true}
                onChange={(e) => set("price_publicly_visible", e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-700" /> Hiển thị giá tham khảo của sản phẩm này cho người mua khi đủ điều kiện</label>
              <p className="mt-1 text-xs text-ink-600">{supplierPriceConsentCurrent(supplier) ? "Nhà cung cấp đã đồng ý chia sẻ giá; vẫn cần chọn riêng từng sản phẩm." : "Nhà cung cấp chưa có quyền chia sẻ giá còn hiệu lực; tích ô này không thay thế sự đồng ý."} Thay đổi chỉ có hiệu lực sau khi lưu.</p>
              {product && savedPrice && <div className={"mt-3 rounded-md px-3 py-2 text-xs " + (savedPrice.buyerPrice ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950")} role="status">
                <p className="font-semibold">Giá người mua · bản đã lưu: {savedPrice.buyerPrice ? <span className="font-mono tabular-nums">{savedPrice.buyerPrice}</span> : savedPrice.publicProduct ? "On request" : "Sản phẩm chưa công khai"}</p>
                {dirty && <p className="mt-1">Bạn đang sửa form; dòng trên vẫn là trạng thái đã lưu.</p>}
                {!savedPrice.buyerPrice && <>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{savedPrice.blockers.map((reason) => <li key={reason}>{reason}</li>)}
                    {!savedPrice.publicProduct && <li>Sản phẩm chưa đủ điều kiện công bố ở checklist phía trên: thiếu duyệt, danh mục, ảnh/catalogue hoặc trạng thái sẵn sàng.</li>}
                  </ul>
                  {savedPrice.blockers.some((reason) => reason.includes("chia sẻ giá")) && <Link href={`/crm/suppliers/${supplier.id}/edit#price-sharing`} className="mt-2 inline-block font-semibold text-brand-700 underline">Kiểm tra quyền chia sẻ giá trong hồ sơ nhà cung cấp</Link>}
                </>}
              </div>}
            </div>
          </div>
        </section>
      )}
      </fieldset>

      <details className="card overflow-hidden">
        <summary className="cursor-pointer list-none p-4">
          <span className="text-sm font-bold text-ink-900">Xem trước thẻ sản phẩm</span>
          <span className="mt-0.5 block text-xs font-normal text-ink-500">Tên, danh mục, giá và MOQ cập nhật theo nội dung đang nhập.</span>
        </summary>
        <div className="border-t border-ink-100 bg-ink-50/50 p-4">
          <div className="max-w-xs overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-ink-100 text-ink-400">
              {previewImage
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={previewImage} alt="Ảnh đại diện đã lưu" className="h-full w-full object-cover" />
                : <ImageIcon className="h-10 w-10" aria-hidden="true" />}
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold text-brand-700">{activeCategory?.name_i18n.en || activeCategory?.slug || "Chưa có danh mục"}</p>
              <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-ink-900">{previewName}</h3>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-ink-500">{product ? "Giá người mua đang thấy" : "Giá trong form"}</dt><dd className="text-right font-semibold tabular-nums text-ink-800">{product ? (savedPrice ? savedPrice.buyerPrice ?? "Price on request" : "Chưa kiểm tra") : previewPrice}</dd></div>
                {!product && <div className="flex justify-between gap-3"><dt className="text-ink-500">MOQ</dt><dd className="text-right font-semibold text-ink-800">{previewMoq}</dd></div>}
              </dl>
            </div>
          </div>
          <p className="mt-3 max-w-md text-xs leading-5 text-ink-500">{"Bản xem trước nội dung đang nhập, không phải trạng thái đã đăng." + " Ảnh và điều kiện hiện giá vẫn theo dữ liệu đã lưu."}</p>
        </div>
      </details>
    </form>
  );
}
