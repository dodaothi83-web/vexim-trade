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
import { shareableProductVideo } from "@/lib/public/product-video";
import { ProductMediaGallery } from "@/components/product-media-gallery";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";

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
  return {
    title: `${detail.card.name} | Vietnam ${detail.category.name_i18n.en || slug} | Vexim Trade`,
    description: `${detail.card.name}. MOQ ${detail.card.moq}. Supplied in ${detail.card.province}. Request a quote from Vexim Trade.`,
    alternates: { canonical: `/products/${slug}/${productId}` },
    robots: { index: !detail.preview && !detail.card.isDemo && !!detail.category.seo_indexable, follow: true },
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
  const video = shareableProductVideo(media, p.id);
  const rfq = `/rfq?category=${encodeURIComponent(slug)}&suppliers=${encodeURIComponent(card.supplierId)}&product=${encodeURIComponent(card.name)}&product_id=${encodeURIComponent(card.id)}`;
  const specs = p.specs && typeof p.specs === "object" ? Object.entries(p.specs).filter(([, value]) => typeof value === "string" || typeof value === "number").slice(0, 12) : [];

  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-7 sm:px-6 lg:px-8">
    {preview && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">Staff preview — this category is not public yet.</p>}
    {card.isDemo && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">DEMO DATA · Sample product, not a real supplier offer.</p>}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name_i18n.en || slug, href: `/products/${slug}` }, { label: card.name }]} />
    <Link href={`/products/${slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
      <ProductMediaGallery name={card.name} images={images} video={video} />
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vietnam · {category.name_i18n.en || slug}</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-ink-900 sm:text-4xl">{card.name}</h1>
        {p.description && <p className="mt-4 text-sm leading-relaxed text-ink-700">{withoutDirectContacts(p.description)}</p>}
        <div className="mt-5 rounded-xl border border-ink-200 bg-white px-5 py-2">
          <Spec label="Grade" value={card.grade} /><Spec label="MOQ" value={card.moq} />
          <Spec label="Reference price" value={card.price || "On request"} />
          <Spec label="Specification" value={p.spec} /><Spec label="Packaging" value={p.packaging} />
          <Spec label="Lead time" value={card.leadTimeDays !== null ? `${card.leadTimeDays} days` : "On request"} />
          <Spec label="Export port" value={p.export_port} />
          {specs.map(([key, value]) => <Spec key={key} label={key} value={String(value)} />)}
        </div>
        <p className="mt-2 text-xs text-ink-500">Reference prices are indicative, not a binding offer. Final terms are confirmed in the quotation.</p>
        <Link href={rfq} className="btn btn-primary mt-5 w-full justify-center">Request a quote <ArrowRight className="h-4 w-4" /></Link>
        <aside className="mt-6 rounded-xl border border-brand-200 bg-brand-50/60 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplied by</h2>
          <Link href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} className="mt-2 inline-block text-lg font-bold text-brand-800 hover:underline">{card.supplierName} → View supplier profile</Link>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-700"><MapPin className="h-4 w-4" />{card.province}, Vietnam</p>
          <div className="mt-3"><ProductVerificationIcons levels={card.verificationSteps} /></div>
          <p className="mt-3 text-xs text-ink-600">Vexim coordinates enquiries; direct supplier contacts are not shown.</p>
        </aside>
      </div>
    </div>
    {p.description_detail && <section aria-labelledby="product-description-heading" className="mt-12 border-t border-ink-200 pt-8">
      <h2 id="product-description-heading" className="text-2xl font-black text-ink-900">Product description</h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{withoutDirectContacts(p.description_detail)}</p>
    </section>}
  </div>;
}
