/* Read-only inventory guard. Nothing here changes data or publishes a product. */
export const SPLIT_DEPENDENCIES = [
  "product_english_name_revisions", "product_quantity_price_revisions", "quantity_product_creation_requests",
  "sponsored_pilot_campaigns", "sponsored_pushes", "sponsored_requests",
  "product_form_drafts", "product_form_submissions",
] as const;
type Dependency = typeof SPLIT_DEPENDENCIES[number];
export type SplitDependencyCounts = Record<Dependency, number | null>;
export type ProductReferenceColumn = { schema: string; table: string; column: string };
export type SplitDependencyIssue = { code: "unknown_reference" | "missing_inventory" | "linked_records"; relation: string };

// Known references are inventoried separately by the split plan or held intact.
// A new/unrecognized relation fails closed until reviewed, even when it looks empty.
const KNOWN = new Set([
  "public.media_assets.product_id", "public.rfqs.source_product_id",
  "public.certificates.requested_product_ids", "public.certificates.approved_product_ids",
  ...SPLIT_DEPENDENCIES.map((table) => `public.${table}.product_id`),
]);
const OPTIONAL = new Set<Dependency>(["product_form_drafts", "product_form_submissions"]);

/**
 * `null` for an optional relation means the DB catalog confirmed it does not
 * exist. A missing key, a query error, partial result, invalid count, or null
 * for a required relation is never interpreted as zero. Caller must query all
 * relevant schemas and all known dependencies, with authorization and no writes.
 */
export function assessSplitDependencies(counts: SplitDependencyCounts, columns: ProductReferenceColumn[]): SplitDependencyIssue[] {
  if (!counts || typeof counts !== "object" || !Array.isArray(columns)) return [{ code: "missing_inventory", relation: "inventory" }];
  const issues: SplitDependencyIssue[] = [];
  for (const name of SPLIT_DEPENDENCIES) {
    const count = counts[name];
    if (count === null && OPTIONAL.has(name)) continue;
    if (!Number.isSafeInteger(count) || typeof count !== "number" || count < 0) issues.push({ code: "missing_inventory", relation: `public.${name}` });
    else if (count > 0) issues.push({ code: "linked_records", relation: `public.${name}` });
  }
  const observed = new Set<string>();
  for (const ref of columns) {
    if (!ref || typeof ref.schema !== "string" || typeof ref.table !== "string" || typeof ref.column !== "string" ||
        !ref.schema || !ref.table || !ref.column) {
      issues.push({ code: "missing_inventory", relation: "reference_columns" });
      continue;
    }
    const key = `${ref.schema}.${ref.table}.${ref.column}`;
    observed.add(key);
    if (!KNOWN.has(key)) issues.push({ code: "unknown_reference", relation: key });
  }
  const mandatory = ["public.media_assets.product_id", "public.rfqs.source_product_id",
    "public.certificates.requested_product_ids", "public.certificates.approved_product_ids"];
  for (const table of SPLIT_DEPENDENCIES) {
    const key = `public.${table}.product_id`;
    if (counts[table] !== null) mandatory.push(key);
    else if (observed.has(key)) issues.push({ code: "missing_inventory", relation: key });
  }
  for (const key of mandatory) if (!observed.has(key)) issues.push({ code: "missing_inventory", relation: key });
  return issues;
}

/** Provisional intent, not a definitive CSV list until the executable script is reviewed. */
export const SPLIT_PROVISIONAL_WRITE_TABLES = ["public.supplier_products", "public.media_assets", "public.rfqs", "public.certificates", "public.audit_log", "storage.objects"] as const;
