import "server-only";

import { getStore } from "@/lib/db";
import { publicProductAttributes } from "@/lib/product-attributes";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { listPublicSuppliers, type PublicSupplierCard } from "@/lib/public/catalog";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved, publicProductPrice, publicProductPricePoint, withoutDirectContacts } from "@/lib/public/product-selection";
import { resolveGrade } from "@/lib/public/grade-resolution";
import { evidenceValidVerificationSteps, rankPublicCategoryProducts, SPEC_RANKING_WEIGHTS } from "@/lib/public/ranking";
import { publicProductTitle } from "@/lib/public/display-name";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { publicProductMoqDisplay, publicProductPlaceDisplay } from "@/lib/public/product-detail-display";
import type { Certificate, Category, MediaAsset, SupplierProduct, VerificationLevel } from "@/lib/types";

/** The client receives only a public projection — never supplier contacts, private media or internal notes. */
export interface PublicCategoryProduct {
  id: string;
  name: string;
  grade: string | null;
  attributes: Record<string, string>;
  moq: string;
  price: string | null;
  /** Số liệu thô để tính khoảng giá tham khảo; null khi giá chưa được phép công khai. */
  pricePoint: { value: number; unit: string | null; currency: string | null; updatedAt: string | null } | null;
  /** Hồ sơ demo không được tham gia vào khoảng giá thị trường. */
  isDemoSupplier: boolean;
  province: string;
  /** Saved product English only; empty when this product's source has not been translated. */
  rawMaterialRegion: string;
  inputMaterialOrigin: string;
  verificationCount: number;
  verificationSteps: VerificationLevel[];
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
  return {
    // Tên công khai: bản soạn sẵn nếu có, không thì tên gốc. Danh mục vẫn
    // suy từ tên gốc (productBelongsToCategory ở trên), không suy từ tên này.
    id: p.id, name: withoutDirectContacts(publicProductTitle(p)),
    // Trường có cấu trúc thắng tên gõ tay. Tên chỉ còn là nguồn dự phòng cho
    // sản phẩm chưa được khai, và là nguồn để cảnh báo khi hai bên lệch nhau.
    grade: resolveGrade({
      name: p.name, spec: p.spec, categorySlug: category.slug, attributes,
    }).value,
    attributes,
    moq: publicProductMoqDisplay(p.moq) || "On request",
    price: publicProductPrice(p, s), pricePoint: publicProductPricePoint(p, s), isDemoSupplier: !!s.is_demo, province: supplierProvinceDisplay(s) || "Vietnam",
    rawMaterialRegion: publicProductPlaceDisplay(tradeEnglish?.raw_material_region),
    inputMaterialOrigin: tradeEnglish?.input_material_origin?.trim() || "",
    verificationCount: s.approved_verification_steps.length, verificationSteps: s.approved_verification_steps,
    evidenceValidSteps: evidenceValidSteps ?? s.approved_verification_steps.length,
    supplierName: withoutDirectContacts(s.display_name || s.trade_name || s.name),
    supplierId: s.id, supplierSlug: s.slug || null, supplierProfileImage: s.profile_image ?? null, supplierFoundedYear: s.founded_year ?? null,
    leadTimeDays: p.lead_time_days ?? null, incoterm: p.incoterm ?? null, oem: !!p.oem, odm: !!p.odm, samples: !!p.samples,
    isDemo: !!s.is_demo, imagePaths: images,
    cardImagePath: shareableProductImages(media, p.id, p.featured_media_id, 1, true)[0] ?? null,
  };
}

export async function listPublicCategoryProducts(category: Category, options?: { today?: string }): Promise<PublicCategoryProduct[]> {
  const store = getStore();
  const [suppliers, allProducts, knownCategories] = await Promise.all([
    listPublicSuppliers(), store.listProducts(), store.listCategories({ publishedOnly: false }),
  ]);
  // "Hôm nay" do server truyền vào (chuỗi YYYY-MM-DD UTC) — module xếp hạng thuần không
  // đọc đồng hồ; check script bơm ngày cố định để assert được kết quả.
  const today = options?.today ?? new Date().toISOString().slice(0, 10);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const candidates = allProducts.filter((p) =>
    byId.has(p.supplier_id) &&
    // A published test profile can be inspected at its own URL, but is not a market listing.
    (!isSyntheticSupplier(byId.get(p.supplier_id)!) || byId.get(p.supplier_id)?.is_demo) &&
    productReviewApproved(p) && !isTestOnlyProduct(p.name) &&
    (p.ready_for_buyer || byId.get(p.supplier_id)?.is_demo) &&
    productBelongsToCategory(p, category, knownCategories));
  const media: MediaAsset[] = [];
  // Bounded batches keep the Supabase URL and result size reasonable for large catalogs.
  for (let i = 0; i < candidates.length; i += 80) {
    media.push(...await store.listMediaForProducts(candidates.slice(i, i + 80).map((p) => p.id)));
  }
  const byProduct = new Map<string, MediaAsset[]>();
  for (const asset of media) {
    if (!asset.product_id) continue;
    const group = byProduct.get(asset.product_id) ?? [];
    if (!byProduct.has(asset.product_id)) byProduct.set(asset.product_id, group);
    group.push(asset);
  }
  // GĐ2 evidence: chỉ NCC đã duyệt L1 mới cần đối chiếu chứng nhận — L2/L3 là xác minh
  // theo sự kiện, không có khái niệm hết hạn. Lỗi đọc CSDL của một NCC thì coi như
  // không có chứng nhận (fail-open), không giấu NCC khỏi lưới.
  const l1SupplierIds = [...new Set(candidates
    .filter((p) => byId.get(p.supplier_id)?.approved_verification_steps.includes(1))
    .map((p) => p.supplier_id))];
  const certificates: Certificate[] = [];
  for (let i = 0; i < l1SupplierIds.length; i += 40) {
    certificates.push(...(await Promise.all(l1SupplierIds.slice(i, i + 40)
      .map((id) => store.listCertificates(id).catch(() => [] as Certificate[])))).flat());
  }
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
  return rankPublicCategoryProducts(
    candidates.filter((p) => byId.get(p.supplier_id)?.is_demo || productReadiness(byProduct.get(p.id) ?? []).ready)
      .map((p) => projectPublicCategoryProduct(p, byId.get(p.supplier_id)!, category, byProduct.get(p.id) ?? [], evidenceBySupplier.get(p.supplier_id)!)),
    SPEC_RANKING_WEIGHTS,
  );
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
  return candidates.filter(({ product }) =>
    productReadiness(media.filter((asset) => asset.product_id === product.id)).ready)
    .map(({ product, supplier, category }) => ({
      product,
      supplier,
      category,
      card: projectPublicCategoryProduct(product, supplier, category, media.filter((asset) => asset.product_id === product.id)),
    }));
}
