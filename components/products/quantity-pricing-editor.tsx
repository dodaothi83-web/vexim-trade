"use client";

import Link from "next/link";
import {
  formatQuantityBuyer,
  formatQuantityPriceBuyer,
  formatQuantityInput,
  ENTRY_PRICE_CURRENCIES,
  normalizePriceCurrency,
  parseQuantityKg,
  normalizePriceInput,
  validateQuantityPricing,
  DEFAULT_PRICE_CURRENCY,
  type QuantityPricingInput,
  type QuantityPricingPolicy,
  type PriceCurrency,
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
  consentChecked?: boolean;
  onConsentChange?: (checked: boolean) => void;
  consentLabel?: string;
  /** Detach inputs when this editor sits inside another product form. */
  isolated?: boolean;
  /** The supplier page can place the live preview in its existing side card. */
  showPreview?: boolean;
  /** Some parent forms already label this section. */
  showTitle?: boolean;
  /** Supplier price submissions do not edit the English translation. */
  validateEnglishName?: boolean;
};

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];

function readCurrency(value: QuantityPricingInput): PriceCurrency {
  return normalizePriceCurrency(value.currency) ?? DEFAULT_PRICE_CURRENCY;
}

/** Read-only live preview, reusable in the supplier sidebar and standalone editor. */
export function QuantityBuyerPreview({ value, standardGrades, policy, buyerPriceUnit, pricePubliclyVisible }: Pick<Props, "value" | "standardGrades" | "policy" | "buyerPriceUnit" | "pricePubliclyVisible">) {
  const parsed = validateQuantityPricing({ ...value, nameEn: "" }, standardGrades, policy).value;
  const previewPrices = parsed?.tiers.map((tier) => tier.priceUsdPerKg) ?? [];
  const low = previewPrices.length ? Math.min(...previewPrices) : null;
  const high = previewPrices.length ? Math.max(...previewPrices) : null;
  const unitLabel = buyerPriceUnit === "mt" ? "MT" : "kg";
  const currency = parsed?.currency ?? readCurrency(value);
  const number = (n: number) => new Intl.NumberFormat("en-US", {
    minimumFractionDigits: buyerPriceUnit === "mt" ? 0 : 2,
    maximumFractionDigits: buyerPriceUnit === "mt" ? 0 : 2,
  }).format(buyerPriceUnit === "mt" ? n * 1000 : n);
  const cardPrice = low !== null && high !== null
    ? `${currency} ${number(low)}${low !== high ? `–${number(high)}` : ""}/${unitLabel}` : "Price on request";
  const title = value.nameEn.trim() || value.nameVi.trim() || "Tên sản phẩm";
  return <div aria-label="Buyer sẽ thấy">
    <h3 className="text-sm font-bold text-ink-900">Buyer sẽ thấy</h3>
    <p className="mt-2 text-sm font-semibold">{title}</p>
    {!value.nameEn.trim() && <p className="mt-1 text-xs text-ink-600">Tên tiếng Anh do Vexim dịch khi duyệt</p>}
    <p className="mt-1 text-xs text-ink-600">{value.grade || "Grade"}</p>
    <p className="mt-3 text-base font-semibold tabular-nums">{pricePubliclyVisible ? cardPrice : "Price on request"}</p>
    {pricePubliclyVisible && parsed && <p className="text-xs text-ink-500">{[...new Set(parsed.tiers.map((tier) => tier.incoterm))].join(" / ")}{parsed.tiers.length > 1 ? " · Volume pricing" : ""}</p>}
    {pricePubliclyVisible && parsed && <table className="mt-3 w-full text-left text-xs">
      <thead><tr><th className="pb-1">Số lượng</th><th className="pb-1">Incoterm</th><th className="pb-1">Price</th></tr></thead>
      <tbody>{parsed.tiers.map((tier, index) => {
        const next = parsed.tiers[index + 1];
        return <tr key={index} className="border-t border-ink-200">
          <td className="py-1.5">{formatQuantityBuyer(tier.minKg)}{next ? `–${formatQuantityBuyer(next.minKg - 1)}` : "+"}</td>
          <td className="py-1.5">{tier.incoterm}</td>
          <td className="py-1.5 tabular-nums">{formatQuantityPriceBuyer(tier.priceUsdPerKg, buyerPriceUnit, tier.currency)}</td>
        </tr>;
      })}</tbody>
    </table>}
    {parsed && <p className="mt-2 text-xs text-ink-600">MOQ: {formatQuantityBuyer(parsed.tiers[0].minKg)}</p>}
  </div>;
}

