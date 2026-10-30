"use client";

import { useState } from "react";
import type { ProductAttributeField } from "@/lib/types";

/** Optional category-specific inputs. No field ever implies independent verification. */
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
  return <section className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
    <h3 className="font-bold text-ink-900">Thông số theo nhóm hàng</h3>
    <p className="mt-1 text-xs text-ink-600">Chỉ khai giá trị đúng với sản phẩm này; để trống nếu chưa rõ. Bảng tham khảo của danh mục không tự điền vào đây.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{fields.filter((f) => !f.showWhen || current[f.showWhen.key] === f.showWhen.value).map((field) => <label key={field.key} className="block text-sm font-semibold text-ink-800">
      {field.label}
      {field.type === "select" ? <select className="input mt-1" name={`attribute:${field.key}`} disabled={disabled} value={String(current[field.key] ?? "")} onChange={(e) => set(field.key, e.target.value)}><option value="">Chưa chọn</option>{field.options.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        : <input className="input mt-1" name={`attribute:${field.key}`} disabled={disabled} maxLength={200} value={String(current[field.key] ?? "")} onChange={(e) => set(field.key, e.target.value)} />}
    </label>)}</div>
  </section>;
}
