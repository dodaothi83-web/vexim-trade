"use client";

import { useState } from "react";
import { Lock, Plus, X } from "lucide-react";

import {
  CUSTOM_GRADE_OPTION,
  GRADE_INCOTERMS,
  MAX_GRADE_ROWS,
  MIN_GRADE_ROWS,
  MOQ_UNIT_OPTIONS,
  allowedMoqUnitsForCategory,
  categoryMarketPriceUnit,
  createEmptyGradeRowDraft,
  defaultMoqUnitForCategory,
  formatStructuredMoqBuyer,
  formatStructuredMoqVi,
  isMoqUnit,
  parseLegacyMoqString,
  serializeGradeRowsDraft,
  standardGradesForCategory,
  validateGradeRowDraft,
  type CategoryGradeSource,
  type MoqUnit,
  type ProductGradeRowDraft,
} from "@/lib/products/grade-pricing";

export type GradePricingTableProps = {
  rows: ProductGradeRowDraft[];
  onChange: (next: ProductGradeRowDraft[]) => void;
  category: CategoryGradeSource;
  disabled?: boolean;
  /** Bật khi người dùng bấm Lưu / Tiếp tục để hiện đủ lỗi tất cả các dòng. */
  showErrors?: boolean;
  /** Tên trường ẩn để gửi qua FormData (ví dụ: grade_rows_json). */
  hiddenInputName?: string;
  id?: string;
};

function resolveRowMoqControls(
  row: ProductGradeRowDraft,
  category: CategoryGradeSource,
): {
  qty: string;
  unit: MoqUnit;
  weightKg: string;
  legacyRaw: string;
} {
  const defaultUnit = defaultMoqUnitForCategory(category);
  if (row.moqQty !== undefined || row.moqUnit !== undefined || row.moqUnitWeightKg !== undefined || row.moqLegacyRaw !== undefined) {
    return {
      qty: row.moqQty ?? "",
      unit: isMoqUnit(row.moqUnit) ? row.moqUnit : defaultUnit,
      weightKg: row.moqUnitWeightKg ?? "",
      legacyRaw: row.moqLegacyRaw ?? "",
    };
  }
  const parsed = parseLegacyMoqString(row.moq);
  if (parsed.status === "converted") {
    return {
      qty: String(parsed.qty),
      unit: parsed.unit,
      weightKg: parsed.unitWeightKg !== null ? String(parsed.unitWeightKg) : "",
      legacyRaw: "",
    };
  }
  if (parsed.status === "needs_review") {
    return {
      qty: parsed.suggestedQty !== null ? String(parsed.suggestedQty) : "",
      unit: parsed.suggestedUnit ?? defaultUnit,
      weightKg: "",
      legacyRaw: parsed.raw,
    };
  }
  return { qty: "", unit: defaultUnit, weightKg: "", legacyRaw: "" };
}

