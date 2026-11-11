import { ExternalLink, Globe2 } from "lucide-react";

import { publicSupplierWebsite } from "@/lib/public/supplier-website";

/** Consistent, compact link for the public supplier profile, product and comparison. */
export function SupplierWebsiteLink({ website, compact = false, plain = false, className = "" }: {
  website: string | null | undefined;
  /** The comparison row already has its own Website label. */
  compact?: boolean;
  /** Text link without the bordered chip, for a spot that already has buttons. */
  plain?: boolean;
  className?: string;
}) {
  const link = publicSupplierWebsite(website);
  if (!link) return null;

  return <a href={link.href} target="_blank" rel="noopener noreferrer nofollow"
    title={link.href} aria-label={`Company website: ${link.domain} (opens in a new tab)`}
    className={`group inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg text-xs font-semibold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${plain ? "px-1" : "border border-brand-200 bg-brand-50/70 px-3 py-2 shadow-sm transition hover:border-brand-400 hover:bg-brand-100"} ${className}`}>
    <Globe2 className="size-4 shrink-0" aria-hidden="true" />
    {!compact && !plain && <><span className="shrink-0">Website</span><span className="text-brand-400" aria-hidden="true">·</span></>}
    <span className="min-w-0 truncate font-bold underline decoration-brand-300 underline-offset-2">{link.domain}</span>
    <ExternalLink className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
  </a>;
}
