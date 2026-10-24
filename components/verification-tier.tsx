import { HelpCircle, ShieldCheck } from "lucide-react";

import type { VerificationLevel } from "@/lib/types";
import { VERIFICATION_LABELS } from "@/lib/verification-status";

export type VerificationTier = 0 | 1 | 2 | 3;

/**
 * Marketplace-style trust level: the tier counts how many independent
 * checks are approved. The exact checks are always listed next to the badge,
 * so a higher tier never implies a check that did not happen.
 */
export function verificationTier(levels: readonly VerificationLevel[]): VerificationTier {
  return Math.min(3, new Set(levels).size) as VerificationTier;
}

export const VERIFICATION_TIER_LABELS: Record<VerificationTier, string> = {
  0: "Under audit",
  1: "Level 1 · Basic",
  2: "Level 2 · Advanced",
  3: "Level 3 · Complete",
};

const BADGE_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-100 text-ink-500 ring-ink-200",
  1: "bg-brand-50 text-brand-800 ring-brand-200",
  2: "bg-brand-100 text-brand-900 ring-brand-300",
  3: "bg-brand-900 text-amber-100 ring-amber-300",
};

const PIP_ON_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-50 text-ink-300 ring-ink-200",
  1: "bg-brand-50 text-brand-700 ring-brand-300",
  2: "bg-brand-100 text-brand-800 ring-brand-500",
  3: "bg-amber-100 text-amber-700 ring-amber-400",
};

const SEAL_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-400 text-white ring-white/70",
  1: "bg-brand-500 text-white ring-white/70",
  2: "bg-brand-700 text-white ring-white/70",
  3: "bg-amber-400 text-amber-950 ring-amber-200",
};

/** Compact pill shown next to the supplier name, product card or list row. */
export function VerificationTierBadge({ levels, className = "" }: {
  levels: readonly VerificationLevel[];
  className?: string;
}) {
  const tier = verificationTier(levels);
  const Icon = tier === 0 ? HelpCircle : ShieldCheck;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${BADGE_CLASSES[tier]} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {VERIFICATION_TIER_LABELS[tier]}
    </span>
  );
}

/** Three small shields, one per independent check, filled only when approved. */
export function VerificationPips({ levels, compact = false }: {
  levels: readonly VerificationLevel[];
  compact?: boolean;
}) {
  const tier = verificationTier(levels);
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  return (
    <span className="inline-flex items-center gap-1" role="img"
      aria-label={approved.length ? `Verification checks approved: ${approved.map((l) => VERIFICATION_LABELS[l]).join(", ")}` : "No verification checks approved yet"}>
      {([1, 2, 3] as const).map((level) => {
        const on = levels.includes(level);
        return (
          <span key={level} title={VERIFICATION_LABELS[level]}
            className={`inline-flex items-center justify-center rounded-full ring-1 ${compact ? "h-5 w-5" : "h-6 w-6"} ${on ? PIP_ON_CLASSES[tier] : "bg-ink-50 text-ink-300 ring-ink-200"}`}>
            <ShieldCheck className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}

/** Round medal placed on the cover photo corner, never over the avatar. */
export function VerificationCoverSeal({ levels }: { levels: readonly VerificationLevel[] }) {
  const tier = verificationTier(levels);
  return (
    <span className={`absolute right-5 top-5 flex h-16 w-16 flex-col items-center justify-center rounded-full text-center shadow-lg ring-4 sm:h-[70px] sm:w-[70px] ${SEAL_CLASSES[tier]}`}
      role="img" aria-label={`Verification ${VERIFICATION_TIER_LABELS[tier]}: ${tier} of 3 checks approved`}>
      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      <b className="text-lg leading-none">{tier}</b>
      <span className="text-[7px] font-black tracking-[0.14em]">CHECKS</span>
    </span>
  );
}

/** Buyer-facing sentence listing exactly which checks were approved. */
export function approvedChecksSummary(levels: readonly VerificationLevel[]): string {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  return approved.map((level) => VERIFICATION_LABELS[level].charAt(0).toLowerCase() + VERIFICATION_LABELS[level].slice(1)).join(" · ");
}
