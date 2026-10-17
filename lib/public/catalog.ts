/**
 * Helpers cho trang công khai (SSR). Mọi hàm ở đây đều an toàn import ở server
 * components; KHÔNG import từ client components.
 */
import "server-only";

import { getStore } from "@/lib/db";
import { productReadiness } from "@/lib/media/readiness";
import type { Category, MediaAsset, Supplier, SupplierProduct, SupplierType, VerificationLevel } from "@/lib/types";
import { approvedPublicReviewSummaries, approvedVerificationSteps, type PublicReviewSummaries } from "@/lib/verification-status";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved } from "@/lib/public/product-selection";

/** Ngôn ngữ hiện tại của trang công khai. MVP chỉ có tiếng Anh; i18n theo subfolder /ja/.. làm sau. */
export const DEFAULT_LOCALE = "en";

/** Lấy chuỗi dịch theo ngôn ngữ, fallback về tiếng Anh. */
export function t(i18n: Record<string, string> | null | undefined, locale: string = DEFAULT_LOCALE): string {
  if (!i18n) return "";
  return i18n[locale] ?? i18n[DEFAULT_LOCALE] ?? Object.values(i18n)[0] ?? "";
}

/** Nhãn hiển thị cho loại hình nhà cung cấp. */
export const SUPPLIER_TYPE_LABEL: Record<SupplierType | "none", string> = {
  manufacturer: "Manufacturer",
  trading: "Trading company",
  cooperative: "Cooperative",
  none: "Supplier",
};

export function supplierTypeLabel(s: Supplier): string {
  const key = (s.supplier_type ?? "none") as SupplierType | "none";
  return SUPPLIER_TYPE_LABEL[key] ?? SUPPLIER_TYPE_LABEL.none;
}

export interface PublicSupplierCard extends Supplier {
  categories: Category[];
  primary_category: Category | null;
  main_products: SupplierProduct[];
  gallery_images: string[];      // storage_path các ảnh buyer-shareable
  public_review_summaries: PublicReviewSummaries;
  approved_verification_steps: VerificationLevel[];
}

function buyerVisibleProduct(p: SupplierProduct, categories: Category[], demo = false): boolean {
  return productReviewApproved(p) && (p.ready_for_buyer || demo) && !isTestOnlyProduct(p.name) &&
    categories.some((c) => c.status === "published" && c.is_published && productBelongsToCategory(p, c, categories));
}

/**
 * Lấy danh sách NCC công khai cho trang danh mục.
 * Public site đọc trực tiếp bảng suppliers (chỉ status='published') để còn lọc linh
 * hoạt theo cột; trong tuần 1 MVP, code lọc tay vì view v_public_suppliers ẩn tạm
 * những supplier chưa published.
 *
 * Demo suppliers (is_demo=true) bị loại khỏi list công khai trừ khi:
 *   - VEXIM_SHOW_DEMO="true" trên môi trường preview/staging, hoặc
 *   - caller truyền includeDemo=true (chỉ dùng cho staff / trang preview nội bộ).
 */
