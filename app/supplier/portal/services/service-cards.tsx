"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock3, Crown, Globe2, Megaphone, Send, ShieldCheck } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { ServicesMessages } from "@/lib/i18n/portal/services";
import { SUPPLIER_SERVICE_NOTE_MAX, type SupplierServiceKeyValue } from "@/lib/supplier-services";
import { submitServiceRequestAction, type ServiceRequestResult } from "./actions";

/** Cùng biểu tượng với thẻ dịch vụ trên trang /for-suppliers để hai nơi nhận ra nhau. */
const ICONS: Record<SupplierServiceKeyValue, typeof Globe2> = {
  international_website: Globe2,
  featured_ads: Megaphone,
  fda_compliance: ShieldCheck,
  plan_upgrade: Crown,
};

export function ServiceCards({ services, openKeys, email, copy, planLimits }: {
  services: readonly SupplierServiceKeyValue[];
  /** Dịch vụ đang có yêu cầu chưa đóng: nút gửi khoá lại để không gửi trùng. */
  openKeys: SupplierServiceKeyValue[];
  email: string;
  copy: ServicesMessages;
  /** Số sản phẩm tối đa của Premium/Pro theo bảng gói CRM; null là không giới hạn. */
  planLimits: { premium: number | null; pro: number | null };
}) {
  const [active, setActive] = useState<SupplierServiceKeyValue | null>(null);
  const open = new Set(openKeys);
  return (
    <div className="space-y-6">
      {/* Gói thành viên là quyền gian hàng, không phải dịch vụ tư vấn: tách thành dải riêng phía trên. */}
      {services.includes("plan_upgrade") && <ServiceCard serviceKey="plan_upgrade" expanded={active === "plan_upgrade"} hasOpen={open.has("plan_upgrade")}
        onToggle={(next) => setActive(next ? "plan_upgrade" : null)} email={email} copy={copy} planLimits={planLimits} />}
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-ink-900">{copy.servicesTitle}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.filter((key) => key !== "plan_upgrade").map((key) => (
            <ServiceCard key={key} serviceKey={key} expanded={active === key} hasOpen={open.has(key)}
              onToggle={(next) => setActive(next ? key : null)} email={email} copy={copy} planLimits={planLimits} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ serviceKey, expanded, hasOpen, onToggle, email, copy, planLimits }: {
  serviceKey: SupplierServiceKeyValue;
  expanded: boolean;
  hasOpen: boolean;
  onToggle: (open: boolean) => void;
  email: string;
  copy: ServicesMessages;
  planLimits: { premium: number | null; pro: number | null };
}) {
  const [state, action, pending] = useActionState<ServiceRequestResult, FormData>(submitServiceRequestAction, null);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const noteId = useId();
  const titleId = useId();
  const service = copy.services[serviceKey];
  const Icon = ICONS[serviceKey];
  const isPlan = serviceKey === "plan_upgrade";
  const limit = (value: number | null) => value === null ? copy.unlimited : String(value);
  const points = service.points.map((point) => fill(point, { premium: limit(planLimits.premium), pro: limit(planLimits.pro) }));

  // onToggle là hàm mới mỗi lần cha render; giữ qua ref để hiệu ứng chỉ chạy khi có kết quả mới.
  const toggleRef = useRef(onToggle);
  useEffect(() => { toggleRef.current = onToggle; });
  useEffect(() => {
    if (!state?.ok) return;
    form.current?.reset();
    toggleRef.current(false);
    router.refresh();
  }, [state, router]);

  const actionArea = <>
        {state && <p role={state.ok ? "status" : "alert"}
          className={`mb-3 rounded-lg px-3 py-2 text-xs leading-5 ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
          {state.ok && <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />}{state.message}
        </p>}
        {hasOpen ? (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            <Clock3 className="size-3.5" aria-hidden="true" />{copy.requestOpen}
          </p>
        ) : expanded ? (
          <form ref={form} action={action} className="space-y-3">
            <input type="hidden" name="service_key" value={serviceKey} />
            <label htmlFor={noteId} className="block text-xs font-semibold text-ink-800">{copy.noteLabel}</label>
            <textarea id={noteId} name="note" rows={3} maxLength={SUPPLIER_SERVICE_NOTE_MAX} placeholder={copy.notePlaceholder}
              className="input w-full text-sm" />
            <p className="text-[11px] leading-4 text-ink-500">{fill(copy.contactLine, { email })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">
                <Send className="size-4" aria-hidden="true" />{pending ? copy.sending : copy.send}
              </button>
              <button type="button" onClick={() => onToggle(false)} disabled={pending}
                className="rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">{copy.cancel}</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => onToggle(true)} aria-expanded={false}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${isPlan
              ? "bg-brand-800 text-white hover:bg-brand-900" : "border border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-400"}`}>
            {isPlan ? copy.requestPlan : copy.request}
          </button>
        )}
      </>;

  const header = <>
    <span className={`flex size-10 items-center justify-center rounded-xl ${isPlan ? "bg-amber-100 text-amber-700" : "bg-brand-50 text-brand-700"}`}><Icon className="size-5" aria-hidden="true" /></span>
    <h3 id={titleId} className={`mt-4 font-bold text-ink-900 ${isPlan ? "text-lg" : "text-[15px]"}`}>{service.title}</h3>
    <p className="mt-1.5 text-sm font-semibold leading-6 text-brand-800">{service.tagline}</p>
  </>;
  const list = <ul className={`space-y-2 ${isPlan ? "" : "mt-3"}`}>
    {points.map((point) => <li key={point} className="flex gap-2 text-sm leading-5 text-ink-700">
      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />{point}
    </li>)}
  </ul>;
  const fit = <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-700">
    <strong className="font-semibold text-ink-900">{copy.fitLabel}:</strong> {service.fit}
  </p>;

  if (isPlan) return (
    <section aria-labelledby={titleId}
      className="grid gap-5 rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50/70 to-white p-5 shadow-sm ring-1 ring-amber-200 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center">
      <div>{header}{fit}</div>
      {list}
      <div>{actionArea}</div>
    </section>
  );

  return (
    <section aria-labelledby={titleId} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      {header}
      {list}
      {fit}
      <div className="mt-auto pt-4">{actionArea}</div>
    </section>
  );
}
