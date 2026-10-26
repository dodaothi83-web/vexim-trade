import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, MapPin, MessageCircle } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { ProductVerificationIcons } from "@/components/product-verification-icons";
import { VerificationTierBadge } from "@/components/verification-tier";
import { parseProductSpecification, productSpecificationKey, publicExportPortDisplay, publicProductMoqDisplay } from "@/lib/public/product-detail-display";
import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listPublicCategoryProducts, shareableProductImages } from "@/lib/public/product-catalog";
import { fieldsFor, publicProductAttributes, supplierFieldsFor } from "@/lib/product-attributes";
import { shareableProductVideo } from "@/lib/public/product-video";
import { ProductMediaGallery } from "@/components/product-media-gallery";
import { StickyProductColumn } from "@/components/sticky-product-column";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { PublicProductCard } from "@/components/public-product-card";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import { createTrafficToken } from "@/lib/traffic/server";
import { SupplierTrafficBeacon } from "@/components/supplier-traffic-beacon";
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; productId: string }> };

async function getDetail(slug: string, productId: string) {
  const store = getStore();
  const category = await store.getCategoryBySlug(slug);
  if (!category) return null;
  const published = category.status === "published" && category.is_published;
  const session = !published ? await getSession() : null;
  if (!published && !(session && hasPermission(session.role, "categories.manage"))) return null;
  const categoryProducts = await listPublicCategoryProducts(category);
  const card = categoryProducts.find((p) => p.id === productId);
  if (!card) return null;
  const product = await store.getProduct(productId);
  if (!product || product.supplier_id !== card.supplierId) return null;
  const categories = await store.listCategories({ publishedOnly: false });
  if (!productBelongsToCategory(product, category, categories)) return null;
  const relatedProducts = categoryProducts.filter((item) => item.id !== card.id && !item.isDemo).slice(0, 4);
  return { category, card, product, relatedProducts, preview: !published };
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
  return <div className="grid gap-1 border-b border-ink-100 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(130px,0.42fr)_minmax(0,1fr)] sm:gap-5">
    <dt className="font-medium text-ink-500">{withoutDirectContacts(label)}</dt>
    <dd className="whitespace-pre-wrap break-words font-semibold leading-6 text-ink-800">{withoutDirectContacts(String(value))}</dd>
  </div>;
}

