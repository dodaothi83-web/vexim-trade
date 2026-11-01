"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import {
  formatQuantityBuyer,
  formatQuantityPriceBuyer,
  formatQuantityInput,
  PRICE_CURRENCIES,
  normalizePriceCurrency,
  parseQuantityKg,
  previewQuantityTiers,
  quantityTierRanges,
  normalizePriceInput,
  validateQuantityPricing,
  DEFAULT_PRICE_CURRENCY,
  type QuantityPricingInput,
  type QuantityPricingPolicy,
  type PriceCurrency,
} from "@/lib/products/quantity-pricing";
import { priceRangeText } from "@/lib/products/price-display";

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
  /** Nhóm hàng đang chọn; đổi danh mục thì bỏ danh sách grade tự thêm của nhóm trước. */
  gradeScope?: string;
  /**
   * Có hàm này thì ô chọn grade hiện thêm lựa chọn "+ Thêm grade mới". Grade mới được lưu
   * cho cả nhóm hàng nên nhà cung cấp khác và sản phẩm cùng danh mục dùng được ngay.
   */
  onAddGrade?: (grade: string) => Promise<{ ok: boolean; message: string; grades?: string[] }>;
};

/** Giá trị giả trong ô chọn: chọn mục này là mở ô nhập grade mới, không đổi grade hiện tại. */
const NEW_GRADE_OPTION = "__new_grade__";

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];

function readCurrency(value: QuantityPricingInput): PriceCurrency {
  return normalizePriceCurrency(value.currency) ?? DEFAULT_PRICE_CURRENCY;
}

/** Read-only live preview, reusable in the supplier sidebar and standalone editor.
 *  Xem trước được cả khi đang nhập dở: thiếu grade hay tên chưa dịch không làm mất
 *  giá vừa gõ (validate nghiêm vẫn chặn lưu ở server). */
