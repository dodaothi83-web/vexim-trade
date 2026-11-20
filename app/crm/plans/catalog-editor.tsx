"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { SupplierPlanCatalogEntry } from "@/lib/supplier-plans";
import { savePlanCatalogAction, type PlanCatalogResult } from "./actions";

/** Form sửa một gói. Chỉ quản trị viên thấy nút lưu; người khác xem ở chế độ chỉ đọc. */
export function PlanCatalogEditor({ entry, canEdit }: { entry: SupplierPlanCatalogEntry; canEdit: boolean }) {
  const [state, action, pending] = useActionState<PlanCatalogResult, FormData>(savePlanCatalogAction, null);
  const [prices, setPrices] = useState(entry.prices.length ? entry.prices.map((p) => ({ months: String(p.months), price: String(p.price_vnd) })) : []);
  const disabled = !canEdit || pending;
  const field = "input mt-1 w-full";

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="plan" value={entry.plan} />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-ink-900">{entry.name}</h3>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{entry.plan}</span>
      </div>
      <label className="text-xs font-semibold text-ink-700">Tên gói
        <input name="name" defaultValue={entry.name} maxLength={60} required disabled={disabled} className={field} />
      </label>
      <label className="text-xs font-semibold text-ink-700">Mô tả ngắn (hiện khi gói không có giá, ví dụ “Miễn phí”)
        <input name="summary" defaultValue={entry.summary} maxLength={300} disabled={disabled} className={field} />
      </label>

      <fieldset className="text-xs font-semibold text-ink-700">
        <legend>Bảng giá</legend>
        <div className="mt-1 space-y-1.5">
          {prices.length === 0 && <p className="font-normal text-ink-500">Chưa có giá: gói hiện “{entry.summary || "Miễn phí"}”.</p>}
          {prices.map((price, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input name="price_months" inputMode="numeric" value={price.months} disabled={disabled} aria-label="Số tháng"
                onChange={(e) => setPrices((all) => all.map((p, i) => i === index ? { ...p, months: e.target.value } : p))}
                className="input w-16 tabular-nums" />
              <span className="font-normal text-ink-500">tháng</span>
              <input name="price_vnd" inputMode="numeric" value={price.price} disabled={disabled} aria-label="Giá (₫)"
                onChange={(e) => setPrices((all) => all.map((p, i) => i === index ? { ...p, price: e.target.value } : p))}
                className="input min-w-0 flex-1 tabular-nums" />
              <span className="font-normal text-ink-500">₫</span>
              {canEdit && <button type="button" aria-label="Xoá mức giá" disabled={pending} onClick={() => setPrices((all) => all.filter((_, i) => i !== index))}
                className="rounded-md p-1.5 text-ink-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button>}
            </div>
          ))}
          {canEdit && prices.length < 6 && <button type="button" disabled={pending} onClick={() => setPrices((all) => [...all, { months: "", price: "" }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus className="size-3.5" /> Thêm mức giá</button>}
        </div>
      </fieldset>

      <label className="text-xs font-semibold text-ink-700">Quyền lợi (mỗi dòng một ý, hiện trong bảng gói của nhà cung cấp)
        <textarea name="features" defaultValue={entry.features.join("\n")} rows={6} disabled={disabled} className={`${field} text-sm leading-6`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-ink-700">Số sản phẩm tối đa
          <input name="max_products" inputMode="numeric" defaultValue={entry.maxProducts ?? ""} placeholder="Không giới hạn" disabled={disabled} className={`${field} tabular-nums`} />
        </label>
        <label className="mt-5 flex items-start gap-2 text-xs font-semibold text-ink-700">
          <input type="checkbox" name="rich_content" value="yes" defaultChecked={entry.richContent} disabled={disabled} className="mt-0.5 size-4 accent-brand-700" />
          Mở nội dung A+ (ảnh, video trong mô tả chi tiết)
        </label>
      </div>
      <p className="text-[11px] leading-4 text-ink-500">Số sản phẩm và nội dung A+ có hiệu lực ngay khi lưu. Hạ mức không xoá sản phẩm hay nội dung đã có.</p>
      {canEdit && <button type="submit" disabled={pending} className="btn btn-primary btn-sm self-start">{pending ? "Đang lưu…" : "Lưu gói"}</button>}
      {state && <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
    </form>
  );
}