export function GradePricingTable({
  rows,
  onChange,
  category,
  disabled = false,
  showErrors = false,
  hiddenInputName,
  id = "grade-pricing-table",
}: GradePricingTableProps) {
  const [touchedGrade, setTouchedGrade] = useState<Record<string, boolean>>({});
  const [touchedPrice, setTouchedPrice] = useState<Record<string, boolean>>({});
  const [touchedMoq, setTouchedMoq] = useState<Record<string, boolean>>({});

  const standardGrades = standardGradesForCategory(category);
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
  const allowedMoqUnits = allowedMoqUnitsForCategory(category);

  function updateRow(rowId: string, patch: Partial<ProductGradeRowDraft>) {
    onChange(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function updateRowMoq(
    row: ProductGradeRowDraft,
    nextFields: Partial<{ qty: string; unit: MoqUnit; weightKg: string; legacyRaw: string }>,
  ) {
    const current = resolveRowMoqControls(row, category);
    const qty = nextFields.qty !== undefined ? nextFields.qty : current.qty;
    const unit = nextFields.unit !== undefined ? nextFields.unit : current.unit;
    const rawWeight = nextFields.weightKg !== undefined ? nextFields.weightKg : current.weightKg;
    const weightKg = unit === "bag" || unit === "carton" ? rawWeight : "";
    const legacyRaw = nextFields.legacyRaw !== undefined ? nextFields.legacyRaw : "";

    const parsedQty = Number(qty.trim());
    const parsedWeight = Number(weightKg.trim());
    const buyerPreview = Number.isFinite(parsedQty) && parsedQty > 0
      ? formatStructuredMoqBuyer(parsedQty, unit, Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null)
      : "";

    updateRow(row.id, {
      moq: buyerPreview,
      moqQty: qty,
      moqUnit: unit,
      moqUnitWeightKg: weightKg,
      moqLegacyRaw: legacyRaw,
    });
  }

  function addRow() {
    if (disabled || rows.length >= MAX_GRADE_ROWS) return;
    const nextId = `row-${Date.now()}-${rows.length + 1}`;
    const lastRow = rows[rows.length - 1];
    const lastMoq = lastRow ? resolveRowMoqControls(lastRow, category) : null;
    const defaultIncoterm = lastRow?.incoterm || "FOB";
    onChange([
      ...rows,
      {
        ...createEmptyGradeRowDraft(nextId, category),
        incoterm: defaultIncoterm,
        moq: lastRow?.moq ?? "",
        moqQty: lastMoq?.qty ?? "",
        moqUnit: lastMoq?.unit ?? defaultMoqUnitForCategory(category),
        moqUnitWeightKg: lastMoq?.weightKg ?? "",
        moqLegacyRaw: "",
      },
    ]);
  }

  function removeRow(rowId: string) {
    if (disabled || rows.length <= MIN_GRADE_ROWS) return;
    onChange(rows.filter((row) => row.id !== rowId));
  }

  return (
    <div id={id} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-bold text-ink-900">Grade &amp; giá</span>
        <span className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
          <Lock className="size-3 text-ink-500" aria-hidden="true" />
          Đơn vị khóa theo danh mục: <strong className="font-mono text-ink-900">{unitMeta.unitLabel}</strong>
        </span>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-3.5 sm:p-4">
        <p className="text-[12px] leading-5 text-ink-600">
          Mỗi dòng là một grade bạn bán. Giá để trống thì buyer thấy &quot;Báo giá theo yêu cầu&quot;. MOQ để trống số lượng sẽ hiện &quot;Theo yêu cầu&quot;. Bắt buộc ít nhất 1 grade, tối đa 10.
        </p>

        {hiddenInputName && (
          <input type="hidden" name={hiddenInputName} value={serializeGradeRowsDraft(rows)} readOnly />
        )}

        <div className="mt-3.5 hidden gap-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-500 md:grid md:grid-cols-[minmax(140px,1.05fr)_minmax(190px,1.2fr)_96px_minmax(210px,1.35fr)_36px]">
          <span>GRADE</span>
          <span>{unitMeta.headerLabel}</span>
          <span>INCOTERM</span>
          <span>MOQ (SỐ + ĐƠN VỊ)</span>
          <span className="sr-only">Thao tác</span>
        </div>

        <div className="mt-2 space-y-3">
          {rows.map((row, index) => {
            const validation = validateGradeRowDraft(row, category);
            const moqControls = resolveRowMoqControls(row, category);
            const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
            const requiresWeight = moqControls.unit === "bag" || moqControls.unit === "carton";
            const unitOptionsForRow = MOQ_UNIT_OPTIONS.filter(
              (opt) => allowedMoqUnits.includes(opt.value) || opt.value === moqControls.unit,
            );
            const hasMalformedTyping =
              (row.priceMin.trim() !== "" && !/^\d+(?:\.\d{1,2})?$/.test(row.priceMin.trim())) ||
              (row.priceMax.trim() !== "" && !/^\d+(?:\.\d{1,2})?$/.test(row.priceMax.trim()));
            const displayGradeError = (showErrors || touchedGrade[row.id]) ? validation.gradeError : null;
            const displayPriceError = (showErrors || touchedPrice[row.id] || hasMalformedTyping) ? validation.priceError : null;
            const displayMoqError = (showErrors || touchedMoq[row.id] || Boolean(moqControls.legacyRaw)) ? validation.moqError : null;
            const rowError = displayGradeError || displayPriceError || displayMoqError || (showErrors ? validation.incotermError : null);

            const parsedQty = Number(moqControls.qty.trim());
            const parsedWeight = Number(moqControls.weightKg.trim());
            const showConvertedHint =
              !validation.moqError &&
              Number.isFinite(parsedQty) &&
              parsedQty > 0 &&
              (requiresWeight ? Number.isFinite(parsedWeight) && parsedWeight > 0 : moqControls.unit === "cont_20ft" || moqControls.unit === "cont_40ft");

            return (
              <div key={row.id} className="space-y-2 rounded-lg border border-ink-100 bg-ink-50/40 p-2.5 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                <div className="grid gap-2.5 md:grid-cols-[minmax(140px,1.05fr)_minmax(190px,1.2fr)_96px_minmax(210px,1.35fr)_36px] md:items-start">
                  {/* GRADE */}
                  <div>
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 md:hidden">
                      GRADE
                    </span>
                    <select
                      aria-label={`Grade dòng ${index + 1}`}
                      className={`input text-[13px] ${displayGradeError && !isCustom ? "border-rose-400 bg-rose-50/40" : ""}`}
                      value={row.selectedGrade}
                      disabled={disabled}
                      onBlur={() => setTouchedGrade((prev) => ({ ...prev, [row.id]: true }))}
                      onChange={(e) => {
                        const value = e.target.value;
                        updateRow(row.id, {
                          selectedGrade: value,
                          ...(value === CUSTOM_GRADE_OPTION ? {} : { customGrade: "" }),
                        });
                        if (value !== CUSTOM_GRADE_OPTION) {
                          setTouchedGrade((prev) => ({ ...prev, [row.id]: true }));
                        }
                      }}
                    >
                      <option value="">Chọn grade</option>
                      {standardGrades.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                      <option value={CUSTOM_GRADE_OPTION}>Khác (tự nhập)</option>
                    </select>

                    {isCustom && (
                      <input
                        type="text"
                        aria-label={`Nhập grade dòng ${index + 1}`}
                        maxLength={80}
                        placeholder="Nhập grade"
                        disabled={disabled}
                        value={row.customGrade}
                        onBlur={() => setTouchedGrade((prev) => ({ ...prev, [row.id]: true }))}
                        onChange={(e) => updateRow(row.id, { customGrade: e.target.value })}
                        className={`input mt-2 text-[13px] ${displayGradeError ? "border-rose-400 bg-rose-50/40" : ""}`}
                      />
                    )}
                  </div>

                  {/* GIÁ TỪ - ĐẾN (KHÓA ĐƠN VỊ THEO DANH MỤC) */}
                  <div>
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 md:hidden">
                      {unitMeta.headerLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Giá từ dòng ${index + 1} (${unitMeta.unitLabel})`}
                        placeholder="từ"
                        disabled={disabled}
                        value={row.priceMin}
                        onBlur={() => setTouchedPrice((prev) => ({ ...prev, [row.id]: true }))}
                        onChange={(e) => updateRow(row.id, { priceMin: e.target.value })}
                        className={`input min-w-0 flex-1 font-mono text-[13px] tabular-nums ${displayPriceError ? "border-rose-400 bg-rose-50/40" : ""}`}
                      />
                      <span className="shrink-0 text-xs font-semibold text-ink-400" aria-hidden="true">-</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Giá đến dòng ${index + 1} (${unitMeta.unitLabel})`}
                        placeholder="đến"
                        disabled={disabled}
                        value={row.priceMax}
                        onBlur={() => setTouchedPrice((prev) => ({ ...prev, [row.id]: true }))}
                        onChange={(e) => updateRow(row.id, { priceMax: e.target.value })}
                        className={`input min-w-0 flex-1 font-mono text-[13px] tabular-nums ${displayPriceError ? "border-rose-400 bg-rose-50/40" : ""}`}
                      />
                      <span
                        title="Đơn vị giá được khóa theo danh mục"
                        className="hidden shrink-0 rounded-md border border-ink-200 bg-ink-50 px-2 py-2 font-mono text-[11px] font-semibold text-ink-600 xl:inline-block"
                      >
                        {unitMeta.unitLabel}
                      </span>
                    </div>
                  </div>

                  {/* INCOTERM */}
                  <div>
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 md:hidden">
                      INCOTERM
                    </span>
                    <select
                      aria-label={`Incoterm dòng ${index + 1}`}
                      className="input px-2.5 text-[13px]"
                      disabled={disabled}
                      value={row.incoterm}
                      onChange={(e) => updateRow(row.id, { incoterm: e.target.value })}
                    >
                      {GRADE_INCOTERMS.map((term) => (
                        <option key={term} value={term}>
                          {term}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* MOQ (SỐ + ĐƠN VỊ + QUY ĐỔI BAO/THÙNG) */}
                  <div className="space-y-1.5">
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 md:hidden">
                      MOQ (SỐ + ĐƠN VỊ)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Số lượng MOQ dòng ${index + 1}`}
                        maxLength={12}
                        placeholder="Số lượng"
                        disabled={disabled}
                        value={moqControls.qty}
                        onBlur={() => setTouchedMoq((prev) => ({ ...prev, [row.id]: true }))}
                        onChange={(e) => updateRowMoq(row, { qty: e.target.value })}
                        className={`input w-24 shrink-0 font-mono text-[13px] tabular-nums ${displayMoqError ? "border-rose-400 bg-rose-50/40" : ""}`}
                      />
                      <select
                        aria-label={`Đơn vị MOQ dòng ${index + 1}`}
                        disabled={disabled}
                        value={moqControls.unit}
                        onBlur={() => setTouchedMoq((prev) => ({ ...prev, [row.id]: true }))}
                        onChange={(e) => {
                          const nextUnit = e.target.value as MoqUnit;
                          updateRowMoq(row, { unit: nextUnit });
                          setTouchedMoq((prev) => ({ ...prev, [row.id]: true }));
                        }}
                        className={`input min-w-0 flex-1 px-2.5 text-[13px] ${displayMoqError ? "border-rose-400 bg-rose-50/40" : ""}`}
                      >
                        {unitOptionsForRow.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.viLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    {requiresWeight && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Trọng lượng mỗi ${moqControls.unit === "bag" ? "bao" : "thùng"} dòng ${index + 1} (kg)`}
                          maxLength={10}
                          placeholder={moqControls.unit === "bag" ? "Trọng lượng 1 bao (VD: 25)" : "Trọng lượng 1 thùng (VD: 10)"}
                          disabled={disabled}
                          value={moqControls.weightKg}
                          onBlur={() => setTouchedMoq((prev) => ({ ...prev, [row.id]: true }))}
                          onChange={(e) => updateRowMoq(row, { weightKg: e.target.value })}
                          className={`input min-w-0 flex-1 font-mono text-[12.5px] tabular-nums ${displayMoqError && !moqControls.weightKg.trim() ? "border-rose-400 bg-rose-50/40" : ""}`}
                        />
                        <span className="shrink-0 rounded-md border border-ink-200 bg-ink-50 px-2 py-2 font-mono text-[11px] font-semibold text-ink-600">
                          {moqControls.unit === "bag" ? "kg/bao" : "kg/thùng"}
                        </span>
                      </div>
                    )}

                    {showConvertedHint && (
                      <p className="text-[11px] leading-4 text-ink-600">
                        {requiresWeight
                          ? `Quy đổi: ${formatStructuredMoqVi(parsedQty, moqControls.unit, parsedWeight)} | Buyer: ${formatStructuredMoqBuyer(parsedQty, moqControls.unit, parsedWeight)}`
                          : `Buyer: ${formatStructuredMoqBuyer(parsedQty, moqControls.unit, null)} (nhóm Full container)`}
                      </p>
                    )}

                    {moqControls.legacyRaw && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
                        <span>Giá trị cũ: <strong>{moqControls.legacyRaw}</strong></span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => updateRowMoq(row, { qty: "", weightKg: "", legacyRaw: "" })}
                          className="font-semibold text-brand-800 underline"
                        >
                          Đặt Theo yêu cầu
                        </button>
                      </div>
                    )}
                  </div>

                  {/* DELETE ROW */}
                  <div className="flex justify-end md:pt-0.5">
                    <button
                      type="button"
                      disabled={disabled || rows.length <= MIN_GRADE_ROWS}
                      onClick={() => removeRow(row.id)}
                      aria-label={`Xóa dòng grade ${index + 1}`}
                      title={rows.length <= MIN_GRADE_ROWS ? "Cần giữ ít nhất 1 dòng grade" : "Xóa dòng này"}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isCustom && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
                    Grade tự nhập không có nhãn chuẩn, không tính vào bảng giá tham khảo và bộ lọc.
                  </p>
                )}

                {rowError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold leading-5 text-rose-800">
                    {rowError}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={disabled || rows.length >= MAX_GRADE_ROWS}
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand-600 bg-white px-3.5 py-2 text-[12.5px] font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" /> Thêm grade
          </button>
          {rows.length >= MAX_GRADE_ROWS && (
            <span className="text-[11.5px] font-medium text-ink-500">Đã đạt tối đa 10 grade.</span>
          )}
        </div>
      </div>
    </div>
  );
}
