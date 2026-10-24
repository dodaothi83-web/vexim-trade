"use client";

import { useMemo, useState } from "react";
import type { ProductAttributeField } from "@/lib/types";
import { cleanSupplierAttributeText, mergeAttributeFields } from "@/lib/product-attributes";

/**
 * Thông số theo nhóm hàng dành cho nhà cung cấp.
 *
 * Chỉ hiện các thông số có cấu trúc do Vexim khai trong CMS (ví dụ Grade với W320,
 * W180) — những giá trị máy đọc được, dùng cho lọc và đối chiếu quy cách. Mô tả dài
 * như độ ẩm, tỷ lệ hạt vỡ đã có ô "Quy cách / tiêu chuẩn" phía dưới, nên không lặp
 * lại ở đây.
 *
 * Giá trị NCC thêm (mã hàng chưa có trong danh sách) được gửi kèm form trong
 * `attribute_pool` và server lưu vào danh mục để NCC khác dùng lại. Thông số tự thêm
 * không tạo nhãn xác minh và không tự hiện cho buyer; Vexim xem khi duyệt.
 */
export function SupplierAttributeInputs({ officialFields, supplierFields = [], values, disabled = false }: {
  officialFields: ProductAttributeField[];
  supplierFields?: ProductAttributeField[];
  values?: Record<string, unknown> | null;
  disabled?: boolean;
}) {
  const [pool, setPool] = useState<ProductAttributeField[]>(supplierFields);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(values ?? {}).filter(([, value]) => typeof value === "string") as [string, string][]));
  const [optionFor, setOptionFor] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => mergeAttributeFields(officialFields, pool), [officialFields, pool]);
  const visible = fields.filter((field) => !field.showWhen || draft[field.showWhen.key] === field.showWhen.value);
  // Danh mục chưa có thông số nào: không hiện khối trống, quy cách đã nằm ở ô bên dưới.
  if (!fields.length) return null;

  function set(key: string, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /** Ghi một giá trị mới vào pool của nhóm hàng để NCC sau chọn lại được. */
  function addOption(field: ProductAttributeField, raw: string) {
    const value = cleanSupplierAttributeText(raw, 60);
    if (!value) { setError("Giá trị mới cần 2–60 ký tự, không kèm link, email hay số điện thoại."); return; }
    if (!field.options.includes(value)) {
      if (field.options.length + 1 > 20) { setError("Một thông số chỉ giữ tối đa 20 lựa chọn."); return; }
      setPool((previous) => {
        const hit = previous.find((item) => item.key === field.key);
        if (hit && hit.options.length) {
          return previous.map((item) => item.key === field.key
            ? { ...item, options: [...item.options, value] } : item);
        }
        // Trường CMS: giữ nguyên nhãn của danh mục, chỉ bổ sung lựa chọn.
        return [...previous.filter((item) => item.key !== field.key),
          { key: field.key, label: field.label, type: "select", options: [value], supplier_added: true }];
      });
    }
    set(field.key, value);
    setOptionFor(null);
    setOptionDraft("");
    setError(null);
  }

  return <section className="rounded-xl border border-ink-200 bg-white p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-[13.5px] font-bold text-ink-900">Thông số theo nhóm hàng</h3>
      <span className="text-[11px] font-semibold text-ink-500">Không bắt buộc · {fields.length} thông số</span>
    </div>
    <p className="mt-1 text-[12px] leading-5 text-ink-600">
      Chọn đúng thông số cho lô hàng này, nếu không có thông số nào phù hợp nhà cung cấp có thể tự thêm.
    </p>

    {!!visible.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {visible.map((field) => <div key={field.key} className="min-w-0">
        <label className="block text-[12px] font-semibold text-ink-800" htmlFor={`attribute-${field.key}`}>
          {field.label}
          {field.supplier_added && <span className="ml-1.5 rounded bg-ink-100 px-1 py-0.5 text-[9.5px] font-bold tracking-wide text-ink-500 uppercase">NCC tự thêm</span>}
        </label>

        {field.type === "select"
          ? <>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <select id={`attribute-${field.key}`} className="input min-w-0 flex-1" name={`attribute:${field.key}`} disabled={disabled}
                value={draft[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)}>
                <option value="">Chưa chọn</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              {optionFor === field.key && <>
                <input className="input min-w-0 flex-1" autoFocus maxLength={60} placeholder="Giá trị mới"
                  aria-label={`Giá trị mới cho ${field.label}`} value={optionDraft}
                  onChange={(event) => setOptionDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(field, optionDraft); } }} />
                <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => addOption(field, optionDraft)}>Thêm</button>
              </>}
            </div>
            {!disabled && optionFor !== field.key && <button type="button"
              onClick={() => { setOptionFor(field.key); setOptionDraft(""); setError(null); }}
              className="mt-1 text-[11.5px] font-semibold text-brand-800 hover:underline">Thêm</button>}
          </>
          : <input id={`attribute-${field.key}`} className="input mt-1" name={`attribute:${field.key}`} disabled={disabled}
            maxLength={200} placeholder="Giá trị thực tế" value={draft[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)} />}
      </div>)}
    </div>}

    {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-800">{error}</p>}
    {pool.some((field) => field.supplier_added) && <p className="mt-2 text-[10.5px] leading-4 text-ink-500">
      Giá trị tự thêm không tạo nhãn xác minh.
    </p>}

    <input type="hidden" name="attribute_pool" value={JSON.stringify(pool)} />
  </section>;
}