export default async function PublicProductDetail({ params }: Props) {
  const { slug, productId } = await params;
  const detail = await getDetail(slug, productId);
  if (!detail) notFound();
  const { category, card, product: p, relatedProducts, preview } = detail;
  // Product eligibility was checked above; project only buyer-shareable images and safe video embeds.
  const media = await getStore().listMedia("product", p.id);
  const images = shareableProductImages(media, p.id, p.featured_media_id, 24);
  const thumbnails = shareableProductImages(media, p.id, p.featured_media_id, 24, true);
  const video = shareableProductVideo(media, p.id);
  const rfq = `/rfq?category=${encodeURIComponent(slug)}&suppliers=${encodeURIComponent(card.supplierId)}&product=${encodeURIComponent(card.name)}&product_id=${encodeURIComponent(card.id)}`;
  const questionRfq = `${rfq}&intent=question`;
  const approvedAttributes = publicProductAttributes(category, p.specs);
  const configuredKeys = new Set(fieldsFor(category).map((f) => f.key));
  // Thông số NCC tự thêm chưa được Vexim duyệt thành trường của danh mục: không tự lên trang buyer.
  const supplierKeys = new Set(supplierFieldsFor(category).map((f) => f.key));
  const legacyKeys = [...supplierKeys].filter((key) => !configuredKeys.has(key));
  const specs = [
    ...fieldsFor(category).filter((f) => approvedAttributes[f.key]).map((f) => [f.label, approvedAttributes[f.key]] as [string, string]),
    ...(configuredKeys.size ? [] : Object.entries(p.specs ?? {}).filter(([key, value]) =>
      (typeof value === "string" || typeof value === "number") && !legacyKeys.includes(key)).map(([key, value]) => [key, String(value)] as [string, string])),
  ].slice(0, 12);

  // Trang buyer hiển thị bản tiếng Anh (AI dịch, nhân viên Vexim đã chốt); chỉ lùi về nội dung gốc khi chưa có bản dịch.
  const enDescription = p.description_i18n?.en?.trim() || p.description;
  const enSpec = p.spec_i18n?.en?.trim() || p.spec;
  const enPackaging = p.packaging_i18n?.en?.trim() || p.packaging;
  const enDetail = p.description_detail_i18n?.en?.trim() || p.description_detail;
  const parsedSpecifications = parseProductSpecification(enSpec);
  const detailRows = parsedSpecifications.filter((row) => !["grade", "minimum order quantity (moq)", "packaging specification"].includes(row.key));
  const detailedPackaging = parsedSpecifications.find((row) => row.key === "packaging specification")?.value;
  const occupiedSpecKeys = new Set([
    ...parsedSpecifications.map((row) => row.key),
    "grade", "moq", "minimum order quantity (moq)", "packaging", "packaging specification",
    "reference price", "lead time", "incoterm", "export port", "loading port",
  ]);
  const additionalSpecs = specs.filter(([label]) => !occupiedSpecKeys.has(productSpecificationKey(label)));
  const supplierImageUrl = card.supplierProfileImage ? `/public-media/${card.supplierProfileImage.replace(/^\/+/, "")}` : null;
  const relatedComparisonOffers = relatedProducts.map((product) => ({
    id: product.id, supplierId: product.supplierId, categorySlug: slug, isDemo: product.isDemo,
  }));

  const countView = !preview && !card.isDemo && !(await getSession());
  // Product schema chỉ cho trang đủ điều kiện index. Không khai offers/aggregateRating:
  // giá trên trang là giá tham khảo qua RFQ, không phải chào bán giao dịch trực tiếp.
  const indexable = !preview && !card.isDemo && !!category.seo_indexable;
  // Thuộc tính có cấu trúc chỉ lấy từ dữ kiện đã qua kiểm tra: MOQ và lead time
  // trên bản ghi sản phẩm công khai, cùng các trường thuộc tính theo danh mục
  // đã qua kiểm tra hợp lệ. Không lấy thuộc tính thô ngoài cấu hình danh mục.
  const structuredProperties: Array<{ "@type": "PropertyValue"; name: string; value: string }> = [];
  const pushProperty = (name: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (!v) return;
    if (structuredProperties.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    structuredProperties.push({ "@type": "PropertyValue", name, value: v });
  };
  const structuredMoq = publicProductMoqDisplay(p.moq);
  if (structuredMoq) pushProperty("MOQ", structuredMoq);
  if (card.leadTimeDays !== null) pushProperty("Lead time", `${card.leadTimeDays} days`);
  for (const f of fieldsFor(category)) {
    if (approvedAttributes[f.key]) pushProperty(f.label, approvedAttributes[f.key]);
  }
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
    ...(structuredProperties.length ? { additionalProperty: structuredProperties } : {}),
  };
  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-7 sm:px-6 lg:px-8">
    {indexable && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />}
    {countView && <SupplierTrafficBeacon pageKey={`product:${p.id}`}
      token={createTrafficToken({ kind: "product", supplierId: p.supplier_id, resourceId: p.id, slug })} />}
    {preview && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">Staff preview — this category is not public yet.</p>}
    {card.isDemo && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">DEMO DATA · Sample product, not a real supplier offer.</p>}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name_i18n.en || slug, href: `/products/${slug}` }, { label: card.name }]} />
    <Link href={`/products/${slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
      <StickyProductColumn>
        <ProductMediaGallery name={card.name} images={images} thumbnails={thumbnails} video={video} />
        <aside className="mt-6 overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card" aria-labelledby="supplier-card-title">
          <div className="border-b border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5">
            <div className="flex items-start gap-3">
              <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} aria-label={`View ${card.supplierName} supplier profile`}
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-100 bg-white text-brand-700 shadow-sm">
                {supplierImageUrl ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={supplierImageUrl} alt="" className="h-full w-full object-cover" />
                </> : <Building2 className="h-6 w-6" aria-hidden="true" />}
              </Link>
              <div className="min-w-0 flex-1">
                <h2 id="supplier-card-title" className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Supplied by</h2>
                <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} className="mt-1 block break-words text-base font-bold leading-6 text-ink-900 hover:text-brand-800">{card.supplierName}</Link>
                <div className="mt-2"><VerificationTierBadge levels={card.verificationSteps} /></div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-ink-600">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-brand-700" />{card.province}, Vietnam</span>
              {card.supplierFoundedYear && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-brand-700" />Founded {card.supplierFoundedYear}</span>}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-ink-800">Supplier verification</p>
              <span className="text-xs font-semibold text-ink-500">{card.verificationSteps.length}/3 approved</span>
            </div>
            <div className="mt-2"><ProductVerificationIcons levels={card.verificationSteps} /></div>
            {(card.verificationSteps.includes(2) || card.verificationSteps.includes(3)) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {card.verificationSteps.includes(2) && <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#factory-visit`} className="text-brand-700 underline">Factory visit scope</Link>}
              {card.verificationSteps.includes(3) && <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#delivery-history`} className="text-brand-700 underline">Delivery review scope</Link>}
            </div>}
            <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-800 hover:underline">View supplier profile <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-3 text-xs leading-5 text-ink-500">Quotes are coordinated through Vexim. Supplier contact details are not shown.</p>
            <Link href={`/khieu-nai?product=${encodeURIComponent(card.id)}`} className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">Report this listing</Link>
          </div>
        </aside>
      </StickyProductColumn>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vietnam · {category.name_i18n.en || slug}</p>
        <h1 className="mt-2 break-words text-2xl font-bold leading-snug tracking-tight text-ink-900 sm:text-3xl">{card.name}</h1>
        {enDescription && <p className="mt-4 text-sm leading-relaxed text-ink-700">{withoutDirectContacts(enDescription)}</p>}
        <div id="reference-price" className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Reference price</p>
          <p className="mt-1 break-words text-3xl font-black leading-tight text-brand-900 sm:text-4xl">{withoutDirectContacts(card.price || "On request")}</p>
        </div>
        {(p.oem || p.odm || p.samples) && <div className="mt-4"><ProductTradeLabels oem={p.oem} odm={p.odm} samples={p.samples} />
          <p className="mt-1.5 text-xs text-ink-500">Product options stated in the listing; confirm availability, scope and sample costs with Vexim in your RFQ.</p></div>}
        <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
            <h2 className="text-sm font-bold text-ink-900">Key terms</h2>
            <p className="mt-0.5 text-xs text-ink-500">Commercial details for your RFQ</p>
          </div>
          <dl className="px-5">
            <Spec label="Grade" value={approvedAttributes.grade ?? card.grade} />
            <Spec label="MOQ" value={card.moq} />
            <Spec label="Packaging" value={detailedPackaging || enPackaging} />
            <Spec label="Lead time" value={card.leadTimeDays !== null ? `${card.leadTimeDays} days` : "On request"} />
            <Spec label="Incoterm" value={card.incoterm} />
            <Spec label="Loading port" value={publicExportPortDisplay(p.export_port)} />
            <Spec label="Raw material region" value={card.rawMaterialRegion} />
            <Spec label="Input material origin" value={card.inputMaterialOrigin} />
          </dl>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-500">Product details and reference prices are supplier-provided and reviewed for listing. Confirm current specifications, availability and final terms in your RFQ.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href={rfq} className="btn btn-primary min-h-12 w-full justify-center px-2 text-sm font-bold shadow-lg shadow-brand-900/20 sm:px-4 sm:text-base">Request a quote <ArrowRight className="hidden h-5 w-5 sm:block" /></Link>
          <Link href={questionRfq} aria-label={`Ask supplier about ${card.name}`} className="btn btn-soft min-h-12 w-full justify-center px-2 text-sm font-bold sm:px-4 sm:text-base"><MessageCircle className="h-5 w-5 shrink-0" />Ask supplier</Link>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-600">Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else.</p>
      </div>
    </div>
    {(detailRows.length > 0 || additionalSpecs.length > 0) && <section aria-labelledby="full-specifications-heading" className="mt-12 border-t border-ink-200 pt-8">
      <h2 id="full-specifications-heading" className="text-2xl font-black text-ink-900">Full specifications</h2>
      <p className="mt-1 text-sm text-ink-500">Technical details from the listing</p>
      <dl className="mt-5 grid gap-x-10 overflow-hidden rounded-xl border border-ink-200 bg-white px-5 shadow-sm md:grid-cols-2">
        {detailRows.map((row, index) => <Spec key={`${row.key}-${index}`} label={row.label} value={row.value} />)}
        {additionalSpecs.map(([key, value]) => <Spec key={key} label={key} value={String(value)} />)}
      </dl>
    </section>}
    {enDetail && <section aria-labelledby="product-description-heading" className="mt-10 border-t border-ink-200 pt-8">
      <h2 id="product-description-heading" className="text-2xl font-black text-ink-900">Product description</h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{withoutDirectContacts(enDetail)}</p>
    </section>}
    {relatedProducts.length > 0 && <section aria-labelledby="related-products-heading" className="mt-12 border-t border-ink-200 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="related-products-heading" className="text-2xl font-black text-ink-900">Related products</h2>
          <p className="mt-1 text-sm text-ink-500">Explore more products in {category.name_i18n.en || slug}.</p>
        </div>
        <Link href={`/products/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:underline">View all products <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <ul className="mt-5 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {relatedProducts.map((related) => <li key={related.id} className="min-w-0">
          <PublicProductCard href={`/products/${encodeURIComponent(slug)}/${encodeURIComponent(related.id)}`}
            imagePath={related.cardImagePath ?? related.imagePaths[0]} name={related.name} moq={related.moq}
            price={related.price} fob={related.incoterm?.toUpperCase() === "FOB"} leadTimeDays={related.leadTimeDays}
            supplierName={related.supplierName} supplierHref={`/suppliers/${encodeURIComponent(related.supplierSlug || related.supplierId)}`}
            quoteHref={`/rfq?category=${encodeURIComponent(slug)}&suppliers=${encodeURIComponent(related.supplierId)}&product=${encodeURIComponent(related.name)}&product_id=${encodeURIComponent(related.id)}`}
            oem={related.oem} odm={related.odm} samples={related.samples}
            verificationSteps={related.verificationSteps}
            comparison={!preview && hasProductComparisonPeer(relatedComparisonOffers, {
              id: related.id, supplierId: related.supplierId, categorySlug: slug, isDemo: related.isDemo,
            }) ? { id: related.id, categorySlug: slug } : undefined} />
        </li>)}
      </ul>
    </section>}
  </div>;
}
