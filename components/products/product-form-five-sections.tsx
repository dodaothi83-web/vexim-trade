"use client";

import { useCallback, type ReactNode } from "react";
import { CheckCircle2, Circle, ImageIcon } from "lucide-react";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { QuantityBuyerV2Preview, QuantityGradeV2Field, QuantityPricingV2Editor } from "@/components/products/quantity-pricing-v2-editor";
import { RawMaterialRegionInput } from "@/components/raw-material-region-input";
import { SupplierAttributeInputs } from "@/components/supplier-attribute-inputs";
import { fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";
import { nonGradeProductFields, standardGradesForCategory } from "@/lib/products/grade-pricing";
import { validateProductFormSubmission, type ProductFormDraft, type ProductFormSection } from "@/lib/products/product-form-model";
import { DEFAULT_QUANTITY_PRICING_POLICY, formatQuantityInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { SupplierQuantityEntry } from "@/lib/products/quantity-entry";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

const SECTIONS: { id: ProductFormSection; title: string; optional?: boolean }[] = [
  { id: "basic", title: "Thông tin cơ bản" },
  { id: "attributes", title: "Thuộc tính" },
  { id: "transaction", title: "Giao dịch" },
  { id: "packaging", title: "Bao bì và năng lực", optional: true },
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
  saveLabel?: string;
  statusText?: string;
};

/** Presentation shared by supplier and CRM. Persistence and permissions belong to the caller. */
export function ProductFormFiveSections({ value, onChange, categories, policies, imageCount, coverUrl, imageControls,
  onSave, onSubmit, disabled = false, busy = false, canSubmit = true, saveLabel = "Lưu nháp", statusText = "Chưa gửi duyệt" }: Props) {
  const category = categories.find((item) => item.slug === value.category);
  const grades = standardGradesForCategory(category ?? (value.category ? { slug: value.category } : null));
  const policy = category ? policies[category.slug] ?? null : null;
  const editorPolicy = policy ?? DEFAULT_QUANTITY_PRICING_POLICY;
  const quantity: SupplierQuantityEntry = { grade: value.grade, customGrade: value.customGrade, incoterm: value.incoterm,
    nameVi: value.name, unit: value.unit, tiers: value.tiers };
  const checked = validateProductFormSubmission(value, { categoryValid: !!category, imageCount, standardGrades: grades, policy });
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
  const problem = (field: string) => checked.errors.find((item) => item.field === field)?.message;
  const categoryLabel = category?.label ?? "Chưa chọn danh mục";
  const complete = (section: ProductFormSection) => !checked.errors.some((item) => item.section === section);
  const ready = checked.errors.length === 0 && canSubmit;

  return <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 space-y-4">
      <Section id="basic" title="Thông tin cơ bản" number={1}>
        <Field label="Tên sản phẩm" required hint="Không ghi grade trong tên. Vexim dịch sang tiếng Anh khi duyệt." error={problem("name")}>
          <input className="input w-full" aria-label="Tên sản phẩm" aria-invalid={!!problem("name") || undefined} maxLength={180} value={value.name} disabled={locked} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Danh mục" required error={problem("category")}>
          <select className="input w-full" aria-label="Danh mục" aria-invalid={!!problem("category") || undefined} value={value.category} disabled={locked} onChange={(event) => onChange({ ...value, category: event.target.value, grade: "", customGrade: false, attributes: {}, attributePool: "", priceConsent: false })}>
            <option value="">Chọn danh mục sản phẩm</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.group ? `${item.group} / ` : ""}{item.label}</option>)}
          </select>
        </Field>
        <Field label="Hình ảnh" required hint="Tải 1 đến 8 ảnh. Ảnh đầu tiên là ảnh chính." error={problem("images")}>
          {imageControls}
        </Field>
      </Section>

      <Section id="attributes" title="Thuộc tính" number={2}>
        <Field label="Grade" required error={problem("grade")}>
          <QuantityGradeV2Field value={quantity} onChange={setQuantity} standardGrades={grades} policy={editorPolicy} disabled={locked} showLabel={false} />
        </Field>
        {category && <SupplierAttributeInputs key={category.slug} officialFields={nonGradeProductFields(fieldsFor(category))}
          supplierFields={nonGradeProductFields(supplierFieldsFor(category))} values={value.attributes} disabled={locked} onCommit={onAttributesCommit} />}
        <Field label="Quy cách / tiêu chuẩn" hint="Nhập quy cách hoặc mô tả ngắn để gửi duyệt.">
          <textarea className="input min-h-24 w-full" aria-label="Quy cách / tiêu chuẩn" maxLength={800} value={value.spec} disabled={locked} onChange={(event) => set("spec", event.target.value)} />
        </Field>
        <Field label="Vùng nguyên liệu"><RawMaterialRegionInput value={value.rawMaterialRegion} disabled={locked} onChange={(event) => set("rawMaterialRegion", event.target.value)} /></Field>
        <Field label="Xuất xứ nguyên liệu đầu vào"><input className="input w-full" aria-label="Xuất xứ nguyên liệu đầu vào" maxLength={300} value={value.inputMaterialOrigin} disabled={locked} onChange={(event) => set("inputMaterialOrigin", event.target.value)} /></Field>
      </Section>

      <Section id="transaction" title="Giao dịch" number={3}>
        {!policy && <p role="status" className="text-sm text-amber-800">Chọn danh mục có cấu hình giá để hoàn thiện bảng giá.</p>}
        <Field label="Giá theo số lượng" required>
          <QuantityPricingV2Editor value={quantity} onChange={setQuantity} standardGrades={grades} policy={editorPolicy}
            pricePubliclyVisible={value.pricePubliclyVisible} consentChecked={value.priceConsent} onConsentChange={(next) => set("priceConsent", next)}
            disabled={locked} showGrade={false} showErrors showWarnings={false} incotermPlace={<label className="block text-sm font-semibold text-ink-800">Địa điểm Incoterm <span className="text-rose-700">*</span>
              <input className="input mt-1 w-full" aria-label="Địa điểm Incoterm" aria-invalid={!!problem("incotermPlace") || undefined} maxLength={100} value={value.incotermPlace} disabled={locked}
                onChange={(event) => onChange({ ...value, incotermPlace: event.target.value, priceConsent: false })} />
              {problem("incotermPlace") && <span className="mt-1 block text-xs font-normal text-rose-700">{problem("incotermPlace")}</span>}
            </label>} />
          {problem("priceConsent") && <p className="mt-1 text-xs text-rose-700">{problem("priceConsent")}</p>}
        </Field>
        <label className="flex items-start gap-2 text-sm font-semibold text-ink-800"><input type="checkbox" className="mt-1 size-4 accent-brand-700" checked={value.pricePubliclyVisible} disabled={locked}
          onChange={(event) => onChange({ ...value, pricePubliclyVisible: event.target.checked, priceConsent: false })} />Công khai giá tham khảo</label>
        <Field label="Điều kiện thanh toán"><input className="input w-full" aria-label="Điều kiện thanh toán" maxLength={200} value={value.paymentTerms} disabled={locked} onChange={(event) => set("paymentTerms", event.target.value)} /></Field>
        <div className="flex flex-wrap gap-4 text-sm text-ink-800">
          {([['oem', 'OEM'], ['odm', 'ODM'], ['samples', 'Có mẫu']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={value[key]} disabled={locked} className="size-4 accent-brand-700" onChange={(event) => set(key, event.target.checked)} />{label}</label>)}
        </div>
      </Section>

      <Section id="packaging" title="Bao bì và năng lực" number={4} optional>
        <Field label="Bao bì / đóng gói"><input className="input w-full" aria-label="Bao bì / đóng gói" maxLength={300} value={value.packaging} disabled={locked} onChange={(event) => set("packaging", event.target.value)} /></Field>
        <Field label="Cảng xuất"><input className="input w-full" aria-label="Cảng xuất" maxLength={120} value={value.exportPort} disabled={locked} onChange={(event) => set("exportPort", event.target.value)} /></Field>
        <Field label="Thời gian giao hàng" hint="Số ngày" error={problem("leadTimeDays")}><input className="input w-full text-right tabular-nums" type="text" inputMode="numeric" aria-label="Thời gian giao hàng (ngày)" maxLength={5} value={value.leadTimeDays} disabled={locked} onChange={(event) => set("leadTimeDays", event.target.value)} /></Field>
        <Field label="Năng lực mỗi tháng" hint="kg / tháng" error={problem("monthlyCapacityKg")}><input className="input w-full text-right tabular-nums" type="text" inputMode="numeric" aria-label="Năng lực mỗi tháng (kg)" maxLength={32} value={value.monthlyCapacityKg} disabled={locked} onChange={(event) => set("monthlyCapacityKg", formatQuantityInput(event.target.value, value.monthlyCapacityKg))} /></Field>
      </Section>

      <Section id="description" title="Mô tả sản phẩm" number={5}>
        <Field label="Mô tả ngắn" hint="Cần ít nhất mô tả ngắn hoặc quy cách để gửi duyệt." error={problem("description")}><textarea className="input min-h-24 w-full" aria-label="Mô tả ngắn" maxLength={1500} value={value.description} disabled={locked} onChange={(event) => set("description", event.target.value)} /></Field>
        <Field label="Mô tả chi tiết"><ProductDescriptionEditor value={value.descriptionDetail} disabled={locked} onChange={(html) => set("descriptionDetail", html)} /></Field>
      </Section>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-lg">
        <span className="text-xs text-ink-600" role="status">{statusText}</span>
        <div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={onSave} disabled={locked}>{saveLabel}</button>
          <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={locked || !ready}>Gửi duyệt</button></div>
      </div>
    </div>
    <aside className="space-y-4 lg:sticky lg:top-6">
      <nav aria-label="Các phần sản phẩm" className="rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-bold text-ink-900">Hoàn thiện sản phẩm</h2>
        <ol className="space-y-1">{SECTIONS.map((section) => <li key={section.id}><a href={`#product-form-${section.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink-700 hover:bg-ink-50">
          {complete(section.id) ? <CheckCircle2 className="size-4 text-brand-700" aria-hidden="true" /> : <Circle className="size-4 text-ink-400" aria-hidden="true" />}
          <span className="flex-1">{section.title}</span><span className="text-xs text-ink-500">{section.optional ? "Không bắt buộc" : complete(section.id) ? "Đã đủ" : "Cần bổ sung"}</span>
        </a></li>)}</ol>
      </nav>
      <section aria-label="Xem trước cho buyer" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="aspect-[4/3] bg-ink-50">{coverUrl ? <img src={coverUrl} alt="Ảnh chính sản phẩm" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-8" aria-hidden="true" /></div>}</div>
        <div className="space-y-2 p-4"><p className="text-xs font-bold text-brand-700">{categoryLabel}</p>
          <QuantityBuyerV2Preview value={quantity} standardGrades={grades} policy={editorPolicy} pricePubliclyVisible={value.pricePubliclyVisible} />
        </div>
      </section>
    </aside>
  </div>;
}

function Section({ id, title, number, optional, children }: { id: ProductFormSection; title: string; number: number; optional?: boolean; children: ReactNode }) {
  return <section id={`product-form-${id}`} className="scroll-mt-6 rounded-xl border border-ink-200 bg-white shadow-sm">
    <h2 className="border-b border-ink-100 px-4 py-3 text-base font-bold text-ink-900">{number}. {title}{optional && <span className="ml-2 text-xs font-normal text-ink-500">Không bắt buộc</span>}</h2>
    <div className="space-y-4 p-4 sm:p-5">{children}</div>
  </section>;
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
    <div><p className="text-sm font-semibold text-ink-800">{label}{required && <span className="text-rose-700"> *</span>}</p>{hint && <p className="mt-1 text-xs leading-5 text-ink-500">{hint}</p>}</div>
    <div className="min-w-0">{children}{error && <p className="mt-1 text-xs text-rose-700">{error}</p>}</div>
  </div>;
}
