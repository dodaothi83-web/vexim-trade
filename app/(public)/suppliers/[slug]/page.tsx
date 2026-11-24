import Link from "next/link";
import { categoryPathOf, certificateLabelsForProducts } from "@/lib/public/certificate-badges";
import { readCategoryCertificateData } from "@/lib/public/category-certificate-data";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/ui";
import { SupplierStorefront } from "@/components/public/supplier-storefront";
import { DownloadFactoryReport } from "@/components/download-factory-report";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import { getPublicSupplierBySlug, supplierTypeLabel } from "@/lib/public/catalog";
import { supplierChatAvailable } from "@/lib/chat/service";
import { SupplierChatButton } from "@/components/public/supplier-chat-button";
import { cache, Suspense } from "react";
import { getStore } from "@/lib/db";
import { publicSupplierCertificates } from "@/lib/public/certificates";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import { publicProductTitle } from "@/lib/public/display-name";
import { supplierNameCase, supplierShortName } from "@/lib/public/supplier-name";
import { supplierAddressDisplay, supplierProvinceDisplay, supplierSummaryDisplay } from "@/lib/public/supplier-english";
import { isSyntheticSupplier, safeJsonLd, supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";
import { SupplierTrafficBeacon } from "@/components/supplier-traffic-beacon";
import { listCachedPublicSuppliers } from "@/lib/public/product-catalog";
import { absolutePublicMediaUrl, publicMediaUrl } from "@/lib/media/public-url";
import { publicSupplierImagePath } from "@/lib/media/public-image-path";

/**
 * Trang dựng sẵn (ISR) phục vụ từ CDN thay vì render lại mỗi lượt xem (từng là force-dynamic chỉ
 * vì đọc hai cookie phiên). Bản này KHÔNG đọc cookie/phiên — đọc là Next.js buộc render động:
 *  - Đếm lượt xem: beacon gửi id + slug nhà cung cấp; /api/public/traffic tự tra lại hồ sơ
 *    (đã công khai, đúng slug, không phải hồ sơ thử) và tự bỏ qua người có phiên nhân viên/NCC.
 *    Không nhúng mã ký có hạn vào HTML vì HTML được giữ trong cache.
 *  - Nút tải báo cáo nhà máy tự biết người mua đã đăng nhập hay chưa ở trình duyệt
 *    (useBuyerEnquiryAuth); API báo cáo vẫn bắt buộc đăng nhập.
 * Làm mới mỗi giờ và ngay khi CRM/cổng NCC gọi revalidatePath("/suppliers/<slug>").
 */
// 1 giờ (chủ dự án duyệt 24/11/2026); NCC/nhân viên sửa thì làm mới ngay (revalidatePath/Tag).
export const revalidate = 3600;

/** Không dựng sẵn lúc build (cần CSDL): mỗi hồ sơ được dựng ở lượt xem đầu rồi giữ trong cache. */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  return [];
}

type PageProps = { params: Promise<{ slug: string }> };
// Ảnh đại diện/ảnh bìa mới trỏ thẳng tới R2; ảnh khác vẫn qua /public-media (xem lib/media/public-url.ts).
const mediaUrl = publicMediaUrl;
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

/**
 * Danh sách nhà cung cấp công khai dựng MỘT lần cho mỗi request (React cache): thẻ meta,
 * nội dung trang và khối "Explore other suppliers" trước đây dựng lại ba lần.
 */
const publicSuppliersForRequest = cache(() => listCachedPublicSuppliers());
const supplierBySlug = cache(async (slug: string) => getPublicSupplierBySlug(slug, await publicSuppliersForRequest()));

/**
 * Hồ sơ chưa có slug dùng địa chỉ theo id (/suppliers/<id>); Google và người mua có thể đã lưu
 * địa chỉ đó. Khi hồ sơ được đặt slug sau này, chuyển hướng vĩnh viễn (308) sang địa chỉ slug
 * thay vì báo 404. Chỉ áp dụng cho hồ sơ đang công khai.
 */
