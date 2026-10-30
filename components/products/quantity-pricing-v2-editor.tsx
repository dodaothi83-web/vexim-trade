"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { validateSupplierQuantityEntry, type SupplierQuantityEntry, type SupplierQuantityUnit } from "@/lib/products/quantity-entry";
import { formatQuantityInput, normalizePriceInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { v2FormatAmount, v2PriceLabel, v2QuantityLabel } from "@/lib/products/quantity-revision-v2";

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];
const CUSTOM = "__custom_grade__";

type Props = {
  value: SupplierQuantityEntry;
  onChange: (value: SupplierQuantityEntry) => void;
  standardGrades: readonly string[];
  policy: QuantityPricingPolicy;
  pricePubliclyVisible: boolean;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  showErrors?: boolean;
  disabled?: boolean;
  /** Controls are detached when used inside the larger product form. */
  isolated?: boolean;
  /** Form bố cục năm phần đặt grade trong phần Thuộc tính. */
  showGrade?: boolean;
  /** The shared supplier form keeps grade-price outliers for staff review only. */
  showWarnings?: boolean;
  /** The owning product form supplies the location field. */
  incotermPlace?: ReactNode;
  /** A surrounding form may place these controls in separate rows. */
  showIncoterm?: boolean;
  showConsent?: boolean;
  /** Compact tier grid for the five-section product form. */
  productFormLayout?: boolean;
};

/** Group the integer part while preserving decimal kg/MT quantities and pasted errors. */
export function formatV2QuantityInput(raw: string, previous = ""): string {
  const parts = raw.split(".");
  if (parts.length > 2 || !/^\d*$/.test(parts[1] ?? "")) return raw;
  const previousInteger = previous.split(".")[0];
  const integer = formatQuantityInput(parts[0], previousInteger);
  return parts.length === 2 ? `${integer}.${parts[1]}` : integer;
}

/** The same controlled grade input can be placed in the attributes section. */
export function QuantityGradeV2Field({ value, onChange, standardGrades, policy, showErrors = false, disabled = false, isolated = false, showLabel = true }: Pick<Props, "value" | "onChange" | "standardGrades" | "policy" | "showErrors" | "disabled" | "isolated"> & { showLabel?: boolean }) {
  const errors = showErrors ? validateSupplierQuantityEntry(value, standardGrades, policy).errors.filter((issue) => issue.code === "grade") : [];
  const form = isolated ? "quantity-pricing-separate" : undefined;
  return <div className="space-y-3">
    <label className="block text-sm font-semibold text-ink-800">{showLabel && <>Grade <span className="text-rose-700">*</span></>}
      <select form={form} className="input mt-1 w-full" aria-label="Grade" aria-invalid={!!errors.length || undefined} disabled={disabled}
        value={value.customGrade ? CUSTOM : value.grade} onChange={(event) => onChange({ ...value, customGrade: event.target.value === CUSTOM, grade: event.target.value === CUSTOM ? "" : event.target.value })}>
        <option value="">Chọn grade</option>{standardGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}<option value={CUSTOM}>Khác (tự nhập)</option>
      </select>
      {errors.map((issue) => <span key={issue.code} className="mt-1 block text-xs text-rose-700">{issue.message}</span>)}
    </label>
    {value.customGrade && <label className="block text-sm font-semibold text-ink-800">Grade khác <span className="text-rose-700">*</span>
      <input form={form} className="input mt-1 w-full" aria-label="Grade khác" maxLength={80} disabled={disabled} value={value.grade} onChange={(event) => onChange({ ...value, grade: event.target.value })} />
      <span className="mt-1 block text-xs font-normal text-ink-600">Grade tự nhập không thuộc bộ lọc grade chuẩn.</span>
    </label>}
  </div>;
}

