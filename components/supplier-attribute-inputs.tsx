"use client";

import { useMemo, useState } from "react";
import type { ProductAttributeField } from "@/lib/types";
import {
  SUPPLIER_ATTRIBUTE_FIELD_LIMIT, attributeKeyFromLabel, cleanSupplierAttributeText, mergeAttributeFields,
} from "@/lib/product-attributes";

/**
 * Thông số theo nhóm hàng dành cho nhà cung cấp.
 *
 * Vexim không hiểu thông số bằng chính nhà máy, nên ngoài các trường CMS, NCC được
 * tự thêm thông số còn thiếu (hoặc thêm lựa chọn mới cho trường có sẵn). Những gì
 * NCC thêm được gửi kèm form trong `attribute_pool` và server lưu vào danh mục, để
 * nhà cung cấp khác trong cùng nhóm hàng mở ra là thấy sẵn. Thông số tự thêm không
 * tạo nhãn xác minh và không tự hiện cho buyer; Vexim xem khi duyệt.
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
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [optionFor, setOptionFor] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => mergeAttributeFields(officialFields, pool), [officialFields, pool]);
  const visible = fields.filter((field) => !field.showWhen || draft[field.showWhen.key] === field.showWhen.value);
  const addable = !disabled && pool.length < SUPPLIER_ATTRIBUTE_FIELD_LIMIT;

  function set(key: string, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /** Ghi một lựa chọn mới vào pool của nhóm hàng để NCC sau chọn lại được. */
  function addOption(field: ProductAttributeField, raw: string) {
    const value = cleanSupplierAttributeText(raw, 60);
    if (!value) { setError("Lựa chọn mới cần 2–60 ký tự, không kèm link, email hay số điện thoại."); return; }
    if (field.options.includes(value)) { set(field.key, value); setOptionFor(null); setOptionDraft(""); setError(null); return; }
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
    set(field.key, value);
    setOptionFor(null);
    setOptionDraft("");
    setError(null);
  }

  /** NCC tự thêm một thông số mới (nhóm hàng chưa có trường này). */
  function addField() {
    const label = cleanSupplierAttributeText(newLabel);
    const value = String(newValue ?? "").trim().slice(0, 200);
    if (!label) { setError("Tên thông số cần 2–48 ký tự, viết như nhà máy vẫn gọi (ví dụ: Độ ẩm). Không kèm link, email, số điện thoại."); return; }
    if (!value) { setError("Nhập giá trị thông số cho sản phẩm này."); return; }
    const taken = new Set(fields.map((field) => field.key));
    let key = attributeKeyFromLabel(label);
    for (let index = 2; taken.has(key); index += 1) key = `${attributeKeyFromLabel(label).slice(0, 28)}_${index}`;
    setPool((previous) => [...previous, { key, label, type: "text", options: [], supplier_added: true }]);
    set(key, value);
    setNewLabel("");
    setNewValue("");
    setError(null);
  }

  return <section className="rounded-xl border border-ink-200 bg-white p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-[13.5px] font-bold text-ink-900">Thông số theo nhóm hàng</h3>
      <span className="text-[11px] font-semibold text-ink-500">Không bắt buộc · {fields.length} thông số</span>
    </div>
    <p className="mt-1 text-[12px] leading-5 text-ink-600">
      Khai đúng thông số của lô hàng này, viết theo cách nhà máy vẫn gọi. Thiếu thông số nào thì thêm ngay bên dưới —
      thông số bạn thêm được lưu vào nhóm hàng <strong className="font-semibold text-ink-800">để nhà cung cấp khác dùng lại</strong>,
      và Vexim xem khi duyệt. Để trống nếu chưa rõ.
    </p>

    {!!visible.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {visible.map((field) => <div key={field.key} className="min-w-0">
        <label className="block text-[12px] font-semibold text-ink-800" htmlFor={`attribute-${field.key}`}>
          {field.label}
          {field.supplier_added && <span className="ml-1.5 rounded bg-ink-100 px-1 py-0.5 text-[9.5px] font-bold tracking-wide text-ink-500 uppercase">NCC tự thêm</span>}
        </label>
        {field.type === "select"
          ? <div className="mt-1 space-y-1">
            <select id={`attribute-${field.key}`} className="input" name={`attribute:${field.key}`} disabled={disabled}
              value={draft[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)}>
              <option value="">Chưa khai</option>
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {!disabled && optionFor !== field.key && <button type="button" onClick={() => { setOptionFor(field.key); setOptionDraft(""); }}
              className="text-[11.5px] font-semibold text-brand-800 underline">Chưa có trong danh sách? Thêm giá trị</button>}
            {!disabled && optionFor === field.key && <div className="rounded-lg bg-ink-50 p-2">
              <div className="flex gap-1.5">
                <input className="input" autoFocus maxLength={60} placeholder="Giá trị nhà máy đang dùng" value={optionDraft}
                  aria-label={`Giá trị mới cho ${field.label}`} onChange={(event) => setOptionDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(field, optionDraft); } }} />
                <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => addOption(field, optionDraft)}>Lưu</button>
              </div>
              <p className="mt-1 text-[10.5px] leading-4 text-ink-500">Giá trị này được thêm vào danh sách của nhóm hàng cho lần sau.</p>
            </div>}
          </div>
          : <input id={`attribute-${field.key}`} className="input mt-1" name={`attribute:${field.key}`} disabled={disabled}
            maxLength={200} placeholder="Giá trị thực tế" value={draft[field.key] ?? ""}
            onChange={(event) => set(field.key, event.target.value)} />}
      </div>)}
    </div>}

    {addable && <div className="mt-3 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
      <p className="text-[12px] font-bold text-brand-900">Thêm thông số chưa có trong danh sách</p>
      <p className="mt-0.5 text-[11px] leading-4 text-brand-900/70">Ví dụ: Độ ẩm, Tỷ lệ hạt vỡ, Quy cách bao bì thực tế, Ngày đóng hàng. Thêm xong nhà cung cấp khác sẽ thấy ngay khi khai sản phẩm cùng nhóm hàng.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input className="input" maxLength={48} placeholder="Tên thông số" aria-label="Tên thông số mới"
          value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
        <input className="input" maxLength={200} placeholder="Giá trị cho sản phẩm này" aria-label="Giá trị thông số mới"
          value={newValue} onChange={(event) => setNewValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} />
        <button type="button" className="btn btn-secondary btn-sm justify-center" onClick={addField}>Thêm thông số</button>
      </div>
    </div>}

    {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-800">{error}</p>}
    {pool.some((field) => field.supplier_added) && <p className="mt-2 text-[10.5px] leading-4 text-ink-500">
      Thông số do NCC tự thêm không tạo nhãn xác minh và chưa hiện trên trang buyer; Vexim xem khi duyệt.
    </p>}

    <input type="hidden" name="attribute_pool" value={JSON.stringify(pool)} />
  </section>;
}
