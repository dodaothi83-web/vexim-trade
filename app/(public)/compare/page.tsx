import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Minus, PackageSearch } from "lucide-react";

import { ProductComparisonSync } from "@/components/product-comparison-actions";
import { ProductComparisonTable } from "@/components/public/product-comparison-table";
import { Breadcrumbs } from "@/components/ui";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import {
  getPublicSuppliersByIds,
  mainProductNames,
  supplierTypeLabel,
} from "@/lib/public/catalog";
import { parseComparisonIds } from "@/lib/public/product-comparison";
import { getPublicProductsForComparison } from "@/lib/public/product-comparison-data";
import { supplierIncotermsDisplay, supplierMoqDisplay, supplierPortsDisplay, supplierProvinceDisplay } from "@/lib/public/supplier-english";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ ids?: string; products?: string }>;
}

function supplierMode(searchParams: { ids?: string; products?: string } | undefined): boolean {
  return searchParams?.products === undefined && searchParams?.ids !== undefined;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: supplierMode(sp) ? "Compare suppliers | Veximtrade" : "Compare products | Veximtrade",
    robots: { index: false, follow: true },
  };
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  if (supplierMode(sp)) {
    const ids = parseComparisonIds(sp?.ids, 4);
    const suppliers = ids.length > 0 ? await getPublicSuppliersByIds(ids) : [];
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-14">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare suppliers" }]} />
        <h1 className="mt-4 text-[32px] font-bold leading-tight text-ink-900 sm:text-[46px]" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}>
          Compare suppliers
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600 sm:text-[15px]">
          Side-by-side view of up to 4 published Vietnamese suppliers.
        </p>

        {suppliers.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-ink-300 bg-ink-50 p-10 text-center">
            <p className="text-[15px] text-ink-600">No public suppliers were found for this link.</p>
            <Link href="/#categories" className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-ink-800">
              Back to categories <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <p id="supplier-comparison-scroll-hint" className="mt-6 text-xs font-medium leading-5 text-ink-500 sm:hidden">Swipe horizontally to see each supplier. Criteria stay visible.</p>
            <div role="region" aria-label="Scrollable supplier comparison" aria-describedby="supplier-comparison-scroll-hint" tabIndex={0} className="mt-2 scroll-smooth overflow-x-auto rounded-lg border border-ink-200 bg-white focus-visible:outline-brand-700 sm:mt-8">
              <table className="min-w-full text-left text-[14px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="sticky left-0 z-10 w-24 min-w-24 bg-ink-50 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 sm:w-48 sm:min-w-48 sm:px-4 sm:text-[12px] sm:tracking-[0.12em]">Criterion</th>
                    {suppliers.map((s) => (
                      <th key={s.id} className="min-w-48 px-3 py-3 align-top sm:min-w-[220px] sm:px-4">
                        <Link href={`/suppliers/${encodeURIComponent(s.slug || s.id)}`} className="block text-[15px] font-semibold text-ink-900 hover:text-brand-700">
                          {s.display_name ?? s.name}
                        </Link>
                        <p className="mt-1 text-[12px] font-medium text-ink-600">{supplierTypeLabel(s)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5"><VerificationPips levels={s.approved_verification_steps} compact /><VerificationTierBadge levels={s.approved_verification_steps} /></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  <Row label="Location" cells={suppliers.map((s) => <>{supplierProvinceDisplay(s) ? `${supplierProvinceDisplay(s)}, Vietnam` : "—"}</>)} />
                  <Row label="Founded" cells={suppliers.map((s) => <>{s.founded_year ?? <Dash />}</>)} />
                  <Row label="Employees" cells={suppliers.map((s) => <>{typeof s.employees === "number" && s.employees > 0 ? `${s.employees}` : <Dash />}</>)} />
                  <Row label="Main products" cells={suppliers.map((s) => <>{mainProductNames(s.main_products) || <Dash />}</>)} />
                  <Row label="MOQ" cells={suppliers.map((s) => <>{supplierMoqDisplay(s) || <Dash />}</>)} />
                  <Row label="Lead time" cells={suppliers.map((s) => <>{s.lead_time_days ? `${s.lead_time_days} days` : <Dash />}</>)} />
                  <Row label="Ports" cells={suppliers.map((s) => <>{supplierPortsDisplay(s).join(", ") || <Dash />}</>)} />
                  <Row label="Incoterms" cells={suppliers.map((s) => <>{supplierIncotermsDisplay(s).join(", ") || <Dash />}</>)} />
                  <Row label="Product prices" cells={suppliers.map((s) => s.main_products.length
                    ? <Link href={`/suppliers/${encodeURIComponent(s.slug || s.id)}#products`} className="font-medium text-brand-700 hover:underline">See individual products</Link>
                    : <Dash />)} />
                  <Row label="Private label" cells={suppliers.map((s) => <>{s.private_label ? "Yes" : "Not stated"}</>)} />
                  <tr className="bg-ink-50/60">
                    <td className="sticky left-0 z-10 w-24 min-w-24 bg-ink-50/60 px-3 py-3 font-semibold text-ink-900 sm:w-48 sm:min-w-48 sm:px-4 sm:py-4" />
                    {suppliers.map((s) => (
                      <td key={s.id} className="min-w-48 px-3 py-3 sm:min-w-[220px] sm:px-4 sm:py-4">
                        <Link href={`/rfq?suppliers=${s.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800">
                          Request quote <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-6 rounded-lg border border-ink-200 bg-white p-5 text-[13px] text-ink-600">
              <p>
                Need help choosing? <Link href="/rfq" className="font-semibold text-ink-900 underline underline-offset-2 hover:text-brand-700">Send a sourcing request</Link> and
                our desk will find suitable suppliers with confirmed quotes within 1 business day.
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  const requestedIds = parseComparisonIds(sp?.products, 3);
  const products = await getPublicProductsForComparison(requestedIds);
  const selections = products.map((product) => ({
    id: product.id,
    name: product.name,
    href: product.href,
    imagePath: product.imagePath,
    categorySlug: product.categorySlug,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-14">
      <ProductComparisonSync products={selections} fromUrl={sp?.products !== undefined} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare products" }]} />
      <h1 className="mt-4 text-[32px] font-bold leading-tight text-ink-900 sm:text-[46px]" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}>
        Compare products
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600 sm:text-[15px]">
        Compare up to 3 product offers side by side. Tick the small box at the top right of a product image to build your list.
      </p>

      {requestedIds.length > products.length && (
        <p role="note" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
          Some requested products could not be found in the public catalogue and were left out.
        </p>
      )}

      {products.length < 2 ? (
        <div className="mt-10 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-12 text-center">
          <PackageSearch className="mx-auto size-9 text-ink-300" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-black text-ink-900">{products.length === 1 ? "Select one more product" : "Build your product comparison"}</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-600">
            Select at least 2 products. You can add a third product or remove any selection before opening the comparison again.
          </p>
          <Link href={products.length === 1 ? `/products/${encodeURIComponent(products[0].categorySlug)}` : "/#categories"} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800">
            Browse products <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : <ProductComparisonTable products={products} />}
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <tr>
      <td className="sticky left-0 z-10 w-24 min-w-24 bg-white px-3 py-3 align-top text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 sm:w-48 sm:min-w-48 sm:px-4 sm:text-[12.5px] sm:tracking-[0.1em]">{label}</td>
      {cells.map((c, i) => <td key={i} className="min-w-48 px-3 py-3 align-top text-[13px] leading-5 text-ink-800 sm:min-w-[220px] sm:px-4 sm:text-[14px]">{c}</td>)}
    </tr>
  );
}

function Dash() {
  return <Minus className="inline-block h-3 w-3 text-ink-300" />;
}
