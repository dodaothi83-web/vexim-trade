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
import type { RfqProductContext } from "@/lib/public/rfq-product-context";

interface Option {
  slug: string;
  name: string;
}

interface CategorySpec {
  grades: string[];
  certs: string[];
}

interface Props {
  questionImageUrl?: string | null;
  questionQuoteHref?: string;
  onQuestionSuccess?: (url: string) => void;
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
  /**
   * Sản phẩm buyer mở từ trang sản phẩm, đã qua cổng công bố. Có thẻ này thì ô mô tả
   * chuyển thành "Your requirements" (tuỳ chọn) vì tên sản phẩm do server dựng.
   */
  contextProduct?: RfqProductContext | null;
}

const UNITS = ["MT", "kg", "lb", "container (20')", "container (40')", "pallet", "carton"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DAP", "FCA"];
const FREQUENCIES = ["One-time", "Monthly", "Quarterly", "Spot", "Contract"];
const COUNTRIES = ["US", "EU", "UK", "Japan", "Korea", "China", "Middle East", "Australia", "Canada", "Other"];
const BUSINESS_TYPES = ["Importer / Distributor", "Brand / Manufacturer", "Wholesaler", "Retailer", "Trading company", "Other"];
/** Tên quốc gia cho ô tìm kiếm; giữ danh sách ngắn, người mua vẫn gõ được tên khác. */
const COUNTRY_NAMES = [
  "United States", "United Kingdom", "Germany", "Netherlands", "France", "Italy", "Spain", "Poland",
  "United Arab Emirates", "Saudi Arabia", "India", "Japan", "South Korea", "China", "Singapore",
  "Australia", "Canada", "Brazil", "Mexico", "South Africa",
];
/** Chứng chỉ gợi ý khi danh mục chưa có danh sách riêng. */
const DEFAULT_CERTS = ["HACCP", "BRCGS", "ISO 22000", "FSSC 22000", "Halal", "Kosher", "Organic"];

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
  questionImageUrl,
  questionQuoteHref,
  onQuestionSuccess,
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
  contextProduct = null,
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
    // Không điền sẵn tiêu đề sản phẩm: người mua tự mô tả nhu cầu bằng lời của họ.
    // `initialProduct` chỉ còn dùng cho banner của chế độ câu hỏi trực tiếp.
    product_text: "",
    source_product_id: initialProductId,
    grade: initialGrade,
    quantity: "",
    unit: "MT",
    frequency: "One-time",
    incoterm: "",
    destination_country: "",
    destination_port: "",
    needed_by: "",
    shipment_month: "",
    target_price: "",
    target_price_currency: "USD",
    target_price_unit: "kg",
    share_target_price: false,
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
    marketing_opt_in: false,
    // Honeypot
    websiteHp: "",
  }));

  const update = (k: keyof typeof data, v: string | boolean | string[]) =>
    setData((d) => ({
      ...d,
      [k]: v,
      // Đổi danh mục thì bỏ liên kết sản phẩm nguồn, tránh gán sai sản phẩm.
      // Riêng mô tả sản phẩm: ô bắt đầu trống nên mọi lần gõ đều khác tiêu đề gốc; giữ
      // `source_product_id` làm dấu vết "người mua đến từ trang sản phẩm nào".
      ...(k === "category_slug" && v !== initialCategory ? { source_product_id: null } : {}),
    }));

  /** Chỉ kiểm đúng những ô đang hiển thị. Không có trường ẩn nào bị đòi. */
  function validateQuote(): Record<string, string> {
    const e: Record<string, string> = {};
    // Có thẻ sản phẩm thì server tự dựng tên sản phẩm; ô này chỉ là yêu cầu thêm.
    if (!contextProduct && !data.product_text.trim()) e.product_text = "Describe the product and grade you need.";
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
    if (data.quantity && (!Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0)) e.quantity = "Enter a quantity greater than zero.";
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
        destination_port: data.destination_port || null,
        needed_by: data.needed_by || null,
        shipment_month: data.shipment_month || null,
        target_price: data.target_price ? Number(data.target_price) : null,
        target_price_currency: data.target_price_currency,
        target_price_unit: data.target_price_unit || null,
        share_target_price: data.share_target_price,
        marketing_opt_in: data.marketing_opt_in,
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
      if (res.statusPageUrl) {
        if (isQuestion && onQuestionSuccess) onQuestionSuccess(res.statusPageUrl);
        else router.push(res.statusPageUrl);
      }
    });
  }

  // Tiến độ các ô bắt buộc — hiển thị ngay để người mua biết còn thiếu gì.
  const requiredChecks = [
    contextProduct
      ? { key: "product", label: "Product", done: true }
      : { key: "product_text", label: "What you need", done: Boolean(data.product_text.trim()) },
    { key: "quantity", label: "Quantity", done: Boolean(data.quantity) && Number(data.quantity) > 0 },
    { key: "destination_country", label: "Destination country", done: Boolean(data.destination_country.trim()) },
    { key: "company", label: "Company", done: Boolean(data.company.trim()) },
    { key: "contact_name", label: "Your name", done: Boolean(data.contact_name.trim()) },
    { key: "email", label: "Work email", done: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) },
  ];
  const completed = requiredChecks.filter((c) => c.done).length;
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
          {questionImageUrl && <img src={questionImageUrl} alt="" className="mt-3 h-16 w-16 rounded-lg object-cover" />}
          <p className="mt-2 break-words text-base font-bold text-ink-900">{contextProduct?.name || initialProduct}</p>
          {initialGrade && <p className="mt-1 text-sm text-ink-600">Grade: {initialGrade}</p>}
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
              maxLength={4000}
              placeholder="What would you like to know about this product?"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity (optional)" error={errors.quantity} id="rfq-quantity">
              <input id="rfq-quantity" type="number" min="0" step="any" className="input" value={data.quantity} onChange={(e) => update("quantity", e.target.value)} />
            </Field>
            <Field label="Unit" id="question-unit">
              <select id="question-unit" className="input" value={data.unit} onChange={(e) => update("unit", e.target.value)}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
            </Field>
          </div>
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
            Send question
          </button>
          <p className="text-center text-[13px] text-ink-600">Need prices or commercial terms? <Link href={questionQuoteHref ?? quoteHref} className="font-semibold text-brand-700 underline">Request a quote instead</Link>.</p>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
      <div className="min-w-0 space-y-4">
        {contextProduct ? (
          <section aria-labelledby="rfq-product-context" className="card p-5 sm:p-6">
            <div className="flex items-start gap-4">
              {contextProduct.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contextProduct.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-ink-200 object-cover" />
              ) : (
                <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-lg border border-ink-200 bg-ink-50" />
              )}
              <div className="min-w-0">
                <p className="text-[11.5px] text-ink-500">You are asking about</p>
                <p id="rfq-product-context" className="break-words text-[15px] font-bold leading-snug text-ink-900">{contextProduct.name}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">
                  from <Link href={contextProduct.supplierHref} className="font-semibold text-brand-700 hover:underline">{contextProduct.supplierName}</Link>
                  {contextProduct.checks.length > 0 && <> · <span className="text-emerald-700">{contextProduct.checks.map((c) => `✓ ${c}`).join(" · ")}</span></>}
                </p>
              </div>
            </div>

            {(contextProduct.grade || contextProduct.moq || contextProduct.referencePrice || contextProduct.exportPort) && (
              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-700">
                {contextProduct.grade && <div><dt className="inline text-ink-500">Grade </dt><dd className="inline font-semibold text-ink-900">{contextProduct.grade}</dd></div>}
                {contextProduct.moq && <div><dt className="inline text-ink-500">MOQ </dt><dd className="inline font-semibold text-ink-900">{contextProduct.moq}</dd></div>}
                {contextProduct.referencePrice && (
                  <div>
                    <dt className="inline text-ink-500">Reference </dt>
                    <dd className="inline font-semibold text-ink-900">{contextProduct.referencePrice}{contextProduct.incoterm ? ` ${contextProduct.incoterm}` : ""}</dd>
                    {contextProduct.priceUpdatedAt && <span className="text-ink-500"> · updated {contextProduct.priceUpdatedAt}</span>}
                  </div>
                )}
                {contextProduct.exportPort && <div><dt className="inline text-ink-500">Ships from </dt><dd className="inline font-semibold text-ink-900">{contextProduct.exportPort}</dd></div>}
              </dl>
            )}

            {contextProduct.certificates.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-600">
                <span>Supplier holds:</span>
                {contextProduct.certificates.map((certificate) => (
                  <span key={certificate} className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11.5px] font-semibold text-teal-900">{certificate}</span>
                ))}
                <Link href={`${contextProduct.supplierHref}#certificates`} className="ml-1 font-semibold text-brand-700 underline">See certificates</Link>
              </p>
            )}

            {(contextProduct.packaging || contextProduct.leadTime) && (
              <details className="mt-3 rounded-lg border border-ink-200 px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-700">Packaging and lead time</summary>
                <dl className="mt-2 space-y-1 text-[12.5px] text-ink-700">
                  {contextProduct.packaging && <div><dt className="inline text-ink-500">Packaging </dt><dd className="inline">{contextProduct.packaging}</dd></div>}
                  {contextProduct.leadTime && <div><dt className="inline text-ink-500">Lead time </dt><dd className="inline">{contextProduct.leadTime}</dd></div>}
                </dl>
              </details>
            )}

            <p className="mt-4 border-t border-ink-100 pt-3 text-[12.5px] leading-relaxed text-ink-600">
              Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else.
            </p>
          </section>
        ) : initialSuppliers.length > 0 ? (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-[13.5px] leading-relaxed text-ink-700">
            You are requesting a quote from <strong className="text-ink-900">{initialSuppliers.map((s) => s.name).join(", ")}</strong>.
            Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else.
          </p>
        ) : (
          <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-[13.5px] leading-relaxed text-ink-700">
            <p>Not sure which supplier fits? Tell us what you need. Vexim will select verified suppliers that match your specs, quantity and market, and send you their quotes to compare.</p>
            <p className="mt-2">Suppliers are matched on your requirements only. Paid listings never affect who we recommend.</p>
          </div>
        )}

        {serverMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-800">{serverMsg}</div>
        )}

        {/* Khối 1: sản phẩm + số lượng + liên hệ — gộp một card như mockup */}
        <section className="card space-y-5 p-5 sm:p-6">
          <Field
            label={contextProduct ? "Your requirements" : "What do you need?"}
            required={!contextProduct}
            error={errors.product_text}
            id="rfq-product_text"
          >
            <textarea
              id="rfq-product_text"
              rows={5}
              maxLength={4000}
              className="input resize-y"
              value={data.product_text}
              onChange={(e) => update("product_text", e.target.value)}
              placeholder={contextProduct
                ? "Anything specific about this product? Packing, certificates, shipment month..."
                : "e.g. Cashew kernels W320, vacuum tins, HACCP required, shipment January"}
            />
            <span className="mt-1 flex justify-end text-[11px] tabular-nums text-ink-400">{data.product_text.length}/4000</span>
          </Field>

          {/*
            Container query thay cho 3 cột cố định: cột form hẹp thì mỗi ô một hàng. Khi
            container ≥640px, hàng 1 là Quantity + Unit, hàng 2 là Destination | Port.
          */}
          <div className="@container">
            <div className="grid gap-4 @min-[640px]:grid-cols-2">
              <div className="max-w-[380px] @min-[640px]:col-span-2">
                <Field
                  label="Quantity"
                  required
                  error={errors.quantity}
                  id="rfq-quantity"
                  hint={contextProduct?.moq ? `Supplier MOQ: ${contextProduct.moq}. Your quantity can be different.` : undefined}
                >
                  <div className="flex">
                    <input
                      id="rfq-quantity"
                      type="number"
                      min={0}
                      className="input min-w-[120px] flex-1 rounded-r-none"
                      value={data.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                      placeholder="e.g. 20"
                    />
                    <select
                      aria-label="Unit"
                      className="input w-[130px] shrink-0 rounded-l-none border-l-0"
                      value={data.unit}
                      onChange={(e) => update("unit", e.target.value)}
                    >
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </Field>
              </div>
              <Field label="Destination" required error={errors.destination_country} id="rfq-destination_country">
                <input
                  id="rfq-destination_country"
                  list="rfq-countries"
                  autoComplete="country-name"
                  className="input"
                  value={data.destination_country}
                  onChange={(e) => update("destination_country", e.target.value)}
                  placeholder="Search country"
                />
                <datalist id="rfq-countries">
                  {COUNTRY_NAMES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field
                label="Port (optional)"
                hint={contextProduct?.exportPort
                  ? `Your destination port. Supplier ships from ${contextProduct.exportPort}.`
                  : undefined}
              >
                <input
                  className="input"
                  value={data.destination_port}
                  onChange={(e) => update("destination_port", e.target.value)}
                  placeholder="e.g. Rotterdam"
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-ink-100 pt-4">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-ink-500">Your details</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Company" required error={errors.company} id="rfq-company">
                <input id="rfq-company" autoComplete="organization" className="input" value={data.company} onChange={(e) => update("company", e.target.value)} />
              </Field>
              <Field label="Your name" required error={errors.contact_name} id="rfq-contact_name">
                <input id="rfq-contact_name" autoComplete="name" className="input" value={data.contact_name} onChange={(e) => update("contact_name", e.target.value)} />
              </Field>
              <Field label="Work email" required error={errors.email} id="rfq-email">
                <input id="rfq-email" autoComplete="email" type="email" className="input" value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="name@company.com" />
              </Field>
            </div>
          </div>
        </section>

        {/* Khối 2: chi tiết tuỳ chọn */}
        <section className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            aria-controls="rfq-details"
            className="flex w-full items-start justify-between gap-3 p-5 text-left sm:p-6"
          >
            <span>
              <span className="text-[14px] font-bold text-ink-900">Add details <span className="font-normal text-ink-500">(optional)</span></span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-600">
                Grade, incoterm, shipment month, certificates, packing. Helps suppliers quote accurately.
              </span>
            </span>
            <span aria-hidden="true" className="mt-0.5 text-lg leading-none text-ink-400">{detailsOpen ? "–" : "+"}</span>
          </button>

          {detailsOpen && (
            <div id="rfq-details" className="space-y-4 border-t border-ink-100 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <select className="input" value={data.category_slug} onChange={(e) => update("category_slug", e.target.value)}>
                    <option value="">Select...</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Incoterm"
                  hint={contextProduct?.incoterm
                    ? `Supplier's reference price is ${contextProduct.incoterm}. Choose CIF/CFR if you need freight included.`
                    : undefined}
                >
                  <select className="input" value={data.incoterm} onChange={(e) => update("incoterm", e.target.value)}>
                    <option value="">Not sure yet</option>
                    {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Shipment month">
                  {/* Ô chọn tháng của trình duyệt. Placeholder ("---- month ----" / "---- năm ----")
                      do ngôn ngữ máy người dùng quyết định, không do trang; giá trị vẫn là YYYY-MM. */}
                  <input type="month" className="input" value={data.shipment_month} onChange={(e) => update("shipment_month", e.target.value)} />
                </Field>
                <Field label="Purchase frequency">
                  <select className="input" value={data.frequency} onChange={(e) => update("frequency", e.target.value)}>
                    {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="Packaging / labelling">
                  <input className="input" value={data.packaging} onChange={(e) => update("packaging", e.target.value)} placeholder="e.g. vacuum tins, private label" />
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

              <Field label="Required certificates">
                <div className="flex flex-wrap gap-2">
                  {(categorySpecs[data.category_slug]?.certs?.length ? categorySpecs[data.category_slug].certs : DEFAULT_CERTS).map((c) => {
                    const active = (data.certifications as string[]).includes(c);
                    return (
                      <button key={c} type="button"
                        aria-pressed={active}
                        onClick={() => update("certifications", active ? (data.certifications as string[]).filter((x) => x !== c) : [...(data.certifications as string[]), c])}
                        className={cx(
                          "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
                          active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-400",
                        )}>{c}</button>
                    );
                  })}
                </div>
                <input
                  className="input mt-2"
                  value={data.certOther as string}
                  onChange={(e) => update("certOther", e.target.value)}
                  placeholder="Other certificate: BRC, organic, ISO..."
                />
              </Field>

              <div>
                <p className="mb-2 text-[12.5px] font-semibold text-ink-700">Also needed</p>
                <div className="flex flex-wrap gap-2">
                  <ToggleChip active={data.wants_samples} onToggle={() => update("wants_samples", !data.wants_samples)}>Samples</ToggleChip>
                  <ToggleChip active={data.wants_inspection} onToggle={() => update("wants_inspection", !data.wants_inspection)}>Pre-shipment inspection</ToggleChip>
                  <ToggleChip active={data.wants_video_call} onToggle={() => update("wants_video_call", !data.wants_video_call)}>Video factory call</ToggleChip>
                </div>
              </div>

              <Field label="Target price">
                <div className="flex max-w-sm">
                  <input
                    type="number"
                    step="0.01"
                    className="input rounded-r-none"
                    value={data.target_price}
                    onChange={(e) => update("target_price", e.target.value)}
                    placeholder="e.g. 6.90"
                  />
                  <select
                    aria-label="Currency"
                    className="input w-[84px] shrink-0 rounded-none border-l-0"
                    value={data.target_price_currency}
                    onChange={(e) => update("target_price_currency", e.target.value)}
                  >
                    <option>USD</option><option>EUR</option><option>GBP</option>
                  </select>
                  <select
                    aria-label="Price unit"
                    className="input w-[92px] shrink-0 rounded-l-none border-l-0"
                    value={data.target_price_unit}
                    onChange={(e) => update("target_price_unit", e.target.value)}
                  >
                    <option value="kg">/ kg</option>
                    <option value="MT">/ MT</option>
                    <option value="lb">/ lb</option>
                  </select>
                </div>
                <label className="mt-2 flex items-start gap-2 text-[12.5px] text-ink-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.share_target_price} onChange={(e) => update("share_target_price", e.target.checked)} />
                  <span>Share my target price with suppliers</span>
                </label>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Phone / WhatsApp">
                  <input id="rfq-phone" className="input" value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+1 555 ..." />
                </Field>
                <Field label="Website">
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
                <textarea rows={3} maxLength={4000} className="input resize-y" value={data.message} onChange={(e) => update("message", e.target.value)} placeholder="Timeline, target port, existing suppliers, anything we should know." />
              </Field>
            </div>
          )}
        </section>

        {/* Khối 3: quyền riêng tư, đồng ý và gửi */}
        <section className="space-y-3">
          {honeypotControl}
          {challengeControl}
          <p className="text-[12.5px] leading-relaxed text-ink-600">
            Vexim shares your request with matching suppliers <strong>without your name or contact details</strong>.
            They are shared only when you approve an introduction. See our{" "}
            <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Privacy Policy</Link> and{" "}
            <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">Terms of Service</Link>.
          </p>
          <label className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-700">
            <input id="rfq-consent" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.consent} onChange={(e) => update("consent", e.target.checked)} />
            <span>
              I agree to Veximtrade sharing this request with matching suppliers and processing my data to reply to this enquiry.{" "}
              <span className="text-red-500">*</span>
            </span>
          </label>
          {errors.consent && <p className="pl-6 text-[12px] text-red-600">{errors.consent}</p>}
          <label className="flex items-start gap-2 text-[12.5px] text-ink-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500" checked={data.marketing_opt_in} onChange={(e) => update("marketing_opt_in", e.target.checked)} />
            <span>Send me occasional sourcing updates from Vexim (optional)</span>
          </label>
          <p className="flex items-start gap-1.5 rounded-md bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
            <span>Your contact details stay private until you agree to an introduction. You sign the contract directly with the supplier you choose. Vexim never holds your payment. Free for buyers.</span>
          </p>
          <button type="submit" className="btn btn-primary min-h-12 w-full justify-center text-base font-bold sm:w-auto sm:px-8" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Send request
          </button>
        </section>
      </div>

      {/* Sidebar tiến độ: giúp người mua biết còn thiếu gì thay vì chỉ báo lỗi khi bấm gửi */}
      <aside aria-label="Request completeness" className="card order-first p-5 lg:order-none lg:sticky lg:top-6">
        <p className="text-[14px] font-bold text-ink-900">Your request</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200">
            <span className="block h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(completed / requiredChecks.length) * 100}%` }} />
          </span>
          <span className="text-[11.5px] font-semibold tabular-nums text-ink-600">{completed}/{requiredChecks.length} required</span>
        </div>
        <ul className="mt-3 space-y-2">
          {requiredChecks.map((check) => (
            <li key={check.key} className="flex items-center gap-2 text-[12.5px] text-ink-700">
              <span aria-hidden="true" className={cx(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                check.done ? "border-emerald-600 bg-emerald-600" : "border-ink-300",
              )}>
                {check.done && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className={check.done ? "text-ink-500 line-through" : undefined}>{check.label}</span>
              <span className="sr-only">{check.done ? "filled" : "still required"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-ink-100 pt-3 text-[11.5px] leading-relaxed text-ink-500">
          Grade, incoterm, shipment month and certificates are optional but lead to more accurate quotes.
        </p>
      </aside>
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
    <label className="block" htmlFor={id} data-invalid={error ? "true" : undefined}>
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
