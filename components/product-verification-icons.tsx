import { Factory, FileCheck2, Truck } from "lucide-react";

import type { VerificationLevel } from "@/lib/types";
import { PRODUCT_VERIFICATION_EXPLANATIONS, VERIFICATION_LABELS } from "@/lib/verification-status";

const ICONS = { 1: FileCheck2, 2: Factory, 3: Truck } as const;

/** Product pages show only individually approved SUPPLIER checks, never inferred cumulative levels. */
export function ProductVerificationIcons({ levels, compact = false }: { levels: readonly VerificationLevel[]; compact?: boolean }) {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));

  return <div className="relative w-full" role="group" aria-label="Vexim supplier checks (not product certification)">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-semibold text-ink-600">{compact ? "Supplier" : "Supplier checks"}</span>
      {approved.length ? approved.map((level) => {
        const Icon = ICONS[level];
        const label = VERIFICATION_LABELS[level];
        const explanation = PRODUCT_VERIFICATION_EXPLANATIONS[level];
        return <div key={level} className="group shrink-0">
          <details className="peer">
            <summary aria-label={`${label}. ${explanation}`}
              className="inline-flex h-7 w-7 cursor-help list-none items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 transition hover:border-emerald-500 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </summary>
          </details>
          <span role="tooltip" aria-hidden="true" className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-full max-w-64 rounded-lg bg-ink-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block peer-open:block">
            <strong className="block font-bold">{label}</strong>{explanation}
          </span>
        </div>;
      }) : <span className="text-[11px] text-ink-500">No approved checks yet</span>}
    </div>
  </div>;
}
