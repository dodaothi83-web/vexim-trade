import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import { readApprovedFormPublications, type ConsentCandidate } from "@/lib/products/approved-product-form-consent";
import { selectPublishedFormImages, type PublishedFormImageRef } from "@/lib/products/product-form-published-images";
import type { MediaAsset } from "@/lib/types";

/**
 * Future buyer cutover reader. The approved form, exact price revision and
 * manifest must agree. A concurrent change or read failure throws instead of
 * falling back to unrelated photos. Old products with no form return null.
 * No page calls this until transaction approval and staging tests are complete.
 */
export async function readApprovedFormImages(candidates: readonly (ConsentCandidate & { media: readonly MediaAsset[]; expectedSubmissionId?: string | null })[]): Promise<Map<string, MediaAsset[] | null>> {
  const publications = await readApprovedFormPublications(candidates);
  const byId = new Map<string, typeof candidates[number]>();
  for (const item of candidates) {
    const id = item.productId.toLowerCase();
    if (byId.has(id)) throw new Error("Duplicate approved form gallery candidate");
    byId.set(id, item);
  }
  const result = new Map<string, MediaAsset[] | null>();
  if (!byId.size) return result;
  const db = getSupabaseClient();
  if (!db) throw new Error("Approved form gallery database unavailable");
  const ids = [...byId.keys()];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    // Schema limits each product to eight slots; the explicit upper bound also
    // detects a corrupted schema instead of accepting a truncated result.
    const { data, error } = await db.from("product_form_published_images").select("product_id,submission_id,media_id,position")
      .in("product_id", batch).limit(401);
    if (error || !Array.isArray(data) || data.length > batch.length * 8) throw new Error("Approved form gallery unavailable");
    const grouped = new Map<string, PublishedFormImageRef[]>();
    for (const row of data as PublishedFormImageRef[]) {
      if (!row || typeof row.product_id !== "string" || !batch.includes(row.product_id)) throw new Error("Unexpected form gallery row");
      const rows = grouped.get(row.product_id) ?? []; rows.push(row); grouped.set(row.product_id, rows);
    }
    for (const id of batch) {
      const candidate = byId.get(id)!, publication = publications.get(id);
      if (publication === undefined) throw new Error("Approved form publication unavailable");
      if (publication && !publication.submissionId) throw new Error("Approved form price and gallery are out of sync");
      if (candidate.expectedSubmissionId !== undefined && candidate.expectedSubmissionId !== (publication?.submissionId ?? null))
        throw new Error("Approved form changed while reading gallery");
      result.set(id, selectPublishedFormImages({ productId: id, supplierId: candidate.supplierId.toLowerCase(),
        approvedSubmissionId: publication?.submissionId ?? null, refs: grouped.get(id) ?? [], media: candidate.media }));
    }
  }
  return result;
}
