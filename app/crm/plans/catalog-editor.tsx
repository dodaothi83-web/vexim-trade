"use client";

import { useActionState, useState } from "react";
import { Check, Crown, Plus, Trash2 } from "lucide-react";

import { formatVnd, type SupplierPlanCatalogEntry } from "@/lib/supplier-plans";
import { savePlanCatalogAction, type PlanCatalogResult } from "./actions";

/**
 * Sửa một gói thành viên, chia 3 nhóm theo mức ảnh hưởng: nội dung hiển thị, bảng giá, quyền trên hệ thống.
 * Bên phải là thẻ gói đúng như nhà cung cấp thấy trong bảng "Gói thành viên", cập nhật ngay khi gõ.
 * Chỉ quản trị viên lưu được; người khác xem ở chế độ chỉ đọc.
 */
export function PlanCatalogEditor({ entry, canEdit }: { entry: SupplierPlanCatalogEntry; canEdit: boolean }) {
  const [state, action, pending] = useActionState<PlanCatalogResult, FormData>(savePlanCatalogAction, null);
  const [name, setName] = useState(entry.name);
  const [summary, setSummary] = useState(entry.summary);
  const [features, setFeatures] = useState(entry.features.join("\n"));
  const [maxProducts, setMaxProducts] = useState(entry.maxProducts === null ? "" : String(entry.maxProducts));
  const [richContent, setRichContent] = useState(entry.richContent);
  const [videoMinutes, setVideoMinutes] = useState(entry.videoMinutes === null ? "" : String(entry.videoMinutes));
  const [prices, setPrices] = useState(entry.prices.length ? entry.prices.map((p) => ({ months: String(p.months), price: String(p.price_vnd) })) : []);
  const disabled = !canEdit || pending;
  const field = "input mt-1 w-full";
  const group = "rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5";
  const groupTitle = "text-sm font-bold text-ink-900";
  const groupHint = "mt-0.5 text-xs text-ink-500";

  const previewPrices = prices
    .map((p) => ({ months: Number(p.months), price: Number(p.price.replace(/[^\d]/g, "")) }))
    .filter((p) => Number.isInteger(p.months) && p.months > 0 && Number.isFinite(p.price))
    .sort((a, b) => a.months - b.months);
  const previewFeatures = features.split("\n").map((f) => f.trim()).filter(Boolean);
  const limitChanged = (maxProducts.trim() || null) !== (entry.maxProducts === null ? null : String(entry.maxProducts)) || richContent !== entry.richContent
    || (videoMinutes.trim() || null) !== (entry.videoMinutes === null ? null : String(entry.videoMinutes));

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <input type="hidden" name="plan" value={entry.plan} />
      <div className="space-y-4">
        <section className={group} aria-labelledby={`${entry.plan}-display`}>
          <h3 id={`${entry.plan}-display`} className={groupTitle}>Nội dung hiển thị</h3>
          <p className={groupHint}>Hiện trong bảng “Gói thành viên” ở cổng nhà cung cấp.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-700">Tên gói
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required disabled={disabled} className={field} />
            </label>
            <label className="text-xs font-semibold text-ink-700">Mô tả ngắn khi gói không có giá
              <input name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} placeholder="Ví dụ: Miễn phí" disabled={disabled} className={field} />
            </label>
          </div>
          <label className="mt-3 block text-xs font-semibold text-ink-700">Quyền lợi, mỗi dòng một ý
            <textarea name="features" value={features} onChange={(e) => setFeatures(e.target.value)} rows={6} disabled={disabled} className={`${field} text-sm leading-6`} />
          </label>
        </section>

        <section className={group} aria-labelledby={`${entry.plan}-prices`}>
          <h3 id={`${entry.plan}-prices`} className={groupTitle}>Bảng giá</h3>
          <p className={groupHint}>Giá tham khảo hiện cho nhà cung cấp. Hệ thống không thu tiền; Vexim thu và xác nhận ngoài hệ thống.</p>
          <div className="mt-3 space-y-2">
            {prices.length === 0 && <p className="text-sm text-ink-500">Chưa có giá. Gói hiện “{summary || "Miễn phí"}”.</p>}
            {prices.map((price, index) => (
              <div key={index} className="flex items-center gap-2">
                <input name="price_months" inputMode="numeric" value={price.months} disabled={disabled} aria-label="Số tháng"
                  onChange={(e) => setPrices((all) => all.map((p, i) => i === index ? { ...p, months: e.target.value } : p))}
                  className="input w-20 tabular-nums" />
                <span className="text-sm text-ink-500">tháng</span>
                <input name="price_vnd" inputMode="numeric" value={price.price} disabled={disabled} aria-label="Giá (₫)"
                  onChange={(e) => setPrices((all) => all.map((p, i) => i === index ? { ...p, price: e.target.value } : p))}
                  className="input min-w-0 flex-1 tabular-nums sm:max-w-[220px]" />
                <span className="text-sm text-ink-500">₫</span>
                {canEdit && <button type="button" aria-label="Xoá mức giá" disabled={pending} onClick={() => setPrices((all) => all.filter((_, i) => i !== index))}
                  className="rounded-md p-1.5 text-ink-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button>}
              </div>
            ))}
            {canEdit && prices.length < 6 && <button type="button" disabled={pending} onClick={() => setPrices((all) => [...all, { months: "", price: "" }])}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><Plus className="size-4" /> Thêm mức giá</button>}
          </div>
        </section>

        <section className={`${group} border-amber-200`} aria-labelledby={`${entry.plan}-rules`}>
          <h3 id={`${entry.plan}-rules`} className={groupTitle}>Quyền trên hệ thống</h3>
          <p className={groupHint}>Có hiệu lực ngay khi lưu, cho mọi nhà cung cấp đang dùng gói này.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-ink-700">Số sản phẩm tối đa
              <input name="max_products" inputMode="numeric" value={maxProducts} onChange={(e) => setMaxProducts(e.target.value)} placeholder="Để trống là không giới hạn" disabled={disabled} className={`${field} tabular-nums`} />
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 text-sm text-ink-800 sm:mt-5">
              <input type="checkbox" name="rich_content" value="yes" checked={richContent} onChange={(e) => setRichContent(e.target.checked)} disabled={disabled} className="mt-0.5 size-4 accent-brand-700" />
              Mở video sản phẩm và nội dung A+
            </label>
            {!richContent && <input type="hidden" name="video_minutes" value={videoMinutes} />}
            {richContent && <label className="text-xs font-semibold text-ink-700">Tổng số phút video
              <input name="video_minutes" inputMode="numeric" value={videoMinutes} onChange={(e) => setVideoMinutes(e.target.value)} placeholder="Để trống là không giới hạn" disabled={disabled} className={`${field} tabular-nums`} />
              <span className="mt-1 block font-normal text-ink-500">Cộng mọi video đang lưu của một nhà cung cấp: video nhà máy, video sản phẩm, video A+.</span>
            </label>}
          </div>
          {richContent && <p className="mt-3 text-xs leading-5 text-ink-500">Mỗi video: nhà máy tối đa 3 phút, sản phẩm và A+ tối đa 2 phút. Mỗi trang A+ tối đa 2 video.</p>}
          {limitChanged && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Hạ mức không xoá sản phẩm, video hay nội dung A+ đã có. Sản phẩm vượt mức chỉ ẩn với người mua; vượt số phút video thì không tải thêm video mới.
          </p>}
        </section>

        {canEdit ? <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Đang lưu…" : `Lưu gói ${name || entry.name}`}</button>
          {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
        </div> : <p className="text-sm text-ink-500">Chỉ quản trị viên được sửa nội dung và giá gói.</p>}
      </div>

      <aside className="lg:sticky lg:top-24" aria-label="Xem trước">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Nhà cung cấp thấy</p>
        <div className="flex flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <h4 className="inline-flex items-center gap-1.5 text-base font-bold text-ink-900">
            {entry.plan !== "basic" && <Crown className="size-4 text-amber-600" aria-hidden="true" />}{name || entry.name}
          </h4>
          <div className="mt-3 space-y-1">
            {previewPrices.length === 0 ? <p className="text-lg font-bold text-ink-900">{summary || "Miễn phí"}</p>
              : previewPrices.map((p) => <p key={p.months} className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-600">{p.months} tháng</span>
                <span className="text-lg font-bold tabular-nums text-ink-900">{formatVnd(p.price)}</span>
              </p>)}
          </div>
          <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm text-ink-700">
            {previewFeatures.length ? previewFeatures.map((item, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />{item}</li>)
              : <li className="text-ink-500">Chưa có quyền lợi.</li>}
          </ul>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-500">
          Áp dụng: {maxProducts.trim() ? `tối đa ${maxProducts.trim()} sản phẩm` : "không giới hạn sản phẩm"}, {richContent ? `có video và A+, ${videoMinutes.trim() ? `${videoMinutes.trim()} phút video` : "không giới hạn phút video"}` : "không có video và A+"}.
        </p>
      </aside>
    </form>
  );
}
