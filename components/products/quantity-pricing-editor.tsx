"use client";

import Link from "next/link";
import {
  formatQuantityBuyer,
  formatQuantityPriceBuyer,
  validateQuantityPricing,
  type QuantityPricingInput,
  type QuantityPricingPolicy,
} from "@/lib/products/quantity-pricing";

type Props = {
  value: QuantityPricingInput;
  onChange: (value: QuantityPricingInput) => void;
  standardGrades: string[];
  policy: QuantityPricingPolicy;
  buyerPriceUnit: "kg" | "mt";
  pricePubliclyVisible: boolean;
  disabled?: boolean;
  showErrors?: boolean;
};

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];

/** Controlled editor; parent owns name and consent state and validates again on the server. */
export function QuantityPricingEditor({ value, onChange, standardGrades, policy, buyerPriceUnit, pricePubliclyVisible, disabled = false, showErrors = false }: Props) {
  const validation = validateQuantityPricing(value, standardGrades, policy);
  const parsed = validation.value;
  const changeTier = (index: number, field: "minKg" | "priceUsdPerKg", text: string) => {
    onChange({ ...value, tiers: value.tiers.map((tier, i) => i === index ? { ...tier, [field]: text } : tier) });
  };
  const previewPrices = parsed?.tiers.map((tier) => tier.priceUsdPerKg) ?? [];
  const low = previewPrices.length ? Math.min(...previewPrices) : null;
  const high = previewPrices.length ? Math.max(...previewPrices) : null;
  const unitFactor = buyerPriceUnit === "mt" ? 1000 : 1;
  const unitLabel = buyerPriceUnit === "mt" ? "MT" : "kg";
  const digits = buyerPriceUnit === "mt" ? 0 : 2;
  const number = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n * unitFactor);
  const cardPrice = low !== null && high !== null
    ? `USD ${number(low)}${low !== high ? `–${number(high)}` : ""}/${unitLabel}` : "Price on request";
  const title = [value.nameEn.trim(), value.grade.trim()].filter(Boolean).join(" ");
  return <section id="quantity-pricing-table" className="space-y-3">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink-800">Grade <span className="text-rose-700">*</span>
            <select aria-label="Grade" className="input mt-1 w-full" required disabled={disabled} value={value.grade} onChange={(e) => onChange({ ...value, grade: e.target.value })}>
              <option value="">Chọn grade</option>{standardGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink-800">Incoterm <span className="text-rose-700">*</span>
            <select aria-label="Incoterm" className="input mt-1 w-full" required disabled={disabled} value={value.incoterm} onChange={(e) => onChange({ ...value, incoterm: e.target.value })}>
              <option value="">Chọn Incoterm</option>{INCOTERMS.map((term) => <option key={term} value={term}>{term}</option>)}
            </select>
          </label>
        </div>
        <h3 className="text-sm font-bold text-ink-900">Bảng giá theo số lượng</h3>
        <p className="text-xs text-ink-600">Số lượng nhập bằng kg. Giá cho 1 kg. Ví dụ 6.40 USD/kg = 6,400 USD/tấn.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[370px] text-left text-sm">
          <thead><tr className="text-xs text-ink-600"><th className="p-2">Số lượng từ (kg)</th><th className="p-2">Đến (kg)</th><th className="p-2">Giá (USD/kg) 🔒</th><th className="p-2"><span className="sr-only">Xóa mức</span></th></tr></thead>
          <tbody>{value.tiers.map((tier, index) => {
            const next = value.tiers[index + 1]?.minKg.trim();
            const upper = next && /^\d+$/.test(next) && Number.isSafeInteger(Number(next)) && Number(next) > 1 ? String(Number(next) - 1) : "—";
            return <tr key={index} className="border-t border-ink-100">
              <td className="p-1"><input aria-label={`Số lượng từ mức ${index + 1} (kg)`} className="input w-full" type="number" min="1" max="1000000000" step="1" required disabled={disabled} value={tier.minKg} onChange={(e) => changeTier(index, "minKg", e.target.value)} /></td>
              <td className="p-2 tabular-nums">{index === value.tiers.length - 1 ? "trở lên" : upper}</td>
              <td className="p-1"><input aria-label={`Giá mức ${index + 1} (USD/kg)`} className="input w-full" type="number" min="0.01" max="1000000000" step="0.01" required disabled={disabled} value={tier.priceUsdPerKg} onChange={(e) => changeTier(index, "priceUsdPerKg", e.target.value)} /></td>
              <td className="p-1">{value.tiers.length > 1 && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, tiers: value.tiers.filter((_, i) => i !== index) })} className="text-xs text-rose-700" aria-label={`Xóa mức giá ${index + 1}`}>Xóa</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <p className="text-xs text-ink-600">MOQ bằng số lượng từ của mức giá đầu tiên.</p>
        {value.tiers.length < policy.maxTiers && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, tiers: [...value.tiers, { minKg: "", priceUsdPerKg: "" }] })} className="text-sm font-semibold text-brand-700">+ Thêm mức giá</button>}
        {showErrors && validation.errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-xs text-rose-700">{validation.errors.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.tierIndex === undefined ? "" : `Mức ${issue.tierIndex + 1}: `}{issue.message}</li>)}</ul>}
        {validation.warnings.length > 0 && <p className="text-xs text-amber-800" role="status">Một số mức giá ngoài ngưỡng tham khảo của grade. Bạn vẫn có thể lưu; giá sẽ được rà soát.</p>}
      </div>
      <aside className="rounded-xl border border-ink-200 bg-ink-50 p-4" aria-label="Buyer sẽ thấy">
        <h3 className="text-sm font-bold text-ink-900">Buyer sẽ thấy</h3>
        <p className="mt-2 text-sm font-semibold">{title || "Product name"}</p>
        <p className="mt-1 text-xs text-ink-600">{value.grade || "Grade"}</p>
        <p className="mt-3 text-base font-semibold tabular-nums">{pricePubliclyVisible ? cardPrice : "Price on request"}</p>
        {pricePubliclyVisible && parsed && <p className="text-xs text-ink-500">{parsed.incoterm}</p>}
        {pricePubliclyVisible && parsed && <table className="mt-3 w-full text-left text-xs">
          <thead><tr><th className="pb-1">Quantity</th><th className="pb-1">Price</th></tr></thead>
          <tbody>{parsed.tiers.map((tier, index) => {
            const next = parsed.tiers[index + 1];
            return <tr key={index} className="border-t border-ink-200"><td className="py-1.5">{formatQuantityBuyer(tier.minKg)}{next ? `–${formatQuantityBuyer(next.minKg - 1)}` : "+"}</td><td className="py-1.5 tabular-nums">{formatQuantityPriceBuyer(tier.priceUsdPerKg, buyerPriceUnit)}</td></tr>;
          })}</tbody>
        </table>}
        {parsed && <p className="mt-2 text-xs text-ink-600">MOQ: {formatQuantityBuyer(parsed.tiers[0].minKg)}</p>}
      </aside>
    </div>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">⚠️ Mọi báo giá bạn gửi qua Vexim đều được lưu và đối chiếu với giá đăng. Chênh lệch bất thường sẽ được Vexim rà soát và xử lý theo <Link href="/quy-che-hoat-dong" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Quy chế hoạt động</Link>.</p>
    {pricePubliclyVisible && <label className="flex items-start gap-2 text-xs font-medium text-ink-800"><input type="checkbox" name="confirm_quantity_price_consent" value="yes" required disabled={disabled} className="mt-0.5 size-4 accent-brand-700" /><span>Tôi xác nhận giá trên là giá tôi sẵn sàng báo cho buyer với đúng grade, Incoterm và số lượng đã ghi. <span className="text-rose-700">*</span></span></label>}
  </section>;
}
