import { HelpCircle, ShieldCheck } from "lucide-react";

import type { VerificationLevel } from "@/lib/types";
import { verificationLabels } from "@/lib/verification-status";

/** Only approved reviews earn public badges; an unreviewed step must never be implied. */
export function PublicVerificationBadges({ levels, compact = false }: {
  levels: readonly VerificationLevel[];
  compact?: boolean;
}) {
  const labels = verificationLabels(levels);
  return <span className="flex flex-wrap gap-1.5" aria-label="Supplier verification">
    {labels.length ? labels.map((label) => <span key={label} className={compact
      ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
      : "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-800 ring-1 ring-emerald-200"}>
      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />{label}
    </span>) : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />Under audit
    </span>}
  </span>;
}
