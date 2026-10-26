import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/ui";
import { SupplierStorefront } from "@/components/public/supplier-storefront";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import { getPublicSupplierBySlug, listPublicSuppliers, supplierTypeLabel } from "@/lib/public/catalog";
import { getStore } from "@/lib/db";
import { publicSupplierCertificates } from "@/lib/public/certificates";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import { publicProductTitle } from "@/lib/public/display-name";
import { supplierAddressDisplay, supplierProvinceDisplay, supplierSummaryDisplay } from "@/lib/public/supplier-english";
import { isSyntheticSupplier, safeJsonLd, supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";
import { getSession } from "@/lib/auth/session";
import { createTrafficToken } from "@/lib/traffic/server";
import { SupplierTrafficBeacon } from "@/components/supplier-traffic-beacon";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };
const mediaUrl = (path: string) => `/public-media/${path.replace(/^\//, "")}`;
const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const s = await getPublicSupplierBySlug(slug);
  if (!s) return { title: "Supplier not found", robots: { index: false } };
  const name = safe(s.display_name || s.name);
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
      ...(s.profile_image ? { images: [{ url: `${SITE_URL}${mediaUrl(s.profile_image)}`, alt: name }] } : {}) },
  };
}

export default async function SupplierProfile({ params }: PageProps) {
  const { slug } = await params;
  const s = await getPublicSupplierBySlug(slug);
  if (!s) notFound();

  const store = getStore();
  const categories = (await store.listCategories({ publishedOnly: true }))
    .filter((c) => c.status === "published" && c.is_published);
  const rawCerts = store.listCertificates ? await store.listCertificates(s.id).catch(() => []) : [];
  const rawSupplierMedia = store.listMedia ? await store.listMedia("supplier", s.id).catch(() => []) : [];
  const supplierCertificates = publicSupplierCertificates(s.id, rawCerts, rawSupplierMedia);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));
  const name = safe(s.display_name || s.name);
  const summary = safe(supplierSummaryDisplay(s));
  const synthetic = isSyntheticSupplier(s);
  const structured = supplierProfileIndexable(s);
  const profileUrl = `${SITE_URL}/suppliers/${encodeURIComponent(s.slug || s.id)}`;
  const coverUrl = s.cover_image ? mediaUrl(s.cover_image) : null;
  const avatarUrl = s.profile_image ? mediaUrl(s.profile_image) : null;
  const steps = s.approved_verification_steps;
  const related = (await listPublicSuppliers()).filter((r) => r.id !== s.id && !isSyntheticSupplier(r)).slice(0, 4);
  // A directory profile is not a checkout offer. Only list products that passed the existing public-product gates.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${profileUrl}#organization`, name, url: profileUrl,
        description: summary, ...(avatarUrl ? { image: `${SITE_URL}${avatarUrl}` } : {}),
        // Năm thành lập và quy mô nhân sự chỉ đưa vào khi vòng kiểm tra giấy tờ
        // đã được phê duyệt, tức hai dữ kiện này đã đối chiếu với hồ sơ doanh nghiệp.
        ...(steps.includes(1) && s.founded_year ? { foundingDate: String(s.founded_year) } : {}),
        ...(steps.includes(1) && s.employees ? { numberOfEmployees: { "@type": "QuantitativeValue", value: s.employees } } : {}),
        address: { "@type": "PostalAddress", ...(safe(supplierAddressDisplay(s)) ? { streetAddress: safe(supplierAddressDisplay(s)) } : {}), addressRegion: safe(supplierProvinceDisplay(s)) || undefined, addressCountry: "VN" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name, item: profileUrl },
      ] },
      { "@type": "ItemList", name: `Products from ${name}`, itemListElement: s.main_products.flatMap((p, index) => {
        const category = productCategory(p);
        return category ? [{ "@type": "ListItem", position: index + 1,
          item: { "@type": "Product", name: safe(publicProductTitle(p)),
            url: `${SITE_URL}/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}`,
            ...(s.product_image_paths[p.id] ? { image: `${SITE_URL}${mediaUrl(s.product_image_paths[p.id])}` } : {}) } }] : [];
      }) },
    ],
  };

  const countView = !synthetic && !(await getSession());
  return <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    {countView && <SupplierTrafficBeacon pageKey={`profile:${s.id}`}
      token={createTrafficToken({ kind: "profile", supplierId: s.id, resourceId: s.id, slug })} />}
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: name }]} />
    {synthetic && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Test profile · Not a commercial supplier offer. Do not use these details to place an order.</p>}

    <SupplierStorefront
      supplier={s}
      certificates={supplierCertificates}
      categories={categories}
      coverUrl={coverUrl}
      avatarUrl={avatarUrl}
      synthetic={synthetic}
    />

    {related.length > 0 && <section className="mt-12" aria-labelledby="related-title">
      <h2 id="related-title" className="text-lg font-bold text-ink-900">Explore other suppliers</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => {
        const relatedName = safe(r.display_name || r.name);
        const relatedLogoUrl = r.profile_image ? mediaUrl(r.profile_image) : null;
        return <li key={r.id}><Link href={`/suppliers/${encodeURIComponent(r.slug || r.id)}`} className="block h-full rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-card">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-white text-lg font-bold text-brand-700">
              {relatedLogoUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={relatedLogoUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1" /></> : relatedName.charAt(0).toUpperCase() || "S"}
            </div>
            <div className="min-w-0">
              <p className="break-words font-bold text-ink-900">{relatedName}</p>
              <p className="mt-1 text-xs text-ink-600">{safe(supplierProvinceDisplay(r)) || "Vietnam"} · {supplierTypeLabel(r)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5"><VerificationPips levels={r.approved_verification_steps} compact /><VerificationTierBadge levels={r.approved_verification_steps} /></div>
        </Link></li>;
      })}</ul>
    </section>}
  </div>;
}
