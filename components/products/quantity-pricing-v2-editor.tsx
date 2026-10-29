"use client";

import Link from "next/link";
import { validateSupplierQuantityEntry, type SupplierQuantityEntry, type SupplierQuantityUnit } from "@/lib/products/quantity-entry";
import { formatQuantityInput, normalizePriceInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { v2FormatAmount } from "@/lib/products/quantity-revision-v2";

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
};

/** Group the integer part while preserving decimal kg/MT quantities and pasted errors. */
export function formatV2QuantityInput(raw: string, previous = ""): string {
  const parts = raw.split(".");
  if (parts.length > 2 || !/^\d*$/.test(parts[1] ?? "")) return raw;
  const previousInteger = previous.split(".")[0];
  const integer = formatQuantityInput(parts[0], previousInteger);
  return parts.length === 2 ? `${integer}.${parts[1]}` : integer;
}

/** Reusable controlled quantity editor. Server validates the same input again. */
export function QuantityPricingV2Editor({ value, onChange, standardGrades, policy, pricePubliclyVisible,
  consentChecked, onConsentChange, showErrors = false, disabled = false, isolated = false }: Props) {
  const validation = validateSupplierQuantityEntry(value, standardGrades, policy);
  const form = isolated ? "quantity-pricing-separate" : undefined;
  const unit = value.unit === "mt" ? "tấn" : "kg";
  const issues = (code: string, tierIndex?: number) => showErrors ? validation.errors.filter((item) => item.code === code && item.tierIndex === tierIndex) : [];
  const changeTier = (index: number, field: "quantity" | "price", text: string) => {
    onChange({ ...value, tiers: value.tiers.map((tier, i) => i === index ? { ...tier, [field]: text } : tier) });
  };
  function changeUnit(next: SupplierQuantityUnit) {
    if (next === value.unit) return;
    const hasNumbers = value.tiers.some((tier) => tier.quantity.trim() || tier.price.trim());
    // A new unit changes both quantity and unit price. Do not silently reinterpret
    // or round any existing numbers when switching units.
    if (hasNumbers && !window.confirm("Đổi đơn vị sẽ xóa các mức số lượng và giá đang nhập. Bạn có muốn tiếp tục?")) return;
    onChange({ ...value, unit: next, tiers: value.tiers.map(() => ({ quantity: "", price: "" })) });
  }
  return <section className="space-y-3" aria-label="Bảng giá theo số lượng">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-ink-800">Grade <span className="text-rose-700">*</span>
        <select form={form} className="input mt-1 w-full" aria-label="Grade" aria-invalid={!!issues("grade").length || undefined} disabled={disabled}
          value={value.customGrade ? CUSTOM : value.grade} onChange={(event) => onChange({ ...value, customGrade: event.target.value === CUSTOM, grade: event.target.value === CUSTOM ? "" : event.target.value })}>
          <option value="">Chọn grade</option>{standardGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}<option value={CUSTOM}>Khác (tự nhập)</option>
        </select>
        {issues("grade").map((issue) => <span key={issue.code} className="mt-1 block text-xs text-rose-700">{issue.message}</span>)}
      </label>
      {value.customGrade && <label className="text-sm font-semibold text-ink-800">Grade khác <span className="text-rose-700">*</span>
        <input form={form} className="input mt-1 w-full" aria-label="Grade khác" maxLength={80} disabled={disabled} value={value.grade} onChange={(event) => onChange({ ...value, grade: event.target.value })} />
        <span className="mt-1 block text-xs font-normal text-ink-600">Grade tự nhập không thuộc bộ lọc grade chuẩn.</span>
      </label>}
      <label className="text-sm font-semibold text-ink-800">Incoterm <span className="text-rose-700">*</span>
        <select form={form} className="input mt-1 w-full" aria-label="Incoterm" aria-invalid={!!issues("incoterm").length || undefined} disabled={disabled} value={value.incoterm} onChange={(event) => onChange({ ...value, incoterm: event.target.value })}>
          <option value="">Chọn Incoterm</option>{INCOTERMS.map((term) => <option key={term} value={term}>{term}</option>)}
        </select>
        {issues("incoterm").map((issue) => <span key={issue.code} className="mt-1 block text-xs text-rose-700">{issue.message}</span>)}
      </label>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[370px] text-left text-sm">
      <thead><tr className="text-xs text-ink-600"><th className="p-2">Số lượng đặt theo {" "}
        <select form={form} aria-label="Đơn vị số lượng" className="input inline-block w-auto" disabled={disabled} value={value.unit} onChange={(event) => changeUnit(event.target.value as SupplierQuantityUnit)}>
          <option value="kg">kg</option><option value="mt">tấn</option>
        </select></th><th className="p-2">Đơn giá (USD/{unit})</th><th className="p-2"><span className="sr-only">Xóa mức</span></th></tr></thead>
      <tbody>{value.tiers.map((tier, index) => {
        const quantityErrors = [...issues("quantity", index), ...issues("quantity_order", index)];
        const priceErrors = [...issues("price", index), ...issues("price_order", index)];
        const normalized = validation.value?.tiers[index];
        const next = validation.value?.tiers[index + 1];
        const rangeEnd = next ? (next.quantityGrams - 1) / normalized!.unitWeightGrams : null;
        return <tr key={index} className="border-t border-ink-100">
          <td className="p-1 align-top"><div className="flex items-center gap-1"><span aria-hidden="true">≥</span><input form={form} type="text" inputMode="decimal" aria-label={`Số lượng mức ${index + 1} (${unit})`} aria-invalid={!!quantityErrors.length || undefined}
            className="input w-full text-right tabular-nums" disabled={disabled} value={tier.quantity} onChange={(event) => changeTier(index, "quantity", formatV2QuantityInput(event.target.value, tier.quantity))} /></div>
            {quantityErrors.map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
            {normalized && <p className="mt-1 text-xs text-ink-500">{rangeEnd === null ? "Trở lên" : `Đến ${v2FormatAmount(rangeEnd)} ${unit}`}</p>}
          </td>
          <td className="p-1 align-top"><input form={form} type="text" inputMode="decimal" aria-label={`Đơn giá mức ${index + 1} (USD/${unit})`} aria-invalid={!!priceErrors.length || undefined}
            className="input w-full text-right tabular-nums" disabled={disabled} value={tier.price} onChange={(event) => changeTier(index, "price", event.target.value)} onBlur={(event) => changeTier(index, "price", normalizePriceInput(event.target.value))} />
            {priceErrors.map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
          </td>
          <td className="p-1">{value.tiers.length > 1 && <button type="button" disabled={disabled} className="text-xs text-rose-700" aria-label={`Xóa mức giá ${index + 1}`} onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })}>Xóa</button>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="text-xs text-ink-600">Mức đầu tiên là số lượng tối thiểu (MOQ).</p>
    {value.tiers.length < Math.min(policy.maxTiers, 4) && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, tiers: [...value.tiers, { quantity: "", price: "" }] })} className="text-sm font-semibold text-brand-700">+ Thêm mức giá</button>}
    {showErrors && validation.errors.filter((issue) => issue.tierIndex === undefined && !["grade", "incoterm"].includes(issue.code)).map((issue) => <p key={issue.code} role="alert" className="text-xs text-rose-700">{issue.message}</p>)}
    {validation.warnings.length > 0 && <p className="text-xs text-amber-800" role="status">Một số mức giá ngoài ngưỡng tham khảo của grade. Bạn vẫn có thể gửi để rà soát.</p>}
    {pricePubliclyVisible && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Mọi báo giá bạn gửi qua Vexim đều được lưu và đối chiếu với giá đăng. Chênh lệch bất thường sẽ được Vexim rà soát theo <Link href="/quy-che-hoat-dong" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Quy chế hoạt động</Link>.</p>}
    {pricePubliclyVisible && <label className="flex items-start gap-2 text-xs font-medium text-ink-800"><input form={form} type="checkbox" checked={consentChecked} disabled={disabled} onChange={(event) => onConsentChange(event.target.checked)} className="mt-0.5 size-4 accent-brand-700" /><span>Tôi xác nhận giá trên là giá tôi sẵn sàng báo cho buyer với đúng grade, Incoterm và số lượng đã ghi. <span className="text-rose-700">*</span></span></label>}
  </section>;
}
