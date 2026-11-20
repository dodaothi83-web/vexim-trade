/**
 * Dữ liệu cho trình "Thiết kế trang": số liệu, thị trường, sản phẩm đang đăng, phần đầu trang
 * và bố cục "Tạo nhanh từ hồ sơ". Dựng từ cùng thẻ nhà cung cấp mà trang công khai dùng, nên
 * bản xem trước và trang thật khớp nhau. Dùng chung cho cổng nhà cung cấp và CRM.
 */
import { storefrontStatValue } from "@/components/public/premium-storefront";
import type { DesignerProduct } from "@/components/storefront-designer/storefront-designer";
import type { PublicSupplierCard } from "@/lib/public/catalog";
import { publicProductTitle } from "@/lib/public/display-name";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";
import type { StorefrontBlockCategory, StorefrontBlockCertificate } from "@/components/public/storefront-blocks";
import type { Category } from "@/lib/types";
import { supplierShortName } from "@/lib/public/supplier-name";
import { supplierExportMarketsDisplay, supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { buildLayoutFromProfile, type StorefrontLayout } from "@/lib/storefront-layout";
import { STOREFRONT_STATS, type StorefrontStat } from "@/lib/storefront-theme";
import { verificationLabel } from "@/lib/verification-status";
import { VERIFICATION_DISPLAY_ORDER } from "@/lib/types";

const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");
const mediaUrl = (path: string) => `/public-media/${path.replace(/^\//, "")}`;

export interface DesignerData {
  statValues: Partial<Record<StorefrontStat, string>>;
  markets: string[];
  products: DesignerProduct[];
  header: { name: string; location: string; checks: string[]; avatarUrl: string | null; coverUrl: string | null };
  quick: StorefrontLayout | null;
  pro: boolean;
  categories: StorefrontBlockCategory[];
  certificates: StorefrontBlockCertificate[];
}

export function designerDataFromCard(card: PublicSupplierCard, opts: {
  avatarUrl: string | null; coverUrl: string | null; pro: boolean; categories: Category[]; certificates: PublicSupplierCertificate[];
}): DesignerData {
  const statValues = Object.fromEntries(STOREFRONT_STATS.map((stat) => [stat, storefrontStatValue(card, stat)]).filter(([, value]) => value)) as Partial<Record<StorefrontStat, string>>;
  const markets = supplierExportMarketsDisplay(card).map((market) => safe(market)).filter(Boolean);
  // Ảnh sản phẩm đã duyệt công khai; bản xem trước trong cổng hiển thị qua /public-media như trang thật.
  const products: DesignerProduct[] = card.main_products.map((p) => {
    const form = card.form_product_cards?.[p.id];
    const image = form ? form.cardImagePath ?? form.imagePaths[0] : card.product_card_image_paths[p.id];
    return { id: p.id, name: safe(form ? form.name : publicProductTitle(p)), imageUrl: image ? mediaUrl(image) : null };
  });
  // Nhóm sản phẩm theo danh mục (giống trang thật) và chứng nhận đã kiểm tra.
  const groups = new Map<string, StorefrontBlockCategory>();
  for (const p of card.main_products) {
    const category = opts.categories.find((c) => productBelongsToCategory(p, c, opts.categories));
    if (!category) continue;
    const group = groups.get(category.slug) ?? { name: safe(category.name_i18n?.en || category.slug), href: null, count: 0, imageUrl: null };
    group.count++;
    group.imageUrl ??= products.find((x) => x.id === p.id)?.imageUrl ?? null;
    groups.set(category.slug, group);
  }
  const categories = [...groups.values()].sort((a, b) => b.count - a.count);
  const certificates = opts.certificates.map((c) => ({ name: safe(c.shortName || c.name),
    detail: [c.holderMatch === "partner" ? "Held by a partner facility" : "", c.validUntil ? `Valid until ${c.validUntil}` : ""].filter(Boolean).join(" · ") }));
  const province = safe(supplierProvinceDisplay(card));
  const quick = buildLayoutFromProfile({
    supplierId: card.id, theme: card.storefront_theme, showcase: card.showcase_blocks,
    productIds: products.map((p) => p.id), statValues, hasMarkets: markets.length > 0,
    province: province ? `${province}, Vietnam` : "Vietnam", foundedYear: card.founded_year ?? null,
    hasCertificates: certificates.length > 0, categoryGroups: opts.pro && categories.length >= 2,
  });
  return {
    statValues, markets, products,
    header: {
      name: safe(supplierShortName(card)),
      location: province ? `${province}, Vietnam` : "Vietnam",
      checks: VERIFICATION_DISPLAY_ORDER.filter((level) => card.approved_verification_steps.includes(level))
        .map((level) => level === 1 ? "Business registration checked" : verificationLabel(level, card.approved_l2_scope ?? null)),
      avatarUrl: opts.avatarUrl,
      coverUrl: opts.coverUrl,
    },
    quick: quick.blocks.length ? quick : null,
    pro: opts.pro, categories, certificates,
  };
}
