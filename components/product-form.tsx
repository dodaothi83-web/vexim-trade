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
import { effectiveFieldsFor, fieldsFor } from "@/lib/product-attributes";
import { gradeKey, resolveGrade } from "@/lib/public/grade-resolution";
import { composeDisplayName, isPlaceholderDisplayName } from "@/lib/public/display-name";
import { useRegisterProductEditDirty } from "@/app/crm/products/[slug]/edit/edit-workspace";

const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP", "FCA"];
const CURRENCIES = ["USD", "EUR", "VND"];

type FormState = Record<string, string | number | boolean>;
type ProductTab = "info" | "spec" | "trade";
type ProductSnapshot = { form: FormState; attributes: Record<string, string>; category: string };

const ORIGINAL_TEXT_KEYS = [
  "name", "description", "spec", "description_detail", "packaging", "certifications",
  "raw_material_region", "input_material_origin",
] as const;

function init(p?: SupplierProduct | null): FormState {
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
    lead_time_days: p?.lead_time_days ?? "",
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
  { key: "info", label: "Thông tin & mô tả", hint: "Tên, danh mục, mô tả cho buyer" },
  { key: "spec", label: "Quy cách & năng lực", hint: "Quy cách, MOQ, đóng gói, chứng nhận tự khai" },
  { key: "trade", label: "Giá & thương mại", hint: "Giá tham khảo, Incoterm, thanh toán" },
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
}: {
  supplier: Supplier;
  product?: SupplierProduct | null;
  categories: Pick<Category, "id" | "slug" | "name_i18n" | "product_fields" | "supplier_product_fields">[];
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
  const [form, setForm] = useState<FormState>(() => init(product));
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<ProductTab>("info");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(product?.reviewed_category_slug ?? product?.category ?? "");
  const [attributes, setAttributes] = useState<Record<string, string>>(() => initAttributes(product));
  const [savedSnapshot, setSavedSnapshot] = useState<ProductSnapshot>(() => ({
    form: init(product),
    attributes: initAttributes(product),
    category: product?.reviewed_category_slug ?? product?.category ?? "",
  }));

  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const v = (k: string) => String(form[k] ?? "");
  const currentSnapshot: ProductSnapshot = { form, attributes, category: selectedCategory };
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
  const suggestedCategory = !selectedCategory && assignedCategory &&
    (!supplierCategories.length || supplierCategories.includes(assignedCategory.slug)) ? assignedCategory : null;
  // Quy cách: trường có cấu trúc thắng tên. Tên còn lại để cảnh báo khi hai bên lệch.
  const grade = resolveGrade({
    name: v("name"), spec: v("spec"), categorySlug: activeCategory?.slug ?? "", attributes,
  });
  const gradeField = fieldsFor(activeCategory).find((f) => (f.key === "grade" || f.key === "product_type") && f.type === "select");
  const gradeFromNameUsable = !!gradeField && !!grade.fromName && !grade.fromAttributes && gradeField.options.includes(grade.fromName);

  // Tên hiển thị cho buyer: soạn từ danh mục, quy cách, tỉnh và thuộc tính còn lại.
  // Nhân viên bấm một nút là xong; để trống thì trang buyer dùng tên gốc.
  const attributeLabels = Object.fromEntries(effectiveFieldsFor(activeCategory).map((f) => [f.key, f.label]));
  // Nhân viên thấy cả thông số NCC tự thêm, có ghi rõ nguồn để không nhầm là trường CMS.
  const attributeInputFields = effectiveFieldsFor(activeCategory)
    .map((field) => field.supplier_added ? { ...field, label: `${field.label} (NCC tự thêm)` } : field);
  const suggestedDisplayName = composeDisplayName({
    categoryLabel: activeCategory ? activeCategory.name_i18n.en || activeCategory.slug : null,
    grade: grade.value,
    province: supplier.province,
    attributes,
    attributeLabels,
  });
  const displayNamePlaceholder = isPlaceholderDisplayName(v("display_name"));
  // Tên hiển thị ghi một mức quy cách khác với ô quy cách đã chốt thì buyer đọc
  // thấy hai mức ở cùng một chỗ, nên phải nói ra thay vì chọn ngầm một bên.
  const confirmedGrade = grade.source === "attributes" ? grade.value : null;
  const displayNameGrade = resolveGrade({
    name: v("display_name"), spec: "", categorySlug: activeCategory?.slug ?? "", attributes: {},
  }).fromName;
  const displayNameConflict = !!confirmedGrade && !!displayNameGrade &&
    gradeKey(confirmedGrade) !== gradeKey(displayNameGrade);
  const previewName = (displayNamePlaceholder ? "" : v("display_name").trim()) || v("name").trim() || "Chưa có tên sản phẩm";

  const priceFromText = v("ref_price").trim();
  const priceToText = v("ref_price_max").trim();
  const priceFrom = Number(priceFromText);
  const priceTo = Number(priceToText);
  const priceRangeError = priceToText && (
    !priceFromText || !Number.isFinite(priceFrom) || !Number.isFinite(priceTo) ||
    priceFrom <= 0 || priceTo < priceFrom
  ) ? "Giá đến phải lớn hơn hoặc bằng giá từ. Giá từ cần lớn hơn 0." : null;
  const previewPrice = priceRangeError
    ? "Kiểm tra giá"
    : form.price_publicly_visible && priceFromText
      ? `${v("currency")} ${priceFromText}${priceToText ? `-${priceToText}` : ""}/${v("unit") || "đơn vị"}`
      : "On request";

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
      setTab("trade");
      requestAnimationFrame(() => document.getElementById("product-ref-price-max")?.focus());
      toast.push({ kind: "error", title: priceRangeError });
      return;
    }
    const mayAutoTranslate = !!product && !supplierReviewedListing && Boolean(form.ready_for_buyer) &&
      (sourceDirty || !savedTranslationCurrent);
    if (mayAutoTranslate && product?.name_i18n?.en?.trim() &&
      !window.confirm("Lưu thay đổi này có thể kích hoạt AI dịch lại và thay thế bản tiếng Anh đã lưu. Tiếp tục?")) return;
    setNameError(null);
    setBusy(true);
    const payload = {
      ...form,
      product_attributes: attributes,
      category: selectedCategory || assignedCategory?.slug || null,
      supplier_id: supplier.id,
      lead_time_days: v("lead_time_days") ? Number(v("lead_time_days")) : null,
      ref_price: v("ref_price") ? Number(v("ref_price")) : null,
      ref_price_max: v("ref_price_max") ? Number(v("ref_price_max")) : null,
    };
    try {
      const res = product
        ? await updateProductAction(product.id, payload)
        : await createProductAction(payload);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
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
            <ArrowLeft className="h-4 w-4" /> {product ? "Chi tiết" : "Hồ sơ NCC"}
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
            <p className="mt-0.5 text-xs text-ink-500">Tên gốc được giữ riêng; tên hiển thị cho buyer có thể chỉnh bên dưới.</p>
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
                  onClick={() => setSelectedCategory(suggestedCategory.slug)}
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
            <Field label="Mô tả chi tiết" hint="Thông tin dài hiển thị dưới trang sản phẩm; văn bản thuần, xuống dòng tùy ý." className="sm:col-span-2 lg:col-span-3">
              <textarea className="input min-h-40 resize-y" rows={7} maxLength={6000} value={v("description_detail")}
                onChange={(e) => set("description_detail", e.target.value)} placeholder="Nguồn gốc, tính năng, ứng dụng, đóng gói, lưu ý sử dụng..." />
            </Field>
          </div>

          {supplierCategories.length > 0 && (
            <Field label="Danh mục cho sản phẩm" hint="Chỉ chọn trong phạm vi NCC đã đăng ký. Nếu tên/quy cách cho thấy ngành khác, hệ thống ưu tiên nhận diện từ sản phẩm; chọn không tự duyệt hoặc công khai.">
              <select className="input mt-1" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="">Tự nhận diện theo tên/quy cách</option>
                {categories.filter((category) => supplierCategories.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{category.name_i18n.en || category.slug}</option>)}
              </select>
            </Field>
          )}
          <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
            <Field
              label="Tên hiển thị cho buyer"
              hint="Trang buyer đọc tên này. Để trống thì dùng tên sản phẩm ở trên; tên gốc không bị thay đổi."
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
            {displayNameConflict && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Tên hiển thị ghi <strong>{displayNameGrade}</strong> nhưng ô quy cách đang là <strong>{confirmedGrade}</strong>. Buyer sẽ đọc hai mức khác nhau. Sửa lại tên hiển thị hoặc ô quy cách.
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
          <div className="mb-5 space-y-3">
            <ProductAttributeInputs fields={attributeInputFields} values={attributes} onChange={setAttributes} />
            {grade.conflict && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Tên gốc ghi <strong>{grade.fromName}</strong> nhưng ô {gradeField?.label ?? "quy cách"} đang là{" "}
                <strong>{grade.fromAttributes}</strong>. Khi công khai, hệ thống lấy theo ô quy cách. Sửa một trong hai cho khớp.
              </p>
            )}
            {gradeFromNameUsable && (
              <p className="text-xs leading-5 text-ink-500">
                Tên gốc có “{grade.fromName}”.{" "}
                <button
                  type="button"
                  onClick={() => setAttributes((current) => ({ ...current, [gradeField!.key]: grade.fromName! }))}
                  className="font-semibold text-brand-700 underline"
                >
                  Điền vào ô {gradeField!.label}
                </button>{" "}
                để giá trị nằm trong dữ liệu, không phụ thuộc cách viết tên.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Thông tin kỹ thuật bổ sung" hint="Nhập thông tin chưa có trường cấu trúc ở trên." className="sm:col-span-2">
              <input
                className="input"
                value={v("spec")}
                onChange={(e) => set("spec", e.target.value)}
                placeholder="VD: 25kg PP bag, moisture ≤ 14%"
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
            <Field label="MOQ">
              <input
                className="input"
                value={v("moq")}
                onChange={(e) => set("moq", e.target.value)}
                placeholder="VD: 100 MT / 1 cont 20ft"
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
            <Field label="Lead time (ngày)">
              <input
                type="number"
                min={0}
                className="input"
                value={v("lead_time_days")}
                onChange={(e) => set("lead_time_days", e.target.value)}
                placeholder="21"
              />
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
                      : "Cần ít nhất 1 ảnh hoặc catalogue ở chế độ Chia sẻ buyer"
                  }
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#0f766e]"
                    disabled={!mediaState.ready && !form.ready_for_buyer}
                    checked={Boolean(form.ready_for_buyer)}
                    onChange={(e) => set("ready_for_buyer", e.target.checked)}
                  />
                  Sẵn sàng gửi buyer
                  {!mediaState.ready && !form.ready_for_buyer && (
                    <span className="font-normal">(cần thêm ảnh/catalogue)</span>
                  )}
                </label>
              )}
            </div>
            <Field label="Chứng nhận / tiêu chuẩn (tự khai; không tự tạo nhãn buyer)" hint="Nhãn chứng nhận chỉ lấy từ tệp NCC nộp, Vexim kiểm bản sao và quyết định công bố riêng tại hồ sơ NCC → Chứng nhận." className="sm:col-span-2 lg:col-span-3">
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
            Quyền chia sẻ giá trong hồ sơ doanh nghiệp là sự đồng ý chung của NCC (hiệu lực 180 ngày). Giá chỉ hiện khi <strong>riêng sản phẩm này</strong> cũng được chọn, có giá hợp lệ và đủ điều kiện công bố; đây không phải báo giá RFQ.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Giá tham khảo từ">
              <input type="number" min={0} step="0.01" className="input" value={v("ref_price")}
                onChange={(e) => set("ref_price", e.target.value)} placeholder="620" />
            </Field>
            <Field label="Giá tham khảo đến" hint="Tùy chọn. Để trống nếu chỉ có một mức giá; không được thấp hơn giá từ.">
              <input id="product-ref-price-max" type="number" min={0} step="0.01" className={`input ${priceRangeError ? "border-rose-400 bg-rose-50/40" : ""}`} value={v("ref_price_max")}
                aria-invalid={!!priceRangeError} aria-describedby={priceRangeError ? "product-price-range-error" : undefined}
                onChange={(e) => set("ref_price_max", e.target.value)} placeholder="680" />
              {priceRangeError && <p id="product-price-range-error" className="mt-1 text-xs font-semibold text-rose-600">{priceRangeError}</p>}
            </Field>
            <Field label="Tiền tệ">
              <select className="input" value={v("currency")} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Đơn vị giá" hint="VD: MT, kg, thùng; giá buyer sẽ hiển thị theo đơn vị này.">
              <input className="input" value={v("unit")} onChange={(e) => set("unit", e.target.value)} placeholder="MT / kg / thùng" />
            </Field>
            <Field label="Giá hiệu lực đến">
              <input
                type="date"
                className="input"
                value={v("price_valid_until")}
                onChange={(e) => set("price_valid_until", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3 text-sm">
              <label className="flex items-start gap-2 font-semibold text-ink-800"><input type="checkbox" checked={form.price_publicly_visible === true}
                onChange={(e) => set("price_publicly_visible", e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand-700" /> Hiển thị giá tham khảo của sản phẩm này cho buyer khi đủ điều kiện</label>
              <p className="mt-1 text-xs text-ink-600">{supplierPriceConsentCurrent(supplier) ? "NCC đã đồng ý chia sẻ giá; vẫn cần chọn riêng từng sản phẩm." : "NCC chưa có quyền chia sẻ giá còn hiệu lực; tích ô này không thay thế sự đồng ý của NCC."} Thay đổi chỉ có hiệu lực sau khi lưu.</p>
              {product && savedPrice && <div className={"mt-3 rounded-md px-3 py-2 text-xs " + (savedPrice.buyerPrice ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950")} role="status">
                <p className="font-semibold">Giá buyer · bản đã lưu: {savedPrice.buyerPrice ? savedPrice.buyerPrice : savedPrice.publicProduct ? "On request" : "Sản phẩm chưa công khai"}</p>
                {dirty && <p className="mt-1">Bạn đang sửa form; dòng trên vẫn là trạng thái đã lưu.</p>}
                {!savedPrice.buyerPrice && <>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{savedPrice.blockers.map((reason) => <li key={reason}>{reason}</li>)}
                    {!savedPrice.publicProduct && <li>Sản phẩm chưa đủ điều kiện công bố ở checklist phía trên (duyệt, danh mục, NCC, ảnh/catalogue hoặc buyer-ready).</li>}
                  </ul>
                  {savedPrice.blockers.some((reason) => reason.includes("NCC")) && <Link href={`/crm/suppliers/${supplier.id}/edit#price-sharing`} className="mt-2 inline-block font-semibold text-brand-700 underline">Kiểm tra quyền chia sẻ giá trong hồ sơ NCC →</Link>}
                </>}
              </div>}
            </div>
            <Field label="Incoterm">
              <select className="input" value={v("incoterm")} onChange={(e) => set("incoterm", e.target.value)}>
                {INCOTERMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
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
                <div className="flex justify-between gap-3"><dt className="text-ink-500">Giá trong form</dt><dd className="text-right font-semibold text-ink-800">{previewPrice}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-500">MOQ</dt><dd className="text-right font-semibold text-ink-800">{v("moq").trim() || "On request"}</dd></div>
              </dl>
            </div>
          </div>
          <p className="mt-3 max-w-md text-xs leading-5 text-ink-500">Đây là preview nội dung đang nhập, không phải trạng thái đã đăng. Ảnh đại diện và điều kiện hiển thị giá thực tế vẫn theo dữ liệu đã lưu.</p>
        </div>
      </details>
    </form>
  );
}
