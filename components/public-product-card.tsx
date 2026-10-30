import type { PublicL2Scope } from "@/lib/verification-status";
import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";

import { SponsoredDisclosure } from "@/components/sponsored-disclosure";
import { ProductCompareCheckbox } from "@/components/product-compare-checkbox";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { VerificationPips } from "@/components/verification-tier";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { VerificationLevel } from "@/lib/types";

/**
 * One responsive product offer card shared by category, supplier profile and home.
 *
 * Hierarchy follows the buyer's decision order: price block first, then the two
 * commercial terms side by side, then who supplies it, then the trust shields
 * paired with the quote action on one row.
 */
export function PublicProductCard({ href, imagePath, name, moq, price, fob, leadTimeDays, supplierName, supplierHref, verificationSteps, l2Scope, quoteHref, oem, odm, samples, test = false, linkable = true, comparison, sponsored = false }: {
  href: string; imagePath?: string | null; name: string; moq: string; price: string | null; fob?: boolean;
  leadTimeDays: number | null; supplierName: string; supplierHref?: string;
  verificationSteps: readonly VerificationLevel[]; l2Scope?: PublicL2Scope; quoteHref: string | undefined;
  oem?: boolean; odm?: boolean; samples?: boolean; test?: boolean;
  /** Tắt đường dẫn ở bản xem trước khi hồ sơ chưa công khai, để không dẫn tới trang 404. */
  linkable?: boolean;
  /** Only public, non-demo offers receive a comparison checkbox. */
  comparison?: { id: string; categorySlug: string };
  /** Paid placement disclosure belongs inside each sponsored card. */
  sponsored?: boolean;
}) {
  const quote = !test && linkable ? quoteHref : undefined;
  // This is a supplier contract check, not a claim about product quality or factory ownership.
  const partnerContractReviewed = !test && verificationSteps.includes(2) && (l2Scope === "partner_contract" || l2Scope === "both");
  const comparisonItem: ProductComparisonSelection | null = comparison && linkable && !test ? {
    id: comparison.id,
    categorySlug: comparison.categorySlug,
    name,
    href,
    imagePath: imagePath ?? null,
  } : null;
  const image = imagePath ? <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/public-media/${imagePath.replace(/^\//, "")}`} alt={name} loading="lazy" className="h-full w-full object-cover" />
  </> : <div className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="size-10" aria-hidden="true" /></div>;
  const thumb = <div className="relative aspect-square w-full overflow-hidden rounded-l-xl bg-ink-50 sm:rounded-l-none sm:rounded-t-xl">
    {linkable ? <Link href={href} aria-label={`View details of ${name}`} className="group block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{image}</Link> : image}
    {test && <span className="absolute left-2 top-2 rounded bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-950">TEST · Not an offer</span>}
    {comparisonItem && <ProductCompareCheckbox product={comparisonItem} />}
  </div>;
  const title = <h3 className="line-clamp-2 min-h-0 text-[13px] font-bold leading-[18px] text-ink-900 group-hover:text-brand-700 sm:min-h-10 sm:text-sm sm:leading-5">{name}</h3>;
  const cta = quote
    ? <Link href={quote} aria-label={`Request a quote for ${name}`} className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-brand-400 bg-white px-3.5 text-[13px] font-bold text-brand-800 transition hover:border-brand-600 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Quote</Link>
    : linkable
      ? <Link href={href} className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-ink-300 bg-white px-3 text-xs font-bold text-ink-700 transition hover:border-ink-400 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">View details <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>
      : <span aria-hidden="true" className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-ink-200 bg-ink-50 px-3 text-xs font-bold text-ink-400">View details <ArrowRight className="size-3.5 shrink-0" /></span>;
  return <article className={`flex h-full min-w-0 flex-row overflow-visible rounded-xl border border-ink-200 bg-white shadow-card transition ${linkable ? "hover:border-brand-300 hover:shadow-md focus-within:border-brand-400" : ""} sm:flex-col`}>
    <div className="w-[38%] shrink-0 self-start sm:w-full">{thumb}</div>
    <div className="@container flex min-w-0 flex-1 flex-col p-2 sm:justify-start sm:px-3.5 sm:pb-3.5 sm:pt-3">
      {sponsored && <SponsoredDisclosure />}
      <div className="mb-1.5 sm:mb-1">{linkable ? <Link href={href} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{title}</Link> : title}</div>
      <div className="mb-1.5 hidden h-5 items-center sm:mb-2 sm:flex sm:h-6">
        {!test && (oem || odm || samples) && <ProductTradeLabels oem={oem} odm={odm} samples={samples} compact />}
      </div>
      {/* Price leads the information block: big and dark-teal, with the incoterm as a quiet suffix. */}
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className={`break-words text-[17px] font-extrabold leading-6 tracking-[-0.01em] @[19rem]:text-[19px] @[19rem]:leading-7 ${test ? "text-[13px] font-semibold text-ink-500" : "text-brand-900"}`}>
          {test ? "Test data · not a price" : price || "On request"}
        </span>
        {!test && fob && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">FOB</span>}
      </p>
      {/* Two commercial terms, always side by side, labels above the values. */}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 text-ink-600 sm:mt-2.5">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-ink-500">MOQ</dt>
          <dd className="mt-0.5 truncate text-[13px] font-bold leading-5 text-ink-900">{moq || "On request"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-ink-500">Lead time</dt>
          <dd className="mt-0.5 truncate text-[13px] font-bold leading-5 text-ink-900">{leadTimeDays != null ? `${leadTimeDays} days` : "On request"}</dd>
        </div>
      </dl>
      <div className="mt-2 border-t border-ink-100 pt-2 sm:mt-auto sm:pt-2.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-[11px] leading-4">
          <span className="shrink-0 text-ink-500">Supplied by</span>
          {supplierHref && linkable ? <Link href={supplierHref} title={supplierName} className="min-w-0 flex-1 truncate font-bold text-brand-700 hover:underline">{supplierName}</Link>
            : <span title={supplierName} className="min-w-0 flex-1 truncate font-bold text-ink-800">{supplierName}</span>}
        </p>
        {/* Trust shields and the quote action share one row: evidence on the left, next step on the right. */}
        <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <VerificationPips levels={test ? [] : verificationSteps} l2Scope={l2Scope} variant="marketplace" shortTooltips />
            {partnerContractReviewed && <span title="The supplier's partner factory contract was reviewed; this is not a factory inspection." className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-brand-800 ring-1 ring-brand-200"><span aria-hidden="true">Partner contract</span><span className="sr-only">Partner factory contract reviewed</span></span>}
          </div>
          {cta}
        </div>
      </div>
    </div>
  </article>;
}
