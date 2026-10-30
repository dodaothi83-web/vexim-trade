import "server-only";

import { readApprovedQuantityRevisions } from "@/lib/products/approved-quantity-revisions";
import { isSyntheticProductFormStaging } from "@/lib/products/product-form-staging-access";
import { readApprovedFormPublications } from "@/lib/products/approved-product-form-consent";
import { readApprovedFormImages } from "@/lib/products/approved-product-form-images";
import { readQuantityPriceSettings } from "@/lib/products/quantity-price-config";
import { projectApprovedQuantityOffer } from "@/lib/products/quantity-public-projection";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import { supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { PublicProductRecord } from "@/lib/public/product-catalog";

/**
 * Staging-only cutover experiment. Call only after public product, supplier and
 * media eligibility checks. A failed read for eligible records must never fall
 * back to legacy prices. Unmapped multi-grade records deliberately remain on
 * the legacy projection. Supplier storefronts and the main editor are not cut over.
 */
function hasUnmappedLegacyGrades(record: PublicProductRecord): boolean {
  const rows = record.product.specs?.grade_rows;
  // An indexed listing can contain multiple legacy grades. A single-grade
  // revision alone is not evidence that those grades, links and URLs were
  // mapped. Keep the existing projection until an explicit migration exists.
  return rows != null && (!Array.isArray(rows) || rows.length > 1);
}

export async function projectQuantityCatalogPreview(records: PublicProductRecord[]): Promise<PublicProductRecord[]> {
  // The new publication and gallery contract is staged only. Preserve the
  // pre-existing quantity preview everywhere else, even if its older flag is on.
  if (!isSyntheticProductFormStaging())
    return (await import("@/lib/public/quantity-catalog-legacy-preview")).projectQuantityCatalogPreview(records);
  const eligible = records.filter((record) => !record.supplier.is_demo && !hasUnmappedLegacyGrades(record));
  if (!eligible.length) return records;
  const [revisions, settings] = await Promise.all([
    readApprovedQuantityRevisions(eligible.map(({ product }) => product.id)),
    readQuantityPriceSettings(),
  ]);
  const candidates = eligible.map(({ product, media }) => {
    const revision = revisions.get(product.id);
    if (!revision) throw new Error("Missing quantity revision read result");
    return { productId: product.id, supplierId: product.supplier_id, media: media ?? [], priceRevision: revision.price ?
      { id: revision.price.id, product_id: revision.price.product_id, status: revision.price.status } : null };
  });
  const publications = await readApprovedFormPublications(candidates);
  const images = await readApprovedFormImages(candidates.map((candidate) => {
    const publication = publications.get(candidate.productId);
    if (publication === undefined || (publication && !publication.submissionId)) throw new Error("Approved form and price revision are out of sync");
    return { ...candidate, expectedSubmissionId: publication?.submissionId ?? null };
  }));
  const now = Date.now();
  return records.map((record) => {
    if (record.supplier.is_demo || hasUnmappedLegacyGrades(record)) return record;
    const { product, supplier, category, card } = record;
    const revision = revisions.get(product.id);
    if (!revision) throw new Error("Missing quantity revision read result");
    const publication = publications.get(product.id);
    const gallery = images.get(product.id);
    if (publication === undefined || gallery === undefined || (publication && !publication.submissionId) ||
        Boolean(publication) !== Boolean(gallery) || (gallery && (!gallery.length || gallery.some((asset) => !asset.storage_path))))
      throw new Error("Approved form and price revision are out of sync");
    // Products without a form or new approved price retain the old projection.
    if (!revision.price) return record;
    const unit = displayUnitsForCategory(category.slug, category.price_unit).primary === "mt" ? "mt" : "kg";
    const offer = projectApprovedQuantityOffer({
      productId: product.id, priceRevision: revision.price, nameRevision: revision.name,
      pricePubliclyVisible: product.price_publicly_visible === true &&
        (publication ? publication.priceConsent : supplierPriceConsentCurrent(supplier, now)),
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
      ...(gallery ? { imagePaths: gallery.map((asset) => asset.storage_path!),
        imageThumbnailPaths: gallery.map((asset) => asset.thumb_path ?? asset.storage_path!),
        cardImagePath: gallery[0].thumb_path ?? gallery[0].storage_path, usesFormGallery: true } : {}),
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
