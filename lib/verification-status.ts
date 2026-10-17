import type { VerificationLevel } from "./types";

/** A passed review is independent of the other two reviews. Never infer one from a higher number. */
export function approvedVerificationSteps(rows: ReadonlyArray<{ target_level: number; status: string }>): VerificationLevel[] {
  return ([1, 2, 3] as const).filter((level) =>
    rows.some((row) => row.target_level === level && row.status === "approved"));
}

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  1: "Documents checked",
  2: "Factory visited",
  3: "Delivery history reviewed",
};

export function verificationLabels(levels: readonly VerificationLevel[]): string[] {
  return levels.map((level) => VERIFICATION_LABELS[level]);
}

/** Buyer-facing explanations describe independently approved SUPPLIER reviews, not product certification. */
export const PRODUCT_VERIFICATION_EXPLANATIONS: Record<VerificationLevel, string> = {
  1: "Vexim reviewed this supplier's business registration evidence. Tax and bank numbers are supplier-provided, not independently verified. This is not a product certification.",
  2: "Vexim approved a factory visit review with site evidence for this supplier. It does not imply the other checks.",
  3: "Vexim approved a review of this supplier's delivery evidence. It does not guarantee future shipments.",
};
