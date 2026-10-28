import type { PublicL2Scope } from "@/lib/verification-status";
import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";

import { SponsoredDisclosure } from "@/components/sponsored-disclosure";
import { ProductCompareCheckbox } from "@/components/product-compare-checkbox";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";
import type { VerificationLevel } from "@/lib/types";

/** One responsive product offer card shared by category, supplier profile and home. */
export function PublicProductCard({ href, imagePath, name, grades, moq, price, fob, leadTimeDays, supplierName, supplierHref, verificationSteps, l2Scope, quoteHref, oem, odm, samples, test = false, linkable = true, comparison, sponsored = false }: {
  href: string; imagePath?: string | null; name: string; grades?: readonly string[]; moq: string; price: string | null; fob?: boolean;
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
  const visibleGrades = (grades ?? []).filter(Boolean);
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
  const title = <h3 className="mb-1 line-clamp-2 min-h-0 text-[13px] font-bold leading-[18px] text-ink-900 group-hover:text-brand-700 sm:mb-3 sm:min-h-10 sm:text-sm sm:leading-5">{name}</h3>;
  return <article className={`flex h-full min-w-0 flex-row overflow-visible rounded-xl border border-ink-200 bg-white shadow-card transition focus-within:border-brand-500 sm:flex-col ${linkable ? "hover:border-brand-400 hover:shadow-md" : ""}`}>
    <div className="w-[38%] shrink-0 self-start sm:w-full">{thumb}</div>
    <div className="flex min-w-0 flex-1 flex-col justify-center p-2 sm:justify-start sm:px-3.5 sm:pb-3.5 sm:pt-3">
      {sponsored && <SponsoredDisclosure />}
      {linkable ? <Link href={href} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">{title}</Link> : title}
      {!test && visibleGrades.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-1">
          {visibleGrades.slice(0, 3).map((gradeItem) => (
            <span key={gradeItem} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-ink-700">
              {gradeItem}
            </span>
          ))}
          {visibleGrades.length > 3 && (
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-ink-600">
              +{visibleGrades.length - 3}
            </span>
          )}
        </div>
      )}
      <div className="mb-1 hidden h-5 items-center sm:mb-2 sm:flex sm:h-6">
        {!test && (oem || odm || samples) && <ProductTradeLabels oem={oem} odm={odm} samples={samples} compact />}
      </div>
      <p className={`break-words ${test ? "text-xs font-semibold leading-4 text-ink-500" : "text-sm font-bold leading-[18px] text-brand-800 sm:text-base sm:leading-5"}`}>
        {test ? "Test data · not a price" : price ? <span className="font-mono tabular-nums">{price}</span> : "On request"}
        {!test && fob && <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-ink-400">FOB</span>}
      </p>
      <dl className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-600 sm:mt-2.5 sm:grid sm:grid-cols-2 sm:gap-x-2">
        <div className="flex min-w-0 items-baseline gap-1 sm:block">
          <dt className="text-[9px] font-medium uppercase tracking-wide text-ink-500 sm:text-[10px]">MOQ</dt>
          <dd className="mt-0 break-words text-[10px] font-semibold leading-4 text-ink-800 sm:mt-0.5 sm:text-xs">{moq || "On request"}</dd>
        </div>
        <div className="flex min-w-0 items-baseline gap-1 sm:block">
          <dt className="text-[9px] font-medium uppercase tracking-wide text-ink-500 sm:text-[10px]">Lead time</dt>
          <dd className="mt-0 break-words text-[10px] font-semibold leading-4 text-ink-800 sm:mt-0.5 sm:text-xs">{leadTimeDays != null ? `${leadTimeDays} days` : "On request"}</dd>
        </div>
      </dl>
      <div className="mt-1 border-t border-ink-100 pt-1 sm:mt-3 sm:pt-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-[14px] sm:text-xs sm:leading-4">
          <span className="shrink-0 text-ink-500">Supplied by</span>
          {supplierHref && linkable ? <Link href={supplierHref} title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-brand-700 hover:underline">{supplierName}</Link>
            : <span title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-ink-800">{supplierName}</span>}
        </p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 sm:mt-1.5 sm:gap-1.5">
          <VerificationPips levels={test ? [] : verificationSteps} l2Scope={l2Scope} compact shortTooltips />
          {partnerContractReviewed && <span title="The supplier's partner factory contract was reviewed; this is not a factory inspection." className="inline-flex items-center rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-brand-800 ring-1 ring-brand-200"><span aria-hidden="true">Partner contract</span><span className="sr-only">Partner factory contract reviewed</span></span>}
          <VerificationTierBadge levels={test ? [] : verificationSteps} compactOnMobile />
        </div>
      </div>
      <div className="mt-auto hidden pt-3 sm:block">{quote
        ? <Link href={quote} aria-label={`Request a quote for ${name}`} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-2.5 py-2 text-center text-xs font-bold text-white transition hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          Request a quote <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
        : linkable
          ? <Link href={href} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-center text-xs font-bold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
            View details <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
          : <span aria-hidden="true" className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900/70 px-3 py-2 text-center text-xs font-bold text-white">
            View details <ArrowRight className="size-3.5 shrink-0" />
          </span>}</div>
    </div>
  </article>;
}
