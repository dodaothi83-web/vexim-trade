import { getStore } from "@/lib/db";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";

/** Làm mới nội dung sau tối đa 60 giây, cùng nhịp với sitemap. */
export const revalidate = 60;

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

/**
 * Bản đồ gọn cho các hệ thống AI: chỉ liệt kê trang công khai cốt lõi,
 * danh mục đang đăng và hồ sơ nhà cung cấp đạt điều kiện hiển thị cho
 * máy tìm kiếm. Không liệt kê trang rỗng hay dữ liệu mẫu.
 */
export async function GET(): Promise<Response> {
  const lines: string[] = [
    "# Vexim Trade — Verified Vietnam Food & Agriculture Sourcing",
    "",
    "> Vexim Trade connects international and domestic buyers with verified Vietnamese food and agricultural manufacturers and exporters across core categories (cashew kernels, green & roasted coffee, black & white pepper, cassia cinnamon & star anise, coconut products, fragrant & export rice, processed fruits & vegetables, and frozen seafood). Buyers can browse supplier listings and request a quote from a supplier they choose. If they have not found the right fit, they can send a request for quotation (RFQ) and we look for suppliers that match their specs, quantity and market. Suppliers are matched on buyer requirements only; paid listings do not affect recommendations. Supplier checks are shown separately for documents, factory verification and delivery history. Automated certificate recognition labels each quality certificate (HACCP, ISO 22000, BRC, Halal, FDA, Organic) as Owner or Partner Entity with its expiration date. For Vietnamese manufacturers, Vexim also offers free marketplace listing, international trade website design, featured placement, and US FDA regulatory compliance consulting. After an introduction, buyers contract directly with the chosen supplier; Vexim does not take orders or hold payments online.",
    "",
    "## Core pages",
    `- [Home](${SITE_URL}/): Search Vietnamese food & agricultural product categories, key product sub-groups, market insights, supplier growth solutions, and FAQs (bilingual English/Vietnamese, default English).`,
    `- [How we verify](${SITE_URL}/how-we-verify): The three independent checks behind supplier verification badges: business documents & automated certificate recognition, factory verification, and export delivery history review.`,
    `- [For suppliers](${SITE_URL}/for-suppliers): How Vietnamese food manufacturers join Vexim Trade, verify their profiles, and register for export growth & FDA compliance services.`,
  ];

  if (INDEXABLE) {
    const store = getStore();
    const [categories, suppliers] = await Promise.all([
      store.listCategories({ publishedOnly: true }).catch(() => []),
      listPublicSuppliers().catch(() => []),
    ]);

    if (categories.length) {
      lines.push("", "## Product categories");
      for (const c of categories) {
        const name = c.name_i18n?.en || c.slug;
        lines.push(`- [${name}](${SITE_URL}/products/${encodeURIComponent(c.slug)}): Verified Vietnamese ${name} suppliers and products.`);
      }
    }

    const indexableSuppliers = suppliers.filter((s) => supplierProfileIndexable(s)).slice(0, 100);
    if (indexableSuppliers.length) {
      lines.push("", "## Supplier profiles");
      for (const s of indexableSuppliers) {
        const name = s.display_name || s.name;
        const url = `${SITE_URL}/suppliers/${encodeURIComponent(s.slug || s.id)}`;
        const area = s.province ? `, ${s.province}` : "";
        lines.push(`- [${name}](${url}): Verified supplier in Vietnam${area}.`);
      }
    }
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
