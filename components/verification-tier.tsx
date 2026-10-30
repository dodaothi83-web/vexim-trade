import { HelpCircle, Shield, ShieldCheck } from "lucide-react";

import type { VerificationLevel } from "@/lib/types";
import { verificationExplanation, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

export type VerificationTier = 0 | 1 | 2 | 3;

/**
 * Marketplace-style trust level: the tier counts how many independent
 * checks are approved. The exact checks are always listed next to the badge,
 * so a higher tier never implies a check that did not happen.
 */
export function verificationTier(levels: readonly VerificationLevel[]): VerificationTier {
  return ([1, 2, 3] as const).filter((level) => levels.includes(level)).length as VerificationTier;
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

// The card keeps each approved check distinct while its overall palette reflects
// how many independent checks passed. Inactive checks always remain neutral.
const PRODUCT_PIP_ON_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-50 text-ink-300 ring-ink-200",
  1: "bg-emerald-100 text-emerald-800 ring-emerald-400 shadow-[0_2px_6px_rgba(4,120,87,0.16)]",
  2: "bg-sky-100 text-sky-800 ring-sky-400 shadow-[0_2px_6px_rgba(3,105,161,0.16)]",
  3: "bg-brand-900 text-amber-200 ring-amber-400 shadow-[0_2px_8px_rgba(19,78,74,0.25)]",
};

const SEAL_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-400 text-white ring-white/70",
  1: "bg-brand-500 text-white ring-white/70",
  2: "bg-brand-700 text-white ring-white/70",
  3: "bg-amber-400 text-amber-950 ring-amber-200",
};

/** Compact pill shown next to a supplier name or in a comparison row. */
export function VerificationTierBadge({ levels, className = "", compactOnMobile = false }: {
  levels: readonly VerificationLevel[];
  className?: string;
  /** Rút gọn “Level 1 · Basic” thành “Level 1” dưới breakpoint sm khi được chọn. */
  compactOnMobile?: boolean;
}) {
  const tier = verificationTier(levels);
  const Icon = tier === 0 ? HelpCircle : ShieldCheck;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${BADGE_CLASSES[tier]} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {compactOnMobile && tier > 0 ? <>
        <span className="sm:hidden">Level {tier}</span>
        <span className="hidden sm:inline">{VERIFICATION_TIER_LABELS[tier]}</span>
      </> : VERIFICATION_TIER_LABELS[tier]}
    </span>
  );
}

/** Three small shields, each with its own explanation and approval status. */
export function VerificationPips({ levels, compact = false, shortTooltips = false, cardTooltips = false, l2Scope }: {
  levels: readonly VerificationLevel[];
  compact?: boolean;
  l2Scope?: PublicL2Scope;
  /** Tooltip nhỏ theo từng cấp, dùng cho thẻ sản phẩm thay vì khung giải thích chung. */
  shortTooltips?: boolean;
  /** Bound tooltips to a positioned card footer so they stay inside narrow viewports. */
  cardTooltips?: boolean;
}) {
  const tier = verificationTier(levels);
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  // An unknown L2 scope must not be presented as a factory inspection.
  const checkLabel = (level: VerificationLevel) => cardTooltips && level === 2 && l2Scope == null
    ? "Factory or partner contract review" : verificationLabel(level, l2Scope);
  return (
    <span className={`inline-flex items-center gap-1 ${cardTooltips ? "shrink-0" : ""}`} role="group"
      aria-label={approved.length ? `Verification checks approved: ${approved.map(checkLabel).join(", ")}` : "No verification checks approved yet"}>
      {([1, 2, 3] as const).map((level) => {
        const on = levels.includes(level);
        const label = checkLabel(level);
        const status = on ? "Approved" : "Not approved";
        const explanation = cardTooltips && !on ? "This supplier check has not been approved."
          : cardTooltips && level === 2 && l2Scope == null
            ? "The scope of this supplier review is available from the supplier profile."
            : verificationExplanation(level, l2Scope);
        const productNote = cardTooltips ? " Supplier check, not product certification." : "";
        const checkName = cardTooltips ? label : `Level ${level} · ${label}`;
        const accessibleName = `${checkName}: ${status}. ${explanation}${productNote}`;
        const onClasses = cardTooltips ? PRODUCT_PIP_ON_CLASSES[tier] : PIP_ON_CLASSES[tier];
        const small = compact && !shortTooltips;
        const size = cardTooltips ? "h-7 w-7" : small ? "h-5 w-5" : "h-6 w-6";
        const ring = cardTooltips && on ? "ring-2" : "ring-1";
        const inactive = cardTooltips ? "bg-ink-50 text-ink-500 ring-ink-300" : "bg-ink-50 text-ink-300 ring-ink-200";
        const pipClass = `inline-flex items-center justify-center rounded-full ${size} ${ring} ${on ? onClasses : inactive}`;
        const ShieldIcon = cardTooltips && !on ? Shield : ShieldCheck;
        const icon = <ShieldIcon className={cardTooltips ? "h-4 w-4" : small ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={cardTooltips ? 2.25 : 2} aria-hidden="true" />;
        if (shortTooltips) return (
          <span key={level} className={`group/pip inline-flex ${cardTooltips ? "" : "relative"}`}>
            <details name="product-verification-checks" className="peer">
              <summary aria-label={accessibleName}
                className={`${pipClass} cursor-help list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden`}>
                {icon}
              </summary>
            </details>
            <span role="tooltip" aria-hidden="true" className={`pointer-events-none absolute bottom-full z-40 mb-2 hidden rounded-md bg-ink-900 px-2.5 py-2 text-left font-normal shadow-xl group-hover/pip:block group-focus-within/pip:block peer-open:block ${cardTooltips ? "left-0 w-full max-w-64" : `w-48 ${level === 1 ? "left-0" : level === 2 ? "left-1/2 -translate-x-1/2" : "right-0"}`}`}>
              <strong className="block text-[11px] font-bold leading-4 text-white">{checkName}</strong>
              <span className={`block text-[10px] font-semibold leading-4 ${on ? "text-emerald-300" : "text-ink-300"}`}>{status}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-ink-200">{explanation}</span>
              {cardTooltips && <span className="mt-1 block text-[10px] leading-4 text-ink-300">Supplier check, not product certification.</span>}
            </span>
          </span>
        );
        return (
          <span key={level} role="img" title={accessibleName} aria-label={accessibleName} className={`${pipClass} cursor-help`}>
            {icon}
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
export function approvedChecksSummary(levels: readonly VerificationLevel[], l2Scope?: PublicL2Scope): string {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  return approved.map((level) => { const label = verificationLabel(level, l2Scope); return label.charAt(0).toLowerCase() + label.slice(1); }).join(" · ");
}
