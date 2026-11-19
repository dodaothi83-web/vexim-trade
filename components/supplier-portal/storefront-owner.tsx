"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock3, Crown, ExternalLink, X } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { StorefrontMessages } from "@/lib/i18n/portal/storefront";
import { formatVnd, SUPPLIER_PLAN_LABELS, SUPPLIER_PLANS, type SupplierPlan, type SupplierPlanCatalog } from "@/lib/supplier-plans";
import { submitServiceRequestAction, type ServiceRequestResult } from "@/app/supplier/portal/services/actions";

type OwnerCopy = StorefrontMessages["owner"];

/**
 * Các nút chỉ nhà cung cấp thấy trên "Trang của tôi". Trang công khai không truyền các
 * phần này vào SupplierStorefront nên người mua không bao giờ thấy.
 */

/** Badge gói hiện tại + nút "Xem trang", đặt cạnh tên công ty. */
export function StorefrontPlanBadge({ plan, expiresOn, publicHref, copy }: {
  plan: SupplierPlan;
  /** Ngày hết hạn đã định dạng sẵn; null khi không có hạn. */
  expiresOn: string | null;
  /** null khi hồ sơ chưa công khai. */
  publicHref: string | null;
  copy: OwnerCopy;
}) {
  const paid = plan !== "basic";
  return <span className="inline-flex flex-wrap items-center gap-2 align-middle">
    <span title={expiresOn ? fill(copy.validUntil, { date: expiresOn }) : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${paid ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700"}`}>
      {paid && <Crown className="size-3.5" aria-hidden="true" />}
      {fill(copy.planBadge, { plan: SUPPLIER_PLAN_LABELS[plan] })}
    </span>
    {publicHref
      ? <a href={publicHref} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-white px-2.5 py-1 text-[11.5px] font-bold text-brand-800 transition hover:bg-brand-50">
          {copy.viewPage}<ExternalLink className="size-3" aria-hidden="true" />
        </a>
      : <span title={copy.notPublishedHint} className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 text-[11.5px] font-semibold text-ink-600">{copy.notPublished}</span>}
  </span>;
}

/** Nút "Nâng cấp gói" dưới link website; mở bảng so sánh gói và gửi yêu cầu nâng gói. */
export function StorefrontUpgradeButton({ plan, catalog, expiresOn, requestOpen, email, copy }: {
  plan: SupplierPlan;
  /** Tên, giá và quyền lợi từng gói, chỉnh trong CRM (/crm/plans). */
  catalog: SupplierPlanCatalog;
  expiresOn: string | null;
  /** Đã có yêu cầu nâng gói chưa đóng: không gửi thêm. */
  requestOpen: boolean;
  email: string;
  copy: OwnerCopy;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState<ServiceRequestResult, FormData>(submitServiceRequestAction, null);
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  const rank = SUPPLIER_PLANS.indexOf(plan);

  return <>
    <button type="button" onClick={() => dialog.current?.showModal()}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 transition hover:bg-amber-100">
      <Crown className="size-4" aria-hidden="true" />{plan === "pro" ? copy.viewPlans : copy.upgrade}
    </button>
    <dialog ref={dialog} aria-labelledby="storefront-plans-title"
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="m-auto max-h-[92dvh] w-[min(94vw,960px)] max-w-none overflow-y-auto rounded-2xl bg-white p-5 text-ink-900 shadow-xl backdrop:bg-black/60 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="storefront-plans-title" className="text-lg font-bold">{copy.plansTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">{copy.plansSub}</p>
        </div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label={copy.close}
          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"><X className="size-5" aria-hidden="true" /></button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {SUPPLIER_PLANS.map((key, index) => {
          const current = key === plan;
          const higher = index > rank;
          const entry = catalog[key];
          return <section key={key} aria-label={SUPPLIER_PLAN_LABELS[key]}
            className={`flex flex-col rounded-xl border p-4 ${current ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-ink-200"}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 text-base font-bold">
                {key !== "basic" && <Crown className="size-4 text-amber-600" aria-hidden="true" />}{entry.name}
              </h3>
              {current && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-bold text-white">{copy.current}</span>}
            </div>
            {current && expiresOn && <p className="mt-1 text-xs text-ink-600">{fill(copy.validUntil, { date: expiresOn })}</p>}
            <div className="mt-3 space-y-1">
              {entry.prices.length === 0
                ? <p className="text-xl font-bold text-ink-900">{entry.summary || copy.free}</p>
                : entry.prices.map((price) => <p key={price.months} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-600">{fill(copy.months, { months: price.months })}</span>
                  <span className="text-lg font-bold tabular-nums text-ink-900">{formatVnd(price.price_vnd)}</span>
                </p>)}
            </div>
            <ul className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm text-ink-700">
              {entry.features.map((item) => <li key={item} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />{item}</li>)}
            </ul>
            <div className="mt-auto pt-4">
              {higher && !requestOpen && <form action={action}>
                <input type="hidden" name="service_key" value="plan_upgrade" />
                <input type="hidden" name="note" value={fill(copy.requestNote, { plan: entry.name || SUPPLIER_PLAN_LABELS[key] })} />
                <button type="submit" disabled={pending || !!state?.ok}
                  className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-60">
                  {fill(copy.request, { plan: entry.name || SUPPLIER_PLAN_LABELS[key] })}
                </button>
              </form>}
            </div>
          </section>;
        })}
      </div>

      {requestOpen && !state?.ok && <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        <Clock3 className="size-3.5" aria-hidden="true" />{copy.requestOpen}
      </p>}
      {state && <p role={state.ok ? "status" : "alert"}
        className={`mt-4 rounded-lg px-3 py-2 text-xs leading-5 ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        {state.ok && <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />}{state.message}
      </p>}
      <p className="mt-4 text-xs leading-5 text-ink-500">{fill(copy.contactLine, { email })}</p>
    </dialog>
  </>;
}
