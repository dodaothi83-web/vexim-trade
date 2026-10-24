import type { ReactNode } from "react";

import type { VerificationLevel } from "@/lib/types";
import { PRODUCT_VERIFICATION_EXPLANATIONS, VERIFICATION_LABELS } from "@/lib/verification-status";

const LEVELS = [1, 2, 3] as const;

/** Explain each independent supplier check without turning it into a product claim. */
export function ProductVerificationTooltip({ levels, children }: { levels: readonly VerificationLevel[]; children: ReactNode }) {
  return (
    <div className="static min-w-0">
      <details className="peer min-w-0">
        <summary
          aria-label="Explain supplier verification levels 1, 2 and 3"
          className="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden"
        >
          {children}
        </summary>
      </details>
      <div
        role="tooltip"
        className="absolute bottom-full left-0 z-40 mb-2 hidden max-h-[70vh] w-full max-w-64 overflow-y-auto rounded-lg bg-ink-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block peer-open:block"
      >
        <strong className="block text-xs font-bold">Supplier verification</strong>
        <ul className="mt-2 space-y-2.5">
          {LEVELS.map((level) => {
            const approved = levels.includes(level);
            return (
              <li key={level}>
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-[11px] font-bold leading-4">Level {level} · {VERIFICATION_LABELS[level]}</strong>
                  <span className={`shrink-0 text-[10px] font-semibold leading-4 ${approved ? "text-emerald-300" : "text-ink-300"}`}>
                    {approved ? "Approved" : "Not approved"}
                  </span>
                </div>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-100">
                  {approved ? PRODUCT_VERIFICATION_EXPLANATIONS[level] : `If approved: ${PRODUCT_VERIFICATION_EXPLANATIONS[level]}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
