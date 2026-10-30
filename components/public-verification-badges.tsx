import { HelpCircle } from "lucide-react";

import { VERIFICATION_LEVEL_ICONS, VERIFICATION_LEVEL_TONES } from "@/components/verification-tier";
import type { VerificationLevel } from "@/lib/types";
import { verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

/**
 * Only approved reviews earn public badges; an unreviewed step must never be implied.
 * Each badge keeps the symbol and hue of its own check, like the shields elsewhere.
 */
export function PublicVerificationBadges({ levels, compact = false, l2Scope }: {
  levels: readonly VerificationLevel[];
  compact?: boolean;
  l2Scope?: PublicL2Scope;
}) {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  return <span className="flex flex-wrap gap-1.5" aria-label="Supplier verification">
    {approved.length ? approved.map((level) => {
      const Icon = VERIFICATION_LEVEL_ICONS[level];
      return <span key={level} className={`inline-flex items-center gap-1 rounded-full border font-semibold ${VERIFICATION_LEVEL_TONES[level].chip} ${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-[12px]"}`}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{verificationLabel(level, l2Scope)}
      </span>;
    }) : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
      <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />Under audit
    </span>}
  </span>;
}
