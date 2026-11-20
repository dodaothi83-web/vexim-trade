"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DesignConsent } from "@/lib/supplier-portal/storefront-design";
import { recordDesignConsentAction, revokeDesignConsentAction } from "./actions";

const METHOD: Record<DesignConsent["method"], string> = { contract: "Hợp đồng dịch vụ", email: "Email", zalo: "Tin nhắn Zalo", other: "Khác" };
const SCOPE: Record<DesignConsent["scope"], string> = { storefront: "Chỉ trang nhà cung cấp", storefront_aplus: "Trang nhà cung cấp + nội dung A+ sản phẩm" };

/** Bước 1: ghi nhận nhà cung cấp đồng ý cho Vexim thiết kế và đăng trang thay họ. */
export function DesignConsentCard({ supplierId, consent, canManage }: { supplierId: string; consent: DesignConsent | null; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

  if (consent) return <section className="card p-4" aria-labelledby="consent-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="consent-title" className="text-sm font-bold text-ink-900">1. Đồng ý thiết kế hộ</h2>
        <p className="mt-0.5 text-xs text-emerald-800">Đã ghi nhận · trình thiết kế đang mở</p>
      </div>
      {canManage && <button type="button" disabled={busy} className="btn btn-soft btn-sm" onClick={async () => {
        if (!window.confirm("Thu hồi đồng ý? Trình thiết kế sẽ khoá, trang đang hiện giữ nguyên.")) return;
        setBusy(true);
        const result = await revokeDesignConsentAction(supplierId, consent.id);
        setMessage({ ok: result.ok, text: result.message }); setBusy(false);
        if (result.ok) router.refresh();
      }}>Thu hồi</button>}
    </div>
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      <div><dt className="text-ink-500">Người đại diện</dt><dd className="font-semibold text-ink-900">{consent.representative}</dd></div>
      <div><dt className="text-ink-500">Ngày đồng ý</dt><dd className="font-semibold text-ink-900">{consent.consented_on.split("-").reverse().join("/")}</dd></div>
      <div><dt className="text-ink-500">Hình thức</dt><dd className="font-semibold text-ink-900">{METHOD[consent.method]}</dd></div>
      <div><dt className="text-ink-500">Bằng chứng</dt><dd className="break-words font-semibold text-ink-900">{consent.evidence}</dd></div>
      <div className="sm:col-span-2"><dt className="text-ink-500">Phạm vi</dt><dd className="font-semibold text-ink-900">{SCOPE[consent.scope]}</dd></div>
      <div className="sm:col-span-2"><dt className="text-ink-500">Người ghi nhận</dt><dd className="text-ink-700">{consent.recorded_by_email ?? "—"}</dd></div>
    </dl>
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;

  return <form className="card p-4" aria-labelledby="consent-title" onSubmit={async (event) => {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true); setMessage(null);
    const result = await recordDesignConsentAction(supplierId, new FormData(event.currentTarget));
    setMessage({ ok: result.ok, text: result.message }); setBusy(false);
    if (result.ok) router.refresh();
  }}>
    <h2 id="consent-title" className="text-sm font-bold text-ink-900">1. Ghi nhận nhà cung cấp đồng ý</h2>
    <p className="mt-0.5 text-xs leading-5 text-ink-500">Bắt buộc trước khi sửa trang. Chỉ dùng ảnh và số liệu thật do nhà cung cấp gửi; trang đẹp không thay đổi mức xác minh.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-ink-700">Người đại diện đồng ý<input name="representative" required maxLength={160} placeholder="Họ tên, chức vụ" className="input mt-1 w-full" disabled={!canManage} /></label>
      <label className="text-xs font-semibold text-ink-700">Ngày đồng ý<input name="consented_on" type="date" required max={today} defaultValue={today} className="input mt-1 w-full" disabled={!canManage} /></label>
      <label className="text-xs font-semibold text-ink-700">Hình thức<select name="method" className="input mt-1 w-full" disabled={!canManage}>
        {Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-ink-700">Bằng chứng (số hợp đồng, tiêu đề email…)<input name="evidence" required maxLength={300} className="input mt-1 w-full" disabled={!canManage} /></label>
      <label className="text-xs font-semibold text-ink-700 sm:col-span-2">Phạm vi<select name="scope" className="input mt-1 w-full" disabled={!canManage}>
        {Object.entries(SCOPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-ink-900">
      <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4 accent-brand-700" disabled={!canManage} />
      Nhà cung cấp đã đồng ý cho Vexim thiết kế và đăng trang thay họ.
    </label>
    {canManage && <button type="submit" disabled={busy} className="btn btn-primary btn-sm mt-3">{busy ? "Đang lưu…" : "Ghi nhận và mở trình thiết kế"}</button>}
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </form>;
}
