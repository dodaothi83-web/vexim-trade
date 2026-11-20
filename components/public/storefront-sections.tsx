import Link from "next/link";
import { ArrowRight, CheckCircle2, Info, Package } from "lucide-react";
import type { ReactNode } from "react";

import { VeximInspectionIcon as Factory, VeximDocumentIcon as FileCheck2, VeximDeliveryIcon as Truck } from "@/components/brand/vexim-icons";
import { VeximMinimumOrderIcon, VeximExportPortIcon, VeximLeadTimeIcon, VeximCapacityIcon, VeximPaymentIcon, VeximMarketsIcon } from "@/components/brand/vexim-icons";
import { ExpandableBlock } from "@/components/public/expandable-text";
import { RichIntro } from "@/components/public/rich-intro";
import { SupplierCertificateRail } from "@/components/public/supplier-certificate-rail";
import type { PublicSupplierCard } from "@/lib/public/catalog";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierShortName } from "@/lib/public/supplier-name";
import {
  supplierAddressDisplay, supplierAnnualOutputDisplay, supplierCapacityDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay,
  supplierLegalNameDisplay, supplierMarketsDisplay, supplierMoqDisplay, supplierPaymentTermsDisplay, supplierPortsDisplay, supplierProductsDisplay,
  supplierProvinceDisplay, supplierSummaryDisplay, supplierSummaryRich,
} from "@/lib/public/supplier-english";
import { factoryReviewLabel, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

/**
 * Nội dung các mục chung của trang nhà cung cấp (giới thiệu, xác minh của Vexim, điều kiện giao
 * dịch, thông tin công ty, chứng nhận, thư viện ảnh). Trang Basic bọc trong khung riêng như cũ;
 * trang Premium/Pro dùng làm khối "Thiết kế trang" sắp xếp được, và trình thiết kế dùng lại để
 * xem trước. Chữ lọc liên hệ ở đây như mọi chữ công khai.
 */
const mediaUrl = (path: string) => `/public-media/${path.replace(/^\//, "")}`;
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

const VERIFICATION_ITEMS = [
  { level: 1, label: "Documents checked", pending: "Covers business registration evidence.", Icon: FileCheck2 },
  // Thứ tự hiển thị 11/2026: lịch sử giao hàng trước, nhà máy sau (mã level giữ nguyên).
  { level: 3, label: "Delivery history", pending: "Covers delivery documents and the reviewed shipment scope.", Icon: Truck },
  { level: 2, label: "Factory verification", pending: "Covers a specific facility associated with the supplier.", Icon: Factory },
] as const;

function Fact({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return <div className="flex gap-3 border-b border-ink-100 py-3 last:border-0">
    <Icon aria-hidden size={20} strokeWidth={2.6} className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
    <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(value) || "On request"}</dd></div>
  </div>;
}

/** Giới thiệu và chi tiết kinh doanh do nhà cung cấp cung cấp. */
export function CompanySection({ s, premium = false, hideIntro = false }: {
  s: PublicSupplierCard; premium?: boolean;
  /** Trình thiết kế (cổng NCC): đoạn giới thiệu được sửa trực tiếp ở chỗ khác, chỉ dựng chi tiết kinh doanh. */
  hideIntro?: boolean;
}) {
  const summary = safe(supplierSummaryDisplay(s));
  const businessDetails = [
    { label: "Main products", value: safe(supplierProductsDisplay(s)), wide: true },
    { label: "Markets served or targeted", value: safe(supplierMarketsDisplay(s)), wide: false },
  ].filter((item) => item.value);
  // Trang Premium/Pro: đoạn giới thiệu chữ lớn, thoáng, có "Read more"; chi tiết kinh doanh hai cột.
  // Trang Premium/Pro: giới thiệu có định dạng (tiêu đề phụ, gạch đầu dòng, chữ đậm).
  const rich = premium ? safe(supplierSummaryRich(s)) : "";
  if (premium) return <>
    {hideIntro ? null : rich
      ? <div className="mt-5"><ExpandableBlock><RichIntro text={rich} className="text-[15.5px] leading-8 text-ink-700" /></ExpandableBlock></div>
      : <p className="mt-5 text-sm leading-7 text-ink-500">This supplier has not added an introduction yet. Ask Vexim for more information.</p>}
    {businessDetails.length > 0 && <div className="mt-7 border-t border-ink-100 pt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">Business details</p>
      <dl className="mt-4 grid gap-x-8 gap-y-4 @2xl:grid-cols-2">
        {businessDetails.map((item) => <div key={item.label} className="min-w-0 border-l-[3px] border-[var(--sf-accent)] pl-3">
          <dt className="text-xs text-ink-500">{item.label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-ink-900">{item.value}</dd>
        </div>)}
      </dl>
      <p className="mt-4 text-xs leading-5 text-ink-500">Provided by the supplier. Confirm details when requesting a quote.</p>
    </div>}
  </>;
  return <>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{summary || (businessDetails.length
            ? "This supplier has not added an introduction yet. See the business details below or ask Vexim for more information."
            : "Supplier information has not been provided yet. Ask Vexim for details before making a sourcing decision.")}</p>
          {businessDetails.length > 0 && <div className="mt-5 rounded-xl bg-ink-50/70 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-ink-900">Business details</h3>
            <p className="mt-1 text-xs leading-5 text-ink-500">Provided by the supplier. Confirm details when requesting a quote.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {businessDetails.map((item) => <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
                <dt className="text-xs font-semibold text-ink-500">{item.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-ink-800">{item.value}</dd>
              </div>)}
            </dl>
          </div>}
  </>;
}

/** Các bước xác minh Vexim đã duyệt và phạm vi từng bước. */
export function ChecksSection({ s, reportAction }: { s: PublicSupplierCard; reportAction?: (code: string) => ReactNode }) {
  const steps = s.approved_verification_steps;
  const l2Scope: PublicL2Scope = s.approved_l2_scope ?? null;
  const plannedL2Scope: PublicL2Scope = s.supplier_type === "trading" ? "partner_contract" : s.supplier_type === "manufacturer" || s.supplier_type === "cooperative" ? "factory" : null;
  return <>
          <div className="mt-5 divide-y divide-ink-200">
              {VERIFICATION_ITEMS.map(({ level, label: defaultLabel, pending: defaultPending, Icon }) => {
                const approvedStep = steps.includes(level);
                const scope = level === 2 ? approvedStep ? l2Scope : plannedL2Scope : null;
                const label = level === 2 ? verificationLabel(2, scope) : defaultLabel;
                const pending = level === 2 && scope === "partner_contract" ? "Covers a contract with a partner factory; not a factory inspection." : level === 2 && scope === null ? "The review scope is not specified." : defaultPending;
                const reviewStatus = approvedStep ? "Checked" : "No completed check shown";
                return <article key={level} id={level === 2 ? scope === "partner_contract" ? "partner-factory-contract" : "factory-visit" : level === 3 ? "delivery-history" : undefined}
                  className="min-w-0 scroll-mt-24 py-5 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${approvedStep ? "text-success" : "text-ink-400"}`} />{level === 1 ? "Business registration" : label}
                    </h3>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${approvedStep ? "bg-success-surface text-success" : "bg-ink-50 text-ink-500"}`}>
                      {approvedStep ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Info aria-hidden="true" className="h-3.5 w-3.5" />}{reviewStatus}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">
                    {level === 1 && (approvedStep ? "Business registration documents reviewed by Vexim." : pending)}
                    {level === 2 && !approvedStep && pending}
                    {level === 2 && approvedStep && (scope === "factory" || scope === "both") && <span className="block">{scope === "both" && <strong className="block">Factory review</strong>}{safe(s.public_review_summaries[2]) || "Detailed factory review scope is available on request."}</span>}
                    {level === 2 && approvedStep && (scope === "partner_contract" || scope === "both") && <span id={scope === "both" ? "partner-factory-contract" : undefined} className="mt-2 block scroll-mt-24">{scope === "both" && <strong className="block">Partner factory contract</strong>}{safe(s.partner_review_summary) || "The supplier's contract with a partner factory was reviewed. Details are available on request."}</span>}
                    {level === 2 && approvedStep && scope === null && "Review scope is available on request."}
                    {level === 3 && (approvedStep ? (safe(s.public_review_summaries[3]) || "Detailed delivery scope is available on request.") : pending)}
                  </p>
                  {level === 2 && approvedStep && (s.factory_reviews ?? []).map((review) => <div key={review.code} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-ink-50 px-3 py-2">
                    <span className="text-xs font-semibold text-ink-800">{factoryReviewLabel(review)}</span>
                    <span className="text-xs text-ink-500">Reviewed by {safe(review.inspectorName)}</span>
                    {reportAction?.(review.code)}
                  </div>)}
                  {approvedStep && level !== 1 && <p className="mt-2 text-xs leading-5 text-ink-500">{level === 2 ? scope === "partner_contract" ? "The contract review does not establish ownership or a factory inspection." : scope === "both" ? "Each result applies only to its separately reviewed scope." : scope === "factory" ? "Applies only to the reviewed facility." : "Ask for the review scope." : "Applies only to the evidence reviewed; it does not by itself prove an end buyer received the goods."}</p>}
                </article>;
              })}
          </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              <p>These checks cover specific documents or activities. Confirm product requirements before ordering.</p>
            </div>
  </>;
}

/** Các điều kiện giao dịch do nhà cung cấp khai (dùng chung cho hai kiểu trình bày). */
function tradeFacts(s: PublicSupplierCard) {
  return [
    { icon: VeximMinimumOrderIcon, label: "Minimum order", value: supplierMoqDisplay(s) },
    { icon: VeximExportPortIcon, label: "Export ports / Incoterms", value: [...supplierPortsDisplay(s), ...supplierIncotermsDisplay(s)].join(" · ") },
    { icon: VeximLeadTimeIcon, label: "Lead time", value: s.lead_time_days ? `${s.lead_time_days} days` : "" },
    { icon: VeximCapacityIcon, label: s.annual_output?.trim() ? "Annual revenue" : "Monthly capacity", value: s.annual_output?.trim() ? supplierAnnualOutputDisplay(s) : supplierCapacityDisplay(s) },
    { icon: VeximPaymentIcon, label: "Payment terms", value: supplierPaymentTermsDisplay(s) },
    { icon: VeximMarketsIcon, label: "Export markets", value: supplierExportMarketsDisplay(s).join(", ") },
  ];
}

/** Đường dẫn gửi yêu cầu qua Vexim; bản xem trước của nhà cung cấp không bấm được. */
function EnquiryButtons({ s, rfqActions, premium }: { s: PublicSupplierCard; rfqActions: boolean; premium: boolean }) {
  const primary = `flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white ${premium ? "bg-[var(--sf-accent)] hover:bg-[var(--sf-dark)]" : "bg-brand-700 hover:bg-brand-800"}`;
  const secondary = "flex items-center justify-center rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50";
  return rfqActions
    ? <><Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className={primary}>Request a quote <ArrowRight className="h-4 w-4" /></Link>
      <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}&sample=1`} className={secondary}>Ask about samples</Link></>
    : <><span className={primary}>Request a quote <ArrowRight className="h-4 w-4" /></span><span className={secondary}>Ask about samples</span></>;
}

/** Trang Premium/Pro: lưới thẻ điều kiện giao dịch và khung gửi yêu cầu bên cạnh. */
function PremiumTrade({ s, rfqActions, synthetic }: { s: PublicSupplierCard; rfqActions: boolean; synthetic: boolean }) {
  return <>
    <p className="mt-1 text-sm leading-6 text-ink-600">Provided by the supplier. Confirm terms when requesting a quote.</p>
    <div className="mt-5 grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_250px]">
      <dl className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
        {tradeFacts(s).map(({ icon: Icon, label, value }) => <div key={label} className="flex min-w-0 gap-3 rounded-xl bg-[var(--sf-tint)] p-4">
          <Icon aria-hidden size={22} strokeWidth={2.6} className="mt-0.5 h-[22px] w-[22px] shrink-0 text-[var(--sf-dark)]" />
          <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-bold text-ink-900">{safe(value) || "On request"}</dd></div>
        </div>)}
      </dl>
      {!synthetic && <div className="flex flex-col justify-center gap-2 rounded-xl border border-ink-200 p-4">
        <p className="text-sm font-bold text-ink-900">Ready to source?</p>
        <EnquiryButtons s={s} rfqActions={rfqActions} premium />
        <p className="text-xs leading-5 text-ink-500">Enquiries go through Vexim Trade. Supplier email and phone are not displayed publicly.</p>
      </div>}
    </div>
  </>;
}

/** Trang Premium/Pro: thông tin công ty xếp hai cột, ghi chú nguồn và báo cáo ở chân khối. */
function PremiumCompanyDetails({ s, rfqActions }: { s: PublicSupplierCard; rfqActions: boolean }) {
  const rows = [
    { label: "Legal name", value: safe(supplierLegalNameDisplay(s)) },
    ...(s.trade_name && s.trade_name !== s.name ? [{ label: "Trade name", value: safe(s.trade_name) }] : []),
    { label: "Registered address", value: safe(supplierAddressDisplay(s)) || (supplierProvinceDisplay(s) ? `${safe(supplierProvinceDisplay(s))}, Vietnam` : "Ask Vexim for the registered address before contracting.") },
    { label: "Contact", value: "Request an introduction through Vexim" },
  ];
  return <>
    <dl className="mt-5 grid gap-x-8 gap-y-4 @2xl:grid-cols-2">
      {rows.map((row) => <div key={row.label} className="min-w-0 border-l-[3px] border-[var(--sf-accent)] pl-3">
        <dt className="text-xs text-ink-500">{row.label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-ink-900">{row.value}</dd>
      </div>)}
    </dl>
    <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
      <p className="max-w-2xl text-xs leading-5 text-ink-500">Legal name and registered address come from the supplier record held by Vexim. The company website is supplier-provided, not verified by Vexim. Email, phone and internal verification documents are not published.</p>
      {rfqActions
        ? <Link href={`/khieu-nai?supplier=${encodeURIComponent(s.slug || s.id)}`} className="shrink-0 text-sm font-semibold text-brand-700 underline">Report this supplier</Link>
        : <span className="shrink-0 text-sm font-semibold text-brand-700 underline">Report this supplier</span>}
    </div>
  </>;
}

/** Điều kiện giao dịch do nhà cung cấp khai và nút gửi yêu cầu qua Vexim. */
export function TradeSection({ s, rfqActions, synthetic, premium = false }: { s: PublicSupplierCard; rfqActions: boolean; synthetic: boolean; premium?: boolean }) {
  if (premium) return <PremiumTrade s={s} rfqActions={rfqActions} synthetic={synthetic} />;
  return <>
    <p className="mt-2 text-xs leading-5 text-ink-500">Provided by the supplier. Confirm terms when requesting a quote.</p>
          <dl className="mt-2"><Fact icon={VeximMinimumOrderIcon} label="Minimum order" value={supplierMoqDisplay(s)} />
            <Fact icon={VeximExportPortIcon} label="Export ports / Incoterms" value={[...supplierPortsDisplay(s), ...supplierIncotermsDisplay(s)].join(" · ")} />
            <Fact icon={VeximLeadTimeIcon} label="Lead time" value={s.lead_time_days ? `${s.lead_time_days} days` : ""} />
            <Fact icon={VeximCapacityIcon} label={s.annual_output?.trim() ? "Annual revenue" : "Monthly capacity"} value={s.annual_output?.trim() ? supplierAnnualOutputDisplay(s) : supplierCapacityDisplay(s)} />
            <Fact icon={VeximPaymentIcon} label="Payment terms" value={supplierPaymentTermsDisplay(s)} />
            <Fact icon={VeximMarketsIcon} label="Export markets" value={supplierExportMarketsDisplay(s).join(", ")} /></dl>
          {rfqActions && !synthetic && <div className="mt-4 space-y-2"><Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white ${premium ? "bg-[var(--sf-accent)] hover:bg-[var(--sf-dark)]" : "bg-brand-700 hover:bg-brand-800"}`}>Request a quote <ArrowRight className="h-4 w-4" /></Link>
            <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}&sample=1`} className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Ask about samples</Link></div>}
          {!rfqActions && !synthetic && <div className="mt-4 space-y-2"><span className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white ${premium ? "bg-[var(--sf-accent)]" : "bg-brand-700"}`}>Request a quote <ArrowRight className="h-4 w-4" /></span>
            <span className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800">Ask about samples</span></div>}
          <p className="mt-3 text-xs leading-5 text-ink-500">Enquiries go through Vexim Trade. Supplier email and phone are not displayed publicly.</p>
  </>;
}

/** Tên pháp lý, địa chỉ đăng ký lấy từ hồ sơ Vexim giữ; liên hệ đi qua Vexim. */
export function CompanyDetailsSection({ s, rfqActions, premium = false }: { s: PublicSupplierCard; rfqActions: boolean; premium?: boolean }) {
  if (premium) return <PremiumCompanyDetails s={s} rfqActions={rfqActions} />;
  return <>
          <dl className="mt-2">
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Legal name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(supplierLegalNameDisplay(s))}</dd></div>
            {s.trade_name && s.trade_name !== s.name && <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Trade name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(s.trade_name)}</dd></div>}
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Registered address</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(supplierAddressDisplay(s)) || (supplierProvinceDisplay(s) ? `${safe(supplierProvinceDisplay(s))}, Vietnam` : "Ask Vexim for the registered address before contracting.")}</dd></div>
            <div className="py-3"><dt className="text-xs text-ink-500">Contact</dt><dd className="mt-0.5 text-sm font-semibold text-ink-800">Request an introduction through Vexim</dd></div>
          </dl>
          <p className="text-xs leading-5 text-ink-500">Legal name and registered address come from the supplier record held by Vexim. The company website is supplier-provided, not verified by Vexim. Email, phone and internal verification documents are not published.</p>
          {rfqActions
            ? <Link href={`/khieu-nai?supplier=${encodeURIComponent(s.slug || s.id)}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</Link>
            : <span className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</span>}
  </>;
}

/** Chứng nhận đã duyệt, kèm ảnh bản sao nhà cung cấp chia sẻ. */
export function CertificatesSection({ certificates }: { certificates: PublicSupplierCertificate[] }) {
  return <>
            <p className="mt-1 text-xs leading-5 text-ink-600">Images are the document copies shared by the supplier. Holder names and expiry dates come from these copies. Issuer authentication is a separate check.</p>
            <SupplierCertificateRail certificates={certificates} />
  </>;
}

/** Ảnh nhà cung cấp chia sẻ cho người mua. */
export function GallerySection({ s }: { s: PublicSupplierCard }) {
  const name = safe(supplierShortName(s));
  return <>
          <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of factory verification.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{s.gallery_images.map((path) => <a key={path} href={mediaUrl(path)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-ink-50 ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(path)} alt={`${name} gallery`} loading="lazy" className="h-32 w-full object-cover transition hover:scale-105 sm:h-40" />
          </a>)}</div>
  </>;
}
