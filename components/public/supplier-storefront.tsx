import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Globe2, MapPin, Package, ShieldCheck, Ship, Users } from "lucide-react";
import type { ReactNode } from "react";

import { PublicProductCard } from "@/components/public-product-card";
import { VerificationCoverSeal, VerificationPips, VerificationTierBadge, approvedChecksSummary, verificationTier } from "@/components/verification-tier";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";
import { supplierTypeLabel, type PublicSupplierCard } from "@/lib/public/catalog";
import type { Category } from "@/lib/types";
import { publicProductTitle } from "@/lib/public/display-name";
import { productBelongsToCategory, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierAddressDisplay, supplierCapacityDisplay, supplierExportMarketsDisplay, supplierIncotermsDisplay, supplierMarketsDisplay, supplierMoqDisplay, supplierPaymentTermsDisplay, supplierPortsDisplay, supplierProductsDisplay, supplierProvinceDisplay, supplierSummaryDisplay } from "@/lib/public/supplier-english";
import { PRODUCT_VERIFICATION_EXPLANATIONS } from "@/lib/verification-status";

const mediaUrl = (path: string) => `/public-media/${path.replace(/^\//, "")}`;
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

const STRIP_CLASSES: Record<number, string> = {
  0: "border-ink-300 bg-ink-50",
  1: "border-brand-500 bg-brand-50",
  2: "border-brand-700 bg-brand-50",
  3: "border-amber-400 bg-gradient-to-r from-brand-50 to-amber-50",
};

function Fact({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return <div className="flex gap-3 border-b border-ink-100 py-3 last:border-0">
    <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
    <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(value) || "On request"}</dd></div>
  </div>;
}

/**
 * Toàn bộ phần nội dung trang nhà cung cấp mà buyer nhìn thấy.
 *
 * Dùng chung cho trang công khai `/suppliers/[slug]` và bản “Trang của tôi” trong cổng
 * NCC, để hai nơi không bao giờ lệch nhau. Trang công khai tự lo SEO, JSON-LD, đếm lượt
 * xem và danh sách nhà cung cấp liên quan; khung này chỉ vẽ hồ sơ.
 *
 * Cổng NCC truyền thêm `coverAction` và `avatarAction` để đặt nút thêm ảnh đúng vị trí
 * buyer nhìn thấy, và tắt các nút gửi RFQ để nhà cung cấp không tự gửi yêu cầu cho mình.
 */
