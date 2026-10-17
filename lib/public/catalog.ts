/**
 * Helpers cho trang công khai (SSR). Mọi hàm ở đây đều an toàn import ở server
 * components; KHÔNG import từ client components.
 */
import "server-only";

import { getStore } from "@/lib/db";
import { productReadiness } from "@/lib/media/readiness";
import type { Category, MediaAsset, Supplier, SupplierProduct, SupplierType } from "@/lib/types";
import { isTestOnlyProduct, productBelongsToCategory } from "@/lib/public/product-selection";

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

/** Hiển thị cấp xác minh: null/0 = "Not yet verified"; 1/2/3 = Verified level N. */
export interface VerificationBadgeInfo {
  text: string;
  tone: "gray" | "slate" | "emerald";
}
export function verificationBadge(s: Pick<Supplier, "verification_level" | "verified_at" | "status">): VerificationBadgeInfo {
  if (s.status !== "published" || !s.verification_level || s.verification_level < 1) {
    return { text: "Under audit", tone: "gray" };
  }
  if (s.verification_level >= 3) return { text: "Delivery history reviewed", tone: "emerald" };
  if (s.verification_level === 2) return { text: "Factory visited", tone: "emerald" };
  return { text: "Documents checked", tone: "slate" };
}

/** Định dạng khoảng giá FOB (chỉ gọi khi public thấy). */
export function formatFob(s: Pick<Supplier, "fob_min" | "fob_max" | "fob_unit" | "fob_currency" | "fob_updated_at" | "fob_publicly_visible">): string | null {
  if (!s.fob_publicly_visible || !s.fob_updated_at) return null;
  const expired = Date.now() - new Date(s.fob_updated_at).getTime() > 180 * 24 * 3600 * 1000;
  if (expired) return null;
  const unit = s.fob_unit ? `/${s.fob_unit}` : "";
  const cur = s.fob_currency ?? "USD";
  if (s.fob_min != null && s.fob_max != null && s.fob_max !== s.fob_min) {
    return `${cur} ${s.fob_min}–${s.fob_max}${unit}`;
  }
  if (s.fob_min != null) return `${cur} ${s.fob_min}${unit}`;
  return null;
}

export interface PublicSupplierCard extends Supplier {
  categories: Category[];
  primary_category: Category | null;
  main_products: SupplierProduct[];
  gallery_images: string[];      // storage_path các ảnh buyer-shareable
  latest_verification_summary: string | null;
}

function buyerVisibleProduct(p: SupplierProduct, categories: Category[], demo = false): boolean {
  return (p.ready_for_buyer || demo) && !isTestOnlyProduct(p.name) &&
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
    latest_verification_summary: null as string | null,
  }));

  // Load media + verifications cho các NCC được hiển thị (giới hạn 50 NCC/lượt)
  const take = baseCards.slice(0, 50);
  await Promise.all(take.map(async (c) => {
    try {
      const [media, vers] = await Promise.all([
        (store.listMedia("supplier", c.id) as Promise<Array<{ kind: string; audience: string; storage_path: string | null; sort_order: number; created_at: string }>>).catch(() => []),
        (store.listVerifications(c.id) as Promise<Array<{ status: string; target_level: number; public_summary_i18n: Record<string,string>; approved_at: string | null }>>).catch(() => []),
      ]);
      c.gallery_images = media
        .filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
        .map((m) => m.storage_path!)
        .slice(0, 6);
      const approved = vers
        .filter((v) => v.status === "approved")
        .sort((a, b) => (b.target_level - a.target_level) || ((b.approved_at ?? "").localeCompare(a.approved_at ?? "")));
      if (approved.length) {
        c.latest_verification_summary = approved[0].public_summary_i18n?.en ?? null;
      }
    } catch { /* best effort */ }
  }));

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

  // Sắp xếp: verification_level desc → độ đầy đủ hồ sơ → tên.
  cards.sort((a, b) => {
    const av = a.verification_level ?? 0;
    const bv = b.verification_level ?? 0;
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
  const approved = vers
    .filter((v) => v.status === "approved")
    .sort((a, b) => (b.target_level - a.target_level) || ((b.approved_at ?? "").localeCompare(a.approved_at ?? "")));
  return {
    ...supplier,
    main_products: publicProducts,
    gallery_images: gallery,
    latest_verification_summary: approved[0]?.public_summary_i18n?.en ?? supplier.latest_verification_summary ?? null,
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
