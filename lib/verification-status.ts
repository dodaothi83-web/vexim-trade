import type { L2VerificationScope, VerificationLevel } from "./types";

/** A passed review is independent of the other two reviews. Never infer one from a higher number. */
export function approvedVerificationSteps(rows: ReadonlyArray<{ target_level: number; status: string }>): VerificationLevel[] {
  return ([1, 2, 3] as const).filter((level) =>
    rows.some((row) => row.target_level === level && row.status === "approved"));
}

export type PublicReviewSummaries = Partial<Record<2 | 3, string>>;

/** No inspector draft or legacy summary reaches the buyer without a separate reviewer publication. */
export function approvedPublicReviewSummaries(rows: ReadonlyArray<{
  target_level: number; status: string; approved_at?: string | null; l2_scope?: L2VerificationScope | null;
  public_summary_i18n?: Record<string, string> | null;
  public_summary_published_at?: string | null;
}>): PublicReviewSummaries {
  const summaries: PublicReviewSummaries = {};
  for (const level of [2, 3] as const) {
    const approved = rows.filter((row) => row.target_level === level && row.status === "approved" && row.public_summary_published_at && (level !== 2 || row.l2_scope !== "partner_contract"))
      .sort((a, b) => (b.public_summary_published_at ?? "").localeCompare(a.public_summary_published_at ?? ""));
    const summary = approved[0]?.public_summary_i18n?.en?.trim();
    // Defense in depth if an old row was published outside the moderated form.
    if (summary && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary) && !/https?:\/\/|www\./i.test(summary) && !/(?:\+?\d[\s().-]?){9,15}\d/.test(summary)) summaries[level] = summary;
  }
  return summaries;
}

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  1: "Documents checked",
  2: "Factory verification",
  3: "Delivery history reviewed",
};

/** Distinct short explanations for each level's own tooltip. */
export const VERIFICATION_LEVEL_EXPLANATIONS: Record<VerificationLevel, string> = {
  1: "Business registration evidence has been reviewed. Tax and bank details are not independently verified.",
  2: "A specific factory associated with the supplier has been reviewed. This does not cover every facility or product.",
  3: "Delivery or export documents have been reviewed for a specific scope. They do not by themselves prove an end buyer received the goods or guarantee future shipments.",
};

export function verificationLabels(levels: readonly VerificationLevel[]): string[] {
  return levels.map((level) => VERIFICATION_LABELS[level]);
}

/** Buyer-facing explanations describe independently approved SUPPLIER reviews, not product certification. */
export const PRODUCT_VERIFICATION_EXPLANATIONS: Record<VerificationLevel, string> = {
  1: "Business registration evidence has been reviewed. Tax and bank details are supplier-provided and not independently verified. This is not a product certification.",
  2: "A specific facility associated with this supplier has been reviewed. See the supplier profile for any separately released scope. This is not certification of this product or all facilities.",
  3: "Delivery or export documents have been reviewed for a specific scope. They do not by themselves prove an end buyer received the goods or guarantee future shipments.",
};

/** Results retain their recorded scope even if the supplier type later changes. */
export type PublicL2Scope = L2VerificationScope | "both" | null;
export function approvedL2Scope(rows: ReadonlyArray<{ target_level: number; status: string; l2_scope?: L2VerificationScope | null }>): PublicL2Scope {
  const approved = rows.filter((row) => row.target_level === 2 && row.status === "approved");
  const factory = approved.some((row) => row.l2_scope !== "partner_contract"); // legacy NULL is factory
  const partner = approved.some((row) => row.l2_scope === "partner_contract");
  return factory && partner ? "both" : partner ? "partner_contract" : factory ? "factory" : null;
}

export function verificationLabel(level: VerificationLevel, scope?: PublicL2Scope): string {
  if (level !== 2) return VERIFICATION_LABELS[level];
  return scope == null ? "L2 review" : scope === "partner_contract" ? "Partner factory contract reviewed" : scope === "both" ? "Factory and partner contract reviewed" : VERIFICATION_LABELS[2];
}

export function verificationExplanation(level: VerificationLevel, scope?: PublicL2Scope, product = false): string {
  if (level === 2 && scope == null) return "The scope of this L2 review is available from the supplier profile; it does not certify a product.";
  if (level === 2 && (scope === "partner_contract" || scope === "both")) {
    const partner = "A contract with a partner factory was reviewed for the stated relationship. The contract review alone does not establish ownership or a factory inspection.";
    const prefix = scope === "both" ? "A separate factory review was also approved. " : "";
    return `${prefix}${partner}${product ? " This is not a product certification." : ""}`;
  }
  return product ? PRODUCT_VERIFICATION_EXPLANATIONS[level] : VERIFICATION_LEVEL_EXPLANATIONS[level];
}

/** Filter 2 is specifically factory, filter 4 specifically partner contract. */
export function matchesVerificationFilter(levels: readonly number[], scope: PublicL2Scope | undefined, filter: number): boolean {
  if (!filter) return true;
  if (filter === 2) return levels.includes(2) && (scope === "factory" || scope === "both");
  if (filter === 4) return levels.includes(2) && (scope === "partner_contract" || scope === "both");
  return levels.includes(filter);
}

export function approvedPartnerReviewSummary(rows: ReadonlyArray<{
  target_level: number; status: string; l2_scope?: L2VerificationScope | null;
  public_summary_i18n?: Record<string, string> | null; public_summary_published_at?: string | null;
}>): string | undefined {
  const approved = rows.filter((row) => row.target_level === 2 && row.status === "approved" && row.l2_scope === "partner_contract" && row.public_summary_published_at)
    .sort((a, b) => (b.public_summary_published_at ?? "").localeCompare(a.public_summary_published_at ?? ""));
  const summary = approved[0]?.public_summary_i18n?.en?.trim();
  return summary && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(summary) && !/https?:\/\/|www\./i.test(summary) && !/(?:\+?\d[\s().-]?){9,15}\d/.test(summary) ? summary : undefined;
}
