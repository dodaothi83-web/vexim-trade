import { ShieldCheck } from "lucide-react";

import { VERIFICATION_LEVEL_ICONS, VERIFICATION_LEVEL_TONES, VERIFICATION_PIP_OFF } from "@/components/verification-tier";
import type { VerificationLevel } from "@/lib/types";
import { verificationExplanation, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

/** Product pages show only individually approved SUPPLIER checks, never inferred cumulative levels. */
export function ProductVerificationIcons({ levels, compact = false, l2Scope }: { levels: readonly VerificationLevel[]; compact?: boolean; l2Scope?: PublicL2Scope }) {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));

  return <div className="relative w-full" role="group" aria-label="Vexim supplier checks (not product certification)">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-semibold text-ink-600">{compact ? "Supplier" : "Supplier checks"}</span>
      {approved.length ? approved.map((level) => {
        // Same per-check hue and symbol as the product cards, so a shield means the
        // same thing on every page.
        const Icon = VERIFICATION_LEVEL_ICONS[level];
        const label = verificationLabel(level, l2Scope);
        const explanation = verificationExplanation(level, l2Scope, true);
        return <div key={level} className="group shrink-0">
          <details className="peer">
            <summary aria-label={`${label}. ${explanation}`}
              className={`inline-flex h-7 w-7 cursor-help list-none items-center justify-center rounded-full transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden ${VERIFICATION_LEVEL_TONES[level].pip}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </summary>
          </details>
          <span role="tooltip" aria-hidden="true" className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-full max-w-64 rounded-lg bg-ink-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block peer-open:block">
            <strong className="block font-bold">{label}</strong>{explanation}
          </span>
        </div>;
      }) : <div className="flex items-center gap-1.5"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${VERIFICATION_PIP_OFF}`}><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span><span className="text-[11px] text-ink-500">No approved checks yet</span></div>}
    </div>
  </div>;
}
