"use client";

import { useState } from "react";
import type { ProductAttributeField } from "@/lib/types";

/**
 * Optional category-specific inputs (CRM). No field ever implies independent verification.
 * Một thông số thì nhãn "Phân loại sản phẩm"; lựa chọn hiện đúng chữ nhập trong CRM.
 */
export function ProductAttributeInputs({ fields, values, onChange, disabled = false }: {
  fields: ProductAttributeField[];
  values: Record<string, unknown>;
  onChange?: (values: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(values ?? {}).filter(([, v]) => typeof v === "string") as [string, string][]));
  const current = onChange ? values : local;
  if (!fields.length) return null;
  const set = (key: string, value: string) => {
    const next = { ...current, [key]: value } as Record<string, string>;
    if (onChange) onChange(next); else setLocal(next);
  };
  const visible = fields.filter((f) => !f.showWhen || current[f.showWhen.key] === f.showWhen.value);
  // Trả về các ô rời (không khung, không tiêu đề) để form cha xếp chung lưới, cạnh ô công suất.
  return <>{visible.map((field) => <label key={field.key} className="block min-w-0 text-[12.5px]">
    <span className="mb-1 block font-semibold text-ink-800">{visible.length === 1 ? "Phân loại sản phẩm" : field.label}</span>
    {field.type === "select" ? <select className="input" name={`attribute:${field.key}`} disabled={disabled} value={String(current[field.key] ?? "")} onChange={(e) => set(field.key, e.target.value)}><option value="">Chưa chọn</option>{field.options.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      : <input className="input" name={`attribute:${field.key}`} disabled={disabled} maxLength={200} value={String(current[field.key] ?? "")} onChange={(e) => set(field.key, e.target.value)} />}
  </label>)}</>;
}
