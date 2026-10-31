import type { PublicL2Scope } from "@/lib/verification-status";
import "server-only";

import { getStore } from "@/lib/db";
import { fieldsFor } from "@/lib/product-attributes";
import { publicSupplierCertificates, type PublicSupplierCertificate } from "@/lib/public/certificates";
import { getPublicProductRecordsByIds } from "@/lib/public/product-catalog";
import { productDetailHref } from "@/lib/public/product-comparison";
import {
  publicProductCapacityDisplay,
  publicProductMoqDisplay,
  publicProductPaymentTermsDisplay,
  publicProductPackagingDisplay,
  publicProductPlaceDisplay,
  publicProductPriceDisplay,
  publicProductUnitDisplay,
} from "@/lib/public/product-detail-display";
import { publicProductExportPortDisplay } from "@/lib/public/product-export-port";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import type { VerificationLevel } from "@/lib/types";

export interface PublicComparedProduct {
  id: string;
  name: string;
  href: string;
  imagePath: string | null;
  categorySlug: string;
  categoryName: string;
  grade: string | null;
  specifications: Array<{ key: string; label: string; value: string }>;
  price: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  priceValidUntil: string | null;
  moq: string;
  packaging: string | null;
  leadTimeDays: number | null;
  leadTimeText?: string | null;
  incoterm: string | null;
  incotermPlace: string | null;
  exportPort: string | null;
  monthlyCapacity: string | null;
  paymentTerms: string | null;
  rawMaterialRegion: string | null;
  inputMaterialOrigin: string | null;
  oem: boolean;
  odm: boolean;
  samples: boolean;
  supplierName: string;
  supplierHref: string;
  province: string;
  verificationSteps: VerificationLevel[];
  l2Scope?: PublicL2Scope;
  certificates: PublicSupplierCertificate[];
  rfqHref: string;
}

const safe = (value: string | null | undefined): string | null => {
  const cleaned = withoutDirectContacts(value ?? "").trim();
  return cleaned || null;
};

/** Buyer-safe comparison data only. Private contacts, evidence and unauthorized prices never enter this projection. */
export async function getPublicProductsForComparison(ids: readonly string[]): Promise<PublicComparedProduct[]> {
  if (!ids.length) return [];
  const records = await getPublicProductRecordsByIds(ids);
  if (!records.length) return [];

  const store = getStore();
  const supplierIds = [...new Set(records.map(({ supplier }) => supplier.id))];
  const certificateGroups = await Promise.all(supplierIds.map(async (supplierId) => {
    const [certificates, media] = await Promise.all([
      store.listCertificates ? store.listCertificates(supplierId).catch(() => []) : Promise.resolve([]),
      store.listMedia ? store.listMedia("supplier", supplierId).catch(() => []) : Promise.resolve([]),
    ]);
    return [supplierId, publicSupplierCertificates(supplierId, certificates, media)] as const;
  }));
  const certificatesBySupplier = new Map(certificateGroups);

  return records.map(({ card, product, supplier, category }) => {
    const attributes = card.attributes;
    const tradeEnglish = product.translation_meta?.fields;
    const specifications = fieldsFor(category)
      .filter((field) => field.key !== "grade" && field.key !== "product_type" && Boolean(attributes[field.key]))
      .map((field) => ({
        key: field.key,
        label: withoutDirectContacts(field.label),
        value: withoutDirectContacts(attributes[field.key]),
      }));
    const href = productDetailHref(category.slug, product.id);
    const declaredGrades = Array.isArray(card.grades) && card.grades.length > 0
      ? card.grades.join(", ")
      : Array.isArray(card.gradeRows) && card.gradeRows.length > 0
        ? card.gradeRows.map((row) => row.grade).join(", ")
        : null;
    return {
      id: product.id,
      name: card.name,
      href,
      imagePath: card.cardImagePath ?? card.imagePaths[0] ?? null,
      categorySlug: category.slug,
      categoryName: safe(category.name_i18n.en || category.slug) ?? category.slug,
      grade: safe(declaredGrades ?? attributes.grade ?? card.grade),
      specifications,
      price: safe(publicProductPriceDisplay(card.price)),
      // Người mua thấy ký hiệu ($, €) chứ không phải mã tiền tệ, nên mã lấy từ bảng giá đã duyệt.
      priceCurrency: card.quantityOffer && card.price
        ? safe(card.quantityOffer.currency)
        : card.price && card.pricePoint ? safe(card.pricePoint.currency) : null,
      priceUnit: card.quantityOffer && card.price ? safe(card.price.match(/\/(kg|MT)$/)?.[1]) : card.price && card.pricePoint ? safe(publicProductUnitDisplay(card.pricePoint.unit)) : null,
      priceValidUntil: !card.quantityOffer && card.price && product.price_valid_until && /^\d{4}-\d{2}-\d{2}$/.test(product.price_valid_until)
        ? product.price_valid_until : null,
      moq: safe(publicProductMoqDisplay(card.moq && card.moq !== "On request" ? card.moq : tradeEnglish?.moq)) ?? "Not provided",
      packaging: safe(publicProductPackagingDisplay(product.packaging_i18n?.en?.trim() || product.packaging)),
      leadTimeDays: card.leadTimeDays,
      leadTimeText: card.leadTimeText,
      incoterm: safe(card.quantityOffer ? card.incoterm : product.incoterm),
      incotermPlace: card.quantityOffer ? null : safe(publicProductPlaceDisplay(tradeEnglish?.incoterm_place || product.incoterm_place)),
      exportPort: safe(publicProductExportPortDisplay(product)),
      monthlyCapacity: safe(publicProductCapacityDisplay(tradeEnglish?.monthly_capacity || product.monthly_capacity)),
      paymentTerms: safe(publicProductPaymentTermsDisplay(tradeEnglish?.payment_terms || product.payment_terms)),
      rawMaterialRegion: safe(card.rawMaterialRegion),
      inputMaterialOrigin: safe(card.inputMaterialOrigin),
      oem: Boolean(product.oem),
      odm: Boolean(product.odm),
      samples: Boolean(product.samples),
      supplierName: card.supplierName,
      supplierHref: `/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`,
      province: card.province,
      verificationSteps: card.verificationSteps,
      l2Scope: card.l2Scope,
      certificates: certificatesBySupplier.get(supplier.id) ?? [],
      rfqHref: `/rfq?category=${encodeURIComponent(category.slug)}&suppliers=${encodeURIComponent(supplier.id)}&product=${encodeURIComponent(card.name)}&product_id=${encodeURIComponent(product.id)}`,
    };
  });
}
