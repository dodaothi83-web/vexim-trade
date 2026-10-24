import Link from "next/link";
import { ArrowRight, Clock3, ImageIcon, Package } from "lucide-react";

import { ProductTradeLabels } from "@/components/product-trade-labels";
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
  const thumb = <div className="relative aspect-square w-full overflow-hidden bg-ink-50">
    {imagePath ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/public-media/${imagePath.replace(/^\//, "")}`} alt={name} loading="lazy" className="h-full w-full object-cover" /></>
      : <div className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="size-10" aria-hidden="true" /></div>}
    {test && <span className="absolute left-2 top-2 rounded bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-950">TEST · Not an offer</span>}
  </div>;
  return <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-card transition focus-within:border-brand-500 ${linkable ? "hover:border-brand-400 hover:shadow-md" : ""}`}>
    {linkable ? <Link href={href} aria-label={`View details of ${name}`} className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
      {thumb}
      <h3 className="mx-3 mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-ink-900 group-hover:text-brand-700 sm:mx-3.5">{name}</h3>
    </Link> : <div>
      {thumb}
      <h3 className="mx-3 mt-3 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-ink-900 sm:mx-3.5">{name}</h3>
    </div>}
    <div className="flex flex-1 flex-col px-3 pb-3 pt-3 sm:px-3.5 sm:pb-3.5">
      {!test && (oem || odm || samples) && <div className="mb-3"><ProductTradeLabels oem={oem} odm={odm} samples={samples} /></div>}
      <div className={`rounded-lg px-3 py-2.5 ${test ? "bg-ink-50" : "bg-brand-50"}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">{test ? "Price" : fob ? "FOB reference" : "Reference price"}</p>
        <p className={`mt-0.5 break-words font-black ${test ? "text-sm leading-5 text-ink-600" : "text-lg leading-6 text-brand-900 sm:text-xl sm:leading-7"}`}>
          {test ? "Test data · not a price" : price || "On request"}
        </p>
      </div>
      <dl className="mt-3 space-y-2 text-xs text-ink-600">
        <div className="flex items-start justify-between gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1.5"><Package className="size-3.5 text-ink-400" aria-hidden="true" />MOQ</dt>
          <dd className="min-w-0 max-w-full break-words text-right font-semibold text-ink-800">{moq || "On request"}</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="inline-flex shrink-0 items-center gap-1.5"><Clock3 className="size-3.5 text-ink-400" aria-hidden="true" />Lead time</dt>
          <dd className="min-w-0 max-w-full break-words text-right font-semibold text-ink-800">{leadTimeDays != null ? `${leadTimeDays} days` : "On request"}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-ink-100 pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5">
          <span className="shrink-0 text-ink-500">Supplied by</span>
          {supplierHref && linkable ? <Link href={supplierHref} title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-brand-700 hover:underline">{supplierName}</Link>
            : <span title={supplierName} className="min-w-0 flex-1 truncate font-semibold text-ink-800">{supplierName}</span>}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5"><VerificationPips levels={test ? [] : verificationSteps} compact /><VerificationTierBadge levels={test ? [] : verificationSteps} /></div>
      </div>
      <div className="mt-auto pt-4">{quote
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
