import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";

import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import type { VerificationLevel } from "@/lib/types";

/** One responsive product offer card shared by category, supplier profile and home. */
export function PublicProductCard({ href, imagePath, name, moq, price, fob, leadTimeDays, supplierName, supplierHref, verificationSteps, test = false, linkable = true }: {
  href: string; imagePath?: string | null; name: string; moq: string; price: string | null; fob?: boolean;
  leadTimeDays: number | null; supplierName: string; supplierHref?: string;
  verificationSteps: readonly VerificationLevel[]; test?: boolean;
  /** Tắt đường dẫn ở bản xem trước khi hồ sơ chưa công khai, để không dẫn tới trang 404. */
  linkable?: boolean;
}) {
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
    <div className="flex flex-1 flex-col px-3 pb-3 pt-2 text-xs sm:px-3.5 sm:pb-3.5">
      <dl className="space-y-1.5 text-ink-600">
        <div className="flex flex-wrap justify-between gap-x-2"><dt>MOQ</dt><dd className="min-w-0 max-w-full break-words text-right font-semibold text-ink-800">{moq || "On request"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-2"><dt>{test ? "Price" : fob ? "FOB reference" : "Reference price"}</dt><dd className="min-w-0 max-w-full break-words text-right font-semibold text-brand-800">{test ? "Test data · not a price" : price || "On request"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-2"><dt>Lead time</dt><dd className="font-semibold text-ink-800">{leadTimeDays != null ? `${leadTimeDays} days` : "On request"}</dd></div>
      </dl>
      <p className="mt-3 break-words border-t border-ink-100 pt-2 leading-5 text-ink-600">Supplied by {supplierHref ?
        <Link href={supplierHref} className="font-semibold text-brand-700 hover:underline">{supplierName}</Link> :
        <span className="font-semibold text-ink-800">{supplierName}</span>}</p>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5"><VerificationPips levels={test ? [] : verificationSteps} compact /><VerificationTierBadge levels={test ? [] : verificationSteps} /></div>
      <div className="mt-auto pt-3">{linkable
        ? <Link href={href} className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg bg-ink-900 px-3 py-2 text-center text-xs font-bold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          View details <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
        : <span aria-hidden="true" className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg bg-ink-900/70 px-3 py-2 text-center text-xs font-bold text-white">
          View details <ArrowRight className="size-3.5 shrink-0" />
        </span>}</div>
    </div>
  </article>;
}
