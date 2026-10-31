import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import { readApprovedQuantityRevisions } from "@/lib/products/approved-quantity-revisions";
import { readQuantityPriceSettings } from "@/lib/products/quantity-price-config";
import { projectApprovedQuantityOffer } from "@/lib/products/quantity-public-projection";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { PublicProductRecord } from "@/lib/public/product-catalog";

/**
 * Buyer projection of approved quantity prices. Call only after public product,
 * supplier and media eligibility checks. A failed read for eligible records must
 * never fall back to legacy prices. Unmapped multi-grade records deliberately
 * remain on the legacy projection. Supplier storefronts keep their own projection.
 */
function hasUnmappedLegacyGrades(record: PublicProductRecord): boolean {
  const rows = record.product.specs?.grade_rows;
  // An indexed listing can contain multiple legacy grades. A single-grade
  // revision alone is not evidence that those grades, links and URLs were
  // mapped. Keep the existing projection until an explicit migration exists.
  return rows != null && (!Array.isArray(rows) || rows.length > 1);
}

export async function projectQuantityCatalogPreview(records: PublicProductRecord[]): Promise<PublicProductRecord[]> {
  // Quantity revisions live in Supabase. A local development store has none, and no
  // public page may fail just because the pricing tables were never installed.
  if (!getSupabaseClient()) return records;
  const eligible = records.filter((record) => !record.supplier.is_demo && !hasUnmappedLegacyGrades(record));
  if (!eligible.length) return records;
  const [revisions, settings] = await Promise.all([
    readApprovedQuantityRevisions(eligible.map(({ product }) => product.id)),
    readQuantityPriceSettings(),
  ]);
  const now = Date.now();
  return records.map((record) => {
    if (record.supplier.is_demo || hasUnmappedLegacyGrades(record)) return record;
    const { product, supplier, category, card } = record;
    const revision = revisions.get(product.id);
    if (!revision) throw new Error("Missing quantity revision read result");
    // Products without a new approved price retain the old public projection.
    if (!revision.price) return record;
    const unit = displayUnitsForCategory(category.slug, category.price_unit).primary === "mt" ? "mt" : "kg";
    const offer = projectApprovedQuantityOffer({
      productId: product.id, priceRevision: revision.price, nameRevision: revision.name,
      pricePubliclyVisible: product.price_publicly_visible === true && supplierPriceConsentCurrent(supplier, now),
      priceUnit: unit, now, staleAfterDays: settings.stale_days,
    });
    // One unusable approved revision must not take the public catalogue down: keep
    // that product on its previous card and leave the row for staff to fix.
    if (!offer) {
      console.error(`[quantity-projection] approved price unusable for product ${product.id}`);
      return record;
    }
    const attributes = { ...card.attributes };
    // Old multi-grade attributes must not make this single-grade offer match a different grade.
    if (offer.customGrade) {
      delete attributes.grade;
      delete attributes.product_type;
    } else {
      if ("grade" in attributes) attributes.grade = offer.grade;
      if ("product_type" in attributes) attributes.product_type = offer.grade;
    }
    return { ...record, card: {
      ...card,
      name: offer.title ?? card.name,
      grade: offer.grade, grades: offer.customGrade ? [] : [offer.grade], cardGrades: [offer.grade], hasGradeRows: true,
      gradeRows: [], attributes,
      gradePricePoints: offer.pricePoint && !offer.customGrade ? [{ ...offer.pricePoint, grade: offer.grade }] : [],
      moq: offer.moq, moqUnit: offer.moqUnit ?? "kg", moqMtEquivalent: offer.moqKg / 1000,
      price: offer.price, pricePoint: offer.pricePoint, priceRankingEligible: offer.priceRankingEligible,
      incoterm: offer.incoterm, quantityOffer: offer,
    } };
  });
}
