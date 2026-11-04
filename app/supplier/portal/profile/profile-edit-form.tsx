"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import type { Supplier } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";
import type { ProfileMessages } from "@/lib/i18n/portal/profile";
import type { SharedMessages } from "@/lib/i18n/portal/shared";
import { saveSupplierProfileEditAction } from "./profile-actions";

export function SupplierProfileEditForm({ supplier, email, messages: m, types, lang }: {
  supplier: Supplier;
  email: string;
  messages: ProfileMessages["edit"];
  types: SharedMessages["supplierTypes"];
  lang: Locale;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setResult(null);
    try {
      const response = await saveSupplierProfileEditAction(new FormData(form));
      setResult(response);
      if (response.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: m.genericError });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-5" lang={lang}>
    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">{m.lockedTitle}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-600">{m.lockedIntro}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Readonly label={m.lockedLabels.name} value={supplier.name} empty={m.empty} />
        <Readonly label={m.lockedLabels.taxId} value={supplier.tax_id} empty={m.empty} />
        <Readonly label={m.lockedLabels.type} value={supplier.supplier_type ? types[supplier.supplier_type] : types.none} empty={m.empty} />
        <p className="text-xs text-ink-500">{m.typeHint}</p>
        <Readonly label={m.lockedLabels.email} value={email} empty={m.empty} />
        <div className="sm:col-span-2"><Readonly label={m.lockedLabels.address} value={supplier.address} empty={m.empty} /></div>
      </dl>
    </section>

    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">{m.contactTitle}</h2>
      <p className="mt-1 text-sm leading-6 text-ink-600">{m.contactIntro}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={m.labels.tradeName} name="trade_name" maxLength={180} defaultValue={supplier.trade_name ?? ""} />
        <Field label={m.labels.displayName} name="display_name" maxLength={180} defaultValue={supplier.display_name ?? ""} />
        <Field label={m.labels.contactName} name="contact_name" required maxLength={120} defaultValue={supplier.contact_name ?? ""} />
        <Field label={m.labels.contactTitle} name="contact_title" maxLength={100} defaultValue={supplier.contact_title ?? ""} />
        <Field label={m.labels.phone} name="phone" required maxLength={40} defaultValue={supplier.phone ?? ""} />
        <Field label={m.labels.zalo} name="zalo" maxLength={40} defaultValue={supplier.zalo ?? ""} />
        <Field label={m.labels.website} name="website" maxLength={250} defaultValue={supplier.website ?? ""} />
        <Field label={m.labels.province} name="province" maxLength={100} defaultValue={supplier.province ?? ""} />
        <Field label={m.labels.country} name="country" maxLength={100} defaultValue={supplier.country ?? "Vietnam"} />
        <Field label={m.labels.products} name="products" required maxLength={1000} defaultValue={supplier.products ?? ""} />
      </div>
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">{m.introLabel}</span>
        <textarea name="intro_source" rows={5} maxLength={1500} className="input resize-y" defaultValue={supplier.intro_source ?? ""} placeholder={m.introPlaceholder} />
      </label>
    </section>

    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">{m.tradeTitle}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={m.labels.foundedYear} name="founded_year" type="number" min={0} max={new Date().getFullYear()} defaultValue={String(supplier.founded_year ?? "")} />
        <Field label={m.labels.employees} name="employees" type="number" min={0} max={1000000} defaultValue={String(supplier.employees ?? "")} />
        <Field label={m.labels.annualOutput} name="annual_output" placeholder={m.labels.annualOutputPlaceholder} maxLength={180} defaultValue={supplier.annual_output ?? ""} />
        <Field label={m.labels.leadTime} name="lead_time_days" type="number" min={0} max={3650} defaultValue={String(supplier.lead_time_days ?? "")} />
        <Field label={m.labels.markets} name="markets" maxLength={800} defaultValue={supplier.markets ?? ""} />
        <Field label={m.labels.exportMarkets} name="export_markets" maxLength={800} defaultValue={supplier.export_markets?.join(", ") ?? ""} />
        <Field label={m.labels.ports} name="ports" maxLength={800} defaultValue={supplier.ports?.join(", ") ?? ""} />
        <Field label={m.labels.incoterms} name="incoterms" maxLength={800} defaultValue={supplier.incoterms?.join(", ") ?? ""} />
        <Field label={m.labels.paymentTerms} name="payment_terms" maxLength={200} defaultValue={supplier.payment_terms ?? ""} />
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier.private_label ?? false} className="mt-1 h-4 w-4 accent-brand-700" />{m.privateLabel}</label>
    </section>

    {result && <p role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{result.message}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/supplier/portal/profile" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />{m.back}</Link>
      <button type="submit" disabled={busy} className="btn btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? m.saving : m.save}</button>
    </div>
  </form>;
}

function Readonly({ label, value, empty }: { label: string; value: string | null | undefined; empty: string }) {
  return <div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-1 break-words font-medium text-ink-800">{value || empty}</dd></div>;
}

function Field({ label, name, required, maxLength, defaultValue, type = "text", min, max, placeholder }: {
  label: string; name: string; required?: boolean; maxLength?: number; defaultValue?: string;
  type?: string; min?: number; max?: number; placeholder?: string;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input name={name} placeholder={placeholder} type={type} required={required} maxLength={maxLength} min={min} max={max} defaultValue={defaultValue} className="input" />
  </label>;
}
