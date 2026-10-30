"use client";

import { useActionState, useState } from "react";
import type { QuantityPriceSettings } from "@/lib/products/quantity-price-settings";
import { saveGradePriceBounds, saveQuantityPriceSettings, type PricingSettingsResult } from "./actions";

const initial: PricingSettingsResult = { ok: false, message: "" };
const fields: Array<{ key: keyof QuantityPriceSettings; label: string; min: string; max: string; step: string }> = [
  { key: "max_tiers", label: "Số mức giá tối đa", min: "1", max: "100", step: "1" },
  { key: "max_price_ratio", label: "Giá cao nhất / thấp nhất tối đa", min: "1", max: "999999", step: "0.0001" },
  { key: "max_last_moq_ratio", label: "Mức cuối / MOQ tối đa", min: "1", max: "99999999", step: "0.0001" },
  { key: "reminder_days", label: "Chu kỳ nhắc xác nhận (ngày)", min: "1", max: "36500", step: "1" },
  { key: "stale_days", label: "Không tính giá cũ sau (ngày)", min: "1", max: "36500", step: "1" },
  { key: "offer_max_discount_percent", label: "Giảm giá tối đa (%)", min: "0.01", max: "100", step: "0.01" },
  { key: "offer_max_days", label: "Thời hạn ưu đãi tối đa (ngày)", min: "1", max: "36500", step: "1" },
  { key: "offer_cooldown_days", label: "Nghỉ giữa các ưu đãi (ngày)", min: "0", max: "36500", step: "1" },
  { key: "offer_price_lock_days", label: "Không tăng giá trước ưu đãi (ngày)", min: "0", max: "36500", step: "1" },
];

function ResultMessage({ result }: { result: PricingSettingsResult }) {
  if (!result.message) return null;
  return <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-emerald-700" : "text-sm text-rose-700"}>{result.message}</p>;
}

export function SettingsForm({ settings }: { settings: QuantityPriceSettings }) {
  const [result, action, pending] = useActionState(saveQuantityPriceSettings, initial);
  return <section className="rounded-xl border border-ink-200 bg-white p-5">
    <h2 className="font-bold text-ink-900">Tham số chung</h2>
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => <label key={field.key} className="text-sm font-semibold text-ink-700">{field.label}
        <input className="input mt-1 w-full" type="number" required name={field.key} min={field.min} max={field.max} step={field.step} defaultValue={settings[field.key]} />
      </label>)}
      <div className="space-y-3 sm:col-span-2 lg:col-span-3"><ResultMessage result={result} />
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Đang lưu…" : "Lưu tham số"}</button>
      </div>
    </form>
  </section>;
}

type Grade = { name: string; min: number | null; max: number | null };
export type GradeCategory = { id: string; name: string; grades: Grade[] };

export function GradeBoundsForm({ categories }: { categories: GradeCategory[] }) {
  const [result, action, pending] = useActionState(saveGradePriceBounds, initial);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const category = categories.find((entry) => entry.id === categoryId);
  const [grade, setGrade] = useState(categories[0]?.grades[0]?.name ?? "");
  const selected = category?.grades.find((entry) => entry.name === grade);
  // Remount both inputs synchronously on selection or saved-value change. This
  // prevents the prior grade's numbers being submitted for a newly selected grade.
  const boundsKey = `${categoryId}:${grade}:${selected?.min ?? ""}:${selected?.max ?? ""}`;
  return <section className="rounded-xl border border-ink-200 bg-white p-5">
    <h2 className="font-bold text-ink-900">Ngưỡng giá theo grade</h2>
    <p className="mt-1 text-sm leading-6 text-ink-600">Ngưỡng tính theo USD/kg. Giá ngoài ngưỡng sẽ cảnh báo để rà soát, không chặn lưu. Để trống cả hai ô để xóa ngưỡng.</p>
    {categories.length === 0 ? <p className="mt-3 text-sm text-ink-500">Chưa có danh mục với grade chuẩn.</p> :
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-ink-700">Danh mục
          <select name="category_id" value={categoryId} className="input mt-1 w-full" onChange={(e) => {
            const next = categories.find((entry) => entry.id === e.target.value);
            setCategoryId(e.target.value); setGrade(next?.grades[0]?.name ?? "");
          }} required>{categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
        </label>
        <label className="text-sm font-semibold text-ink-700">Grade
          <select name="grade" value={grade} className="input mt-1 w-full" onChange={(e) => setGrade(e.target.value)} required>
            {category?.grades.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-ink-700">Giá từ (USD/kg)
          <input key={`min:${boundsKey}`} name="min_usd_per_kg" type="number" min="0.0001" max="1000000000" step="0.0001" className="input mt-1 w-full" defaultValue={selected?.min ?? ""} />
        </label>
        <label className="text-sm font-semibold text-ink-700">Giá đến (USD/kg)
          <input key={`max:${boundsKey}`} name="max_usd_per_kg" type="number" min="0.0001" max="1000000000" step="0.0001" className="input mt-1 w-full" defaultValue={selected?.max ?? ""} />
        </label>
        <div className="space-y-3 sm:col-span-2"><ResultMessage result={result} />
          <button className="btn btn-primary btn-sm" disabled={pending || !grade}>{pending ? "Đang lưu…" : "Lưu ngưỡng grade"}</button>
        </div>
      </form>}
  </section>;
}