export function SupplierStorefront({
  supplier: s, certificates, categories, coverUrl, avatarUrl, synthetic,
  productLinks = true, rfqActions = true, coverAction, avatarAction, verificationActions, nameTag = "h1",
}: {
  supplier: PublicSupplierCard;
  certificates: PublicSupplierCertificate[];
  categories: Category[];
  coverUrl: string | null;
  avatarUrl: string | null;
  synthetic: boolean;
  /** Tắt đường dẫn sản phẩm khi hồ sơ chưa công khai để không dẫn tới trang 404. */
  productLinks?: boolean;
  /** Tắt nút gửi RFQ ở bản xem trước của chính nhà cung cấp. */
  rfqActions?: boolean;
  coverAction?: ReactNode;
  avatarAction?: ReactNode;
  /**
   * Khối chỉ nhà cung cấp thấy, chèn ngay dưới phần “What Vexim checked”.
   * Trang công khai không truyền prop này nên buyer không bao giờ thấy nút nộp bằng chứng.
   */
  verificationActions?: ReactNode;
  /** Cấp thẻ cho tên nhà cung cấp. Trang xem trước đã có h1 riêng nên dùng h2. */
  nameTag?: "h1" | "h2";
}) {
  const NameTag = nameTag;
  const name = safe(s.display_name || s.name);
  const summary = safe(supplierSummaryDisplay(s));
  const statedProducts = safe(supplierProductsDisplay(s));
  const businessDetails = [
    { label: "Main products", value: statedProducts, wide: true },
    { label: "Markets served or targeted", value: safe(supplierMarketsDisplay(s)), wide: false },
    { label: "Monthly capacity", value: safe(supplierCapacityDisplay(s)), wide: false },
    { label: "Payment terms", value: safe(supplierPaymentTermsDisplay(s)), wide: false },
  ].filter((item) => item.value);
  const steps = s.approved_verification_steps;
  const tier = verificationTier(steps);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));

  return <>
    <section className="mt-5 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card" aria-labelledby="supplier-name">
      <div className="relative h-28 bg-gradient-to-r from-ink-900 via-brand-800 to-brand-700 sm:h-40">
        {coverUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-ink-900/60 to-transparent" /></>}
        <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-800">Vietnam supplier profile</span>
        <VerificationCoverSeal levels={steps} />
        {coverAction}
      </div>
      <div className="relative flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:gap-6 sm:px-8">
        <div className="relative -mt-9 shrink-0 sm:-mt-11">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-ink-50 text-3xl font-bold text-ink-400 shadow-sm sm:h-24 sm:w-24">
            {avatarUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={avatarUrl} alt="" className="h-full w-full object-cover" /></> : name.slice(0, 1).toUpperCase()}
          </div>
          {avatarAction}
        </div>
        <div className="min-w-0 flex-1 pt-0 sm:pt-5">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{supplierTypeLabel(s)}</span><VerificationTierBadge levels={steps} />
            {s.private_label && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">Private label stated</span>}
          </div>
          <NameTag id="supplier-name" className="mt-3 break-words text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{name}</NameTag>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
            {supplierProvinceDisplay(s) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-700" />{safe(supplierProvinceDisplay(s))}, Vietnam</span>}
            {s.founded_year && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand-700" />Founded {s.founded_year}</span>}
            {typeof s.employees === "number" && s.employees > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-700" />{s.employees} employees</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Vexim checks</span>
            <VerificationPips levels={steps} />
            <span className="text-[13px] font-medium text-ink-600">{steps.length}/3 checks approved</span>
          </div>
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 px-3.5 py-2.5 ${STRIP_CLASSES[tier]}`}>
            <p className="text-[13px] leading-5 text-ink-700"><b className="text-ink-900">Vexim verification:</b>{" "}
              {steps.length ? <>approved checks: {approvedChecksSummary(steps)}.</> : "this profile is still under audit."}</p>
            <a href="#verification" className="inline-flex shrink-0 items-center rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-50">{steps.length ? "View checked items" : "Verification pending"}</a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:pt-6">
          {rfqActions && !synthetic && <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800">Request a quote <ArrowRight className="h-4 w-4" /></Link>}
          {!rfqActions && !synthetic && <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white">Request a quote <ArrowRight className="h-4 w-4" /></span>}
          <a href="#products" className="inline-flex items-center justify-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Browse products</a>
        </div>
      </div>
    </section>

    <nav aria-label="Supplier sections" className="mt-5 flex gap-2 overflow-x-auto border-b border-ink-200 pb-3 text-sm font-semibold text-ink-600">
      {[
        ["About", "about"],
        ["Verification", "verification"],
        ...(certificates.length > 0 ? [["Certificates", "certificates"] as const] : []),
        ["Trade details", "trade"],
        ["Products", "products"],
      ].map(([label, id]) =>
        <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 hover:bg-white hover:text-brand-700">{label}</a>)}
    </nav>

    <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section id="about" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="about-title">
          <h2 id="about-title" className="text-lg font-bold text-ink-900">About this supplier</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{summary || (businessDetails.length
            ? "This supplier has not added an introduction yet. See the business details below or ask Vexim for more information."
            : "Supplier information has not been provided yet. Ask Vexim for details before making a sourcing decision.")}</p>
          {businessDetails.length > 0 && <div className="mt-5 rounded-xl bg-ink-50/70 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-ink-900">Business details</h3>
            <p className="mt-1 text-xs leading-5 text-ink-500">Shared by the supplier. Ask Vexim to confirm the details for your order.</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {businessDetails.map((item) => <div key={item.label} className={item.wide ? "sm:col-span-2" : undefined}>
                <dt className="text-xs font-semibold text-ink-500">{item.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-ink-800">{item.value}</dd>
              </div>)}
            </dl>
          </div>}
        </section>
        <section id="verification" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="verification-title">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-700" /><h2 id="verification-title" className="text-lg font-bold text-ink-900">What Vexim checked</h2></div>
          <p className="mt-2 text-xs leading-5 text-ink-600">Each check is independent. Only approved reviews are marked as approved; “not reviewed” does not mean a failed check.</p>
          <div className="mt-2">
            {([[1, "Documents checked"], [2, "Factory visit"], [3, "Delivery history"]] as const).map(([level, label]) => {
              const approvedStep = steps.includes(level);
              return <div key={level} id={level === 2 ? "factory-visit" : level === 3 ? "delivery-history" : undefined} className="flex scroll-mt-24 gap-3 border-t border-ink-100 py-4 first:border-t-0">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${approvedStep ? "bg-brand-50 text-brand-800 ring-brand-300" : "bg-ink-50 text-ink-400 ring-ink-200"}`}>
                  {approvedStep ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink-900">{label}</h3>
                  <p className={`mt-0.5 text-xs font-bold ${approvedStep ? "text-brand-800" : "text-ink-500"}`}>{approvedStep ? "Review approved" : "Not reviewed yet"}</p>
                  {level === 3 && supplierExportMarketsDisplay(s).length > 0 && <p className="mt-1.5 text-sm leading-6 text-ink-700">Supplier-stated markets (not independently verified): {safe(supplierExportMarketsDisplay(s).join(", "))}</p>}
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">
                    {level === 1 && (approvedStep ? PRODUCT_VERIFICATION_EXPLANATIONS[1] : "Vexim has not approved a document review for this supplier yet.")}
                    {level === 2 && (approvedStep ? (safe(s.public_review_summaries[2]) || "Visit details have not been released for public viewing.") : "No approved factory visit review is available.")}
                    {level === 3 && (approvedStep ? (safe(s.public_review_summaries[3]) || "Reviewed shipment details have not been released for public viewing.") : "No approved delivery evidence review is available. Stated markets are not a Vexim-verified export history.")}
                  </p>
                  {level === 2 && approvedStep && <p className="mt-1.5 text-xs text-ink-500">Only the site described in a published summary was reviewed. This is not a certification of other facilities or products.</p>}
                  {level === 3 && approvedStep && <p className="mt-1.5 text-xs text-ink-500">A reviewed delivery is not proof of the supplier’s entire export history or a guarantee of future shipments.</p>}
                </div>
              </div>;
            })}
          </div>
          <p className="mt-2 text-xs leading-5 text-ink-500">Verification is limited to the documents, site or shipment in the relevant review. It does not certify every facility or product. Ask Vexim to confirm the certificate holder and its scope for the goods offered.</p>
        </section>
        {verificationActions}
        {certificates.length > 0 && (
          <section id="certificates" className="scroll-mt-24 rounded-xl border border-teal-200 bg-teal-50/40 p-5 sm:p-6" aria-labelledby="certificates-title">
            <h2 id="certificates-title" className="text-lg font-bold text-ink-900">Certificates on file (L1 document scan)</h2>
            <p className="mt-1 text-xs leading-5 text-ink-600">Copies uploaded by the supplier in L1 document checks and read by Vexim document AI for holder-name match and expiry date. Holder match reflects what is stated on the document copy, not independent issuer authentication.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {certificates.map((c) => (
                <li key={c.id} className="rounded-xl border border-teal-100 bg-white p-4 text-sm shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="font-bold text-ink-900">{c.name}</strong>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.holderMatch === "owner" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>
                      {c.holderMatch === "owner" ? "Registered to supplier" : `Third-party holder · ${c.holderName}`}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink-600">
                    {c.holderName ? `Holder on document: ${c.holderName} · ` : ""}
                    {c.issuer ? `Issuer: ${c.issuer} · ` : ""}
                    Valid until: <strong className="text-ink-900">{c.validUntil}</strong>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {s.gallery_images.length > 0 && <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-lg font-bold text-ink-900">Supplier gallery</h2>
          <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of a factory visit.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{s.gallery_images.map((path) => <a key={path} href={mediaUrl(path)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-ink-50 ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(path)} alt={`${name} gallery`} loading="lazy" className="h-32 w-full object-cover transition hover:scale-105 sm:h-40" />
          </a>)}</div>
        </section>}
      </div>
      <aside id="trade" className="scroll-mt-24 space-y-4 lg:sticky lg:top-24" aria-label="Trade details and enquiry">
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Trade at a glance</h2>
          <dl className="mt-2"><Fact icon={Package} label="Typical MOQ (supplier-stated)" value={supplierMoqDisplay(s)} />
            <Fact icon={Ship} label="Ports / Incoterms (supplier-stated)" value={[...supplierPortsDisplay(s), ...supplierIncotermsDisplay(s)].join(" · ")} />
            <Fact icon={Clock3} label="Lead time (supplier-stated)" value={s.lead_time_days ? `${s.lead_time_days} days` : ""} />
            <Fact icon={Globe2} label="Export markets (supplier-stated)" value={supplierExportMarketsDisplay(s).join(", ")} /></dl>
          {rfqActions && !synthetic && <div className="mt-4 space-y-2"><Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-ink-800">Request quote <ArrowRight className="h-4 w-4" /></Link>
            <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}&sample=1`} className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Ask about samples</Link></div>}
          {!rfqActions && !synthetic && <div className="mt-4 space-y-2"><span className="flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white">Request quote <ArrowRight className="h-4 w-4" /></span>
            <span className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800">Ask about samples</span></div>}
          <p className="mt-3 text-xs leading-5 text-ink-500">Enquiries go through Vexim Trade. Supplier contact information is not displayed publicly.</p>
        </div>
        {!synthetic && <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Seller information</h2>
          <dl className="mt-2">
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Legal name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(s.name)}</dd></div>
            {s.trade_name && s.trade_name !== s.name && <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Trade name</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(s.trade_name)}</dd></div>}
            <div className="border-b border-ink-100 py-3"><dt className="text-xs text-ink-500">Registered address</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(supplierAddressDisplay(s)) || (supplierProvinceDisplay(s) ? `${safe(supplierProvinceDisplay(s))}, Vietnam` : "Ask Vexim for the registered address before contracting.")}</dd></div>
            <div className="py-3"><dt className="text-xs text-ink-500">Contact</dt><dd className="mt-0.5 text-sm font-semibold text-ink-800">Through Vexim Trade by RFQ</dd></div>
          </dl>
          <p className="text-xs leading-5 text-ink-500">Legal name and registered address come from the supplier record held by Vexim. Email, phone and internal verification documents are not published.</p>
          {rfqActions
            ? <Link href={`/khieu-nai?supplier=${encodeURIComponent(s.slug || s.id)}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</Link>
            : <span className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Report this supplier</span>}
        </div>}
      </aside>
    </div>

    <section id="products" className="mt-10 scroll-mt-24 border-t border-ink-200 pt-10" aria-labelledby="products-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplier catalogue</p>
          <h2 id="products-title" className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Products <span className="text-base font-medium text-ink-500">({s.main_products.length})</span></h2>
          <p className="mt-1 text-sm text-ink-600">{synthetic ? "Test entries on this profile are not commercial offers." : "Listings ready to share with buyers. Prices, where shown, are references; request a quote for current terms."}</p></div>
      </div>
      {s.main_products.length ? <ul className="mt-5 grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {s.main_products.map((p) => {
          const category = productCategory(p);
          const href = synthetic
            ? `/suppliers/${encodeURIComponent(s.slug || s.id)}/products/${encodeURIComponent(p.id)}`
            : category ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}` : null;
          if (!href) return null;
          return <li key={p.id} className="min-w-0">
            <PublicProductCard href={href} imagePath={s.product_card_image_paths?.[p.id] ?? s.product_image_paths[p.id]}
              name={safe(publicProductTitle(p))} moq={safe(p.moq) || "On request"}
              price={synthetic ? null : publicProductPrice(p, s)} fob={p.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.lead_time_days ?? null} supplierName={name}
              supplierHref={productLinks ? `/suppliers/${encodeURIComponent(s.slug || s.id)}` : undefined}
              verificationSteps={steps} test={synthetic} linkable={productLinks} />
          </li>;
        })}
      </ul> : <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-ink-300 bg-white p-6 text-sm text-ink-600"><Package className="h-8 w-8 shrink-0 text-ink-400" /><p>{statedProducts && !synthetic
        ? "No individual product listings are available yet. See the main products above or ask Vexim about specifications and availability."
        : "No buyer-ready products are available on this profile yet. Products appear here only after the listing and shareable media meet publication requirements."}</p></div>}
    </section>
  </>;
}
