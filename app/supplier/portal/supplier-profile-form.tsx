"use client";

import { supplierTypeIcon } from "@/components/brand/vexim-icons";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Supplier, SupplierType } from "@/lib/types";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { SUPPLIER_TYPES } from "@/lib/supplier";
import { COMPANY } from "@/lib/config";
import { COMPANY_DOCUMENT_KEYS, INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { fill } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { OnboardingMessages } from "@/lib/i18n/portal/onboarding";
import type { SharedMessages } from "@/lib/i18n/portal/shared";
import type { CategoryRequestView } from "@/lib/supplier-portal/requested-category";
import { SupplierCategoryPicker } from "./supplier-category-picker";
import { FilePicker } from "@/components/file-picker";

/** Bước xác thực doanh nghiệp chỉ nhận một giấy; giấy phải đứng tên doanh nghiệp đã khai. */
const CORE_DOC_KEYS = ["business_license"] as const;

/**
 * Bước 1 chỉ cần MỘT trong hai: chọn danh mục đang mở, hoặc ghi ngành chưa mở.
 *
 * Cho phép chỉ ghi ngành là chủ ý: đó chính là ca từng làm hồ sơ treo (ngành chưa mở thì
 * không có gì để chọn). Yêu cầu ngành không cấp phạm vi — sản phẩm vẫn chờ danh mục mở.
 */
function categoriesChosen(form: HTMLFormElement): boolean {
  if (form.querySelectorAll('input[name="requested_category_slugs"]').length > 0) return true;
  const other = form.querySelector<HTMLInputElement>('input[name="requested_category_other"]');
  return Boolean(other?.value.trim());
}

function coreDocChosen(form: HTMLFormElement): boolean {
  return CORE_DOC_KEYS.some((key) =>
    Boolean(form.querySelector<HTMLInputElement>(`input[name="doc:${key}"]`)?.files?.length));
}

/**
 * Các trường của biểu mẫu hồ sơ; ba bước nằm trong ba panel, bước đang điền thì hiện.
 *
 * Mọi chuỗi đến từ `lib/i18n/portal/onboarding.ts` — component chỉ giữ cấu trúc và luật
 * kiểm tra, để bản tiếng Anh và tiếng Việt không thể lệch nhau.
 */
export function SupplierProfileFields({ supplier, email, categories, categoryRequests = [], step, accountName, messages: m, types }: {
  supplier?: Supplier;
  email: string;
  categories: CategoryProposalOption[];
  /** Yêu cầu mở ngành đã gửi, để NCC thấy câu trả lời của Vexim ngay trong form. */
  categoryRequests?: CategoryRequestView[];
  step: number;
  accountName?: string | null;
  messages: OnboardingMessages;
  types: SharedMessages["supplierTypes"];
}) {
  const [supplierType, setSupplierType] = useState<SupplierType | "">(supplier?.supplier_type ?? "");
  const [visitRequested, setVisitRequested] = useState(false);
  const SupplierTypeIcon = supplierTypeIcon(supplierType);
  const lockedType = supplier?.onboarding_status === "changes_requested";
  const typeLabel = (value: SupplierType | "") => (value ? types[value] : types.unset);
  return <>
    <div data-step-panel={1} className={step === 1 ? "space-y-7" : "hidden"}>
    <section aria-labelledby="company-section-title"><h2 id="company-section-title" className="text-xl font-black text-ink-900">{m.company.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{m.company.intro} {lockedType ? m.company.introLocked : m.company.introOpen}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={m.company.labels.name} name="name" required maxLength={180} placeholder={m.company.placeholders.name} defaultValue={supplier?.name ?? ""} />
        <Field label={m.company.labels.tradeName} name="trade_name" maxLength={180} placeholder={m.company.placeholders.tradeName} defaultValue={supplier?.trade_name ?? ""} />
        <label className="block text-sm"><span className="mb-1 inline-flex items-center gap-2 font-semibold"><SupplierTypeIcon className="h-5 w-5 text-brand-700" aria-hidden="true" />{m.company.labels.supplierType}</span>
          {lockedType ? <>
            <input name="supplier_type" type="hidden" value={supplierType} />
            <span className="input block bg-ink-50">{typeLabel(supplierType)}</span>
            <span className="mt-1 block text-xs text-ink-500">{m.company.typeLockedHint}</span>
          </> : <select name="supplier_type" className="input" required value={supplierType} onChange={(event) => {
            const next = event.target.value as SupplierType | "";
            setSupplierType(next);
          }}>
            <option value="" disabled>{m.company.typeSelectPlaceholder}</option>
            {SUPPLIER_TYPES.map((type) => <option key={type.value} value={type.value}>{types[type.value]}</option>)}
          </select>}
        </label>
        <Field label={m.company.labels.products} name="products" required maxLength={1000} placeholder={m.company.placeholders.products} defaultValue={supplier?.products ?? ""} />
        <Field label={m.company.labels.taxNumber} name="tax_number" required maxLength={32} inputMode="numeric" pattern="[0-9]+" placeholder={m.company.placeholders.taxNumber} defaultValue={supplier?.tax_id ?? ""} />
        <Field label={m.company.labels.province} name="province" maxLength={100} placeholder={m.company.placeholders.province} defaultValue={supplier?.province ?? ""} />
        <Field label={m.company.labels.address} name="address" maxLength={250} placeholder={m.company.placeholders.address} defaultValue={supplier?.address ?? ""} />
      </div>
    </section>
    <section className="border-t border-ink-200 pt-6" aria-labelledby="contact-section-title"><h2 id="contact-section-title" className="text-base font-bold text-ink-900">{m.contact.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{m.contact.intro}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={m.contact.labels.contactName} name="contact_name" required maxLength={120} placeholder={m.contact.placeholders.contactName} defaultValue={supplier?.contact_name ?? accountName ?? ""} />
        <Field label={m.contact.labels.phone} name="phone" required maxLength={40} placeholder={m.contact.placeholders.phone} defaultValue={supplier?.phone ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">{m.contact.labels.email}</span>
          <span className="input block bg-ink-50 text-ink-600">{email}</span>
          <span className="mt-1 block text-xs text-ink-500">{m.contact.emailHint}</span>
        </label>
      </div>
    </section>
    <CategoryProposals categories={categories} supplier={supplier} requests={categoryRequests} messages={m} />
    </div>
    <div data-step-panel={2} className={step === 2 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">{m.documents.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{m.documents.intro.map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{COMPANY_DOCUMENT_KEYS.map((key) => <FilePicker
        key={key}
        name={`doc:${key}`}
        accept=".pdf,image/jpeg,image/png,image/webp"
        title={m.docs[key as (typeof INITIAL_DOCUMENT_KEYS)[number]]}
        required
        requiredMark
        hint={m.fileHint}
      />)}</div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">{m.documents.extraTitle}</h2>
      <p className="mt-1 text-sm text-ink-600">{m.documents.extraIntro}</p>
      <div className="mt-4 space-y-3">
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:2" value="yes" checked={visitRequested} onChange={(event) => setVisitRequested(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">{supplierType === "trading" ? m.documents.partnerTitle : m.documents.factoryTitle}</strong><small className="text-ink-600">{supplierType === "trading" ? m.documents.partnerHint : m.documents.factoryHint}</small></span>
        </label>
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:3" value="yes" className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">{m.documents.exportTitle}</strong><small className="text-ink-600">{m.documents.exportHint}</small></span>
        </label>
      </div>
    </section>
    </div>
    <div data-step-panel={3} className={step === 3 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">{m.publicPage.title}</h2>
      <p className="mt-1 text-sm text-ink-600">{m.publicPage.intro.map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={m.publicPage.labels.displayName} name="display_name" maxLength={180} defaultValue={supplier?.display_name ?? ""} />
        <Field label={m.publicPage.labels.website} name="website" maxLength={250} placeholder={m.publicPage.labels.websitePlaceholder} defaultValue={supplier?.website ?? ""} />
        <Field label={m.publicPage.labels.country} name="country" maxLength={100} defaultValue={supplier?.country ?? "Vietnam"} />
        <Field label={m.publicPage.labels.contactTitle} name="contact_title" maxLength={100} defaultValue={supplier?.contact_title ?? ""} />
        <Field label={m.publicPage.labels.zalo} name="zalo" maxLength={40} defaultValue={supplier?.zalo ?? ""} />
        <Field label={m.publicPage.labels.foundedYear} name="founded_year" maxLength={4} inputMode="numeric" defaultValue={String(supplier?.founded_year ?? "")} />
        <Field label={m.publicPage.labels.employees} name="employees" maxLength={8} inputMode="numeric" defaultValue={String(supplier?.employees ?? "")} />
        <Field label={m.publicPage.labels.annualOutput} name="annual_output" placeholder={m.publicPage.labels.annualOutputPlaceholder} maxLength={180} defaultValue={supplier?.annual_output ?? ""} />
        <Field label={m.publicPage.labels.leadTime} name="lead_time_days" maxLength={5} inputMode="numeric" defaultValue={String(supplier?.lead_time_days ?? "")} />
        <Field label={m.publicPage.labels.markets} name="markets" maxLength={800} defaultValue={supplier?.markets ?? ""} />
        <Field label={m.publicPage.labels.exportMarkets} name="export_markets" maxLength={800} placeholder={m.publicPage.labels.exportMarketsPlaceholder} defaultValue={supplier?.export_markets?.join(", ") ?? ""} />
        <Field label={m.publicPage.labels.ports} name="ports" maxLength={800} placeholder={m.publicPage.labels.portsPlaceholder} defaultValue={supplier?.ports?.join(", ") ?? ""} />
        <Field label={m.publicPage.labels.incoterms} name="incoterms" maxLength={800} placeholder={m.publicPage.labels.incotermsPlaceholder} defaultValue={supplier?.incoterms?.join(", ") ?? ""} />
        <Field label={m.publicPage.labels.paymentTerms} name="payment_terms" maxLength={200} defaultValue={supplier?.payment_terms ?? ""} />
      </div>
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">{m.publicPage.introLabel}</span><textarea name="intro_source" rows={4} maxLength={1500} className="input" defaultValue={supplier?.intro_source ?? supplier?.summary_i18n?.en ?? ""} placeholder={m.publicPage.introPlaceholder} /></label>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier?.private_label ?? false} /> {m.publicPage.privateLabel}</label>
    </section>
    <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4" aria-labelledby="supplier-commitments-title">
      <h2 id="supplier-commitments-title" className="text-base font-bold text-ink-900">{m.commitments.title}</h2>
      <div className="mt-3 space-y-3">
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>{m.commitments.termsBefore} <Link href="/dieu-khoan-su-dung" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">{m.commitments.termsLink}</Link> {m.commitments.termsAfter}</span>
        </label>
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="information_accuracy" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>{m.commitments.accuracyBefore}<br />{m.commitments.accuracyAfter}</span>
        </label>
      </div>
    </section>
    </div>
  </>;
}

function CategoryProposals({ categories, supplier, requests, messages: m }: {
  categories: CategoryProposalOption[]; supplier?: Supplier; requests: CategoryRequestView[]; messages: OnboardingMessages;
}) {
  return <section className="border-t border-ink-200 pt-6">
    {!categories.length && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{m.categories.none}</p>}
    <SupplierCategoryPicker categories={categories} initial={supplier?.requested_category_slugs ?? []}
      other={supplier?.requested_category_other ?? ""} requests={requests} messages={m.picker}
      title={m.categories.title} intro={m.categories.intro} />
  </section>;
}

/** First invalid (enabled, non-hidden) field inside one wizard step panel, if any. */
function firstInvalidField(form: HTMLFormElement, step: number): HTMLElement | null {
  const panel = form.querySelector(`[data-step-panel="${step}"]`);
  if (!panel) return null;
  for (const el of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (el.disabled || (el instanceof HTMLInputElement && el.type === "hidden")) continue;
    if (!el.checkValidity()) return el;
  }
  return null;
}

export function SupplierProfileForm({ supplier, email, categories, categoryRequests = [], hasCoreDoc = false, accountName, messages: m, types, lang }: {
  supplier?: Supplier;
  email: string;
  categories: CategoryProposalOption[];
  categoryRequests?: CategoryRequestView[];
  hasCoreDoc?: boolean;
  accountName?: string | null;
  messages: OnboardingMessages;
  types: SharedMessages["supplierTypes"];
  lang: Locale;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; notification?: string } | null>(null);

  function goToStep(next: number) {
    setStep(next);
    setStepError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextStep() {
    const form = formRef.current;
    if (!form) return;
    const bad = firstInvalidField(form, step);
    if (bad) {
      setStepError(m.form.errors.requiredInStep);
      bad.focus();
      bad.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (step === 1 && !categoriesChosen(form)) {
      setStepError(m.form.errors.noCategory);
      return;
    }
    if (step === 2 && !hasCoreDoc && !coreDocChosen(form)) {
      setStepError(m.form.errors.noCoreDoc);
      return;
    }
    goToStep(step + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // Panels of other steps are hidden, so native validation cannot surface
    // their errors; walk the steps ourselves and jump to the first problem.
    for (const s of [1, 2, 3]) {
      const bad = firstInvalidField(form, s);
      if (bad) {
        setStep(s);
        const fieldName = (bad as HTMLInputElement).name;
        setStepError(s === 3 && fieldName === "consent"
          ? m.form.errors.consent
          : s === 3 && fieldName === "information_accuracy"
            ? m.form.errors.accuracy
            : m.form.errors.requiredInStepShort);
        window.setTimeout(() => { bad.focus(); bad.scrollIntoView({ block: "center", behavior: "smooth" }); }, 50);
        return;
      }
    }
    if (!categoriesChosen(form)) {
      setStep(1);
      setStepError(m.form.errors.noCategorySubmit);
      return;
    }
    if (!hasCoreDoc && !coreDocChosen(form)) {
      setStep(2);
      setStepError(m.form.errors.noCoreDoc);
      return;
    }
    setStepError(null);
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/supplier-portal/profile", { method: "POST", body: new FormData(form) });
      const data = await response.json() as { ok: boolean; message: string; notification?: string };
      setResult(data);
      if (data.ok) router.refresh();
    } catch { setResult({ ok: false, message: m.form.errors.generic }); }
    finally { setBusy(false); }
  }
  // Biểu mẫu chiếm khoảng hai phần ba bề ngang, cột hướng dẫn một phần ba.
  // Trần 1240px để trang rộng không kéo ô nhập dài hết tầm mắt.
  return <form ref={formRef} noValidate onSubmit={submit} className="mt-6" lang={lang}>
    <div className="grid max-w-[1240px] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="min-w-0 rounded-xl border border-ink-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-black text-ink-900">{m.form.header}</p>
          <p className="hidden text-sm text-ink-500 lg:block">{fill(m.form.stepOf, { step })}</p>
        </div>
        {/* Mobile: cùng một tiến trình, thu gọn thành thanh trên đầu biểu mẫu. */}
        <div className="mt-3 lg:hidden">
          <p className="text-sm text-ink-600">{fill(m.form.stepOfTitle, { step, title: m.steps[step - 1] })}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={fill(m.form.progressAria, { step })}>
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>
        <div className="mt-6">
          <SupplierProfileFields supplier={supplier} email={email} accountName={accountName} categories={categories} categoryRequests={categoryRequests} step={step} messages={m} types={types} />
        </div>
        {stepError && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{stepError}</p>}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
          <button type="button" onClick={() => goToStep(step - 1)} disabled={step === 1 || busy} className="btn btn-ghost disabled:cursor-not-allowed disabled:opacity-50">{m.form.back}</button>
          {step < 3
            ? <button type="button" onClick={nextStep} disabled={busy} className="btn btn-primary">{m.form.next}</button>
            : <button type="submit" disabled={busy || result?.ok} className="btn btn-primary">{busy ? m.form.submitting : m.form.submit}</button>}
        </div>
        {result && <div role="status" className={`mt-5 rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {result.message}{result.ok && result.notification !== "sent" && <p className="mt-1">{m.form.noNotification}</p>}
        </div>}
      </div>
      <OnboardingAside step={step} onStep={goToStep} messages={m} />
    </div>
  </form>;
}

/**
 * Cột phụ bên phải: giúp doanh nghiệp đi hết biểu mẫu chứ không bán thêm gói dịch vụ.
 * Desktop bám theo khi cuộn; mobile đẩy xuống dưới biểu mẫu, riêng tiến trình đã thu gọn
 * thành thanh trên đầu nên không lặp lại hai chỉ báo bước.
 */
function OnboardingAside({ step, onStep, messages: m }: { step: number; onStep: (step: number) => void; messages: OnboardingMessages }) {
  return <aside aria-label={m.aside.aria} className="min-w-0 space-y-4 lg:sticky lg:top-20">
    <section className="hidden rounded-xl border border-brand-200 bg-brand-50/60 p-5 lg:block">
      <h2 className="text-sm font-black text-ink-900">{m.aside.progressTitle}</h2>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={fill(m.form.progressAria, { step })}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5 text-sm">
        {m.progressSteps.map((title, index) => {
          const number = index + 1;
          const done = number < step;
          const current = number === step;
          return <li key={title} className="flex items-center gap-2">
            <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-600 text-white" : current ? "bg-brand-700 text-white" : "border border-ink-300 text-ink-500"}`}>
              {done ? <Check className="h-3 w-3" /> : number}
            </span>
            {done
              ? <button type="button" onClick={() => onStep(number)} className="text-left font-semibold text-brand-700 underline">{title}</button>
              : <span className={current ? "font-bold text-ink-900" : "text-ink-500"}>{title}</span>}
            <span className="ml-auto text-xs text-ink-500">{done ? m.aside.done : current ? m.aside.current : m.aside.todo}</span>
          </li>;
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-600">{m.aside.clickDone}</p>
    </section>
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-black text-ink-900">{m.aside.prepareTitle}</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-700">
        {m.aside.prepare.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-500">{m.aside.prepareHint}</p>
    </section>
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
      <h2 className="text-sm font-black text-ink-900">{m.aside.afterTitle}</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-700">
        {m.unlock.map((item) => <li key={item} className="flex gap-2">
          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{item}</span>
        </li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-600">{m.aside.afterHint}</p>
    </section>
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-black text-ink-900">{m.aside.timingTitle}</h2>
      <p className="mt-2 text-sm text-ink-700">{m.aside.timing}</p>
      <p className="mt-1 text-sm text-ink-700">{m.aside.timingEmail}</p>
      <p className="mt-3 text-sm text-ink-700">{m.aside.hotline} <a href={`tel:${COMPANY.phone}`} className="font-semibold text-brand-700 underline">{COMPANY.phoneDisplay}</a>.</p>
      <p className="mt-1 text-sm text-ink-700">{m.aside.email} <a href={`mailto:${COMPANY.contactEmail}`} className="font-semibold text-brand-700 underline">{COMPANY.contactEmail}</a></p>
    </section>
  </aside>;
}

function Field({ label, name, required, maxLength, inputMode, pattern, defaultValue, placeholder }: {
  label: string; name: string; required?: boolean; maxLength: number; inputMode?: "numeric"; pattern?: string; defaultValue?: string; placeholder?: string;
}) {
  return <label className="block text-sm"><FieldLabel text={label} />
    <input name={name} className="input" required={required} maxLength={maxLength} inputMode={inputMode} pattern={pattern} defaultValue={defaultValue} placeholder={placeholder} />
  </label>;
}

/** Nhãn gọn: phần chú thích trong ngoặc (đơn vị, định dạng) để chữ thường, không tô đậm. */
function FieldLabel({ text }: { text: string }) {
  const match = text.match(/^(.*?)\s*(\([^()]*\))\s*(\*?)$/);
  if (!match) return <span className="mb-1 block font-semibold">{text}</span>;
  return <span className="mb-1 block font-semibold">{match[1]} <span className="font-normal text-ink-500">{match[2]}</span>{match[3] ? ` ${match[3]}` : ""}</span>;
}
