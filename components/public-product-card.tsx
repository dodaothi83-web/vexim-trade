import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";

import { ProductTradeLabels } from "@/components/product-trade-labels";
import { ProductVerificationTooltip } from "@/components/product-verification-tooltip";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import type { VerificationLevel } from "@/lib/types";

/** One responsive product offer card shared by category, supplier profile and home. */
export function PublicProductCard({ href, imagePath, name, moq, price, fob, leadTimeDays, supplierName, supplierHref, verificationSteps, quoteHref, oem, odm, samples, test = false, linkable = true }: {
  href: string; imagePath?: string | null; name: string; moq: string; price: string | null; fob?: boolean;
  leadTimeDays: number | null; supplierName: string; supplierHref?: string;
  verificationSteps: readonly VerificationLevel[]; quoteHref: string | undefined;
  oem?: boolean; odm?: boolean; samples?: boolean; test?: boolean;
  /** Tắt đường dẫn ở bản xem trước khi hồ sơ chưa công khai, để không dẫn tới trang 404. */
  linkable?: boolean;
}) {
  const quote = !test && linkable ? quoteHref : undefined;
  const thumb = <div className="relative aspect-square w-full overflow-hidden rounded-t-xl bg-ink-50">
    {imagePath ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/public-media/${imagePath.replace(/^\//, "")}`} alt={name} loading="lazy" className="h-full w-full object-cover" /></>
      : <div className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="size-10" aria-hidden="true" /></div>}
    {test && <span className="absolute left-2 top-2 rounded bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-950">TEST · Not an offer</span>}
  </div>;
  return <article className={`flex h-full min-w-0 flex-col overflow-visible rounded-xl border border-ink-200 bg-white shadow-card transition focus-within:border-brand-500 ${linkable ? "hover:border-brand-400 hover:shadow-md" : ""}`}>
    {linkable ? <Link href={href} aria-label={`View details of ${name}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
      {thumb}
      <h3 className="mx-3 mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-ink-900 group-hover:text-brand-700 sm:mx-3.5">{name}</h3>
    </Link> : <div>
      {thumb}
      <h3 className="mx-3 mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-ink-900 sm:mx-3.5">{name}</h3>
    </div>}
    <div className="flex flex-1 flex-col px-3 pb-3 pt-3 sm:px-3.5 sm:pb-3.5">
      <div className="mb-2 flex h-6 items-center">
        {!test && (oem || odm || samples) && <ProductTradeLabels oem={oem} odm={odm} samples={samples} compact />}
      </div>
      <p className={`break-words ${test ? "text-xs font-semibold leading-4 text-ink-500" : "text-[15px] font-bold leading-5 text-brand-800 sm:text-base"}`}>
        {test ? "Test data · not a price" : price || "On request"}
        {!test && fob && <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-ink-400">FOB</span>}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-2 text-ink-600">
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-500">MOQ</dt>
          <dd className="mt-0.5 break-words text-[11px] font-semibold leading-4 text-ink-800 sm:text-xs">{moq || "On request"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-500">Lead time</dt>
          <dd className="mt-0.5 break-words text-[11px] font-semibold leading-4 text-ink-800 sm:text-xs">{leadTimeDays != null ? `${leadTimeDays} days` : "On request"}</dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-ink-100 pt-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
          <span className="shrink-0 text-ink-500">Supplied by</span>
          {supplierHref && linkable ? <Link href={supplierHref} title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-brand-700 hover:underline">{supplierName}</Link>
            : <span title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-ink-800">{supplierName}</span>}
        </p>
        <div className="group relative mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <ProductVerificationTooltip levels={test ? [] : verificationSteps}>
            <VerificationPips levels={test ? [] : verificationSteps} compact />
            <VerificationTierBadge levels={test ? [] : verificationSteps} />
          </ProductVerificationTooltip>
        </div>
      </div>
      <div className="mt-auto pt-3">{quote
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