export function QuantityIncotermV2Field({ value, onChange, standardGrades, policy, disabled = false, isolated = false, showErrors = false, showLabel = true, invalid = false }: Pick<Props, "value" | "onChange" | "standardGrades" | "policy" | "disabled" | "isolated" | "showErrors"> & { showLabel?: boolean; invalid?: boolean }) {
  const errors = showErrors ? validateSupplierQuantityEntry(value, standardGrades, policy).errors.filter((issue) => issue.code === "incoterm") : [];
  return <label className="block text-sm font-semibold text-ink-800">{showLabel && <>Incoterm <span className="text-rose-700">*</span></>}
    <select form={isolated ? "quantity-pricing-separate" : undefined} className={`input w-full ${showLabel ? "mt-1" : ""}`} aria-label="Incoterm"
      aria-invalid={invalid || !!errors.length || undefined} disabled={disabled} value={value.incoterm} onChange={(event) => onChange({ ...value, incoterm: event.target.value })}>
      <option value="">Chọn Incoterm</option>{INCOTERMS.map((term) => <option key={term} value={term}>{term}</option>)}
    </select>
    {errors.map((issue) => <span key={issue.code} className="mt-1 block text-xs text-rose-700">{issue.message}</span>)}
  </label>;
}

export function QuantityPriceV2Consent({ visible, checked, onChange, disabled = false, isolated = false }: {
  visible: boolean; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; isolated?: boolean;
}) {
  if (!visible) return null;
  return <div className="space-y-3">
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Giá này là thông tin tham khảo do bạn cung cấp. Vexim có thể yêu cầu xác nhận lại khi xử lý báo giá theo <Link href="/quy-che-hoat-dong" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Quy chế hoạt động</Link>.</p>
    <label className="flex items-start gap-2 text-xs font-medium text-ink-800"><input form={isolated ? "quantity-pricing-separate" : undefined} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 accent-brand-700" /><span>Tôi xác nhận giá trên là giá tôi sẵn sàng báo cho buyer với đúng grade, Incoterm và số lượng đã ghi. <span className="text-rose-700">*</span></span></label>
  </div>;
}