/** Controlled editor; parent owns name and consent state and validates again on the server. */
export function QuantityPricingEditor({ value, onChange, standardGrades, policy, buyerPriceUnit, pricePubliclyVisible, disabled = false, showErrors = false, consentChecked, onConsentChange, consentLabel, isolated = false, showPreview = true, showTitle = true, validateEnglishName = true }: Props) {
  const validation = validateQuantityPricing(validateEnglishName ? value : { ...value, nameEn: "" }, standardGrades, policy);
  const currency = readCurrency(value);
  const form = isolated ? "quantity-pricing-separate" : undefined;
  /** Keep the table-level Incoterm in step with the first row so both persist the same reason. */
  function emitTiers(tiers: QuantityPricingInput["tiers"]) {
    onChange({ ...value, tiers, incoterm: (tiers[0]?.incoterm ?? value.incoterm ?? "").trim().toUpperCase() });
  }
  const changeTier = (index: number, patch: Partial<QuantityPricingInput["tiers"][number]>) => {
    emitTiers(value.tiers.map((tier, i) => i === index ? { ...tier, ...patch } : tier));
  };
  const addTier = () => {
    const last = value.tiers[value.tiers.length - 1];
    emitTiers([...value.tiers, { minKg: "", priceUsdPerKg: "", incoterm: last?.incoterm ?? value.incoterm ?? "" }]);
  };
  return <section id="quantity-pricing-table" className="space-y-3">
    <div className={showPreview ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.72fr)]" : "grid gap-4"}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink-800">Grade <span className="text-rose-700">*</span>
            <select form={form} aria-label="Grade" className="input mt-1 w-full" required disabled={disabled} value={value.grade} onChange={(e) => onChange({ ...value, grade: e.target.value })}>
              <option value="">Chọn grade</option>{standardGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <div className="text-sm font-semibold text-ink-800">
            <span>Tiền tệ <span className="text-rose-700">*</span></span>
            <p aria-label="Tiền tệ" className="input mt-1 flex w-full items-center bg-ink-50 font-mono text-ink-800">{currency}</p>
            <span className="mt-1 block text-[11.5px] font-normal leading-4 text-ink-600">Tạm thời chỉ nhập giá USD. VND/EUR sẽ mở lại khi dữ liệu giá cho phép.</span>
            {!ENTRY_PRICE_CURRENCIES.includes(currency) && <span className="mt-1 block text-[11.5px] font-normal leading-4 text-amber-800">Bảng giá này đang lưu bằng {currency}; hãy nhập lại bảng mới bằng USD để gửi duyệt.</span>}
          </div>
        </div>
        {showTitle && <h3 className="text-sm font-bold text-ink-900">Bảng giá theo số lượng</h3>}
        <p className="text-xs text-ink-600">Chỉ nhập số lượng <strong>từ</strong>; cột <strong>đến</strong> tự tính bằng mức kế tiếp trừ 1. Mức cuối là “trở lên”.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="text-xs text-ink-600">
            <th className="p-2">Incoterm</th>
            <th className="p-2">Từ (kg)</th>
            <th className="p-2">Đến (kg)</th>
            <th className="p-2">Giá ({currency}/kg) 🔒</th>
            <th className="p-2"><span className="sr-only">Xóa mức</span></th>
          </tr></thead>
          <tbody>{value.tiers.map((tier, index) => {
            const next = parseQuantityKg(value.tiers[index + 1]?.minKg ?? "");
            const upper = next !== null && next > 1 ? formatQuantityInput(String(next - 1)) : null;
            const rowErrors = showErrors ? validation.errors.filter((issue) => issue.tierIndex === index) : [];
            const invalid = (codes: string[]) => rowErrors.some((issue) => codes.includes(issue.code)) || undefined;
            return <tr key={index} className="border-t border-ink-100">
              <td className="p-1 align-top">
                <select form={form} aria-label={`Incoterm mức ${index + 1}`} className="input w-full" required disabled={disabled}
                  aria-invalid={invalid(["incoterm"])} value={tier.incoterm ?? ""}
                  onChange={(e) => changeTier(index, { incoterm: e.target.value })}>
                  <option value="">Chọn</option>{INCOTERMS.map((term) => <option key={term} value={term}>{term}</option>)}
                </select>
                {rowErrors.filter((issue) => issue.code === "incoterm").map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
              </td>
              <td className="p-1 align-top"><input form={form} aria-label={`Số lượng từ mức ${index + 1} (kg)`} aria-invalid={invalid(["quantity", "quantity_order", "quantity_spread"])} className="input w-full text-right tabular-nums" type="text" inputMode="numeric" required disabled={disabled} value={tier.minKg} onChange={(e) => changeTier(index, { minKg: formatQuantityInput(e.target.value, tier.minKg) })} />
                {rowErrors.filter((issue) => ["quantity", "quantity_order"].includes(issue.code)).map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
              </td>
              <td className="p-2 align-top">
                <p aria-live="polite" className="rounded-lg bg-ink-50 px-3 py-2 text-right font-mono text-sm tabular-nums text-ink-700">
                  {index === value.tiers.length - 1 ? "trở lên" : upper ?? "—"}
                </p>
              </td>
              <td className="p-1 align-top"><input form={form} aria-label={`Giá mức ${index + 1} (${currency}/kg)`} aria-invalid={invalid(["price", "price_order"])} className="input w-full text-right tabular-nums" type="text" inputMode="decimal" required disabled={disabled} value={tier.priceUsdPerKg} onChange={(e) => changeTier(index, { priceUsdPerKg: e.target.value })} onBlur={(e) => { const normalized = normalizePriceInput(e.target.value); if (normalized !== e.target.value) changeTier(index, { priceUsdPerKg: normalized }); }} />
                {rowErrors.filter((issue) => ["price", "price_order"].includes(issue.code)).map((issue) => <p key={issue.code} className="mt-1 text-xs text-rose-700">{issue.message}</p>)}
              </td>
              <td className="p-1">{value.tiers.length > 1 && <button type="button" disabled={disabled} onClick={() => emitTiers(value.tiers.filter((_, i) => i !== index))} className="text-xs text-rose-700" aria-label={`Xóa mức giá ${index + 1}`}>Xóa</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <p className="text-xs text-ink-600">Mức đầu tiên là số lượng tối thiểu (MOQ).</p>
        {value.tiers.length < Math.min(policy.maxTiers, 4) && <button type="button" disabled={disabled} onClick={addTier} className="text-sm font-semibold text-brand-700">+ Thêm mức giá</button>}
        {showErrors && validation.errors.length > 0 && <ul role="alert" className="list-disc space-y-1 pl-5 text-xs text-rose-700">{validation.errors.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.tierIndex === undefined ? "" : `Mức ${issue.tierIndex + 1}: `}{issue.message}</li>)}</ul>}
        {validation.warnings.length > 0 && <p className="text-xs text-amber-800" role="status">Một số mức giá ngoài ngưỡng tham khảo của grade. Bạn vẫn có thể lưu; giá sẽ được rà soát.</p>}
      </div>
      {showPreview && <aside className="rounded-xl border border-ink-200 bg-ink-50 p-4">
        <QuantityBuyerPreview value={value} standardGrades={standardGrades} policy={policy} buyerPriceUnit={buyerPriceUnit} pricePubliclyVisible={pricePubliclyVisible} />
      </aside>}
    </div>
    {pricePubliclyVisible && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">⚠️ Mọi báo giá bạn gửi qua Vexim đều được lưu và đối chiếu với giá đăng. Chênh lệch bất thường sẽ được Vexim rà soát và xử lý theo <Link href="/quy-che-hoat-dong" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Quy chế hoạt động</Link>.</p>}
    {pricePubliclyVisible && <label className="flex items-start gap-2 text-xs font-medium text-ink-800"><input form={form} type="checkbox" name="confirm_quantity_price_consent" value="yes" required disabled={disabled} checked={consentChecked} onChange={onConsentChange ? (event) => onConsentChange(event.target.checked) : undefined} className="mt-0.5 size-4 accent-brand-700" /><span>{consentLabel ?? "Tôi xác nhận giá trên là giá tôi sẵn sàng báo cho buyer với đúng grade, Incoterm và số lượng đã ghi."} <span className="text-rose-700">*</span></span></label>}
  </section>;
}
