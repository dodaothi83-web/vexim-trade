import { HelpCircle, ShieldCheck } from "lucide-react";
import { VeximInspectionIcon as Factory, VeximDocumentIcon as FileCheck2, VeximDeliveryIcon as Truck } from "@/components/brand/vexim-icons";

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

/** Approved checks use success green; icons and labels identify the check. */
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
    pip: "border-2 border-emerald-400 bg-emerald-100 text-emerald-700",
    seal: "bg-emerald-600 text-white ring-emerald-100",
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-300",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800",
    card: "border-emerald-300 bg-emerald-50/70",
    bar: "bg-emerald-400",
    status: "text-emerald-300",
  },
  2: {
    pip: "border-2 border-emerald-400 bg-emerald-100 text-emerald-700",
    seal: "bg-emerald-700 text-white ring-emerald-100",
    pill: "bg-emerald-50 text-emerald-900 ring-emerald-300",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-900",
    card: "border-emerald-300 bg-emerald-50/70",
    bar: "bg-emerald-300",
    status: "text-emerald-300",
  },
  3: {
    pip: "border-2 border-emerald-400 bg-emerald-100 text-emerald-700",
    seal: "bg-emerald-600 text-white ring-emerald-100",
    pill: "bg-emerald-700 text-white ring-emerald-300",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800",
    card: "border-emerald-300 bg-emerald-50/70",
    bar: "bg-emerald-400",
    status: "text-emerald-300",
  },
};

/** A check that is not approved yet stays a grey outline: no colour implies progress. */
export const VERIFICATION_PIP_OFF = "border border-ink-300 bg-ink-50 text-ink-500";

/** Same approved colour at every count in compact CRM pips: colour indicates status there. */
export const VERIFICATION_PIP_ON = "border border-success bg-success-surface text-success";
export const VERIFICATION_TIER_SHIELD_TONES: Record<Exclude<VerificationTier, 0>, {
  pip: string;
  status: string;
}> = {
  1: { pip: VERIFICATION_PIP_ON, status: "text-emerald-200" },
  2: { pip: VERIFICATION_PIP_ON, status: "text-emerald-200" },
  3: { pip: VERIFICATION_PIP_ON, status: "text-emerald-200" },
};

/**
 * Thẻ công khai (variant "marketplace"): giữ hình khiên trơn, cùng kích thước khiên chưa duyệt.
 * Khiên đã duyệt được TÔ ĐẶC (cả viền) màu theo cấp nhà cung cấp, chỉ dấu tích màu trắng:
 * 1 bước xanh lá #2FA35A · 2 bước vàng nhạt #E9C64A · đủ 3 bước đỏ đô #8E1B2C.
 * Khiên chưa duyệt giữ nét xám, không tô. Chủ dự án duyệt 11/2026.
 */
const TICK_WHITE = "[&>path:last-child]:stroke-white";
export const VERIFICATION_SHIELD_FILL: Record<Exclude<VerificationTier, 0>, string> = {
  1: `fill-[#2FA35A] text-[#2FA35A] ${TICK_WHITE}`,
  2: `fill-[#E9C64A] text-[#E9C64A] ${TICK_WHITE}`,
  3: `fill-[#8E1B2C] text-[#8E1B2C] ${TICK_WHITE}`,
};

const BADGE_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-100 text-ink-500 ring-ink-200",
  1: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  2: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  3: "bg-emerald-100 text-emerald-900 ring-emerald-300",
};

const SEAL_CLASSES: Record<VerificationTier, string> = {
  0: "bg-ink-400 text-white ring-white/70",
  1: "bg-emerald-700 text-white ring-white/70",
  2: "bg-emerald-600 text-white ring-white/70",
  3: "bg-emerald-700 text-white ring-emerald-200",
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
 * Three shield-check pips, one per independent verification check.
 * Product cards use larger, unframed shields; other contexts retain circular pips.
 *
 * All three positions keep the shield icon (`ShieldCheck`). Approved shields
 * use success green, while unapproved checks remain muted grey outlines and
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
  // Trong lưới sản phẩm, ba khiên đứng chung một hàng với tên người bán nên phải nhỏ và đều:
  // 18px trên điện thoại, 20px từ `sm`. To hơn thì hàng cuối phình ra và đẩy tên bị cắt sớm.
  const pipSize = marketplace ? "h-[18px] w-[18px] sm:h-5 sm:w-5" : compact ? "h-5 w-5" : "h-6 w-6";
  const iconSize = marketplace ? "h-[18px] w-[18px] sm:h-5 sm:w-5" : compact ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex items-center ${marketplace ? "gap-0.5" : "gap-1"}`} role="group"
      aria-label={approved.length ? `Verification checks approved: ${approved.map((l) => verificationLabel(l, l2Scope)).join(", ")}` : "No verification checks approved yet"}>
      {([1, 2, 3] as const).map((level) => {
        const on = levels.includes(level);
        const label = verificationLabel(level, l2Scope);
        const status = on ? "Approved" : "Not approved";
        const explanation = verificationExplanation(level, l2Scope);
        const accessibleName = `${label}: ${status}. ${explanation}`;
        // Thẻ công khai: khiên trơn, đã duyệt thì tô đặc màu theo cấp, dấu tích trắng (VERIFICATION_SHIELD_FILL).
        const appearance = marketplace
          ? `rounded-sm ${on ? "" : "text-ink-400"}`
          : `rounded-full ${on && activeTone ? activeTone.pip : VERIFICATION_PIP_OFF}`;
        const pipClass = `inline-flex items-center justify-center transition ${pipSize} ${appearance}`;
        const filled = marketplace && on && tier > 0 ? VERIFICATION_SHIELD_FILL[tier as Exclude<VerificationTier, 0>] : "";
        const icon = <ShieldCheck className={`${iconSize} ${filled}`} strokeWidth={2} aria-hidden="true" />;
        if (shortTooltips) return (
          <span key={level} className="group/pip relative inline-flex">
            <button type="button" aria-label={accessibleName}
              className={`${pipClass} cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700`}>
              {icon}
            </button>
            <span role="tooltip" className={`pointer-events-none absolute bottom-full z-40 mb-2 hidden w-48 max-w-[calc(100vw-2rem)] rounded-md bg-ink-900 px-2.5 py-2 text-left font-normal shadow-xl group-hover/pip:block group-focus-within/pip:block ${level === 1 ? "left-0" : level === 3 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
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