export async function listPublicSuppliers(options?: {
  categorySlug?: string;
  includeDemo?: boolean;
}): Promise<PublicSupplierCard[]> {
  const showDemo =
    options?.includeDemo === true ||
    process.env.VEXIM_SHOW_DEMO === "true";
  const store = getStore();
  const [suppliers, products, categories] = await Promise.all([
    store.listSuppliers(),
    store.listProducts(),
    typeof store.listCategories === "function"
      ? store.listCategories({ publishedOnly: true })
      : Promise.resolve([] as Category[]),
  ]);

  const filtered = suppliers.filter((s) => {
    if (s.status !== "published") return false;
    if (s.is_demo && !showDemo) return false;
    return true;
  });
  const bySupplier = new Map<string, SupplierProduct[]>();
  for (const p of products) {
    if (!bySupplier.has(p.supplier_id)) bySupplier.set(p.supplier_id, []);
    bySupplier.get(p.supplier_id)!.push(p);
  }

  const baseCards = filtered.map((s) => ({
    ...s,
    categories: [] as Category[],
    primary_category: null as Category | null,
    main_products: (bySupplier.get(s.id) ?? []).filter((p) => buyerVisibleProduct(p, categories, !!s.is_demo)).slice(0, 4),
    gallery_images: [] as string[],
    public_review_summaries: {} as PublicReviewSummaries,
    approved_verification_steps: [] as VerificationLevel[],
  }));

  // Load approvals for EVERY public supplier; do not infer passed steps from
  // verification_level (e.g. delivery may pass without a factory visit).
  // Bound concurrency while keeping the earlier gallery-media limit.
  for (let i = 0; i < baseCards.length; i += 40) {
    await Promise.all(baseCards.slice(i, i + 40).map(async (c, offset) => {
      try {
        const [media, vers] = await Promise.all([
          i + offset < 50 ? store.listMedia("supplier", c.id).catch(() => []) : Promise.resolve([] as MediaAsset[]),
          store.listVerifications(c.id).catch(() => []),
        ]);
        c.gallery_images = media
          .filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path)
          .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
          .map((m) => m.storage_path!)
          .slice(0, 6);
        // Even demo listings must not imply a check from the legacy numeric maximum.
        c.approved_verification_steps = approvedVerificationSteps(vers);
        c.public_review_summaries = approvedPublicReviewSummaries(vers);
      } catch { /* best effort */ }
    }));
  }

  let cards: PublicSupplierCard[] = baseCards;

  if (options?.categorySlug) {
    const cat = categories.find((c) => c.slug === options.categorySlug);
    // Only an actual product in the requested category qualifies; supplier blurbs
    // must never pull an unrelated product/supplier onto a category page.
    cards = cat ? cards.filter((s) => (bySupplier.get(s.id) ?? []).some((p) =>
      buyerVisibleProduct(p, categories, !!s.is_demo) && productBelongsToCategory(p, cat, categories)))
      .map((s) => ({ ...s, main_products: s.main_products.filter((p) =>
        productBelongsToCategory(p, cat, categories)) })) : [];
  }

  // Sort by actual approved review count, not the legacy maximum level.
  cards.sort((a, b) => {
    const av = a.approved_verification_steps.length;
    const bv = b.approved_verification_steps.length;
    if (bv !== av) return bv - av;
    const score = (s: Supplier) =>
      (s.products ? 1 : 0) + (s.province ? 1 : 0) + (s.moq_text ? 1 : 0) + (s.lead_time_days ? 1 : 0);
    const aScore = score(a);
    const bScore = score(b);
    if (bScore !== aScore) return bScore - aScore;
    return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
  });

  return cards;
}

export async function getPublicSupplierBySlug(slug: string): Promise<PublicSupplierCard | null> {
  const list = await listPublicSuppliers();
  const supplier = list.find((s) => s.slug === slug || (!s.slug && s.id === slug)) ?? null;
  if (!supplier) return null;
  const store = getStore();
  // Thêm tất cả sản phẩm của NCC (listPublicSuppliers chỉ lấy 4)
  const [products, categories, media, vers] = await Promise.all([
    store.listProductsBySupplier(supplier.id),
    store.listCategories({ publishedOnly: true }),
    store.listMedia("supplier", supplier.id).catch(() => []),
    store.listVerifications(supplier.id).catch(() => []),
  ]);
  const eligible = products.filter((p) => buyerVisibleProduct(p, categories, !!supplier.is_demo));
  const productMedia: MediaAsset[] = [];
  if (!supplier.is_demo) {
    for (let i = 0; i < eligible.length; i += 80) {
      productMedia.push(...await store.listMediaForProducts(eligible.slice(i, i + 80).map((p) => p.id)));
    }
  }
  const publicProducts = eligible.filter((p) => supplier.is_demo || productReadiness(productMedia.filter((m) => m.product_id === p.id)).ready);
  const gallery = media
    .filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((m) => m.storage_path!)
    .slice(0, 12);
  return {
    ...supplier,
    main_products: publicProducts,
    gallery_images: gallery,
    approved_verification_steps: vers.length ? approvedVerificationSteps(vers) : supplier.approved_verification_steps,
    public_review_summaries: approvedPublicReviewSummaries(vers),
  };
}

export async function getPublicSuppliersByIds(ids: string[]): Promise<PublicSupplierCard[]> {
  const all = await listPublicSuppliers();
  const map = new Map(all.map((s) => [s.id, s]));
  return ids.map((id) => map.get(id)).filter((s): s is PublicSupplierCard => Boolean(s));
}

/** Tạo chuỗi sản phẩm chính để hiển thị trên card */
export function mainProductNames(products: SupplierProduct[], max = 3): string {
  return products
    .slice(0, max)
    .map((p) => p.name)
    .join(" · ");
}
