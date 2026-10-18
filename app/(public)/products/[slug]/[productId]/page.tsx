import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { ProductVerificationIcons } from "@/components/product-verification-icons";
import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listPublicCategoryProducts, shareableProductImages } from "@/lib/public/product-catalog";
import { fieldsFor, publicProductAttributes } from "@/lib/product-attributes";
import { shareableProductVideo } from "@/lib/public/product-video";
import { ProductMediaGallery } from "@/components/product-media-gallery";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { publicCertificateLabels } from "@/lib/public/certificates";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import { createTrafficToken } from "@/lib/traffic/server";
import { SupplierTrafficBeacon } from "@/components/supplier-traffic-beacon";
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; productId: string }> };

async function getDetail(slug: string, productId: string) {
  const store = getStore();
  const category = await store.getCategoryBySlug(slug);
  if (!category) return null;
  const published = category.status === "published" && category.is_published;
  const session = !published ? await getSession() : null;
  if (!published && !(session && hasPermission(session.role, "categories.manage"))) return null;
  const card = (await listPublicCategoryProducts(category)).find((p) => p.id === productId);
  if (!card) return null;
  const product = await store.getProduct(productId);
  if (!product || product.supplier_id !== card.supplierId) return null;
  const categories = await store.listCategories({ publishedOnly: false });
  if (!productBelongsToCategory(product, category, categories)) return null;
  return { category, card, product, preview: !published };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const detail = await getDetail(slug, productId);
  if (!detail) return { title: "Product not found | Vexim Trade", robots: { index: false } };
  const title = `${detail.card.name} | Vietnam ${detail.category.name_i18n.en || slug} | Vexim Trade`;
  const description = `${detail.card.name}. MOQ ${detail.card.moq}. Supplied in ${detail.card.province}. Request a quote from Vexim Trade.`;
  const ogImagePath = detail.card.cardImagePath ?? detail.card.imagePaths[0];
  const ogImage = ogImagePath ? `${SITE_URL}/public-media/${ogImagePath.replace(/^\//, "")}` : null;
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}/${productId}` },
    robots: { index: !detail.preview && !detail.card.isDemo && !!detail.category.seo_indexable, follow: true },
    openGraph: {
      title, description, url: `/products/${slug}/${productId}`, siteName: "Vexim Trade", type: "website",
      ...(ogImage ? { images: [{ url: ogImage, alt: detail.card.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image", title, description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="grid grid-cols-[120px_1fr] gap-4 border-b border-ink-100 py-3 text-sm"><dt className="font-medium text-ink-500">{withoutDirectContacts(label)}</dt><dd className="font-semibold text-ink-800">{withoutDirectContacts(String(value))}</dd></div>;
}

export default async function PublicProductDetail({ params }: Props) {
  const { slug, productId } = await params;
  const detail = await getDetail(slug, productId);
  if (!detail) notFound();
  const { category, card, product: p, preview } = detail;
  // Product eligibility was checked above; project only buyer-shareable images and safe video embeds.
  const media = await getStore().listMedia("product", p.id);
  const images = shareableProductImages(media, p.id, p.featured_media_id, 24);
  const thumbnails = shareableProductImages(media, p.id, p.featured_media_id, 24, true);
  const video = shareableProductVideo(media, p.id);
  // The certificates table and private file locations never go to the client.
  const [certificates, supplierMedia] = await Promise.all([
    getStore().listCertificates(p.supplier_id), getStore().listMedia("supplier", p.supplier_id),
  ]);
  const certificateLabels = publicCertificateLabels(p.supplier_id, p.id, certificates, supplierMedia);
  const rfq = `/rfq?category=${encodeURIComponent(slug)}&suppliers=${encodeURIComponent(card.supplierId)}&product=${encodeURIComponent(card.name)}&product_id=${encodeURIComponent(card.id)}`;
  const approvedAttributes = publicProductAttributes(category, p.specs);
  const configuredKeys = new Set(fieldsFor(category).map((f) => f.key));
  const specs = [
    ...fieldsFor(category).filter((f) => approvedAttributes[f.key]).map((f) => [f.label, approvedAttributes[f.key]] as [string, string]),
    ...(configuredKeys.size ? [] : Object.entries(p.specs ?? {}).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => [key, String(value)] as [string, string])),
  ].slice(0, 12);

  // Trang buyer hiển thị bản tiếng Anh (AI dịch, nhân viên Vexim đã chốt); chỉ lùi về nội dung gốc khi chưa có bản dịch.
  const enDescription = p.description_i18n?.en?.trim() || p.description;
  const enSpec = p.spec_i18n?.en?.trim() || p.spec;
  const enPackaging = p.packaging_i18n?.en?.trim() || p.packaging;
  const enDetail = p.description_detail_i18n?.en?.trim() || p.description_detail;

  const countView = !preview && !card.isDemo && !(await getSession());
  // Product schema chỉ cho trang đủ điều kiện index. Không khai offers/aggregateRating:
  // giá trên trang là giá tham khảo qua RFQ, không phải chào bán giao dịch trực tiếp.
  const indexable = !preview && !card.isDemo && !!category.seo_indexable;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name,
    url: `${SITE_URL}/products/${slug}/${productId}`,
    ...(images.length ? { image: images.map((path) => `${SITE_URL}/public-media/${path.replace(/^\//, "")}`) } : {}),
    ...(enDescription ? { description: withoutDirectContacts(enDescription) } : {}),
    category: category.name_i18n.en || slug,
    brand: {
      "@type": "Organization",
      name: card.supplierName,
      ...(card.supplierSlug ? { url: `${SITE_URL}/suppliers/${encodeURIComponent(card.supplierSlug)}` } : {}),
    },
  };
  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-7 sm:px-6 lg:px-8">
    {indexable && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />}
    {countView && <SupplierTrafficBeacon pageKey={`product:${p.id}`}
      token={createTrafficToken({ kind: "product", supplierId: p.supplier_id, resourceId: p.id, slug })} />}
    {preview && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">Staff preview — this category is not public yet.</p>}
    {card.isDemo && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">DEMO DATA · Sample product, not a real supplier offer.</p>}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name_i18n.en || slug, href: `/products/${slug}` }, { label: card.name }]} />
    <Link href={`/products/${slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
      <ProductMediaGallery name={card.name} images={images} thumbnails={thumbnails} video={video} />
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vietnam · {category.name_i18n.en || slug}</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-ink-900 sm:text-4xl">{card.name}</h1>
        {enDescription && <p className="mt-4 text-sm leading-relaxed text-ink-700">{withoutDirectContacts(enDescription)}</p>}
        {(p.oem || p.odm || p.samples) && <div className="mt-4"><ProductTradeLabels oem={p.oem} odm={p.odm} samples={p.samples} />
          <p className="mt-1.5 text-xs text-ink-500">Product options stated in the listing; confirm availability, scope and sample costs with Vexim in your RFQ.</p></div>}
        <div className="mt-5 rounded-xl border border-ink-200 bg-white px-5 py-2">
          <Spec label="Grade" value={approvedAttributes.grade ?? card.grade} /><Spec label="MOQ" value={card.moq} />
          <Spec label="Reference price" value={card.price || "On request"} />
          <Spec label="Specification" value={enSpec} /><Spec label="Packaging" value={enPackaging} />
          <Spec label="Lead time" value={card.leadTimeDays !== null ? `${card.leadTimeDays} days` : "On request"} />
          <Spec label="Export port" value={p.export_port} />
          {specs.filter(([key]) => key.toLowerCase() !== "grade" || !(approvedAttributes.grade || card.grade)).map(([key, value]) => <Spec key={key} label={key} value={String(value)} />)}
        </div>
        <p className="mt-2 text-xs text-ink-500">Product specifications are supplier-stated and reviewed for listing by Vexim; they are not independent certification. Confirm contract terms through an RFQ.</p>
        {certificateLabels.length > 0 && <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50/40 p-4" aria-labelledby="certificates-heading">
          <h2 id="certificates-heading" className="text-sm font-bold text-ink-900">Documents reviewed for this product</h2>
          <p className="mt-1 text-xs leading-5 text-ink-600">Vexim reviewed copies and their stated holder/scope. This is not independent issuer authentication or a certification issued by Vexim. Original files are shared only on request.</p>
          <ul className="mt-3 space-y-2">{certificateLabels.map((c) => <li key={c.id} className="rounded-lg border border-teal-100 bg-white p-3 text-sm">
            <strong className="text-teal-900">{c.name}</strong>
            <p className="mt-1 text-xs text-ink-600">Holder: {c.holder} · Scope: {c.scope}{c.issuer ? ` · Issuer: ${c.issuer}` : ""} · Valid until: {c.validUntil}</p>
          </li>)}</ul>
        </section>}
        <p className="mt-2 text-xs text-ink-500">Reference prices are indicative, not a binding offer. Final terms are confirmed in the quotation.</p>
        <Link href={rfq} className="btn btn-primary mt-5 w-full justify-center">Request a quote <ArrowRight className="h-4 w-4" /></Link>
        <aside className="mt-6 rounded-xl border border-brand-200 bg-brand-50/60 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplied by</h2>
          <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} className="mt-2 inline-block text-lg font-bold text-brand-800 hover:underline">{card.supplierName} → View supplier profile</Link>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-700"><MapPin className="h-4 w-4" />{card.province}, Vietnam</p>
          <div className="mt-3"><ProductVerificationIcons levels={card.verificationSteps} /></div>
          {(card.verificationSteps.includes(2) || card.verificationSteps.includes(3)) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {card.verificationSteps.includes(2) && <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#factory-visit`} className="text-brand-700 underline">Factory visit scope on supplier profile</Link>}
            {card.verificationSteps.includes(3) && <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#delivery-history`} className="text-brand-700 underline">Delivery review scope on supplier profile</Link>}
          </div>}
          <p className="mt-3 text-xs text-ink-600">These are supplier reviews, not certifications of this product. Vexim coordinates enquiries; direct supplier contacts are not shown.</p>
          <Link href={`/khieu-nai?product=${encodeURIComponent(card.id)}`} className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">Report this listing</Link>
        </aside>
      </div>
    </div>
    {enDetail && <section aria-labelledby="product-description-heading" className="mt-12 border-t border-ink-200 pt-8">
      <h2 id="product-description-heading" className="text-2xl font-black text-ink-900">Product description</h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{withoutDirectContacts(enDetail)}</p>
    </section>}
  </div>;
}
