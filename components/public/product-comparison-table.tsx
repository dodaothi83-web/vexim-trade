import Link from "next/link";
import { ArrowRight, CheckCircle2, ImageIcon, Info, Minus, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { CopyComparisonLink, RemoveComparedProduct } from "@/components/product-comparison-actions";
import { VerificationTierBadge } from "@/components/verification-tier";
import { productComparisonWarnings, type ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { PublicComparedProduct } from "@/lib/public/product-comparison-data";
import { verificationLabel } from "@/lib/verification-status";

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
        <CopyComparisonLink productIds={products.map((product) => product.id)} />
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
                    <Link href={product.href} className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-ink-300 ring-1 ring-ink-200 sm:size-16">
                      {product.imagePath ? <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/public-media/${product.imagePath}`} alt="" className="h-full w-full object-cover" />
                      </> : <ImageIcon className="size-6" aria-hidden="true" />}
                    </Link>
                    <div className="w-full min-w-0 flex-1 sm:w-auto">
                      <Link href={product.href} className="block break-words text-[13px] font-black leading-5 text-ink-900 hover:text-brand-700 sm:text-sm">{product.name}</Link>
                      <Link href={product.supplierHref} className="mt-1 block break-words text-xs font-semibold leading-5 text-brand-700 hover:underline">{product.supplierName}</Link>
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
            <Row label="Reference price" products={products}>{(product) => product.price ? <span className="break-words font-black text-brand-800">{product.price}</span> : <Missing>On request</Missing>}</Row>
            <Row label="Price valid until" products={products}>{(product) => product.price ? <Value value={product.priceValidUntil} /> : <Missing>On request</Missing>}</Row>
            <Row label="MOQ" products={products}>{(product) => <Value value={product.moq} />}</Row>
            <Row label="Packaging" products={products}>{(product) => <Value value={product.packaging} />}</Row>
            <Row label="Lead time" products={products}>{(product) => product.leadTimeDays !== null ? `${product.leadTimeDays} days` : <Missing>On request</Missing>}</Row>
            <Row label="Incoterm" products={products}>{(product) => <Value value={product.incoterm} />}</Row>
            <Row label="Named place" products={products}>{(product) => <Value value={product.incotermPlace} />}</Row>
            <Row label="Loading port" products={products}>{(product) => <Value value={product.exportPort} />}</Row>
            <Row label="Monthly capacity" products={products}>{(product) => <Value value={product.monthlyCapacity} />}</Row>
            <Row label="Payment terms" products={products}>{(product) => <Value value={product.paymentTerms} />}</Row>

            <Section label="Product options stated by the supplier" count={products.length} />
            <Row label="OEM" products={products}>{(product) => <Availability available={product.oem} />}</Row>
            <Row label="ODM" products={products}>{(product) => <Availability available={product.odm} />}</Row>
            <Row label="Samples" products={products}>{(product) => <Availability available={product.samples} />}</Row>

            <Section label="Supplier" count={products.length} />
            <Row label="Location" products={products}>{(product) => `${product.province}, Vietnam`}</Row>
            <Row label="Raw material region" products={products}>{(product) => <Value value={product.rawMaterialRegion} />}</Row>
            <Row label="Input material origin" products={products}>{(product) => <Value value={product.inputMaterialOrigin} />}</Row>
            <Row label="Independent verification" products={products}>{(product) => (
              <div>
                <VerificationTierBadge levels={product.verificationSteps} />
                <ul className="mt-3 space-y-2">
                  {([1, 2, 3] as const).map((level) => {
                    const approved = product.verificationSteps.includes(level);
                    return (
                      <li key={level} className="flex items-start gap-2 text-xs leading-5">
                        {approved ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" /> : <Minus className="mt-0.5 size-3.5 shrink-0 text-ink-300" aria-hidden="true" />}
                        <span className={approved ? "text-ink-800" : "text-ink-400"}>{verificationLabel(level, product.l2Scope)}: {approved ? "Approved" : "Not approved"}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link href={`${product.supplierHref}#verification`} className="mt-3 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">View verification scope</Link>
              </div>
            )}</Row>
            <Row label="Public supplier certificates" products={products}>{(product) => product.certificates.length ? (
              <div>
                <ul className="space-y-3">
                  {product.certificates.slice(0, 3).map((certificate) => (
                    <li key={certificate.id} className="text-xs leading-5">
                      <strong className="block break-words text-ink-800">{certificate.name}</strong>
                      <span className="mt-0.5 block text-ink-500">Valid until {certificate.validUntil}</span>
                      <span className="block text-ink-500">{certificate.holderMatch === "owner" ? "Registered to supplier" : `Third-party holder: ${certificate.holderName}`}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`${product.supplierHref}#certificates`} className="mt-3 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">View certificates</Link>
              </div>
            ) : <Missing>No public certificates</Missing>}</Row>

            <tr className="bg-ink-50/70">
              <th scope="row" className="sticky left-0 z-10 w-24 min-w-24 bg-ink-50 px-3 py-3 text-left text-[11px] font-bold text-ink-600 sm:w-44 sm:min-w-44 sm:px-4 sm:py-4 sm:text-xs">Next step</th>
              {products.map((product) => (
                <td key={product.id} className="min-w-48 border-l border-ink-100 px-3 py-3 sm:min-w-60 sm:px-4 sm:py-4">
                  <div className="flex flex-col gap-2">
                    <Link href={product.rfqHref} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800">
                      Request a quote <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                    <Link href={product.href} className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-ink-700 hover:border-brand-400">View product</Link>
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