async function redirectLegacySupplierUrl(param: string): Promise<void> {
  const supplier = (await publicSuppliersForRequest()).find((s) => s.id === param && s.slug && s.slug !== param);
  if (supplier?.slug) permanentRedirect(`/suppliers/${encodeURIComponent(supplier.slug)}`);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const s = await supplierBySlug(slug);
  if (!s) {
    await redirectLegacySupplierUrl(slug);
    return { title: "Supplier not found", robots: { index: false } };
  }
  // Cùng cách viết tên với tiêu đề H1 (không để "TINIMEX COMPANY LIMITED" viết hoa toàn bộ).
  const name = safe(supplierShortName(s));
  const url = `${SITE_URL}/suppliers/${encodeURIComponent(s.slug || s.id)}`;
  const summary = safe(supplierSummaryDisplay(s)).replace(/\s+/g, " ").trim();
  const description = summary.length > 155 ? `${summary.slice(0, 152).trimEnd()}…` :
    summary || `Explore ${name}'s buyer-ready products and request a quote through Vexim Trade.`;
  const title = `${name} | ${supplierTypeLabel(s)} in ${safe(supplierProvinceDisplay(s)) || "Vietnam"}`;
  const index = process.env.PUBLIC_SITE_INDEXABLE === "true" && supplierProfileIndexable(s);
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { type: "profile", title, description, url, siteName: "Vexim Trade",
      ...(s.profile_image ? { images: [{ url: absolutePublicMediaUrl(publicSupplierImagePath(s, "profile", 1024)!, SITE_URL), alt: name }] } : {}) },
  };
}

