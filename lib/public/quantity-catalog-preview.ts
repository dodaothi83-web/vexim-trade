import "server-only";

import { readApprovedQuantityRevisions } from "@/lib/products/approved-quantity-revisions";
import { readQuantityPriceSettings } from "@/lib/products/quantity-price-config";
import { projectApprovedQuantityOffer } from "@/lib/products/quantity-public-projection";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { PublicProductRecord } from "@/lib/public/product-catalog";

/**
 * Staging-only cutover experiment. Call only after public product, supplier and
 * media eligibility checks. A failed read must never fall back to legacy prices.
 * This does not yet cover supplier storefronts, promotions or the main editor.
 */
export async function projectQuantityCatalogPreview(records: PublicProductRecord[]): Promise<PublicProductRecord[]> {
  const eligible = records.filter(({ supplier }) => !supplier.is_demo);
  if (!eligible.length) return records;
  const [revisions, settings] = await Promise.all([
    readApprovedQuantityRevisions(eligible.map(({ product }) => product.id)),
    readQuantityPriceSettings(),
  ]);
  const now = Date.now();
  return records.map((record) => {
    if (record.supplier.is_demo) return record;
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
    // Never surface an older legacy price if an approved new revision is corrupt.
    if (!offer) throw new Error(`Invalid approved quantity price for product ${product.id}`);
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
