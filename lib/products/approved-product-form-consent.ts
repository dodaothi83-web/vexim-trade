import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import { approvedFormPriceConsent, type ApprovedFormPriceConsent } from "@/lib/products/product-form-price-consent";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 50, PAGE_SIZE = 500, MAX_ROWS_PER_BATCH = 10_000;
export type ConsentCandidate = {
  productId: string; supplierId: string;
  priceRevision: { id: string; product_id: string; status: string } | null;
};
/** A null publication is legacy; a null submissionId means a form exists but its current price link is invalid. */
export type ApprovedFormPublication = { submissionId: string | null; priceConsent: boolean };

/**
 * Server-only reader for the future buyer cutover. Fetches only the consent
 * flags, not the private form payload. Any DB error throws: silently treating a
 * missing migration or failed query as legacy consent could expose a new price.
 * Not connected until SQL65 and atomic form approval are complete.
 */
export async function readApprovedFormPublications(candidates: readonly ConsentCandidate[]): Promise<Map<string, ApprovedFormPublication | null>> {
  const byId = new Map<string, ConsentCandidate>();
  for (const candidate of candidates) {
    if (!UUID.test(candidate.productId) || !UUID.test(candidate.supplierId) ||
        (candidate.priceRevision && (!UUID.test(candidate.priceRevision.id) || !UUID.test(candidate.priceRevision.product_id) || candidate.priceRevision.status !== "approved")))
      throw new Error("Invalid form consent candidate");
    const id = candidate.productId.toLowerCase();
    const normalized: ConsentCandidate = { productId: id, supplierId: candidate.supplierId.toLowerCase(),
      priceRevision: candidate.priceRevision ? { ...candidate.priceRevision, id: candidate.priceRevision.id.toLowerCase(),
        product_id: candidate.priceRevision.product_id.toLowerCase() } : null };
    if (normalized.priceRevision && normalized.priceRevision.product_id !== id) throw new Error("Unexpected price revision owner");
    const previous = byId.get(id);
    if (previous && (previous.supplierId !== normalized.supplierId || previous.priceRevision?.id !== normalized.priceRevision?.id ||
        previous.priceRevision?.status !== normalized.priceRevision?.status)) throw new Error("Conflicting form consent candidate");
    byId.set(id, normalized);
  }
  const result = new Map([...byId.keys()].map((id) => [id, null as ApprovedFormPublication | null]));
  if (!byId.size) return result;
  const db = getSupabaseClient();
  if (!db) throw new Error("Product form consent database unavailable");
  const ids = [...byId.keys()];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE), grouped = new Map<string, (ApprovedFormPriceConsent & { id: unknown })[]>();
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await db.from("product_form_submissions")
        .select("id,product_id,supplier_id,status,approved_price_revision_id,price_consent:payload->priceConsent,price_publicly_visible:payload->pricePubliclyVisible")
        .eq("status", "approved").in("product_id", batch).order("product_id").order("id").range(start, start + PAGE_SIZE - 1);
      if (error || !data) throw new Error("Approved product form consent unavailable");
      if (start + data.length > MAX_ROWS_PER_BATCH) throw new Error("Too many approved product form revisions");
      for (const row of data as unknown as (ApprovedFormPriceConsent & { id: unknown })[]) {
        if (typeof row.product_id !== "string" || !batch.includes(row.product_id) || row.status !== "approved")
          throw new Error("Unexpected approved product form consent row");
        const rows = grouped.get(row.product_id) ?? [];
        rows.push(row); grouped.set(row.product_id, rows);
      }
      if (data.length < PAGE_SIZE) break;
    }
    for (const id of batch) {
      const candidate = byId.get(id)!;
      const rows = grouped.get(id) ?? [];
      const matching = rows.filter((row) => row.approved_price_revision_id === candidate.priceRevision?.id);
      if (matching.length > 1) throw new Error("Duplicate approved product form price link");
      const record = matching[0] ?? rows[0] ?? null;
      if (!record) { result.set(id, null); continue; }
      const matched = matching[0];
      const submissionId = matched && matched.supplier_id === candidate.supplierId && typeof matched.id === "string" && UUID.test(matched.id)
        ? matched.id.toLowerCase() : null;
      result.set(id, { submissionId, priceConsent: submissionId !== null && approvedFormPriceConsent({ record, productId: id, supplierId: candidate.supplierId,
        priceRevision: candidate.priceRevision }) === true });
    }
  }
  return result;
}

/** Compatibility adapter for the future price projection. */
export async function readApprovedFormPriceConsents(candidates: readonly ConsentCandidate[]): Promise<Map<string, boolean | null>> {
  const publications = await readApprovedFormPublications(candidates);
  return new Map([...publications].map(([id, publication]) => [id, publication?.priceConsent ?? null]));
}
