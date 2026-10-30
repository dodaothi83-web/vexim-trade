import type { LegacySplitInput, LegacySplitPlan } from "@/lib/products/legacy-grade-split-plan";

export type SplitBaselineIssue = "product_changed" | "category_changed" | "media_changed" | "rfqs_changed" |
  "certificates_changed" | "target_product_taken" | "target_media_taken" | "target_paths_referenced" | "invalid_inventory";
export type SplitCurrentInventory = Omit<LegacySplitInput, "newProductId" | "imageMappings"> & {
  targetProductExists: boolean;
  /** Existing media IDs and paths found while checking the planned destinations. */
  existingTargetMediaIds: string[];
  referencedTargetPaths: string[];
};

// PostgREST values are JSON; canonical JSON comparison ignores object key order
// but preserves array order, exact strings, nulls and all stored product fields.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    return item;
  });
}
function orderedById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}
function rfqSnapshot(rfq: LegacySplitInput["rfqs"][number]) {
  const specs = rfq.specs && typeof rfq.specs === "object" && !Array.isArray(rfq.specs) ? rfq.specs as Record<string, unknown> : {};
  return { id: rfq.id, sourceProductId: rfq.source_product_id, updatedAt: rfq.updated_at, grade: specs.grade ?? null };
}

/**
 * Read-only preflight. The caller must load complete inventories, not pages or
 * only public media, and must repeat these comparisons under database locks in
 * the eventual transaction. This function alone cannot prevent concurrent edits.
 */
export function compareLegacySplitBaseline(plan: LegacySplitPlan, current: SplitCurrentInventory): SplitBaselineIssue[] {
  const issues: SplitBaselineIssue[] = [];
  if (!current || !current.product || !Array.isArray(current.assets) || !Array.isArray(current.rfqs) ||
      !Array.isArray(current.certificates) || typeof current.targetProductExists !== "boolean" ||
      !Array.isArray(current.existingTargetMediaIds) || !Array.isArray(current.referencedTargetPaths) ||
      !Array.isArray(plan.rfqSnapshots) || !Array.isArray(plan.assetSnapshots) || !Array.isArray(plan.certificateSnapshots) || !Array.isArray(plan.assetCopies) ||
      [current.assets, current.rfqs, current.certificates, plan.assetSnapshots, plan.rfqSnapshots, plan.certificateSnapshots]
        .some((records) => records.some((row) => !row || typeof row.id !== "string")) ||
      current.existingTargetMediaIds.some((id) => typeof id !== "string") || current.referencedTargetPaths.some((path) => typeof path !== "string") ||
      plan.assetCopies.some((asset) => !asset || typeof asset.newId !== "string" || typeof asset.newPath !== "string" ||
        !(asset.newThumbPath === null || typeof asset.newThumbPath === "string"))) return ["invalid_inventory"];
  if (current.product.id !== plan.sourceId || canonical(current.product) !== canonical(plan.sourceSnapshot)) issues.push("product_changed");
  if (current.resolvedCategorySlug !== plan.category) issues.push("category_changed");
  if (current.assets.some((a) => a.product_id !== plan.sourceId) ||
      canonical(orderedById(current.assets)) !== canonical(orderedById(plan.assetSnapshots))) issues.push("media_changed");
  if (current.rfqs.some((r) => r.source_product_id !== plan.sourceId) ||
      canonical(orderedById(current.rfqs.map(rfqSnapshot))) !== canonical(orderedById(plan.rfqSnapshots))) issues.push("rfqs_changed");
  if (canonical(orderedById(current.certificates)) !== canonical(orderedById(plan.certificateSnapshots))) issues.push("certificates_changed");
  if (current.targetProductExists) issues.push("target_product_taken");
  const newIds = new Set(plan.assetCopies.map((asset) => asset.newId.toLowerCase()));
  const newPaths = new Set(plan.assetCopies.flatMap((asset) => [asset.newPath, ...(asset.newThumbPath ? [asset.newThumbPath] : [])]));
  if (current.existingTargetMediaIds.some((id) => newIds.has(id.toLowerCase()))) issues.push("target_media_taken");
  if (current.referencedTargetPaths.some((path) => newPaths.has(path))) issues.push("target_paths_referenced");
  return issues;
}
