"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Loader2,
  Lock,
  MailCheck,
  MessageCircle,
  Package,
  ShieldCheck,
} from "lucide-react";

import { submitRfqAction } from "./actions";
import { FormChallenge } from "@/components/form-challenge";
import { cx } from "@/components/ui";

interface Option {
  slug: string;
  name: string;
}

interface CategorySpec {
  grades: string[];
  certs: string[];
}

interface Props {
  categories: Option[];
  categorySpecs: Record<string, CategorySpec>;
  initialProductId: string | null;
  initialCategory: string | null;
  initialProduct: string;
  initialGrade?: string;
  initialSupplierIds: string[];
  /** Nhà cung cấp buyer đã chỉ định từ trang sản phẩm hoặc trang NCC, để hiển thị rõ trong form. */
  initialSuppliers?: Array<{ id: string; name: string }>;
  wantsSamples: boolean;
  mode?: "quote" | "question";
}

const UNITS = ["MT", "kg", "lb", "container (20')", "container (40')", "pallet", "carton"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DAP", "FCA"];
const FREQUENCIES = ["One-time", "Monthly", "Quarterly", "Spot", "Contract"];
const COUNTRIES = ["US", "EU", "UK", "Japan", "Korea", "China", "Middle East", "Australia", "Canada", "Other"];
const BUSINESS_TYPES = ["Importer / Distributor", "Brand / Manufacturer", "Wholesaler", "Retailer", "Trading company", "Other"];

/**
 * Form RFQ: **một trang, không chia bước**.
 *
 * Chỉ 6 nhóm trường bắt buộc hiện ra; phần còn lại (quy cách, incoterm, giá mục tiêu,
 * chứng chỉ, liên hệ phụ) nằm trong mục "Thêm chi tiết" — mở sẵn khi URL đã điền sẵn
 * grade hoặc khi người mua đến từ link yêu cầu mẫu.
 *
 * Trước đây form chia 3 bước nhưng `validateStep(2)` lại kiểm company/contact/email/consent
 * trong khi các ô đó chỉ render ở bước 3 → bấm Continue không đi tiếp được và không có
 * thông báo lỗi nào. Một trang + một hàm validate duy nhất loại bỏ hẳn loại lỗi đó.
 */
export function RfqForm({
  categories,
  categorySpecs,
  initialCategory,
  initialProduct,
  initialProductId,
  initialGrade = "",
  initialSupplierIds,
  initialSuppliers = [],
  wantsSamples,
  mode = "quote",
}: Props) {
  const router = useRouter();
  const isQuestion = mode === "question";
  const params = useSearchParams();
  const [busy, startSubmit] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  // Mở sẵn mục chi tiết khi đã có dữ liệu điền trước, để người mua không bỏ sót.
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initialGrade) || wantsSamples);
  const [data, setData] = useState(() => ({
    // Product
    category_slug: initialCategory ?? "",
    product_text: initialProduct,
    source_product_id: initialProductId,
    grade: initialGrade,
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
    certifications: [] as string[],
    certOther: "",
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
  }));

  const update = (k: keyof typeof data, v: string | boolean | string[]) =>
    setData((d) => ({
      ...d,
      [k]: v,
      // Sửa nội dung sản phẩm/danh mục thì bỏ liên kết sản phẩm nguồn, tránh gán sai sản phẩm.
      ...(k === "product_text" && v !== initialProduct ? { source_product_id: null } : {}),
      ...(k === "category_slug" && v !== initialCategory ? { source_product_id: null } : {}),
    }));

  /** Chỉ kiểm đúng những ô đang hiển thị. Không có trường ẩn nào bị đòi. */
  function validateQuote(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!data.product_text.trim()) e.product_text = "Describe the product and grade you need.";
    if (!data.quantity || Number(data.quantity) <= 0) e.quantity = "Enter a quantity.";
    if (!data.destination_country) e.destination_country = "Pick a destination.";
    if (!data.company.trim()) e.company = "Enter your company name.";
    if (!data.contact_name.trim()) e.contact_name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "Enter a valid work email.";
    if (!data.consent) e.consent = "Please agree to the use of your enquiry data.";
    return e;
  }

  function validateQuestion(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!data.message.trim()) e.message = "Enter your question for the supplier.";
    if (!data.company.trim()) e.company = "Enter your company name.";
    if (!data.contact_name.trim()) e.contact_name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = "Enter a valid work email.";
    if (!data.consent) e.consent = "Approve sharing these details with the supplier.";
    return e;
  }

  function focusFirstError(found: Record<string, string>) {
    const first = Object.keys(found)[0];
    if (!first) return;
    // Ô lỗi có thể nằm trong mục chi tiết đang đóng → mở ra trước khi cuộn tới.
    if (["grade", "target_price", "incoterm", "needed_by", "packaging", "phone", "country", "website", "business_type"].includes(first)) {
      setDetailsOpen(true);
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(`rfq-${first}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLInputElement | null)?.focus?.({ preventScroll: true });
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = isQuestion ? validateQuestion() : validateQuote();
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstError(found);
      return;
    }
    setServerMsg(null);
    startSubmit(async () => {
      const res = await submitRfqAction({
        product_text: data.product_text,
        source_product_id: data.source_product_id,
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
        certifications: [
          ...(data.certifications as string[]),
          ...((data.certOther as string) ? String(data.certOther).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []),
        ].join(", ") || null,
        message: data.message || null,
        company: data.company,
        contact_name: data.contact_name,
        email: data.email,
        phone: data.phone || null,
        country: data.country || null,
        website: data.website || null,
        business_type: data.business_type || null,
        consent: data.consent,
        inquiry_kind: isQuestion ? "supplier_question" : "quote",
        share_contact_consent: isQuestion ? data.consent : false,
        source_page: isQuestion ? "/rfq?intent=question" : "/rfq",
        referrer: typeof document !== "undefined" ? document.referrer : null,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        honeypot: data.websiteHp,
        challenge_token: challengeToken,
      });
      if (!res.ok) {
        setServerMsg(res.message);
        return;
      }
      if (res.statusPageUrl) router.push(res.statusPageUrl);
    });
  }

  const supplierName = initialSuppliers[0]?.name ?? "the selected supplier";
  const quoteHref = useMemo(() => {
    const query = new URLSearchParams(params.toString());
    query.delete("intent");
    return `/rfq?${query.toString()}`;
  }, [params]);
  const honeypotControl = (
    <div aria-hidden className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
      <label>Leave empty <input tabIndex={-1} autoComplete="off" value={data.websiteHp} onChange={(e) => update("websiteHp", e.target.value)} /></label>
    </div>
  );
  const challengeControl = (
    <FormChallenge purpose="rfq" onChange={setChallengeToken} />
  );

  if (isQuestion) {
    return (
      <form onSubmit={submit} className="mt-8">
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700"><MessageCircle className="h-4 w-4" />Product question</p>
          <p className="mt-2 break-words text-base font-bold text-ink-900">{initialProduct}</p>
          <p className="mt-1 text-sm text-ink-600">To: <strong className="text-ink-800">{supplierName}</strong></p>
        </div>
        {serverMsg && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{serverMsg}</div>}
        <div className="card space-y-5 p-5 sm:p-6">
          <Field label="Your question" required error={errors.message} id="rfq-message">
            <textarea
              id="rfq-message"
              rows={5}
              className="input resize-y"
              value={data.message}
              onChange={(e) => update("message", e.target.value)}
              placeholder="Ask about specifications, availability, packaging, samples or other product details."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" required error={errors.company} id="rfq-company">
              <input id="rfq-company" autoComplete="organization" className="input" value={data.company} onChange={(e) => update("company", e.target.value)} placeholder="Your company name" />
            </Field>
            <Field label="Your name" required error={errors.contact_name} id="rfq-contact_name">
              <input id="rfq-contact_name" autoComplete="name" className="input" value={data.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Jane Doe" />
            </Field>
          </div>
          <Field label="Work email" required error={errors.email} hint="Supplier replies go to this email." id="rfq-email">
            <input id="rfq-email" autoComplete="email" type="email" className="input" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@company.com" />
          </Field>
          {honeypotControl}
          {challengeControl}
          <label className="flex items-start gap-2 pt-1 text-[13px] leading-relaxed text-ink-700">
            <input id="rfq-consent" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.consent} onChange={(e) => update("consent", e.target.checked)} />
            <span>I agree to share my name, company, email and this question with <strong>{supplierName}</strong> so they can reply directly.</span>
          </label>
          {errors.consent && <p className="pl-6 text-[12px] text-red-600">{errors.consent}</p>}
          <p className="pl-6 text-[12px] text-ink-600">
            Read our <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Terms of Service</Link> before submitting.
          </p>
          <p className="flex items-start gap-1.5 rounded-md bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
            <span>Your details are shared with this supplier for this question, not with other suppliers. Vexim keeps the original question for support and moderation.</span>
          </p>
          <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Send to supplier
          </button>
          <p className="text-center text-[13px] text-ink-600">Need prices or commercial terms? <Link href={quoteHref} className="font-semibold text-brand-700 underline">Request a quote instead</Link>.</p>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8">
      {initialSuppliers.length > 0 ? (
        <p className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13.5px] leading-relaxed text-ink-700">
          You are requesting a quote from <strong className="text-ink-900">{initialSuppliers.map((s) => s.name).join(", ")}</strong>.
          Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else.
        </p>
      ) : (
        <div className="mb-6 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-[13.5px] leading-relaxed text-ink-700">
          <p>Not sure which supplier fits? Tell us what you need. Vexim will select verified suppliers that match your specs, quantity and market, and send you their quotes to compare.</p>
          <p className="mt-2">Suppliers are matched on your requirements only. Paid listings never affect who we recommend.</p>
        </div>
      )}

      {serverMsg && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">
          {serverMsg}
        </div>
      )}

      {/* 1. Sản phẩm: nội dung tự do + số lượng + điểm đến */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-500">
          <Package className="h-4 w-4 text-brand-700" /> What do you need
        </h2>
        <Field label="What do you need?" required error={errors.product_text} id="rfq-product_text">
          <textarea
            id="rfq-product_text"
            rows={3}
            className="input resize-y"
            value={data.product_text}
            onChange={(e) => update("product_text", e.target.value)}
            placeholder="E.g. W320 cashew kernels AFI, 50 MT to Hamburg in December. Mention grade, quantity and timing if you know them."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity" required error={errors.quantity} id="rfq-quantity">
            <input id="rfq-quantity" type="number" min={0} className="input" value={data.quantity} onChange={(e) => update("quantity", e.target.value)} placeholder="50" />
          </Field>
          <Field label="Unit">
            <select className="input" value={data.unit} onChange={(e) => update("unit", e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Destination" required error={errors.destination_country} id="rfq-destination_country">
            <select id="rfq-destination_country" className="input" value={data.destination_country} onChange={(e) => update("destination_country", e.target.value)}>
              <option value="">Select...</option>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* 2. Liên hệ: chỉ những ô bắt buộc để trả lời được */}
      <section className="card mt-4 space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-500">
          <Building2 className="h-4 w-4 text-brand-700" /> How to reach you
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" required error={errors.company} id="rfq-company">
            <input id="rfq-company" autoComplete="organization" className="input" value={data.company} onChange={(e) => update("company", e.target.value)} placeholder="Your company name" />
          </Field>
          <Field label="Your name" required error={errors.contact_name} id="rfq-contact_name">
            <input id="rfq-contact_name" autoComplete="name" className="input" value={data.contact_name} onChange={(e) => update("contact_name", e.target.value)} placeholder="Jane Doe" />
          </Field>
        </div>
        <Field label="Work email" required error={errors.email} id="rfq-email">
          <input id="rfq-email" autoComplete="email" type="email" className="input" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="jane@company.com" />
        </Field>
      </section>

      {/* 3. Chi tiết tuỳ chọn — đóng mặc định để giữ form ngắn */}
      <section className="card mt-4 p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          aria-controls="rfq-details"
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-ink-500">
              <ClipboardList className="h-4 w-4 text-brand-700" /> Add details
            </span>
            <span className="mt-1 block text-[12.5px] text-ink-600">
              Grade, target price, incoterm, certifications, packaging. Optional, but it shortens the quote.
            </span>
          </span>
          <ChevronDown className={cx("h-5 w-5 shrink-0 text-ink-400 transition", detailsOpen && "rotate-180")} aria-hidden="true" />
        </button>

        {detailsOpen && (
          <div id="rfq-details" className="mt-5 space-y-4 border-t border-ink-100 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <select className="input" value={data.category_slug} onChange={(e) => update("category_slug", e.target.value)}>
                  <option value="">Select...</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Purchase frequency">
                <select className="input" value={data.frequency} onChange={(e) => update("frequency", e.target.value)}>
                  {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
            </div>

            <Field
              label="Grade / spec"
              hint={categorySpecs[data.category_slug]?.grades?.length ? "Tap a common grade for this category, or type your own." : undefined}
              id="rfq-grade"
            >
              {categorySpecs[data.category_slug]?.grades?.length ? (
                <div className="flex flex-wrap gap-2">
                  {categorySpecs[data.category_slug].grades.map((g) => (
                    <button key={g} type="button" onClick={() => update("grade", data.grade === g ? "" : g)}
                      className={cx(
                        "rounded-full border px-3 py-1 text-[12.5px] font-medium transition",
                        data.grade === g ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-400",
                      )}>{g}</button>
                  ))}
                  <button type="button" onClick={() => update("grade", "__custom__")}
                    className={cx(
                      "rounded-full border px-3 py-1 text-[12.5px] font-medium transition",
                      data.grade && !categorySpecs[data.category_slug].grades.includes(data.grade)
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-dashed border-ink-300 text-ink-500 hover:border-ink-500",
                    )}>Other…</button>
                </div>
              ) : null}
              {(!categorySpecs[data.category_slug]?.grades?.length || data.grade === "__custom__" ||
                (data.grade && !categorySpecs[data.category_slug].grades.includes(data.grade))) && (
                <input
                  id="rfq-grade"
                  className={cx("input", categorySpecs[data.category_slug]?.grades?.length ? "mt-2" : "")}
                  value={data.grade === "__custom__" ? "" : data.grade}
                  onChange={(e) => update("grade", e.target.value)}
                  placeholder="W320, WW240, LP, other spec..."
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target price">
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

            <Field label="Needed by">
              <input type="date" className="input" value={data.needed_by} onChange={(e) => update("needed_by", e.target.value)} />
            </Field>

            <Field label="Packaging / labelling">
              <textarea rows={2} className="input resize-y" value={data.packaging} onChange={(e) => update("packaging", e.target.value)} placeholder="E.g. 10kg vacuum tins per carton, private label." />
            </Field>

            <Field label="Required certifications" hint="Pick any that apply, or add your own.">
              {categorySpecs[data.category_slug]?.certs?.length ? (
                <div className="flex flex-wrap gap-2">
                  {categorySpecs[data.category_slug].certs.map((c) => {
                    const active = (data.certifications as string[]).includes(c);
                    return (
                      <button key={c} type="button"
                        onClick={() => update("certifications", active ? (data.certifications as string[]).filter((x) => x !== c) : [...(data.certifications as string[]), c])}
                        className={cx(
                          "rounded-full border px-3 py-1 text-[12.5px] font-medium transition",
                          active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-400",
                        )}>{c}</button>
                    );
                  })}
                </div>
              ) : null}
              <input
                className={cx("input", categorySpecs[data.category_slug]?.certs?.length ? "mt-2" : "")}
                value={data.certOther as string}
                onChange={(e) => update("certOther", e.target.value)}
                placeholder="Other certification: HACCP, BRC, organic, ISO..."
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <ToggleChip active={data.wants_samples} onToggle={() => update("wants_samples", !data.wants_samples)}>Samples needed</ToggleChip>
              <ToggleChip active={data.wants_inspection} onToggle={() => update("wants_inspection", !data.wants_inspection)}>Pre-shipment inspection</ToggleChip>
              <ToggleChip active={data.wants_video_call} onToggle={() => update("wants_video_call", !data.wants_video_call)}>Video factory call</ToggleChip>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone / WhatsApp" id="rfq-phone">
                <input id="rfq-phone" className="input" value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 555 ..." />
              </Field>
              <Field label="Country">
                <select className="input" value={data.country} onChange={(e) => update("country", e.target.value)}>
                  <option value="">Select...</option>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Website" id="rfq-website">
                <input id="rfq-website" className="input" value={data.website} onChange={(e) => update("website", e.target.value)} placeholder="company.com" />
              </Field>
              <Field label="Business type">
                <select className="input" value={data.business_type} onChange={(e) => update("business_type", e.target.value)}>
                  <option value="">Select...</option>
                  {BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Notes for the desk">
              <textarea rows={3} className="input resize-y" value={data.message} onChange={(e) => update("message", e.target.value)} placeholder="Timeline, target port, existing suppliers, anything we should know." />
            </Field>
          </div>
        )}
      </section>

      {/* 4. Đồng ý + gửi */}
      <section className="card mt-4 space-y-4 p-5 sm:p-6">
        {honeypotControl}
        {challengeControl}
        <label className="flex items-start gap-2 text-[13px] text-ink-700">
          <input id="rfq-consent" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.consent} onChange={(e) => update("consent", e.target.checked)} />
          <span>
            I agree to Veximtrade sharing this request with matching suppliers and processing my data
            to reply to this enquiry. {errors.consent && <span className="text-red-600">(required)</span>}
          </span>
        </label>
        {errors.consent && <p className="pl-6 text-[12px] text-red-600">{errors.consent}</p>}
        <p className="pl-6 text-[12px] text-ink-600">
          Read our <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Terms of Service</Link> before submitting.
        </p>
        <p className="flex items-start gap-1.5 rounded-md bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-600">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
          <span>Your contact details stay private until you agree to an introduction. You sign the contract directly with the supplier you choose. Vexim never holds your payment. Free for buyers.</span>
        </p>
        <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          Submit request
        </button>
        <p className="text-center text-[12.5px] text-ink-500">Only the fields marked * are required. We reply within one business day.</p>
      </section>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  id,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block" htmlFor={id}>
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