/** Reusable controlled quantity editor. Server validates the same input again. */
export function QuantityPricingV2Editor({ value, onChange, standardGrades, policy, pricePubliclyVisible,
  consentChecked, onConsentChange, showErrors = false, disabled = false, isolated = false, showGrade = true, showWarnings = false, incotermPlace, showIncoterm = true, showConsent = true, productFormLayout = false }: Props) {
  const [pendingUnit, setPendingUnit] = useState<SupplierQuantityUnit | null>(null);
  const errorPrefix = useId();
  const validation = validateSupplierQuantityEntry(value, standardGrades, policy);
  const form = isolated ? "quantity-pricing-separate" : undefined;
  const unit = value.unit === "mt" ? "tấn" : "kg";
  const issues = (code: string, tierIndex?: number) => showErrors ? validation.errors.filter((item) => item.code === code && item.tierIndex === tierIndex) : [];
  const changeTier = (index: number, field: "quantity" | "price", text: string) => {
    onChange({ ...value, tiers: value.tiers.map((tier, i) => i === index ? { ...tier, [field]: text } : tier) });
  };
  function changeUnit(next: SupplierQuantityUnit) {
    if (next === value.unit) { setPendingUnit(null); return; }
    // A change of unit changes both quantity and price. Ask inline, never silently reinterpret numbers.
    if (value.tiers.some((tier) => tier.quantity.trim() || tier.price.trim())) { setPendingUnit(next); return; }
    setPendingUnit(null);
    onChange({ ...value, unit: next });
  }
  return <section className="space-y-3" aria-label="Bảng giá theo số lượng">
    {showGrade && <QuantityGradeV2Field value={value} onChange={onChange} standardGrades={standardGrades} policy={policy} showErrors={showErrors} disabled={disabled} isolated={isolated} />}
    {showIncoterm && <div className="grid gap-3 sm:grid-cols-2">
      <QuantityIncotermV2Field value={value} onChange={onChange} standardGrades={standardGrades} policy={policy} disabled={disabled} isolated={isolated} showErrors={showErrors} />
      {incotermPlace}
    </div>}
    <div className={productFormLayout ? "overflow-x-auto rounded-lg border border-ink-200" : "overflow-x-auto"}><table className="w-full min-w-[370px] text-left text-sm">
      <thead className={productFormLayout ? "bg-ink-50" : undefined}><tr className="text-xs text-ink-600"><th className="p-2">Số lượng đặt theo {" "}
        <select form={form} aria-label="Đơn vị số lượng" className="input inline-block w-auto" disabled={disabled} value={value.unit} onChange={(event) => changeUnit(event.target.value as SupplierQuantityUnit)}>
          <option value="kg">kg</option><option value="mt">tấn</option>
        </select></th><th className="p-2">Đơn giá (USD/{unit})</th><th className="relative p-2"><span className="sr-only">Xóa mức</span></th></tr></thead>
      <tbody>{value.tiers.map((tier, index) => {
        const quantityErrors = [...issues("quantity", index), ...issues("quantity_order", index)];
        const priceErrors = [...issues("price", index), ...issues("price_order", index)];
        const normalized = validation.value?.tiers[index];
        const next = validation.value?.tiers[index + 1];
        const rangeEnd = next ? (next.quantityGrams - 1) / normalized!.unitWeightGrams : null;
        return <tr key={index} className="border-t border-ink-100">
          <td className="p-1 align-top"><div className={productFormLayout ? "relative" : "flex items-center gap-1"}><span aria-hidden="true" className={productFormLayout ? "pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-500" : undefined}>≥</span><input form={form} type="text" inputMode="decimal" aria-label={`Số lượng mức ${index + 1} (${unit})`} aria-invalid={!!quantityErrors.length || undefined} aria-describedby={quantityErrors.length ? `${errorPrefix}-quantity-${index}` : undefined}
            className={`input w-full text-right font-mono tabular-nums ${productFormLayout ? "pl-8 pr-12" : ""}`} disabled={disabled} value={tier.quantity} onChange={(event) => changeTier(index, "quantity", formatV2QuantityInput(event.target.value, tier.quantity))} />
            {productFormLayout && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">{unit}</span>}</div>
            {quantityErrors.length > 0 && <div id={`${errorPrefix}-quantity-${index}`}>{quantityErrors.map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}</div>}
            {normalized && !productFormLayout && <p className="mt-1 text-xs text-ink-500">{rangeEnd === null ? "Trở lên" : `Đến ${v2FormatAmount(rangeEnd)} ${unit}`}</p>}
          </td>
          <td className="p-1 align-top"><div className={productFormLayout ? "relative" : undefined}>
            {productFormLayout && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-ink-500">US$</span>}
            <input form={form} type="text" inputMode="decimal" aria-label={`Đơn giá mức ${index + 1} (USD/${unit})`} aria-invalid={!!priceErrors.length || undefined} aria-describedby={priceErrors.length ? `${errorPrefix}-price-${index}` : undefined}
              className={`input w-full text-right font-mono tabular-nums ${productFormLayout ? "pl-11 pr-12" : ""}`} disabled={disabled} value={tier.price} onChange={(event) => changeTier(index, "price", event.target.value)} onBlur={(event) => changeTier(index, "price", normalizePriceInput(event.target.value))} />
            {productFormLayout && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">/{unit}</span>}</div>
            {priceErrors.length > 0 && <div id={`${errorPrefix}-price-${index}`}>{priceErrors.map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}</div>}
          </td>
          <td className="p-1">{value.tiers.length > 1 && <button type="button" disabled={disabled} className={productFormLayout ? "grid size-10 place-items-center rounded-lg border border-ink-200 text-lg text-ink-600" : "text-xs text-rose-700"} aria-label={`Xóa mức giá ${index + 1}`} onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })}>{productFormLayout ? "×" : "Xóa"}</button>}</td>
        </tr>;
      })}</tbody>
    </table>
      {productFormLayout && value.tiers.length < Math.min(policy.maxTiers, 4) && <button type="button" disabled={disabled}
        onClick={() => onChange({ ...value, tiers: [...value.tiers, { quantity: "", price: "" }] })}
        className="min-h-10 w-full border-t border-ink-200 px-3 text-left text-sm font-semibold text-brand-700">+ Thêm mức giá</button>}
    </div>
    {pendingUnit && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <p>Đổi đơn vị sẽ xóa các mức số lượng và giá đang nhập. Bạn có muốn tiếp tục?</p>
      <div className="mt-2 flex gap-3">
        <button type="button" disabled={disabled} className="font-semibold text-brand-700" onClick={() => { onChange({ ...value, unit: pendingUnit, tiers: value.tiers.map(() => ({ quantity: "", price: "" })) }); setPendingUnit(null); }}>Đổi đơn vị</button>
        <button type="button" className="font-semibold text-ink-700" onClick={() => setPendingUnit(null)}>Giữ đơn vị</button>
      </div>
    </div>}
    {productFormLayout && validation.value && pricePubliclyVisible && <p className="text-xs leading-5 text-ink-600">Buyer thấy: {validation.value.tiers.map((tier, index, tiers) => {
      const next = tiers[index + 1];
      const first = v2QuantityLabel(tier.quantityGrams, { ...validation.value!, tiers: [] });
      const last = next ? v2QuantityLabel(next.quantityGrams - 1, { ...validation.value!, tiers: [] }) : null;
      return `${first}${last ? ` đến ${last}` : " trở lên"}: ${v2PriceLabel(tier.priceCentsPerUnit, validation.value!.unit)}`;
    }).join("; ")}</p>}
    <p className="text-xs text-ink-600">Mức đầu tiên là số lượng tối thiểu (MOQ).</p>
    {!productFormLayout && value.tiers.length < Math.min(policy.maxTiers, 4) && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, tiers: [...value.tiers, { quantity: "", price: "" }] })} className="text-sm font-semibold text-brand-700">+ Thêm mức giá</button>}
    {showErrors && validation.errors.filter((issue) => issue.tierIndex === undefined && !["grade", "incoterm", "name_vi_grade"].includes(issue.code)).map((issue) => <p key={issue.code} role="alert" className="text-xs text-rose-700">{issue.message}</p>)}
    {showWarnings && validation.warnings.length > 0 && <p className="text-xs text-amber-800" role="status">Một số mức giá ngoài ngưỡng tham khảo của grade. Bạn vẫn có thể gửi để rà soát.</p>}
    {showConsent && <QuantityPriceV2Consent visible={pricePubliclyVisible} checked={consentChecked} onChange={onConsentChange} disabled={disabled} isolated={isolated} />}
  </section>;
}