export function QuantityBuyerPreview({ value, standardGrades, policy, buyerPriceUnit, pricePubliclyVisible, imageUrl }: Pick<Props, "value" | "standardGrades" | "policy" | "buyerPriceUnit" | "pricePubliclyVisible"> & { /** Ảnh đại diện đã lưu, để thẻ xem trước có hình như thẻ thật của người mua. */ imageUrl?: string | null }) {
  const preview = previewQuantityTiers(value, standardGrades);
  const prices = preview.tiers.map((tier) => tier.priceUsdPerKg);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const maxTiers = Math.min(policy.maxTiers, 4);
  const unitLabel = buyerPriceUnit === "mt" ? "MT" : "kg";
  const toBuyerUnit = (value: number) => (buyerPriceUnit === "mt" ? value * 1000 : value);
  const cardPrice = low !== null && high !== null
    ? `${priceRangeText(toBuyerUnit(low), toBuyerUnit(high), preview.currency)}/${unitLabel}` : "Price on request";
  const incoterms = [...new Set(preview.tiers.map((tier) => tier.incoterm).filter(Boolean))];
  const title = value.nameEn.trim() || value.nameVi.trim() || "Tên sản phẩm";
  return <div aria-label="Người mua sẽ thấy">
    <h3 className="text-sm font-bold text-ink-900">Người mua sẽ thấy</h3>
    <div className="mt-2">
      <div className="flex items-start gap-3">
        {/* Chỉ vẽ ô ảnh khi nơi gọi chủ động truyền ảnh (CRM); sidebar NCC đã có ảnh lớn phía trên. */}
        {imageUrl !== undefined && <div className="size-[64px] shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
          {imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={imageUrl} alt="Ảnh đại diện sản phẩm" className="size-full object-cover" />
            : <span className="flex size-full flex-col items-center justify-center gap-1 text-ink-400">
              <ImageIcon className="size-5" aria-hidden="true" />
              <span className="text-[9px] font-semibold">Chưa có ảnh</span>
            </span>}
        </div>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {!value.nameEn.trim() && <p className="mt-1 text-xs text-ink-600">Tên tiếng Anh do Vexim dịch khi duyệt</p>}
          <p className="mt-1 text-xs text-ink-600">{preview.grade || "Chưa chọn grade"}</p>
        </div>
      </div>
    </div>
    <p className="mt-3 text-base font-semibold tabular-nums">{pricePubliclyVisible ? cardPrice : "Price on request"}</p>
    {!pricePubliclyVisible && <p className="mt-1 text-xs text-ink-500">Đang tắt chia sẻ giá nên người mua chỉ thấy “Price on request”.</p>}
    {pricePubliclyVisible && preview.tiers.length > 0 && <p className="text-xs text-ink-500">{incoterms.join(" / ")}{preview.tiers.length > 1 ? " · Volume pricing" : ""}</p>}
    {pricePubliclyVisible && preview.tiers.length > 0 && <table className="mt-3 w-full text-left text-xs">
      <thead><tr><th className="pb-1">Số lượng</th><th className="pb-1">Incoterm</th><th className="pb-1">Price</th></tr></thead>
      <tbody>{quantityTierRanges(preview.tiers).map((tier, index) => <tr key={index} className="border-t border-ink-200">
        <td className="py-1.5">{formatQuantityBuyer(tier.minKg)}{tier.maxKg === null ? "+" : tier.maxKg > tier.minKg ? `–${formatQuantityBuyer(tier.maxKg)}` : ""}</td>
        <td className="py-1.5">{tier.incoterm || "—"}</td>
        <td className="py-1.5 tabular-nums">{formatQuantityPriceBuyer(tier.priceUsdPerKg, buyerPriceUnit, tier.currency)}</td>
      </tr>)}</tbody>
    </table>}
    {preview.tiers.length > 0 && <p className="mt-2 text-xs text-ink-600">MOQ: {formatQuantityBuyer(preview.tiers[0].minKg)}</p>}
    {preview.tiers.length >= maxTiers && <p className="mt-1 text-[11px] text-ink-500">Đã đạt tối đa {maxTiers} mức giá.</p>}
    {preview.tiers.length === 0 && <p className="mt-2 text-[11px] leading-4 text-ink-500">Nhập số lượng và đơn giá để xem trước bảng giá người mua.</p>}
    {!preview.grade && preview.tiers.length > 0 && <p className="mt-2 text-[11px] leading-4 text-amber-800">Chọn grade để hoàn tất bảng giá; giá trên chỉ là bản xem trước.</p>}
  </div>;
}

/** Controlled editor; parent owns name and consent state and validates again on the server. */
export function QuantityPricingEditor({ value, onChange, standardGrades, policy, buyerPriceUnit, pricePubliclyVisible, disabled = false, showErrors = false, consentChecked, onConsentChange, consentLabel, isolated = false, showPreview = true, showTitle = true, validateEnglishName = true, gradeScope, onAddGrade }: Props) {
  const currency = readCurrency(value);
  const form = isolated ? "quantity-pricing-separate" : undefined;
  // Grade do chính nhà cung cấp vừa thêm trong phiên này; prop standardGrades chỉ đổi sau khi trang tải lại.
  const [addedGrades, setAddedGrades] = useState<string[]>([]);
  const [newGradeOpen, setNewGradeOpen] = useState(false);
  const [newGradeDraft, setNewGradeDraft] = useState("");
  const [newGradeBusy, setNewGradeBusy] = useState(false);
  const [newGradeNote, setNewGradeNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Đổi danh mục là danh sách grade khác hẳn, nên bỏ grade đã thêm của nhóm trước.
  useEffect(() => { setAddedGrades([]); setNewGradeOpen(false); setNewGradeDraft(""); setNewGradeNote(null); }, [gradeScope]);
  const gradeOptions = [...standardGrades, ...addedGrades.filter((grade) =>
    !standardGrades.some((option) => option.trim().toLowerCase() === grade.trim().toLowerCase()))];
  // Kiểm tra ngay trên trình duyệt phải nhận cả grade vừa thêm, nếu không nút lưu vẫn báo thiếu grade.
  const validation = validateQuantityPricing(validateEnglishName ? value : { ...value, nameEn: "" }, gradeOptions, policy);
  async function submitNewGrade() {
    if (!onAddGrade || newGradeBusy) return;
    const grade = newGradeDraft.replace(/\s+/g, " ").trim();
    if (grade.length < 2) { setNewGradeNote({ ok: false, text: "Nhập mã grade từ 2 ký tự." }); return; }
    setNewGradeBusy(true);
    try {
      const result = await onAddGrade(grade);
      setNewGradeNote({ ok: result.ok, text: result.message });
      if (!result.ok) return;
      const list = result.grades?.length ? result.grades : [...gradeOptions, grade];
      setAddedGrades(list);
      setNewGradeOpen(false);
      setNewGradeDraft("");
      // Chọn luôn grade vừa thêm để nhà cung cấp không phải mở lại ô chọn.
      onChange({ ...value, grade: list.find((option) => option.trim().toLowerCase() === grade.toLowerCase()) ?? grade });
    } catch {
      setNewGradeNote({ ok: false, text: "Không kết nối được máy chủ." });
    } finally {
      setNewGradeBusy(false);
    }
  }
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
        <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_136px]">
          <div className="text-sm font-semibold text-ink-800">
            <label htmlFor="quantity-grade">Grade <span className="text-rose-700">*</span></label>
            <select id="quantity-grade" form={form} aria-label="Grade" className="input mt-1 w-full" required
              disabled={disabled || (!gradeOptions.length && !onAddGrade)} value={newGradeOpen ? NEW_GRADE_OPTION : value.grade}
              onChange={(e) => {
                if (e.target.value === NEW_GRADE_OPTION) { setNewGradeOpen(true); setNewGradeNote(null); setNewGradeDraft(""); return; }
                setNewGradeOpen(false);
                onChange({ ...value, grade: e.target.value });
              }}>
              <option value="">{gradeOptions.length ? "Chọn grade" : "Danh mục chưa có grade"}</option>{gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              {onAddGrade && <option value={NEW_GRADE_OPTION}>+ Thêm grade mới</option>}
            </select>
            {!gradeOptions.length && !onAddGrade && <span role="status" className="mt-1 block text-[11.5px] font-normal leading-4 text-amber-800">Danh mục này chưa có grade. Gửi Vexim bổ sung.</span>}
            {/* Giữ lại câu xác nhận sau khi lưu để nhà cung cấp biết grade đã vào danh sách của nhóm hàng. */}
            {!newGradeOpen && newGradeNote && <span role={newGradeNote.ok ? "status" : "alert"} className={`mt-1 block text-[11.5px] font-normal leading-4 ${newGradeNote.ok ? "text-emerald-700" : "text-rose-700"}`}>{newGradeNote.text}</span>}
            {onAddGrade && newGradeOpen && <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50 p-2.5 font-normal">
              <label htmlFor="quantity-new-grade" className="text-[11.5px] font-semibold text-brand-900">Grade mới</label>
              <input id="quantity-new-grade" className="input mt-1 w-full" value={newGradeDraft} maxLength={40} placeholder="VD: 600 g/L"
                disabled={disabled || newGradeBusy} onChange={(e) => setNewGradeDraft(e.target.value)} />
              <p className="mt-1 text-[11px] leading-4 text-brand-900">Grade này lưu cho cả nhóm hàng, nên sản phẩm cùng danh mục của bạn và nhà cung cấp khác dùng được ngay.</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={disabled || newGradeBusy} onClick={() => void submitNewGrade()}>{newGradeBusy ? "Đang lưu…" : "Lưu grade"}</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={newGradeBusy}
                  onClick={() => { setNewGradeOpen(false); setNewGradeDraft(""); setNewGradeNote(null); }}>Hủy</button>
              </div>
              {newGradeNote && <p role={newGradeNote.ok ? "status" : "alert"} className={`mt-1.5 text-[11.5px] font-normal ${newGradeNote.ok ? "text-emerald-700" : "text-rose-700"}`}>{newGradeNote.text}</p>}
            </div>}
          </div>
          <div className="text-sm font-semibold text-ink-800">
            <label htmlFor="quantity-currency">Tiền tệ <span className="text-rose-700">*</span></label>
            <select id="quantity-currency" form={form} aria-label="Tiền tệ" className="input mt-1 w-full font-mono" disabled={disabled}
              value={currency} onChange={(e) => onChange({ ...value, currency: e.target.value })}>
              {PRICE_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
        {showTitle && <h3 className="text-sm font-bold text-ink-900">Bảng giá theo số lượng</h3>}
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[96px]" />
            <col />
            <col />
            <col />
            <col className="w-[44px]" />
          </colgroup>
          <thead><tr className="text-xs text-ink-600">
            <th className="px-2 py-1.5 font-semibold">Incoterm</th>
            <th className="px-2 py-1.5 text-right font-semibold">Từ (kg)</th>
            <th className="px-2 py-1.5 text-right font-semibold">Đến (kg)</th>
            <th className="px-2 py-1.5 text-right font-semibold">Giá ({currency}/kg) 🔒</th>
            <th className="px-1 py-1.5"><span className="sr-only">Xóa mức</span></th>
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
              <td className="p-1 align-top">
                <p aria-live="polite" className="rounded-lg bg-ink-50 px-2.5 py-2 text-right font-mono text-sm tabular-nums text-ink-700">
                  {upper ?? "—"}
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
        <QuantityBuyerPreview value={value} standardGrades={gradeOptions} policy={policy} buyerPriceUnit={buyerPriceUnit} pricePubliclyVisible={pricePubliclyVisible} />
      </aside>}
    </div>
    {pricePubliclyVisible && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Mọi báo giá bạn gửi đều được đối chiếu với giá đăng. Chênh lệch bất thường sẽ được rà soát theo <Link href="/quy-che-hoat-dong" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Quy chế hoạt động</Link>.</p>}
    {pricePubliclyVisible && <label className="flex items-start gap-2 text-xs font-medium text-ink-800"><input form={form} type="checkbox" name="confirm_quantity_price_consent" value="yes" required disabled={disabled} checked={consentChecked} onChange={onConsentChange ? (event) => onConsentChange(event.target.checked) : undefined} className="mt-0.5 size-4 accent-brand-700" /><span>{consentLabel ?? "Tôi xác nhận giá trên là giá tôi sẵn sàng báo cho người mua, đúng grade và Incoterm."} <span className="text-rose-700">*</span></span></label>}
  </section>;
}
