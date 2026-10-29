import type { PublicL2Scope } from "@/lib/verification-status";
import "server-only";

import { getStore } from "@/lib/db";
import { publicProductAttributes } from "@/lib/product-attributes";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { listPublicSuppliers, type PublicSupplierCard } from "@/lib/public/catalog";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, productBelongsToCategory, productPriceBlockers, productReviewApproved, publicProductCategorySlug, publicProductPrice, publicProductPricePoint, withoutDirectContacts } from "@/lib/public/product-selection";
import { resolveGrade } from "@/lib/public/grade-resolution";
import {
  formatLeadTimeBuyer,
  formatStructuredMoqBuyer,
  isMoqUnit,
  projectPublicGradeData,
  type MoqUnit,
  type PublicProductGradeRow,
} from "@/lib/products/grade-pricing";
import { evidenceValidVerificationSteps, rankPublicCategoryProducts, SPEC_RANKING_WEIGHTS } from "@/lib/public/ranking";
import { publicProductTitle } from "@/lib/public/display-name";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { publicProductMoqDisplay, publicProductPlaceDisplay, publicProductPriceDisplay } from "@/lib/public/product-detail-display";
import type { Certificate, Category, MediaAsset, SupplierProduct, VerificationLevel } from "@/lib/types";

/** The client receives only a public projection — never supplier contacts, private media or internal notes. */
export interface PublicCategoryProduct {
  id: string;
  name: string;
  grade: string | null;
  /** Standard grades declared on the product (used for filters and search). Custom grades are excluded. */
  grades: string[];
  /** Standard grades strictly from the Grade & giá table in canonical category order (never inferred from product name). */
  cardGrades: string[];
  hasGradeRows: boolean;
  /** Per-grade commercial rows for buyer PDP / comparison (prices redacted unless price gates pass). */
  gradeRows: PublicProductGradeRow[];
  /** Per-standard-grade price points for the category reference price range strip. */
  gradePricePoints: Array<{
    grade: string;
    value: number;
    highValue: number | null;
    unit: string | null;
    currency: string | null;
    updatedAt: string | null;
  }>;
  attributes: Record<string, string>;
  moq: string;
  moqUnit: MoqUnit | null;
  moqMtEquivalent: number | null;
  price: string | null;
  /** Only present in the opt-in, approved quantity pricing preview. */
  quantityOffer?: import("@/lib/products/quantity-public-projection").PublicQuantityOffer;
  priceRankingEligible?: boolean;
  /** Số liệu thô để tính khoảng giá tham khảo; null khi giá chưa được phép công khai. */
  pricePoint: { value: number; highValue?: number | null; unit: string | null; currency: string | null; updatedAt: string | null } | null;
  /** Hồ sơ demo không được tham gia vào khoảng giá thị trường. */
  isDemoSupplier: boolean;
  province: string;
  /** Saved product English only; empty when this product's source has not been translated. */
  rawMaterialRegion: string;
  inputMaterialOrigin: string;
  verificationCount: number;
  verificationSteps: VerificationLevel[];
  l2Scope?: PublicL2Scope;
  /**
   * Số bước xác minh còn hiệu lực (0-3): L2/L3 đã duyệt là còn; L1 chỉ còn khi NCC
   * có chứng nhận đã duyệt còn hạn (hoặc không có chứng nhận nào để đối chiếu —
   * NCC legacy). Chỉ dùng cho xếp hạng, không phải cổng hiển thị.
   */
  evidenceValidSteps: number;
  supplierName: string;
  supplierId: string;
  supplierSlug: string | null;
  supplierProfileImage: string | null;
  supplierFoundedYear: number | null;
  leadTimeDays: number | null;
  leadTimeText: string;
  incoterm: string | null;
  oem: boolean;
  odm: boolean;
  samples: boolean;
  isDemo: boolean;
  imagePaths: string[];
  cardImagePath: string | null;
}

export function shareableProductImages(media: MediaAsset[], productId: string, featuredMediaId?: string | null, limit = 6, thumbnail = false): string[] {
  return media.filter((m) => m.owner_type === "product" && m.product_id === productId &&
    m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m))
    .sort((a, b) => Number(b.id === featuredMediaId) - Number(a.id === featuredMediaId) ||
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((m) => thumbnail ? (m.thumb_path || m.storage_path!) : m.storage_path!)
    .slice(0, limit);
}

