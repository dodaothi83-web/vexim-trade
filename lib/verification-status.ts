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
