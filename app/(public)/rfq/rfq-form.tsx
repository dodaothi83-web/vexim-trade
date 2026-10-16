"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  MailCheck,
  Package,
  ShieldCheck,
} from "lucide-react";

import { submitRfqAction } from "./actions";
import { cx } from "@/components/ui";

interface Option {
  slug: string;
  name: string;
}

interface Props {
  categories: Option[];
  initialCategory: string | null;
  initialSupplierIds: string[];
  wantsSamples: boolean;
}

const UNITS = ["MT", "kg", "lb", "container (20')", "container (40')", "pallet", "carton"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DAP", "FCA"];
const FREQUENCIES = ["One-time", "Monthly", "Quarterly", "Spot", "Contract"];
const COUNTRIES = ["US", "EU", "UK", "Japan", "Korea", "China", "Middle East", "Australia", "Canada", "Other"];
const BUSINESS_TYPES = ["Importer / Distributor", "Brand / Manufacturer", "Wholesaler", "Retailer", "Trading company", "Other"];

export function RfqForm({ categories, initialCategory, initialSupplierIds, wantsSamples }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(1);
  const [busy, startSubmit] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [data, setData] = useState(() => ({
    // Product
    category_slug: initialCategory ?? "",
    product_text: "",
    grade: "",
    quantity: "",
    unit: "MT",
    frequency: "One-time",
    incoterm: "FOB",
    destination_country: "",
    needed_by: "",
    target_price: "",
    target_price_currency: "USD",
    wants_samples: wantsSamples,
    wants_inspection: false,
    wants_video_call: false,
    packaging: "",
    certifications: "",
    message: "",
    preferred_supplier_ids: initialSupplierIds,
    // Company
    company: "",
    contact_name: "",
    email: "",
    phone: "",
    country: "",
    website: "",
    business_type: "",
    consent: false,
    // Honeypot
    websiteHp: "",
    // Turnstile — MVP bỏ qua; gửi lên chuỗi rỗng, server cho qua nếu secretKey là "x"
  }));

  const update = (k: keyof typeof data, v: string | boolean | string[]) =>
    setData((d) => ({ ...d, [k]: v }));

  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!data.product_text.trim()) e.product_text = "Describe the product and grade you need.";
      if (!data.quantity || Number(data.quantity) <= 0) e.quantity = "Enter a quantity.";
      if (!data.destination_country) e.destination_country = "Pick a destination.";
    }
    if (s === 2) {
      if (!data.company.trim()) e.company = "Enter your company name.";
      if (!data.contact_name.trim()) e.contact_name = "Enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "Enter a valid work email.";
      if (!data.consent) e.consent = "You need to accept the privacy policy.";
    }
    return e;
  }

  function next() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function prev() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const e3 = validateStep(2);
    setErrors(e3);
    if (Object.keys(e3).length) return;
    setServerMsg(null);
    startSubmit(async () => {
      const res = await submitRfqAction({
        product_text: data.product_text,
        category_slug: data.category_slug || null,
        grade: data.grade || null,
        quantity: data.quantity ? Number(data.quantity) : null,
        unit: data.unit,
        frequency: data.frequency,
        incoterm: data.incoterm,
        destination_country: data.destination_country || null,
        needed_by: data.needed_by || null,
        target_price: data.target_price ? Number(data.target_price) : null,
        target_price_currency: data.target_price_currency,
        wants_samples: data.wants_samples,
        wants_inspection: data.wants_inspection,
        wants_video_call: data.wants_video_call,
        preferred_supplier_ids: data.preferred_supplier_ids,
        packaging: data.packaging || null,
        certifications: data.certifications || null,
        message: data.message || null,
        company: data.company,
        contact_name: data.contact_name,
        email: data.email,
        phone: data.phone || null,
        country: data.country || null,
        website: data.website || null,
        business_type: data.business_type || null,
        consent: data.consent,
        source_page: "/rfq",
        referrer: typeof document !== "undefined" ? document.referrer : null,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        honeypot: data.websiteHp,
        turnstile_token: null,
      });
      if (!res.ok) {
        setServerMsg(res.message);
        if (res.rateLimited) setStep(3);
        return;
      }
      if (res.statusPageUrl) router.push(res.statusPageUrl);
    });
  }

  const steps = [
    { n: 1, label: "Product", icon: Package },
    { n: 2, label: "Quantity & terms", icon: ClipboardList },
    { n: 3, label: "Your company", icon: Building2 },
  ];

  return (
    <form onSubmit={submit} className="mt-8">
      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-2 text-[12px] font-semibold">
        {steps.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <li key={s.n} className="flex items-center gap-2">
              <span
                className={cx(
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] ring-1",
                  done && "bg-emerald-600 text-white ring-emerald-600",
                  active && "bg-brand-700 text-white ring-brand-700",
                  !done && !active && "bg-white text-ink-500 ring-ink-200",
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.n}
              </span>
              <span className={cx(active ? "text-ink-900" : "text-ink-500")}>{s.label}</span>
              {i < steps.length - 1 && <span className="mx-1 text-ink-200">→</span>}
            </li>
          );
        })}
      </ol>

      {serverMsg && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
          {serverMsg}
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <div className="card space-y-4 p-6">
          <Field label="Category" hint="Pick the main category your product belongs to.">
            <select className="input" value={data.category_slug} onChange={(e) => update("category_slug", e.target.value)}>
              <option value="">— Select —</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="What do you need?" required error={errors.product_text}>
            <textarea
              rows={3}
              className="input resize-y"
              value={data.product_text}
              onChange={(e) => update("product_text", e.target.value)}
              placeholder="E.g. W320 cashew kernels, whole, white, 50 MT/month, AFI quality."
            />
          </Field>
          <Field label="Grade / spec">
            <input className="input" value={data.grade} onChange={(e) => update("grade", e.target.value)} placeholder="W320, WW240, LP..." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quantity" required error={errors.quantity}>
              <input type="number" min={0} className="input" value={data.quantity} onChange={(e) => update("quantity", e.target.value)} placeholder="50" />
            </Field>
            <Field label="Unit">
              <select className="input" value={data.unit} onChange={(e) => update("unit", e.target.value)}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Frequency">
              <select className="input" value={data.frequency} onChange={(e) => update("frequency", e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target price (optional)">
              <div className="flex gap-2">
                <input type="number" step="0.01" className="input" value={data.target_price} onChange={(e) => update("target_price", e.target.value)} placeholder="3.50" />
                <select className="input w-28" value={data.target_price_currency} onChange={(e) => update("target_price_currency", e.target.value)}>
                  <option>USD</option><option>EUR</option><option>GBP</option>
                </select>
              </div>
            </Field>
            <Field label="Incoterm">
              <select className="input" value={data.incoterm} onChange={(e) => update("incoterm", e.target.value)}>
                {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination" required error={errors.destination_country}>
              <select className="input" value={data.destination_country} onChange={(e) => update("destination_country", e.target.value)}>
                <option value="">— Select —</option>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Needed by">
              <input type="date" className="input" value={data.needed_by} onChange={(e) => update("needed_by", e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <ToggleChip active={data.wants_samples} onToggle={() => update("wants_samples", !data.wants_samples)}>Samples needed</ToggleChip>
            <ToggleChip active={data.wants_inspection} onToggle={() => update("wants_inspection", !data.wants_inspection)}>Pre-shipment inspection</ToggleChip>
            <ToggleChip active={data.wants_video_call} onToggle={() => update("wants_video_call", !data.wants_video_call)}>Video factory call</ToggleChip>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="card space-y-4 p-6">
          <Field label="Packaging / labelling requirements">
            <textarea rows={2} className="input resize-y" value={data.packaging} onChange={(e) => update("packaging", e.target.value)} placeholder="E.g. 10kg vacuum tins per carton, private label." />
          </Field>
          <Field label="Required certifications">
            <input className="input" value={data.certifications} onChange={(e) => update("certifications", e.target.value)} placeholder="HACCP, BRC, organic, fair-trade..." />
          </Field>
          <Field label="Additional notes for the desk">
            <textarea rows={3} className="input resize-y" value={data.message} onChange={(e) => update("message", e.target.value)} placeholder="Timeline, target port, existing suppliers, anything we should know." />
          </Field>
          <p className="rounded-md bg-ink-50 p-3 text-[12.5px] leading-relaxed text-ink-600">
            <ShieldCheck className="mr-1 inline h-4 w-4 text-brand-700" />
            Your company identity is not shared with suppliers until you approve an introduction.
            We reply to your email with a shortlist first.
          </p>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="card space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" required error={errors.company}>
              <input className="input" value={data.company} onChange={(e) => update("company", e.target.value)} placeholder="Your company name" />
            </Field>
            <Field label="Your name" required error={errors.contact_name}>
              <input className="input" value={data.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Work email" required error={errors.email}>
              <input type="email" className="input" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@company.com" />
            </Field>
            <Field label="Phone / WhatsApp">
              <input className="input" value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 555 ..." />
            </Field>
            <Field label="Country">
              <select className="input" value={data.country} onChange={(e) => update("country", e.target.value)}>
                <option value="">— Select —</option>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Website">
              <input className="input" value={data.website} onChange={(e) => update("website", e.target.value)} placeholder="company.com" />
            </Field>
            <Field label="Business type">
              <select className="input" value={data.business_type} onChange={(e) => update("business_type", e.target.value)}>
                <option value="">— Select —</option>
                {BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>

          {/* Honeypot — ẩn với user thật */}
          <div aria-hidden className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
            <label>Leave empty <input tabIndex={-1} autoComplete="off" value={data.websiteHp} onChange={(e) => update("websiteHp", e.target.value)} /></label>
          </div>

          <label className="flex items-start gap-2 pt-2 text-[13px] text-ink-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.consent} onChange={(e) => update("consent", e.target.checked)} />
            <span>
              I agree to Veximtrade sharing this request with shortlisted suppliers and processing my data
              to reply to this enquiry. {errors.consent && <span className="text-red-600">(required)</span>}
            </span>
          </label>
          <p className="flex items-center gap-1.5 rounded-md bg-ink-50 p-3 text-[12px] text-ink-600">
            <Lock className="h-3.5 w-3.5 text-brand-700" />
            We will never publish your contact details. Suppliers are contacted anonymously until you approve.
          </p>
        </div>
      )}

      {/* Success state sau khi submit thành công được xử lý bằng redirect sang /rfq/status/[token] */}

      {/* Nav buttons */}
      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 1 ? (
          <button type="button" onClick={prev} className="btn btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button type="button" onClick={next} className="btn btn-primary ml-auto">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary ml-auto" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Submit request
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-0.5 block text-[11.5px] text-ink-400">{hint}</span>}
      {error && <span className="mt-0.5 block text-[11.5px] text-red-600">{error}</span>}
    </label>
  );
}

function ToggleChip({
  active,
  onToggle,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
        active
          ? "border-brand-600 bg-brand-50 text-brand-800"
          : "border-ink-200 bg-white text-ink-600 hover:border-ink-400",
      )}
    >
      {children}
    </button>
  );
}