function projectPublicCategoryProduct(
  p: SupplierProduct,
  s: PublicSupplierCard,
  category: Category,
  media: MediaAsset[],
  evidenceValidSteps?: number,
): PublicCategoryProduct {
  const images = shareableProductImages(media, p.id, p.featured_media_id);
  // A product marked ready can have only a catalogue; in that case show a neutral placeholder.
  const attributes = publicProductAttributes(category, p.specs);
  const tradeEnglish = p.translation_meta?.fields;
  const priceVisible = productPriceBlockers(p, s).length === 0;
  const gradeData = projectPublicGradeData(p, category, {
    canShowPrice: priceVisible,
    sanitizeText: withoutDirectContacts,
    translateMoq: (moq) => publicProductMoqDisplay(moq),
    fallbackMoq: p.moq,
    fallbackUpdatedAt: p.updated_at,
  });
  const legacyGrade = resolveGrade({
    name: p.name, spec: p.spec, categorySlug: category.slug, attributes,
  }).value;
  const primaryGrade = gradeData.hasGradeRows
    ? gradeData.primaryGrade
    : legacyGrade;
  const grades = gradeData.hasGradeRows
    ? gradeData.standardGrades
    : (legacyGrade ? [legacyGrade] : []);
  const firstGradePoint = gradeData.gradePricePoints[0] ?? null;
  const legacyPricePoint = publicProductPricePoint(p, s);
  const effectivePricePoint = gradeData.hasGradeRows
    ? (firstGradePoint ?? legacyPricePoint)
    : legacyPricePoint;
  const rawFallbackPrice = publicProductPrice(p, s);
  const normalizedFallbackPrice = rawFallbackPrice ? publicProductPriceDisplay(rawFallbackPrice) : null;
  const effectivePrice = gradeData.summaryPrice ?? normalizedFallbackPrice;
  const specWeight = p.specs && typeof p.specs === "object" && typeof (p.specs as Record<string, unknown>).moq_unit_weight_kg === "number"
    ? ((p.specs as Record<string, unknown>).moq_unit_weight_kg as number)
    : null;
  const legacyStructuredMoq = typeof p.moq_qty === "number" && p.moq_qty > 0 && isMoqUnit(p.moq_unit)
    ? formatStructuredMoqBuyer(p.moq_qty, p.moq_unit, specWeight)
    : "";
  const fallbackMoqDisplay = legacyStructuredMoq || publicProductMoqDisplay(p.moq) || "On request";
  const effectiveMoq = gradeData.hasGradeRows
    ? (gradeData.gradeRows.find((r) => r.moq !== "On request")?.moq ?? fallbackMoqDisplay)
    : fallbackMoqDisplay;
  const effectiveIncoterm = gradeData.hasGradeRows
    ? (gradeData.gradeRows[0]?.incoterm ?? p.incoterm ?? null)
    : (p.incoterm ?? null);
  return {
    // Tên công khai: bản soạn sẵn nếu có, không thì tên gốc. Danh mục vẫn
    // suy từ tên gốc (productBelongsToCategory ở trên), không suy từ tên này.
    id: p.id, name: withoutDirectContacts(publicProductTitle(p)),
    grade: primaryGrade,
    grades,
    cardGrades: gradeData.cardGrades,
    hasGradeRows: gradeData.hasGradeRows,
    gradeRows: gradeData.gradeRows,
    gradePricePoints: !s.is_demo ? gradeData.gradePricePoints : [],
    attributes,
    moq: effectiveMoq,
    moqUnit: gradeData.moqUnit,
    moqMtEquivalent: gradeData.moqMtEquivalent,
    price: effectivePrice,
    pricePoint: effectivePricePoint,
    isDemoSupplier: !!s.is_demo,
    province: supplierProvinceDisplay(s) || "Vietnam",
    rawMaterialRegion: publicProductPlaceDisplay(tradeEnglish?.raw_material_region),
    inputMaterialOrigin: tradeEnglish?.input_material_origin?.trim() || "",
    verificationCount: s.approved_verification_steps.length, verificationSteps: s.approved_verification_steps,
    l2Scope: s.approved_l2_scope ?? null,
    evidenceValidSteps: evidenceValidSteps ?? s.approved_verification_steps.length,
    supplierName: withoutDirectContacts(s.display_name || s.trade_name || s.name),
    supplierId: s.id, supplierSlug: s.slug || null, supplierProfileImage: s.profile_image ?? null, supplierFoundedYear: s.founded_year ?? null,
    leadTimeDays: p.lead_time_days ?? null, leadTimeText: formatLeadTimeBuyer(p), incoterm: effectiveIncoterm, oem: !!p.oem, odm: !!p.odm, samples: !!p.samples,
    isDemo: !!s.is_demo, imagePaths: images,
    cardImagePath: shareableProductImages(media, p.id, p.featured_media_id, 1, true)[0] ?? null,
  };
}

