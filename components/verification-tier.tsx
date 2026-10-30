import { Factory, FileCheck2, HelpCircle, ShieldCheck, Truck } from "lucide-react";

import type { VerificationLevel } from "@/lib/types";
import { verificationExplanation, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";

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

/** Each check keeps its own symbol, so the shields differ without relying on colour alone. */
export const VERIFICATION_LEVEL_ICONS: Record<VerificationLevel, typeof ShieldCheck> = {
  1: FileCheck2,
  2: Factory,
  3: Truck,
};

/**
 * One hue per check: blue for documents, gold for the factory review, violet for
 * delivery history. The colour never carries the meaning by itself — the icon,
 * the label and the tooltip always say which check passed.
 */
export const VERIFICATION_LEVEL_TONES: Record<VerificationLevel, {
  /** Approved shield on a light card or header. */
  pip: string;
  /** Filled medal on the cover photo. */
  seal: string;
  /** Tier pill that names the level. */
  pill: string;
  /** Small labelled chip listing one approved check. */
  chip: string;
  /** Tinted panel for one approved check inside a light section. */
  card: string;
  /** Progress segment on a dark panel. */
  bar: string;
  /** "Approved" line inside the dark tooltip. */
  status: string;
}> = {
  1: {
    pip: "border-2 border-sky-400 bg-sky-100 text-sky-700",
    seal: "bg-sky-600 text-white ring-sky-100",
    pill: "bg-sky-50 text-sky-800 ring-sky-300",
    chip: "border-sky-300 bg-sky-50 text-sky-800",
    card: "border-sky-300 bg-sky-50/70",
    bar: "bg-sky-400",
    status: "text-sky-300",
  },
  2: {
    pip: "border-2 border-amber-400 bg-amber-100 text-amber-700",
    seal: "bg-amber-400 text-amber-950 ring-amber-100",
    pill: "bg-amber-50 text-amber-900 ring-amber-300",
    chip: "border-amber-300 bg-amber-50 text-amber-900",
    card: "border-amber-300 bg-amber-50/70",
    bar: "bg-amber-300",
    status: "text-amber-300",
  },
  3: {
    pip: "border-2 border-violet-400 bg-violet-100 text-violet-700",
    seal: "bg-violet-600 text-white ring-violet-100",
    pill: "bg-violet-700 text-white ring-violet-300",
    chip: "border-violet-300 bg-violet-50 text-violet-800",
    card: "border-violet-300 bg-violet-50/70",
    bar: "bg-violet-400",
    status: "text-violet-300",
  },
};

/** A check that is not approved yet stays a grey outline: no colour implies progress. */
export const VERIFICATION_PIP_OFF = "border border-ink-200 bg-white text-ink-300";

/**
 * Progressive shield palette keyed by total approved check count (tier 1 → 2 → 3):
 * - 1 shield: clean cool sky blue (entry tier)
 * - 2 shields: rich signature Vexim emerald-teal (higher tier)
 * - 3 shields: warm prestige gold with subtle sheen (highest tier)
 */
export const VERIFICATION_TIER_SHIELD_TONES: Record<Exclude<VerificationTier, 0>, {
  pip: string;
  status: string;
}> = {
  1: {
    pip: "border border-sky-300 bg-sky-50 text-sky-600",
    status: "text-sky-300",
  },
  2: {
    pip: "border border-brand-500 bg-brand-100 text-brand-800 shadow-2xs",
    status: "text-emerald-300",
  },
  3: {
    pip: "border border-amber-500 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-900 shadow-xs ring-1 ring-amber-300/70",
    status: "text-amber-300",
  },
};

const BADGE_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-100 text-ink-500 ring-ink-200",
  1: "bg-sky-50 text-sky-800 ring-sky-200",
  2: "bg-brand-100 text-brand-900 ring-brand-300",
  3: "bg-amber-100 text-amber-900 ring-amber-300",
};

const SEAL_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-400 text-white ring-white/70",
  1: "bg-sky-500 text-white ring-white/70",
  2: "bg-brand-600 text-white ring-white/70",
  3: "bg-amber-400 text-amber-950 ring-amber-200",
};

/** Compact pill shown next to the supplier name, product page or list row. */
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

/**
 * Three circular shield-check pips, one per independent verification check.
 *
 * All three positions keep the shield icon (`ShieldCheck`). Approved shields
 * step up in visual prestige by total approved count (1 → sky, 2 → rich teal,
 * 3 → prestige gold), while unapproved checks remain muted grey outlines and
 * each shield's tooltip names the specific check without "Level 1/2/3" labels.
 */
export function VerificationPips({ levels, compact = false, shortTooltips = false, l2Scope, variant = "default" }: {
  levels: readonly VerificationLevel[];
  compact?: boolean;
  l2Scope?: PublicL2Scope;
  /** Compact per-shield hover/focus tooltip used on product offer cards. */
  shortTooltips?: boolean;
  variant?: "default" | "marketplace";
}) {
  const approved = ([1, 2, 3] as const).filter((level) => levels.includes(level));
  const tier = verificationTier(approved);
  const activeTone = tier > 0 ? VERIFICATION_TIER_SHIELD_TONES[tier as Exclude<VerificationTier, 0>] : null;
  const marketplace = variant === "marketplace";
  const pipSize = marketplace ? "h-7 w-7" : compact ? "h-5 w-5" : "h-6 w-6";
  const iconSize = marketplace ? "h-4 w-4" : compact ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex items-center ${marketplace ? "gap-1 @[11.5rem]:gap-1.5" : "gap-1"}`} role="group"
      aria-label={approved.length ? `Verification checks approved: ${approved.map((l) => verificationLabel(l, l2Scope)).join(", ")}` : "No verification checks approved yet"}>
      {([1, 2, 3] as const).map((level) => {
        const on = levels.includes(level);
        const label = verificationLabel(level, l2Scope);
        const status = on ? "Approved" : "Not approved";
        const explanation = verificationExplanation(level, l2Scope);
        const accessibleName = `${label}: ${status}. ${explanation}`;
        const pipClass = `inline-flex items-center justify-center rounded-full transition ${pipSize} ${on && activeTone ? activeTone.pip : VERIFICATION_PIP_OFF}`;
        const icon = <ShieldCheck className={iconSize} aria-hidden="true" />;
        if (shortTooltips) return (
          <span key={level} className="group/pip relative inline-flex">
            <button type="button" aria-label={accessibleName}
              className={`${pipClass} cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700`}>
              {icon}
            </button>
            <span role="tooltip" className={`pointer-events-none absolute bottom-full z-40 mb-2 hidden w-48 max-w-[calc(100vw-2rem)] rounded-md bg-ink-900 px-2.5 py-2 text-left font-normal shadow-xl group-hover/pip:block group-focus-within/pip:block ${level === 1 ? "left-0" : "left-1/2 -translate-x-1/2"}`}>
              <strong className="block text-[11px] font-bold leading-4 text-white">{label}</strong>
              <span className={`block text-[10px] font-semibold leading-4 ${on && activeTone ? activeTone.status : "text-ink-300"}`}>{status}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-ink-200">{explanation}</span>
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
