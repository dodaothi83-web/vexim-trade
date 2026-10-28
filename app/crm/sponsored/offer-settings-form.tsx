"use client";

import { useActionState } from "react";
import { updateOfferSettingsAction, type OfferActionResult } from "./offer-actions";
import type { OfferSettings } from "@/lib/sponsored/offer-settings";

const INITIAL: OfferActionResult = { ok: false, message: "" };
export function OfferSettingsForm({ settings }: { settings: OfferSettings }) {
  const [state, action, pending] = useActionState(updateOfferSettingsAction, INITIAL);
  return <section className="mb-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm" aria-labelledby="offer-settings-title">
    <h2 id="offer-settings-title" className="text-[15px] font-bold text-ink-900">Cấu hình gói đẩy sản phẩm</h2>
    <p className="mt-1 text-xs leading-5 text-ink-500">Chỉ lưu cấu hình chuẩn bị. Chức năng mua, giữ chỗ và giới hạn bể mới chưa hoạt động; việc lưu không mở bán hoặc thay đổi gói hiện có.</p>
    <form action={action} className="mt-4 grid gap-4 sm:grid-cols-3">
      <label className="block text-xs font-bold text-ink-700">Giá gói (VND)
        <input name="price_vnd" type="number" min="1" max="1000000000" step="1" defaultValue={settings.price_vnd ?? ""} placeholder="Chưa đặt giá" className="input mt-1 w-full font-mono tabular-nums" />
        <span className="mt-1 block font-normal leading-5 text-ink-500">Để trống nếu chưa chốt giá.</span>
      </label>
      <label className="block text-xs font-bold text-ink-700">Giữ chỗ (phút)
        <input name="hold_minutes" type="number" min="1" max="1440" step="1" required defaultValue={settings.hold_minutes} className="input mt-1 w-full" />
      </label>
      <label className="block text-xs font-bold text-ink-700">Số gói tối đa mỗi ô
        <input name="packages_per_slot" type="number" min="1" max="20" step="1" required defaultValue={settings.packages_per_slot} className="input mt-1 w-full" />
      </label>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`text-xs sm:col-span-3 ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
      <div className="sm:col-span-3"><button type="submit" disabled={pending} className="btn btn-primary btn-sm">{pending ? "Đang lưu…" : "Lưu cấu hình"}</button></div>
    </form>
  </section>;
}