/** Server-only snapshot for callers that need the same gated catalogue across several categories. */
export interface PublicProductCatalogSnapshot {
  suppliers: PublicSupplierCard[];
  products: SupplierProduct[];
  categories: Category[];
  /** Each product's category uses the same rules and category list for this request. */
  categoryByProduct: Map<string, string | null>;
  /** Request-scoped promises only; raw evidence stays on the server. */
  mediaByProduct: Map<string, Promise<MediaAsset[]>>;
  certificatesBySupplier: Map<string, Promise<Certificate[]>>;
}

export async function loadPublicProductCatalogSnapshot(options?: { categories?: Category[] }): Promise<PublicProductCatalogSnapshot> {
  const store = getStore();
  const [rawSuppliers, products, categories] = await Promise.all([
    store.listSuppliers(), store.listProducts(),
    options?.categories ? Promise.resolve(options.categories) : store.listCategories({ publishedOnly: false }),
  ]);
  const suppliers = await listPublicSuppliers({ source: { suppliers: rawSuppliers, products, categories } });
  return { suppliers, products, categories, categoryByProduct: new Map(), mediaByProduct: new Map(), certificatesBySupplier: new Map() };
}

/** Share a single in-flight batch among overlapping categories in the same request. */
async function cachedByOwner<T>(
  ids: readonly string[], cache: Map<string, Promise<T[]>>,
  read: (ids: string[]) => Promise<T[]>, owner: (row: T) => string | null | undefined,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length) {
    const grouped = read(missing).then((rows) => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        const id = owner(row);
        if (!id) continue;
        const group = map.get(id) ?? [];
        if (!map.has(id)) map.set(id, group);
        group.push(row);
      }
      return map;
    });
    for (const id of missing) cache.set(id, grouped.then((map) => map.get(id) ?? []));
  }
  return (await Promise.all(unique.map((id) => cache.get(id)!))).flat();
}

