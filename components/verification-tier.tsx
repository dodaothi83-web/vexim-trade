import { HelpCircle, ShieldCheck, Star } from "lucide-react";

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

// The product-card palette makes the number of approved supplier checks easy to
// distinguish without turning the stars into a product rating.
const PRODUCT_BADGE_CLASSES: Record<VerificationTier, string> = {
  0: "border-ink-200 bg-ink-50 text-ink-600",
  1: "border-emerald-200 bg-emerald-50 text-emerald-800",
  2: "border-sky-200 bg-sky-50 text-sky-800",
  3: "border-amber-400/70 bg-gradient-to-r from-brand-900 to-[#176457] text-amber-50 shadow-[0_2px_8px_rgba(19,78,74,0.18)]",
};

const PRODUCT_STAR_CLASSES: Record<VerificationTier, string> = {
  0: "text-ink-400",
  1: "text-emerald-700",
  2: "text-sky-700",
  3: "text-amber-300",
};

const PRODUCT_PIP_ON_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-50 text-ink-300 ring-ink-200",
  1: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  2: "bg-sky-50 text-sky-700 ring-sky-300",
  3: "bg-amber-50 text-amber-700 ring-amber-400",
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

/**
 * A card-only summary: stars count independently approved SUPPLIER checks,
 * not reviews or product quality. The individual checks remain beside it.
 */
export function ProductVerificationBadge({ levels }: { levels: readonly VerificationLevel[] }) {
  const tier = verificationTier(levels);
  const label = tier === 0 ? "No supplier checks approved yet" : `${tier} of 3 supplier checks approved`;

  return (
    <span role="img" aria-label={label} title={label} data-verification-tier={tier}
      className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-bold leading-4 ${PRODUCT_BADGE_CLASSES[tier]}`}>
      {tier === 0
        ? <HelpCircle className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
        : <span className={`inline-flex shrink-0 items-center gap-0.5 ${PRODUCT_STAR_CLASSES[tier]}`} aria-hidden="true">
            {Array.from({ length: tier }, (_, index) => <Star key={index} className="h-3 w-3 fill-current" strokeWidth={1.75} />)}
          </span>}
      <span>{tier === 0 ? "No checks approved" : `${tier} supplier ${tier === 1 ? "check" : "checks"}`}</span>
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
  return (
    <span className="inline-flex items-center gap-1" role="group"
      aria-label={approved.length ? `Verification checks approved: ${approved.map((l) => verificationLabel(l, l2Scope)).join(", ")}` : "No verification checks approved yet"}>
      {([1, 2, 3] as const).map((level) => {
        const on = levels.includes(level);
        const label = verificationLabel(level, l2Scope);
        const status = on ? "Approved" : "Not approved";
        const explanation = cardTooltips && !on ? "This supplier check has not been approved." : verificationExplanation(level, l2Scope);
        const productNote = cardTooltips ? " Supplier check, not product certification." : "";
        const accessibleName = `Level ${level} · ${label}: ${status}. ${explanation}${productNote}`;
        const onClasses = shortTooltips ? PRODUCT_PIP_ON_CLASSES[tier] : PIP_ON_CLASSES[tier];
        // Card controls stay at least 24px wide for touch; noninteractive compact pips remain smaller.
        const small = compact && !shortTooltips;
        const pipClass = `inline-flex items-center justify-center rounded-full ring-1 ${small ? "h-5 w-5" : "h-6 w-6"} ${on ? onClasses : "bg-ink-50 text-ink-300 ring-ink-200"}`;
        const icon = <ShieldCheck className={small ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />;
        if (shortTooltips) return (
          <span key={level} className={`group/pip inline-flex ${cardTooltips ? "" : "relative"}`}>
            <details name="product-verification-checks" className="peer">
              <summary aria-label={accessibleName}
                className={`${pipClass} cursor-help list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 [&::-webkit-details-marker]:hidden`}>
                {icon}
              </summary>
            </details>
            <span role="tooltip" aria-hidden="true" className={`pointer-events-none absolute bottom-full z-40 mb-2 hidden rounded-md bg-ink-900 px-2.5 py-2 text-left font-normal shadow-xl group-hover/pip:block group-focus-within/pip:block peer-open:block ${cardTooltips ? "left-0 w-full max-w-64" : `w-48 ${level === 1 ? "left-0" : level === 2 ? "left-1/2 -translate-x-1/2" : "right-0"}`}`}>
              <strong className="block text-[11px] font-bold leading-4 text-white">Level {level} · {label}</strong>
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
