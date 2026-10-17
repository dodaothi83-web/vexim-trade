import type { VerificationLevel } from "./types";

/** A passed review is independent of the other two reviews. Never infer one from a higher number. */
export function approvedVerificationSteps(rows: ReadonlyArray<{ target_level: number; status: string }>): VerificationLevel[] {
  return ([1, 2, 3] as const).filter((level) =>
    rows.some((row) => row.target_level === level && row.status === "approved"));
}

export type PublicReviewSummaries = Partial<Record<2 | 3, string>>;

/** No inspector draft or legacy summary reaches the buyer without a separate reviewer publication. */
export function approvedPublicReviewSummaries(rows: ReadonlyArray<{
  target_level: number; status: string; approved_at?: string | null;
  public_summary_i18n?: Record<string, string> | null;
  public_summary_published_at?: string | null;
}>): PublicReviewSummaries {
  const summaries: PublicReviewSummaries = {};
  for (const level of [2, 3] as const) {
    const approved = rows.filter((row) => row.target_level === level && row.status === "approved" && row.public_summary_published_at)
      .sort((a, b) => (b.public_summary_published_at ?? "").localeCompare(a.public_summary_published_at ?? ""));
    const summary = approved[0]?.public_summary_i18n?.en?.trim();
    // Defense in depth if an old row was published outside the moderated form.
    if (summary && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary) && !/https?:\/\/|www\./i.test(summary) && !/(?:\+?\d[\s().-]?){9,15}\d/.test(summary)) summaries[level] = summary;
  }
  return summaries;
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
  2: "Vexim approved a visit review for a specific facility associated with this supplier. See the supplier profile for any separately released scope. This is not certification of this product or all facilities.",
  3: "Vexim approved a review of this supplier's delivery evidence. See the supplier profile for any separately released scope. This does not establish all export history or guarantee future shipments.",
};