export async function listPublicCategoryProducts(category: Category, options?: {
  today?: string;
  snapshot?: PublicProductCatalogSnapshot;
}): Promise<PublicCategoryProduct[]> {
  const store = getStore();
  const snapshot = options?.snapshot ?? await loadPublicProductCatalogSnapshot();
  const { suppliers, products: allProducts, categories: knownCategories } = snapshot;
  // "Hôm nay" do server truyền vào (chuỗi YYYY-MM-DD UTC) — module xếp hạng thuần không
  // đọc đồng hồ; check script bơm ngày cố định để assert được kết quả.
  const today = options?.today ?? new Date().toISOString().slice(0, 10);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const categoryFor = (product: SupplierProduct) => {
    if (!snapshot.categoryByProduct.has(product.id)) {
      snapshot.categoryByProduct.set(product.id, publicProductCategorySlug(product, knownCategories));
    }
    return snapshot.categoryByProduct.get(product.id);
  };
  const candidates = allProducts.filter((p) =>
    byId.has(p.supplier_id) &&
    // A published test profile can be inspected at its own URL, but is not a market listing.
    (!isSyntheticSupplier(byId.get(p.supplier_id)!) || byId.get(p.supplier_id)?.is_demo) &&
    productReviewApproved(p) && !isTestOnlyProduct(p.name) &&
    (p.ready_for_buyer || byId.get(p.supplier_id)?.is_demo) &&
    categoryFor(p) === category.slug);
  const media = await cachedByOwner(candidates.map((p) => p.id), snapshot.mediaByProduct,
    (ids) => store.listMediaForProducts(ids), (asset) => asset.product_id);
  const byProduct = new Map<string, MediaAsset[]>();
  for (const asset of media) {
    if (!asset.product_id) continue;
    const group = byProduct.get(asset.product_id) ?? [];
    if (!byProduct.has(asset.product_id)) byProduct.set(asset.product_id, group);
    group.push(asset);
  }
  // Only L1 needs the existing certificate validity check. Failed pages must be
  // surfaced, not treated as "no certificates" and silently change ranking.
  const l1SupplierIds = [...new Set(candidates
    .filter((p) => byId.get(p.supplier_id)?.approved_verification_steps.includes(1))
    .map((p) => p.supplier_id))];
  const certificates = await cachedByOwner(l1SupplierIds, snapshot.certificatesBySupplier, async (ids) => {
    if (typeof store.listCertificatesForSuppliers === "function") return store.listCertificatesForSuppliers(ids);
    const rows: Certificate[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      rows.push(...(await Promise.all(ids.slice(i, i + 40).map((id) => store.listCertificates(id)))).flat());
    }
    return rows;
  }, (cert) => cert.supplier_id);
  const certsBySupplier = new Map<string, Certificate[]>();
  for (const cert of certificates) {
    const group = certsBySupplier.get(cert.supplier_id) ?? [];
    if (!certsBySupplier.has(cert.supplier_id)) certsBySupplier.set(cert.supplier_id, group);
    group.push(cert);
  }
  const evidenceBySupplier = new Map(suppliers.map((s) =>
    [s.id, evidenceValidVerificationSteps(s.approved_verification_steps, certsBySupplier.get(s.id) ?? [], today)]));
  // GĐ2 xếp hạng: hàm thuần lib/public/ranking.ts + trọng số đặc tả (30/30/15/15/10).
  // Tầng xác minh vẫn CỨNG (B2) nên bật điểm chỉ đổi thứ tự TRONG TẦNG; bậc xen kẽ NCC
  // (arrangeSupplierProducts) và cổng công khai giữ nguyên chỗ cũ. Trọng số 0 vẫn tái
  // tạo đúng sort cũ (property test trong scripts/check-marketplace-ranking.mjs).
  const readyRecords = candidates.filter((p) => byId.get(p.supplier_id)?.is_demo || productReadiness(byProduct.get(p.id) ?? []).ready)
    .map((product) => ({
      product, supplier: byId.get(product.supplier_id)!, category,
      card: projectPublicCategoryProduct(product, byId.get(product.supplier_id)!, category, byProduct.get(product.id) ?? [], evidenceBySupplier.get(product.supplier_id)!),
    }));
  const projected = process.env.VEXIM_QUANTITY_BUYER_PREVIEW === "true"
    ? await (await import("@/lib/public/quantity-catalog-preview")).projectQuantityCatalogPreview(readyRecords)
    : readyRecords;
  return rankPublicCategoryProducts(projected.map(({ card }) => card), SPEC_RANKING_WEIGHTS);
}

export interface PublicProductRecord {
  card: PublicCategoryProduct;
  product: SupplierProduct;
  supplier: PublicSupplierCard;
  category: Category;
}

/**
 * Resolve a small ID list through the same publication, review, category, media and
 * price projection as the category catalogue. Raw records stay on the server.
 */
export async function getPublicProductRecordsByIds(ids: readonly string[]): Promise<PublicProductRecord[]> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  if (!uniqueIds.length) return [];
  const store = getStore();
  const [products, suppliers, categories] = await Promise.all([
    Promise.all(uniqueIds.map((id) => store.getProduct(id))),
    listPublicSuppliers(),
    store.listCategories({ publishedOnly: false }),
  ]);
  const bySupplier = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const candidates: Array<Omit<PublicProductRecord, "card">> = [];
  for (const product of products) {
    if (!product) continue;
    const supplier = bySupplier.get(product.supplier_id);
    if (!supplier || supplier.is_demo || isSyntheticSupplier(supplier) ||
      !productReviewApproved(product) || isTestOnlyProduct(product.name) || !product.ready_for_buyer) continue;
    const category = categories.find((candidate) =>
      candidate.status === "published" && candidate.is_published && productBelongsToCategory(product, candidate, categories));
    if (category) candidates.push({ product, supplier, category });
  }
  if (!candidates.length) return [];

  const media = await store.listMediaForProducts(candidates.map(({ product }) => product.id));
  const readyRecords = candidates.filter(({ product }) =>
    productReadiness(media.filter((asset) => asset.product_id === product.id)).ready)
    .map(({ product, supplier, category }) => ({
      product,
      supplier,
      category,
      card: projectPublicCategoryProduct(product, supplier, category, media.filter((asset) => asset.product_id === product.id)),
    }));
  return process.env.VEXIM_QUANTITY_BUYER_PREVIEW === "true"
    ? (await import("@/lib/public/quantity-catalog-preview")).projectQuantityCatalogPreview(readyRecords)
    : readyRecords;
}
