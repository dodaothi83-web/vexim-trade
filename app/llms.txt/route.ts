import { getStore } from "@/lib/db";
import { COMPANY } from "@/lib/config";
import { publicProductPlaceDisplay } from "@/lib/public/product-detail-display";
import { supplierProvinceDisplay } from "@/lib/public/supplier-english";
import { supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { listCachedPublicSuppliers } from "@/lib/public/product-catalog";

/** Làm mới nội dung sau tối đa 60 giây, cùng nhịp với sitemap. */
export const revalidate = 60;

const NON_PRODUCTION = ["preview", "development"].includes(process.env.VERCEL_ENV ?? "") || process.env.VEXIM_DEPLOY_ENV === "staging";
const INDEXABLE = !NON_PRODUCTION && process.env.PUBLIC_SITE_INDEXABLE === "true";

/**
 * Bản đồ gọn cho các hệ thống AI: chỉ liệt kê trang công khai cốt lõi,
 * danh mục đang đăng và hồ sơ nhà cung cấp đạt điều kiện hiển thị cho
 * máy tìm kiếm. Không liệt kê trang rỗng hay dữ liệu mẫu.
 */
export async function GET(): Promise<Response> {
  // Cùng cổng chặn với robots.txt/sitemap.xml: host staging không được quảng bá
  // danh mục, hồ sơ và URL canonical của bản production.
  const lines: string[] = [
    `# ${SITE_NAME} — Verified Vietnam Food & Agriculture Sourcing`,
    "",
    "> Vexim Trade connects international and domestic buyers with verified Vietnamese food and agricultural manufacturers and exporters across core categories (cashew kernels, green & roasted coffee, black & white pepper, cassia cinnamon & star anise, coconut products, fragrant & export rice, processed fruits & vegetables, and frozen seafood). Buyers can browse supplier listings and request a quote from a supplier they choose. If they have not found the right fit, they can send a request for quotation (RFQ) and we look for suppliers that match their specs, quantity and market. Suppliers are matched on buyer requirements only; paid listings do not affect recommendations. Supplier checks are shown separately for documents, factory verification and delivery history. Automated certificate recognition labels each quality certificate (HACCP, ISO 22000, BRC, Halal, FDA, Organic) as Owner or Partner Entity with its expiration date. For Vietnamese manufacturers, Vexim also offers free marketplace listing, international trade website design, featured placement, and US FDA regulatory compliance consulting. After an introduction, buyers contract directly with the chosen supplier; Vexim does not take orders or hold payments online.",
    "",
    // GEO: các dữ kiện định danh/liên hệ ngắn, chép lại được nguyên văn khi một hệ
    // thống AI cần nêu nguồn. Chỉ dùng dữ liệu đã công khai ở chân trang và ở
    // trang thông tin chủ quản (xem app/(legal)/thong-tin-chu-quan).
    "## Key facts",
    `- Legal entity: ${COMPANY.legalName}`,
    "- What it is: a business-to-business sourcing and supplier-discovery platform for Vietnamese food and agricultural products. It is not a marketplace that takes orders, holds payments or guarantees shipments.",
    "- Buyers pay nothing to search, compare or send an RFQ. Vexim earns from services sold to Vietnamese suppliers.",
    "- Supplier checks are Vexim's own reviews (documents, production source, export history). They are not third-party audits and do not certify a product.",
    "- Reference prices are supplier-stated indicative quotes within a valid date window, not binding offers.",
    `- Contact: ${COMPANY.contactEmail} · ${COMPANY.phoneDisplay}`,
    `- Country: Vietnam · Address: ${COMPANY.addressEn}`,
    `- Canonical host: ${SITE_URL} (the non-www domain redirects here).`,
    "",
    "## Core pages",
    `- [Home](${SITE_URL}/): Search Vietnamese food & agricultural product categories, key product sub-groups and market insights (bilingual English/Vietnamese, default English).`,
    `- [How it works](${SITE_URL}/how-it-works): Buyer guide to searching products, comparing up to 3 listings, reading verification badges, requesting a quote from a chosen supplier, or sending open requirements when looking for matching factories.`,
    `- [How we verify](${SITE_URL}/how-we-verify): The three separate checks Vexim carries out behind supplier verification badges: business documents & certificate recognition, factory review by live video call or on-site visit, and export delivery history review. These are Vexim's own reviews, not third-party audits.`,
    `- [For suppliers](${SITE_URL}/for-suppliers): How Vietnamese food manufacturers join Vexim Trade, list products free and verify their profiles.`,
    `- [News](${SITE_URL}/blog): Buying guides and Vietnam market updates for importers.`,
    `- [Sitemap](${SITE_URL}/sitemap.xml): Every public URL Vexim currently advertises to crawlers.`,
    "",
  ];

  if (INDEXABLE) {
    const store = getStore();
    const [categories, suppliers] = await Promise.all([
      store.listCategories({ publishedOnly: true }).catch(() => []),
      listCachedPublicSuppliers().catch(() => []),
    ]);

    const published = categories.filter((c) => c.status === "published" && c.is_published);
    if (published.length) {
      lines.push("## Product categories");
      for (const c of published) {
        const name = c.name_i18n?.en || c.slug;
        const vi = c.name_i18n?.vi && c.name_i18n.vi !== name ? ` (Vietnamese: ${c.name_i18n.vi})` : "";
        lines.push(`- [${name}](${SITE_URL}/products/${encodeURIComponent(c.slug)}): Verified Vietnamese ${name} suppliers and products${vi}.`);
      }
      lines.push("");
    }

    const indexableSuppliers = suppliers.filter((s) => supplierProfileIndexable(s)).slice(0, 100);
    if (indexableSuppliers.length) {
      lines.push("## Supplier profiles");
      for (const s of indexableSuppliers) {
        const name = s.display_name || s.name;
        const url = `${SITE_URL}/suppliers/${encodeURIComponent(s.slug || s.id)}`;
        // Tỉnh/thành phải là bản tiếng Anh như phần còn lại của tệp: trước đây
        // in thẳng cột `province` nên ra "Hồ Chính Minh" giữa văn bản tiếng Anh.
        const province = publicProductPlaceDisplay(supplierProvinceDisplay(s));
        const area = province ? `, ${province}` : ", Vietnam";
        const steps = s.approved_verification_steps?.length ?? 0;
        const checked = steps ? ` · ${steps}/3 Vexim checks approved` : "";
        lines.push(`- [${name}](${url}): Vietnamese food & agricultural supplier based in ${area}${checked}.`);
      }
      lines.push("");
    }
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Nội dung đổi theo danh mục/hồ sơ mới; để crawler đọc lại bản mới nhưng
      // vẫn dùng được bản cũ trong lúc chờ.
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
