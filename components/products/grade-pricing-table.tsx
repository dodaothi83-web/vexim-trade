"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import {
  CUSTOM_GRADE_OPTION,
  GRADE_INCOTERMS,
  MAX_GRADE_ROWS,
  MIN_GRADE_ROWS,
  categoryMarketPriceUnit,
  createEmptyGradeRowDraft,
  serializeGradeRowsDraft,
  standardGradesForCategory,
  validateGradeRowDraft,
  type CategoryGradeSource,
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

  const standardGrades = standardGradesForCategory(category);
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);

  function updateRow(rowId: string, patch: Partial<ProductGradeRowDraft>) {
    onChange(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (disabled || rows.length >= MAX_GRADE_ROWS) return;
    const nextId = `row-${Date.now()}-${rows.length + 1}`;
    const defaultMoq = rows[rows.length - 1]?.moq ?? "";
    const defaultIncoterm = rows[rows.length - 1]?.incoterm || "FOB";
    onChange([
      ...rows,
      {
        ...createEmptyGradeRowDraft(nextId),
        incoterm: defaultIncoterm,
        moq: defaultMoq,
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
        <span className="text-[11px] font-semibold text-ink-500">
          Đơn vị theo danh mục: <strong className="font-mono text-ink-800">{unitMeta.unitLabel}</strong>
        </span>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-3.5 sm:p-4">
        <p className="text-[12px] leading-5 text-ink-600">
          Mỗi dòng là một grade bạn bán. Giá để trống thì buyer thấy &quot;Báo giá theo yêu cầu&quot;. Bắt buộc ít nhất 1 grade, tối đa 10.
        </p>

        {hiddenInputName && (
          <input type="hidden" name={hiddenInputName} value={serializeGradeRowsDraft(rows)} readOnly />
        )}

        <div className="mt-3.5 hidden gap-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-500 md:grid md:grid-cols-[minmax(150px,1.15fr)_minmax(175px,1.2fr)_104px_minmax(130px,1fr)_36px]">
          <span>GRADE</span>
          <span>{unitMeta.headerLabel}</span>
          <span>INCOTERM</span>
          <span>MOQ</span>
          <span className="sr-only">Thao tác</span>
        </div>

        <div className="mt-2 space-y-3">
          {rows.map((row, index) => {
            const validation = validateGradeRowDraft(row, category);
            const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
            const hasMalformedTyping =
              (row.priceMin.trim() !== "" && !/^\d+(?:\.\d{1,2})?$/.test(row.priceMin.trim())) ||
              (row.priceMax.trim() !== "" && !/^\d+(?:\.\d{1,2})?$/.test(row.priceMax.trim()));
            const displayGradeError = (showErrors || touchedGrade[row.id]) ? validation.gradeError : null;
            const displayPriceError = (showErrors || touchedPrice[row.id] || hasMalformedTyping) ? validation.priceError : null;
            const rowError = displayGradeError || displayPriceError || (showErrors ? validation.incotermError : null);

            return (
              <div key={row.id} className="space-y-2 rounded-lg border border-ink-100 bg-ink-50/40 p-2.5 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                <div className="grid gap-2.5 md:grid-cols-[minmax(150px,1.15fr)_minmax(175px,1.2fr)_104px_minmax(130px,1fr)_36px] md:items-start">
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

                  {/* GIÁ TỪ - ĐẾN */}
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

                  {/* MOQ */}
                  <div>
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 md:hidden">
                      MOQ
                    </span>
                    <input
                      type="text"
                      aria-label={`MOQ dòng ${index + 1}`}
                      maxLength={180}
                      placeholder="1 tấn"
                      disabled={disabled}
                      value={row.moq}
                      onChange={(e) => updateRow(row.id, { moq: e.target.value })}
                      className="input text-[13px]"
                    />
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
