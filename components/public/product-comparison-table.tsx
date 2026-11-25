import { publicMediaUrlAt } from "@/lib/media/public-url";
import { DownloadComparisonPdf } from "@/components/download-comparison-pdf";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ImageIcon, Info, Minus, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { CopyComparisonLink, RemoveComparedProduct } from "@/components/product-comparison-actions";
import { VerificationTierBadge } from "@/components/verification-tier";
import { SupplierWebsiteLink } from "@/components/public/supplier-website-link";
import { productComparisonWarnings, type ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { PublicComparedProduct } from "@/lib/public/product-comparison-data";
import { verificationCheckLabel } from "@/lib/verification-status";
import { VERIFICATION_DISPLAY_ORDER } from "@/lib/types";
import { publicProductLocationDisplay } from "@/lib/public/product-detail-display";

function Missing({ children = "Not provided" }: { children?: string }) {
  return <span className="font-normal text-ink-400">{children}</span>;
}

function Value({ value }: { value: string | null }) {
  return value ? <span className="whitespace-pre-wrap break-words">{value}</span> : <Missing />;
}

function Availability({ available }: { available: boolean }) {
  return available ? <span>Yes</span> : <Missing />;
}

function Section({ label, count }: { label: string; count: number }) {
  return (
    <tr>
      <th colSpan={count + 1} scope="colgroup" className="border-y border-ink-200 bg-ink-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.14em] text-ink-500 sm:px-4">
        {label}
      </th>
    </tr>
  );
}

function Row({ label, products, children }: {
  label: string;
  products: PublicComparedProduct[];
  children: (product: PublicComparedProduct) => ReactNode;
}) {
  return (
    <tr className="border-b border-ink-100">
      <th scope="row" className="sticky left-0 z-10 w-24 min-w-24 bg-white px-3 py-3 align-top text-left text-[11px] font-bold leading-4 text-ink-600 sm:w-44 sm:min-w-44 sm:px-4 sm:py-3.5 sm:text-xs sm:leading-5">
        {label}
      </th>
      {products.map((product) => (
        <td key={product.id} className="min-w-48 px-3 py-3 align-top text-[13px] font-medium leading-5 text-ink-800 sm:min-w-60 sm:px-4 sm:py-3.5 sm:text-sm sm:leading-6">
          {children(product)}
        </td>
      ))}
    </tr>
  );
}

/** Tên ngắn cho các bước chưa duyệt, gộp một dòng để ô không dài. */
const PENDING_SHORT: Record<number, string> = { 1: "Documents", 2: "Factory", 3: "Delivery history" };

/**
 * Xác minh Vexim, bản gọn: huy hiệu cấp, các bước đã duyệt (mỗi bước một dòng có dấu tích),
 * các bước chưa làm gộp một dòng mờ "Not yet reviewed". Không ghi "Not approved" vì người mua
 * dễ hiểu thành bị từ chối.
 */
function VerificationCell({ product }: { product: PublicComparedProduct }) {
  const approved = VERIFICATION_DISPLAY_ORDER.filter((level) => product.verificationSteps.includes(level));
  const pending = VERIFICATION_DISPLAY_ORDER.filter((level) => !product.verificationSteps.includes(level));
  return (
    <div>
      <VerificationTierBadge levels={product.verificationSteps} />
      {approved.length > 0 && (
        <ul className="mt-2 space-y-1">
          {approved.map((level) => (
            <li key={level} className="flex items-start gap-1.5 text-xs leading-5 text-ink-800">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>{verificationCheckLabel(level, product.l2Scope, true)}<span className="sr-only">: Approved</span></span>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-ink-400">
          <Minus className="mt-0.5 size-3.5 shrink-0 text-ink-300" aria-hidden="true" />
          <span>{approved.length ? "Not yet reviewed" : "No checks completed yet"}: {pending.map((level) => PENDING_SHORT[level]).join(", ")}</span>
        </p>
      )}
      <Link prefetch={false} href={`${product.supplierHref}#verification`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">Verification scope</Link>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-03-31" → "Mar 2027"; giá trị lạ giữ nguyên. */
function shortValidity(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : value;
}

/**
 * Chứng nhận công khai, bản gọn: mỗi giấy một thẻ nhỏ "HACCP · to Mar 2027", tối đa 3 thẻ rồi
 * "+N more". Tên đầy đủ, đơn vị cấp, chủ sở hữu nằm trong tooltip. Giấy đứng tên đối tác ghi rõ
 * ngay trên thẻ để không bị hiểu là của nhà cung cấp.
 */
function CertificatesCell({ product }: { product: PublicComparedProduct }) {
  const certificates = product.certificates;
  if (!certificates.length) return <Missing>None listed</Missing>;
  const shown = certificates.slice(0, 3);
  const more = certificates.length - shown.length;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((certificate) => {
          const label = certificate.shortName || certificate.name;
          const partner = certificate.holderMatch !== "owner";
          const tooltip = [
            certificate.name,
            certificate.issuer ? `Issued by ${certificate.issuer}` : "",
            `Valid until ${certificate.validUntil}`,
            partner ? `Third-party holder: ${certificate.holderName ?? "partner"}` : "Registered to supplier",
          ].filter(Boolean).join(" · ");
          return (
            <li key={certificate.id} title={tooltip}
              className={`inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-md border px-2 py-0.5 text-xs leading-5 ${partner ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
              <strong className="break-words font-bold">{label}</strong>
              <span className="whitespace-nowrap font-medium opacity-75">to {shortValidity(certificate.validUntil)}</span>
              {partner && <span className="whitespace-nowrap font-semibold">· partner</span>}
              <span className="sr-only">{tooltip}</span>
            </li>
          );
        })}
      </ul>
      <Link prefetch={false} href={`${product.supplierHref}#certificates`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">
        {more > 0 ? `View all ${certificates.length} certificates` : "View certificates"}
      </Link>
    </div>
  );
}

export function ProductComparisonTable({ products }: { products: PublicComparedProduct[] }) {
  const selections: ProductComparisonSelection[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    href: product.href,
    imagePath: product.imagePath,
    categorySlug: product.categorySlug,
  }));
  const warnings = productComparisonWarnings(products);
  const sameCategory = new Set(products.map((product) => product.categorySlug)).size === 1;
  const specificationRows: Array<{ key: string; label: string }> = [];
  if (sameCategory) {
    const seen = new Set<string>();
    for (const product of products) {
      for (const specification of product.specifications) {
        if (seen.has(specification.key)) continue;
        seen.add(specification.key);
        specificationRows.push({ key: specification.key, label: specification.label });
      }
    }
  }

  return (
    <>
      {warnings.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4" role="note" aria-label="Comparison cautions">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-800" aria-hidden="true" />
            <ul className="space-y-1.5 text-xs font-semibold leading-5 text-amber-950">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-600">{products.length} products selected</p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyComparisonLink productIds={products.map((product) => product.id)} />
          <DownloadComparisonPdf products={products} />
        </div>
      </div>

      <p id="comparison-scroll-hint" className="mt-4 text-xs font-medium leading-5 text-ink-500 sm:hidden">Swipe horizontally to see each product. Criteria stay visible.</p>
      <div role="region" aria-label="Scrollable product comparison" aria-describedby="comparison-scroll-hint" tabIndex={0} className="mt-2 scroll-smooth overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-card focus-visible:outline-brand-700 sm:mt-4">
        <table className="min-w-full border-collapse text-left">
          <caption className="sr-only">Side-by-side comparison of selected products and their suppliers</caption>
          <thead>
            <tr className="bg-ink-50">
              <th scope="col" className="sticky left-0 z-20 w-24 min-w-24 bg-ink-50 px-3 py-3 align-bottom text-[10px] font-black uppercase tracking-[0.1em] text-ink-500 sm:w-44 sm:min-w-44 sm:px-4 sm:py-4 sm:text-[11px] sm:tracking-[0.14em]">
                Criterion
              </th>
              {products.map((product, index) => (
                <th key={product.id} scope="col" className="min-w-48 border-l border-ink-100 px-3 py-3 align-top sm:min-w-60 sm:px-4 sm:py-4">
                  <div className="relative flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
                    <Link prefetch={false} href={product.href} target="_blank" rel="noopener noreferrer" aria-label={`${product.name} (opens in a new tab)`} className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-ink-300 ring-1 ring-ink-200 sm:size-16">
                      {product.imagePath ? <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={publicMediaUrlAt(product.imagePath, 400)} alt={product.name} className="h-full w-full object-cover" />
                      </> : <ImageIcon className="size-6" aria-hidden="true" />}
                    </Link>
                    <div className="w-full min-w-0 flex-1 sm:w-auto">
                      <Link prefetch={false} href={product.href} target="_blank" rel="noopener noreferrer" className="block break-words text-[13px] font-black leading-5 text-ink-900 hover:text-brand-700 sm:text-sm">{product.name}</Link>
                      <Link prefetch={false} href={product.supplierHref} target="_blank" rel="noopener noreferrer" className="mt-1 block break-words text-xs font-semibold leading-5 text-brand-700 hover:underline">{product.supplierName}</Link>
                    </div>
                    <div className="absolute right-0 top-0 sm:static"><RemoveComparedProduct product={selections[index]} products={selections} /></div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Section label="Product" count={products.length} />
            <Row label="Category" products={products}>{(product) => product.categoryName}</Row>
            {sameCategory && <Row label="Grade" products={products}>{(product) => <Value value={product.grade} />}</Row>}
            {specificationRows.map((specification) => (
              <Row key={specification.key} label={specification.label} products={products}>
                {(product) => <Value value={product.specifications.find((item) => item.key === specification.key)?.value ?? null} />}
              </Row>
            ))}

            <Section label="Commercial terms" count={products.length} />
            <Row label="Reference price" products={products}>{(product) => product.price ? <span className="break-words font-bold tabular-nums tracking-tight text-brand-800">{product.price}</span> : <Missing>On request</Missing>}</Row>
            <Row label="Price updated" products={products}>{(product) => product.price ? <Value value={product.priceUpdatedAt} /> : <Missing>On request</Missing>}</Row>
            <Row label="MOQ" products={products}>{(product) => <Value value={product.moq} />}</Row>
            <Row label="Packaging" products={products}>{(product) => <Value value={product.packaging} />}</Row>
            <Row label="Lead time" products={products}>{(product) => {
              const lt = product.leadTimeText?.trim() || (product.leadTimeDays !== null ? `${product.leadTimeDays} days` : "");
              return lt && lt !== "On request" ? lt : <Missing>On request</Missing>;
            }}</Row>
            <Row label="Incoterm" products={products}>{(product) => <Value value={product.incoterm} />}</Row>
            <Row label="Named place" products={products}>{(product) => <Value value={product.incotermPlace} />}</Row>
            <Row label="Loading port" products={products}>{(product) => <Value value={product.exportPort} />}</Row>
            <Row label="Monthly capacity" products={products}>{(product) => <Value value={product.monthlyCapacity} />}</Row>
            <Row label="Payment terms" products={products}>{(product) => <Value value={product.paymentTerms} />}</Row>

            <Section label="Verification and certificates" count={products.length} />
            <Row label="Vexim verification" products={products}>{(product) => <VerificationCell product={product} />}</Row>
            <Row label="Supplier certificates" products={products}>{(product) => <CertificatesCell product={product} />}</Row>

            <Section label="Product options stated by the supplier" count={products.length} />
            <Row label="OEM" products={products}>{(product) => <Availability available={product.oem} />}</Row>
            <Row label="ODM" products={products}>{(product) => <Availability available={product.odm} />}</Row>
            <Row label="Samples" products={products}>{(product) => <Availability available={product.samples} />}</Row>

            <Section label="Supplier" count={products.length} />
            <Row label="Company website" products={products}>{(product) => product.supplierWebsite
              ? <SupplierWebsiteLink website={product.supplierWebsite} compact /> : <Missing />}</Row>
            <Row label="Location" products={products}>{(product) => publicProductLocationDisplay(product.province)}</Row>
            <Row label="Raw material region" products={products}>{(product) => <Value value={product.rawMaterialRegion} />}</Row>
            <Row label="Input material origin" products={products}>{(product) => <Value value={product.inputMaterialOrigin} />}</Row>
            <tr className="bg-ink-50/70">
              <th scope="row" className="sticky left-0 z-10 w-24 min-w-24 bg-ink-50 px-3 py-3 text-left text-[11px] font-bold text-ink-600 sm:w-44 sm:min-w-44 sm:px-4 sm:py-4 sm:text-xs">Next step</th>
              {products.map((product) => (
                <td key={product.id} className="min-w-48 border-l border-ink-100 px-3 py-3 sm:min-w-60 sm:px-4 sm:py-4">
                  <div className="flex flex-col gap-2">
                    <Link href={product.rfqHref} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800">
                      Request a quote <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <Link prefetch={false} href={product.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-700 hover:border-brand-400">View product</Link>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-ink-50 p-4 text-xs leading-5 text-ink-600">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
        <div>
          <p>Product details and reference prices are supplier-provided. Prices may apply to different MOQs. Confirm your target quantity, specifications, availability and final terms in your RFQ.</p>
          <p className="mt-1.5">Supplier verification and certificates have their own scope. They do not certify these products or a specific lot.</p>
        </div>
      </div>
    </>
  );
}