export default async function SupplierProfile({ params }: PageProps) {
  const { slug } = await params;
  const s = await supplierBySlug(slug);
  if (!s) {
    await redirectLegacySupplierUrl(slug);
    notFound();
  }

  const store = getStore();
  const [allCategories, rawCerts, rawSupplierMedia] = await Promise.all([
    store.listCategories({ publishedOnly: true }),
    store.listCertificates ? store.listCertificates(s.id).catch(() => []) : [],
    store.listMedia ? store.listMedia("supplier", s.id).catch(() => []) : [],
  ]);
  const categories = allCategories.filter((c) => c.status === "published" && c.is_published);
  const supplierCertificates = publicSupplierCertificates(s.id, rawCerts, rawSupplierMedia);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));
  // Chứng nhận trên thẻ sản phẩm của gian hàng: cùng luật với thẻ ở danh mục và trang chủ.
  const productCertificates = Object.fromEntries(await certificateLabelsForProducts(store, s.main_products.flatMap((p) => {
    const category = productCategory(p);
    return category ? [{ id: p.id, supplierId: s.id, categoryPath: categoryPathOf(category.id, categories) }] : [];
  }), readCategoryCertificateData(store, [s.id], { certificates: rawCerts, media: rawSupplierMedia }))
    .catch(() => new Map<string, string[]>()));
  const name = safe(supplierShortName(s));
  const summary = safe(supplierSummaryDisplay(s));
  const synthetic = isSyntheticSupplier(s);
  const structured = supplierProfileIndexable(s);
  const profileUrl = `${SITE_URL}/suppliers/${encodeURIComponent(s.slug || s.id)}`;
  const coverPath = publicSupplierImagePath(s, "cover");
  const avatarPath = publicSupplierImagePath(s, "profile");
  const coverUrl = coverPath ? mediaUrl(coverPath) : null;
  const avatarUrl = avatarPath ? mediaUrl(avatarPath) : null;
  const steps = s.approved_verification_steps;
  // Chỉ mở chat khi nhà cung cấp có tài khoản cổng đang hoạt động để trả lời.
  const canChat = await supplierChatAvailable(store, s.id).catch(() => false);
  const related = (await publicSuppliersForRequest()).filter((r) => r.id !== s.id && !isSyntheticSupplier(r)).slice(0, 4);
  // A supplier directory lists links, not Product rich-result entities without offers/reviews.
  // Keep the existing public-product gates; never invent prices or ratings for RFQ listings.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${profileUrl}#organization`, name, url: profileUrl,
        description: summary, ...(avatarUrl ? { image: avatarUrl.startsWith("/") ? `${SITE_URL}${avatarUrl}` : avatarUrl } : {}),
        // Năm thành lập và quy mô nhân sự chỉ đưa vào khi vòng kiểm tra giấy tờ
        // đã được phê duyệt, tức hai dữ kiện này đã đối chiếu với hồ sơ doanh nghiệp.
        ...(steps.includes(1) && s.founded_year ? { foundingDate: String(s.founded_year) } : {}),
        ...(steps.includes(1) && s.employees ? { numberOfEmployees: { "@type": "QuantitativeValue", value: s.employees } } : {}),
        address: { "@type": "PostalAddress", ...(safe(supplierAddressDisplay(s)) ? { streetAddress: safe(supplierAddressDisplay(s)) } : {}), addressRegion: safe(supplierProvinceDisplay(s)) || undefined, addressCountry: "VN" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name, item: profileUrl },
      ] },
      { "@type": "ItemList", name: `Products from ${name}`, itemListElement: s.main_products.flatMap((p) => {
        const category = productCategory(p);
        return category ? [{ "@type": "ListItem", name: safe(s.form_product_cards?.[p.id]?.name ?? publicProductTitle(p)),
            url: `${SITE_URL}/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}`,
            ...(s.product_image_paths[p.id] ? { image: absolutePublicMediaUrl(s.product_image_paths[p.id], SITE_URL) } : {}) }] : [];
      }).map((item, index) => ({ ...item, position: index + 1 })) },
    ],
  };

  const countView = !synthetic; // Lượt xem của nhân viên/NCC do /api/public/traffic loại (đọc phiên ở đó).
  return <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    {countView && <SupplierTrafficBeacon pageKey={`profile:${s.id}`} profile={{ supplierId: s.id, slug: s.slug || s.id }} />}
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: name }]} />
    {synthetic && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Test profile · Not a commercial supplier offer. Do not use these details to place an order.</p>}

    <SupplierStorefront
      supplier={s}
      certificates={supplierCertificates}
      productCertificates={productCertificates}
      categories={categories}
      coverUrl={coverUrl}
      avatarUrl={avatarUrl}
      synthetic={synthetic}
      reportAction={synthetic ? undefined : (code) => <DownloadFactoryReport code={code} nextPath={`/suppliers/${encodeURIComponent(slug)}#factory-visit`} />}
      chatAction={canChat ? <Suspense fallback={null}><SupplierChatButton supplierId={s.id} supplierName={name} /></Suspense> : undefined}
    />

    {related.length > 0 && <section className="mt-12" aria-labelledby="related-title">
      <h2 id="related-title" className="text-left text-base font-semibold text-ink-900">Explore other suppliers</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => {
        const relatedName = supplierNameCase(safe(r.display_name || r.name));
        const relatedLogoPath = publicSupplierImagePath(r, "profile");
        const relatedLogoUrl = relatedLogoPath ? mediaUrl(relatedLogoPath) : null;
        // Thẻ cao bằng nhau: tên tối đa 2 dòng, hàng huy hiệu ghim đáy nên bốn thẻ luôn thẳng hàng.
        return <li key={r.id} className="h-full"><Link href={`/suppliers/${encodeURIComponent(r.slug || r.id)}`}
          className="flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 text-left transition hover:border-brand-200 hover:shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-white text-lg font-bold text-brand-700">
              {relatedLogoUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={relatedLogoUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1" /></> : relatedName.charAt(0).toUpperCase() || "S"}
            </div>
            <div className="min-w-0 flex-1">
              <p title={relatedName} className="line-clamp-2 break-words text-left text-base font-semibold leading-6 text-ink-900">{relatedName}</p>
              <p className="mt-1 text-xs text-ink-600">{safe(supplierProvinceDisplay(r)) || "Vietnam"} · {supplierTypeLabel(r)}</p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3"><VerificationPips levels={r.approved_verification_steps} l2Scope={r.approved_l2_scope ?? null} variant="marketplace" shortTooltips /><VerificationTierBadge levels={r.approved_verification_steps} /></div>
        </Link></li>;
      })}</ul>
    </section>}
  </div>;
}