/** Preview of the unsent form, not the approved public offer. */
export function QuantityBuyerV2Preview({ value, standardGrades, policy, pricePubliclyVisible, englishName = "", incotermPlace = "", showHeading = true, namePendingText = "Tên tiếng Anh do Vexim dịch khi duyệt" }: {
  value: SupplierQuantityEntry; standardGrades: readonly string[]; policy: QuantityPricingPolicy;
  pricePubliclyVisible: boolean; englishName?: string; incotermPlace?: string; showHeading?: boolean; namePendingText?: string;
}) {
  const valid = validateSupplierQuantityEntry(value, standardGrades, policy).value;
  const first = valid?.tiers[0];
  const last = valid?.tiers.at(-1);
  const unitLabel = value.unit === "mt" ? "MT" : "kg";
  const amount = (cents: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  const price = first && last && pricePubliclyVisible
    ? `USD ${amount(last.priceCentsPerUnit)}${first.priceCentsPerUnit !== last.priceCentsPerUnit ? `–${amount(first.priceCentsPerUnit)}` : ""}/${unitLabel}`
    : "Price on request";
  return <div className="space-y-1.5">
    {showHeading && <p className="text-sm font-bold text-ink-900">Buyer sẽ thấy</p>}
    <p className="text-sm font-semibold text-ink-900">{englishName || value.nameVi || "Tên sản phẩm"}</p>
    {!englishName && <p className="text-xs text-ink-600">{namePendingText}</p>}
    {value.grade.trim() && <p><span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{value.grade.trim()}</span></p>}
    <p className="text-base font-semibold tabular-nums text-brand-800">{price}{first && valid && pricePubliclyVisible && valid.tiers.length > 1 && <span className="ml-2 text-xs font-normal text-ink-600">Volume pricing</span>}</p>
    <p className="text-xs text-ink-600">MOQ: {first && valid ? v2QuantityLabel(first.quantityGrams, { ...valid, tiers: [] }) : "On request"}</p>
    {value.incoterm && <p className="text-xs text-ink-600">{value.incoterm}{incotermPlace.trim() ? ` ${incotermPlace.trim()}` : ""}</p>}
    {first && valid && pricePubliclyVisible && <ul className="space-y-1 text-xs text-ink-600">
      {valid.tiers.map((tier, index) => <li key={index}>
        ≥ {v2QuantityLabel(tier.quantityGrams, { ...valid, tiers: [] })}: {v2PriceLabel(tier.priceCentsPerUnit, valid.unit)}
      </li>)}
    </ul>}
  </div>;
}
