"use client";

import { useCallback, type ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { QuantityBuyerV2Preview, QuantityGradeV2Field, QuantityIncotermV2Field, QuantityPriceV2Consent, QuantityPricingV2Editor } from "@/components/products/quantity-pricing-v2-editor";
import { RawMaterialRegionInput } from "@/components/raw-material-region-input";
import { SupplierAttributeInputs } from "@/components/supplier-attribute-inputs";
import { fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";
import { nonGradeProductFields, standardGradesForCategory } from "@/lib/products/grade-pricing";
import { validateProductFormSubmission, type ProductFormDraft, type ProductFormIssue, type ProductFormSection } from "@/lib/products/product-form-model";
import { DEFAULT_QUANTITY_PRICING_POLICY, formatQuantityInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { SupplierQuantityEntry } from "@/lib/products/quantity-entry";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

const SECTIONS: { id: ProductFormSection; title: string; optional?: boolean }[] = [
  { id: "basic", title: "Thông tin cơ bản" },
  { id: "attributes", title: "Thuộc tính sản phẩm" },
  { id: "transaction", title: "Thông tin giao dịch" },
  { id: "packaging", title: "Đóng gói và giao hàng", optional: true },
  { id: "description", title: "Mô tả sản phẩm" },
];

type Props = {
  value: ProductFormDraft;
  onChange: (draft: ProductFormDraft) => void;
  categories: CategoryProposalOption[];
  policies: Record<string, QuantityPricingPolicy>;
  imageCount: number;
  coverUrl?: string | null;
  /** The owner supplies the same authorized image uploader for create and edit. */
  imageControls: ReactNode;
  onSave: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  canSubmit?: boolean;
  serverErrors?: ProductFormIssue[];
  saveLabel?: string;
  statusText?: string;
};

/** Presentation shared by supplier and CRM. Persistence and permissions belong to the caller. */
export function ProductFormFiveSections({ value, onChange, categories, policies, imageCount, coverUrl, imageControls,
  onSave, onSubmit, disabled = false, busy = false, canSubmit = true, serverErrors = [], saveLabel = "Lưu nháp", statusText = "Chưa gửi duyệt" }: Props) {
  const category = categories.find((item) => item.slug === value.category);
  const grades = standardGradesForCategory(category ?? (value.category ? { slug: value.category } : null));
  const policy = category ? policies[category.slug] ?? null : null;
  const editorPolicy = policy ?? DEFAULT_QUANTITY_PRICING_POLICY;
  const quantity: SupplierQuantityEntry = { grade: value.grade, customGrade: value.customGrade, incoterm: value.incoterm,
    nameVi: value.name, unit: value.unit, tiers: value.tiers };
  const checked = validateProductFormSubmission(value, { categoryValid: !!category, imageCount, standardGrades: grades, policy });
  const allErrors = [...checked.errors, ...serverErrors];
  const locked = disabled || busy;
  function set<K extends keyof ProductFormDraft>(key: K, next: ProductFormDraft[K]) { onChange({ ...value, [key]: next }); }
  function setQuantity(next: SupplierQuantityEntry) {
    const priceChanged = next.grade !== value.grade || next.customGrade !== value.customGrade || next.incoterm !== value.incoterm ||
      next.unit !== value.unit || JSON.stringify(next.tiers) !== JSON.stringify(value.tiers);
    onChange({ ...value, grade: next.grade, customGrade: next.customGrade, incoterm: next.incoterm, unit: next.unit,
      tiers: next.tiers, priceConsent: priceChanged ? false : value.priceConsent });
  }
  const onAttributesCommit = useCallback((pool: string, attributes: Record<string, string>) => {
    if (pool === value.attributePool && JSON.stringify(attributes) === JSON.stringify(value.attributes)) return;
    onChange({ ...value, attributePool: pool, attributes });
  }, [onChange, value]);
  const problem = (field: string) => allErrors.find((item) => item.field === field)?.message;
  const categoryLabel = category?.label ?? "Chưa chọn danh mục";
  const complete = (section: ProductFormSection) => !allErrors.some((item) => item.section === section);
  const ready = allErrors.length === 0 && canSubmit;
  const incompleteCount = SECTIONS.filter((section) => !complete(section.id)).length;

  return <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-4">
      <Section id="basic" title="Thông tin cơ bản">
        <Field label="Tên sản phẩm" required hint="Không ghi grade trong tên. Vexim dịch sang tiếng Anh khi duyệt." error={problem("name")}>
          <input className="input w-full" aria-label="Tên sản phẩm" aria-invalid={!!problem("name") || undefined} maxLength={180} value={value.name} disabled={locked} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Danh mục" required error={problem("category")}>
          <select className="input w-full" aria-label="Danh mục" aria-invalid={!!problem("category") || undefined} value={value.category} disabled={locked} onChange={(event) => onChange({ ...value, category: event.target.value, grade: "", customGrade: false, attributes: {}, attributePool: "", priceConsent: false })}>
            <option value="">Chọn danh mục sản phẩm</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.group ? `${item.group} / ` : ""}{item.label}</option>)}
          </select>
        </Field>
        <Field label="Ảnh sản phẩm" required hint="Ảnh đầu tiên là ảnh chính." hintByLabel error={problem("images")}>
          {imageControls}
        </Field>
      </Section>

      <Section id="attributes" title="Thuộc tính sản phẩm" subtitle="Buyer dùng các thông tin này để lọc và so sánh.">
        <Field label="Grade" required error={problem("grade")}>
          <QuantityGradeV2Field value={quantity} onChange={setQuantity} standardGrades={grades} policy={editorPolicy} disabled={locked} showLabel={false} />
        </Field>
        {category && <SupplierAttributeInputs key={category.slug} officialFields={nonGradeProductFields(fieldsFor(category))}
          supplierFields={nonGradeProductFields(supplierFieldsFor(category))} values={value.attributes} disabled={locked} onCommit={onAttributesCommit} />}
        {problem("attributes") && <p role="alert" className="text-xs text-rose-700">{problem("attributes")}</p>}
        <Field label="Quy cách / tiêu chuẩn" hint="Nhập quy cách hoặc mô tả ngắn để gửi duyệt.">
          <textarea className="input min-h-24 w-full" aria-label="Quy cách / tiêu chuẩn" maxLength={800} value={value.spec} disabled={locked} onChange={(event) => set("spec", event.target.value)} />
        </Field>
        <Field label="Vùng nguyên liệu"><RawMaterialRegionInput value={value.rawMaterialRegion} disabled={locked} onChange={(event) => set("rawMaterialRegion", event.target.value)} /></Field>
        <Field label="Xuất xứ nguyên liệu đầu vào"><input className="input w-full" aria-label="Xuất xứ nguyên liệu đầu vào" maxLength={300} value={value.inputMaterialOrigin} disabled={locked} onChange={(event) => set("inputMaterialOrigin", event.target.value)} /></Field>
      </Section>

      <Section id="transaction" title="Thông tin giao dịch">
        {!policy && <p role="status" className="text-sm text-amber-800">Chọn danh mục có cấu hình giá để hoàn thiện bảng giá.</p>}
        <Field label="Incoterm" required error={problem("incoterm")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuantityIncotermV2Field value={quantity} onChange={setQuantity} standardGrades={grades} policy={editorPolicy} disabled={locked} showLabel={false} invalid={!!problem("incoterm")} />
            <div><input className="input w-full" aria-label="Địa điểm Incoterm" aria-invalid={!!problem("incotermPlace") || undefined} placeholder="Địa điểm Incoterm" maxLength={100} value={value.incotermPlace} disabled={locked}
              onChange={(event) => onChange({ ...value, incotermPlace: event.target.value, priceConsent: false })} />
              {problem("incotermPlace") && <p className="mt-1 text-xs text-rose-700">{problem("incotermPlace")}</p>}</div>
          </div>
        </Field>
        <Field label="Giá theo số lượng" required hint="Tối đa 4 mức" hintByLabel>
          <QuantityPricingV2Editor value={quantity} onChange={setQuantity} standardGrades={grades} policy={editorPolicy}
            pricePubliclyVisible={value.pricePubliclyVisible} consentChecked={value.priceConsent} onConsentChange={(next) => set("priceConsent", next)}
            disabled={locked} showGrade={false} showIncoterm={false} showConsent={false} showErrors showWarnings={false} />
          {serverErrors.filter((issue) => issue.field === "tiers" &&
            !checked.errors.some((current) => current.code === issue.code && current.tierIndex === issue.tierIndex))
            .map((issue, index) => <p key={`${issue.code}-${issue.tierIndex ?? "all"}-${index}`} role="alert" className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
        </Field>
        <Field label="Hiện giá">
          <label className="flex items-start gap-2 text-sm font-semibold text-ink-800"><input type="checkbox" className="mt-1 size-4 accent-brand-700" checked={value.pricePubliclyVisible} disabled={locked}
            onChange={(event) => onChange({ ...value, pricePubliclyVisible: event.target.checked, priceConsent: false })} />Hiện giá cho buyer</label>
          <p className="mt-1 text-xs text-ink-600">Bỏ chọn nếu muốn buyer gửi yêu cầu báo giá trước.</p>
          <div className="mt-3"><QuantityPriceV2Consent visible={value.pricePubliclyVisible} checked={value.priceConsent} onChange={(next) => set("priceConsent", next)} disabled={locked} /></div>
          {problem("priceConsent") && <p className="mt-1 text-xs text-rose-700">{problem("priceConsent")}</p>}
        </Field>
        <Field label="Điều kiện thanh toán"><input className="input w-full" aria-label="Điều kiện thanh toán" maxLength={200} value={value.paymentTerms} disabled={locked} onChange={(event) => set("paymentTerms", event.target.value)} /></Field>
        <div className="flex flex-wrap gap-4 text-sm text-ink-800">
          {([['oem', 'OEM'], ['odm', 'ODM'], ['samples', 'Có mẫu']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={value[key]} disabled={locked} className="size-4 accent-brand-700" onChange={(event) => set(key, event.target.checked)} />{label}</label>)}
        </div>
      </Section>

      <Section id="packaging" title="Đóng gói và giao hàng">
        <Field label="Bao bì / đóng gói"><input className="input w-full" aria-label="Bao bì / đóng gói" maxLength={300} value={value.packaging} disabled={locked} onChange={(event) => set("packaging", event.target.value)} /></Field>
        <Field label="Cảng xuất"><input className="input w-full" aria-label="Cảng xuất" maxLength={120} value={value.exportPort} disabled={locked} onChange={(event) => set("exportPort", event.target.value)} /></Field>
        <Field label="Thời gian giao hàng" error={problem("leadTimeDays")}><div className="relative max-w-xs"><input className="input w-full pr-16 text-right font-mono tabular-nums" type="text" inputMode="numeric" aria-label="Thời gian giao hàng (ngày)" maxLength={5} value={value.leadTimeDays} disabled={locked} onChange={(event) => set("leadTimeDays", event.target.value)} /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-500">ngày</span></div></Field>
        <Field label="Năng lực cung cấp" error={problem("monthlyCapacityKg")}><div className="relative max-w-xs"><input className="input w-full pr-24 text-right font-mono tabular-nums" type="text" inputMode="numeric" aria-label="Năng lực mỗi tháng (kg)" maxLength={32} value={value.monthlyCapacityKg} disabled={locked} onChange={(event) => set("monthlyCapacityKg", formatQuantityInput(event.target.value, value.monthlyCapacityKg))} /><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-500">kg/tháng</span></div></Field>
      </Section>

      <Section id="description" title="Mô tả sản phẩm" subtitle="Cần có mô tả ngắn hoặc quy cách để gửi duyệt.">
        <Field label="Mô tả ngắn" hint="Cần ít nhất mô tả ngắn hoặc quy cách để gửi duyệt." error={problem("description")}><textarea className="input min-h-24 w-full" aria-label="Mô tả ngắn" maxLength={1500} value={value.description} disabled={locked} onChange={(event) => set("description", event.target.value)} /></Field>
        <Field label="Mô tả chi tiết"><ProductDescriptionEditor value={value.descriptionDetail} disabled={locked} onChange={(html) => set("descriptionDetail", html)} /></Field>
      </Section>
    </div>
    <aside className="space-y-4 lg:sticky lg:top-6">
      <nav aria-label="Các phần sản phẩm" className="rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-ink-900">Các phần</h2>
        <ol className="space-y-1">{SECTIONS.map((section) => <li key={section.id}><a href={`#product-form-${section.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm text-ink-800 hover:bg-ink-50">
          <span className="flex-1">{section.title}</span><span className={`text-xs font-semibold ${complete(section.id) ? "text-brand-700" : "text-rose-700"}`}>
            {!complete(section.id) ? "Cần bổ sung" : section.optional ? "Không bắt buộc" : "Đã xong"}
          </span>
        </a></li>)}</ol>
      </nav>
      <section aria-label="Xem trước cho buyer" className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-ink-900">Buyer sẽ thấy</h2>
        <div className="aspect-[4/3] overflow-hidden rounded-lg bg-ink-50">{coverUrl ? <img src={coverUrl} alt="Ảnh chính sản phẩm" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-8" aria-hidden="true" /></div>}</div>
        <div className="space-y-2 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{categoryLabel}</p>
          <QuantityBuyerV2Preview value={quantity} standardGrades={grades} policy={editorPolicy} pricePubliclyVisible={value.pricePubliclyVisible} incotermPlace={value.incotermPlace} showHeading={false} />
        </div>
      </section>
    </aside>
    <div className="sticky bottom-0 z-20 col-span-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-lg">
      <span className="text-xs text-ink-600" role="status">{statusText}{incompleteCount > 0 && `. Còn ${incompleteCount} phần cần bổ sung trước khi gửi duyệt.`}</span>
      <div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={onSave} disabled={locked}>{saveLabel}</button>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={locked || !ready}>Gửi duyệt</button></div>
    </div>
  </div>;
}

function Section({ id, title, subtitle, children }: { id: ProductFormSection; title: string; subtitle?: string; children: ReactNode }) {
  return <section id={`product-form-${id}`} className="scroll-mt-6 rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="border-b border-ink-100 px-4 py-3 sm:px-5"><h2 className="text-base font-bold text-ink-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}</div>
    <div className="space-y-4 p-4 sm:p-5">{children}</div>
  </section>;
}

function Field({ label, required, hint, hintByLabel, error, children }: { label: string; required?: boolean; hint?: string; hintByLabel?: boolean; error?: string; children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
    <div><p className="text-sm font-semibold text-ink-800">{label}{required && <span className="text-rose-700"> *</span>}</p>{hint && hintByLabel && <p className="mt-1 text-xs leading-5 text-ink-500">{hint}</p>}</div>
    <div className="min-w-0">{children}{hint && !hintByLabel && <p className="mt-1 text-xs leading-5 text-ink-500">{hint}</p>}{error && <p className="mt-1 text-xs text-rose-700">{error}</p>}</div>
  </div>;
}
