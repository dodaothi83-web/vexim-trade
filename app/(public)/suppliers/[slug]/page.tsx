import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Clock3, FileCheck2, Globe2, MapPin, Package, ShieldCheck, Ship, Users } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { PublicVerificationBadges } from "@/components/public-verification-badges";
import { getPublicSupplierBySlug, listPublicSuppliers, supplierTypeLabel, t } from "@/lib/public/catalog";
import { getStore } from "@/lib/db";
import { productBelongsToCategory, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import { isSyntheticSupplier, safeJsonLd, supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";

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
  const summary = safe(t(s.summary_i18n)).replace(/\s+/g, " ").trim();
  const description = summary.length > 155 ? `${summary.slice(0, 152).trimEnd()}…` :
    summary || `Explore ${name}'s buyer-ready products and request a quote through Vexim Trade.`;
  const title = `${name} | ${supplierTypeLabel(s)} in ${safe(s.province) || "Vietnam"}`;
  const index = process.env.PUBLIC_SITE_INDEXABLE === "true" && supplierProfileIndexable(s);
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { type: "profile", title, description, url, siteName: "Vexim Trade",
      ...(s.profile_image ? { images: [{ url: `${SITE_URL}${mediaUrl(s.profile_image)}`, alt: name }] } : {}) },
  };
}

function Fact({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return <div className="flex gap-3 border-b border-ink-100 py-3 last:border-0">
    <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
    <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-ink-800">{safe(value) || "On request"}</dd></div>
  </div>;
}

export default async function SupplierProfile({ params }: PageProps) {
  const { slug } = await params;
  const s = await getPublicSupplierBySlug(slug);
  if (!s) notFound();

  const categories = (await getStore().listCategories({ publishedOnly: true }))
    .filter((c) => c.status === "published" && c.is_published);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));
  const name = safe(s.display_name || s.name);
  const summary = safe(t(s.summary_i18n));
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
        address: { "@type": "PostalAddress", addressRegion: safe(s.province) || undefined, addressCountry: "VN" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name, item: profileUrl },
      ] },
      { "@type": "ItemList", name: `Products from ${name}`, itemListElement: s.main_products.flatMap((p, index) => {
        const category = productCategory(p);
        return category ? [{ "@type": "ListItem", position: index + 1,
          item: { "@type": "Product", name: safe(p.name),
            url: `${SITE_URL}/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}`,
            ...(s.product_image_paths[p.id] ? { image: `${SITE_URL}${mediaUrl(s.product_image_paths[p.id])}` } : {}) } }] : [];
      }) },
    ],
  };

  return <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: name }]} />
    {synthetic && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Test profile · Not a commercial supplier offer. Do not use these details to place an order.</p>}

    <section className="mt-5 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card" aria-labelledby="supplier-name">
      <div className="relative h-28 bg-gradient-to-r from-ink-900 via-brand-800 to-brand-700 sm:h-40">
        {coverUrl && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-ink-900/60 to-transparent" /></>}
        <span className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-800">Vietnam supplier profile</span>
      </div>
      <div className="relative flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:gap-6 sm:px-8">
        <div className="-mt-9 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-ink-50 text-3xl font-bold text-ink-400 shadow-sm sm:-mt-11 sm:h-24 sm:w-24">
          {avatarUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={avatarUrl} alt="" className="h-full w-full object-cover" /></> : name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 pt-0 sm:pt-5">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{supplierTypeLabel(s)}</span><PublicVerificationBadges levels={steps} compact />
            {s.private_label && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">Private label stated</span>}
          </div>
          <h1 id="supplier-name" className="mt-3 break-words text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
            {s.province && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-700" />{safe(s.province)}, Vietnam</span>}
            {s.founded_year && <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand-700" />Founded {s.founded_year}</span>}
            {typeof s.employees === "number" && s.employees > 0 && <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-700" />{s.employees} employees</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:pt-6">
          {!synthetic && <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800">Request a quote <ArrowRight className="h-4 w-4" /></Link>}
          <a href="#products" className="inline-flex items-center justify-center rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Browse products</a>
        </div>
      </div>
    </section>

    <nav aria-label="Supplier sections" className="mt-5 flex gap-2 overflow-x-auto border-b border-ink-200 pb-3 text-sm font-semibold text-ink-600">
      {[ ["Products", "products"], ["About", "about"], ["Verification", "verification"], ["Trade details", "trade"] ].map(([label, id]) =>
        <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 hover:bg-white hover:text-brand-700">{label}</a>)}
    </nav>

    <section id="products" className="scroll-mt-24 pt-9" aria-labelledby="products-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Supplier catalogue</p>
          <h2 id="products-title" className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Products <span className="text-base font-medium text-ink-500">({s.main_products.length})</span></h2>
          <p className="mt-1 text-sm text-ink-600">{synthetic ? "Test entries on this profile are not commercial offers." : "Listings ready to share with buyers. Prices, where shown, are references; request a quote for current terms."}</p></div>
      </div>
      {s.main_products.length ? <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {s.main_products.map((p) => {
          const category = productCategory(p);
          const href = !synthetic && category ? `/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}` : null;
          const image = s.product_image_paths[p.id];
          const rfq = `/rfq?category=${encodeURIComponent(category?.slug || "")}&suppliers=${encodeURIComponent(s.id)}&product=${encodeURIComponent(p.name)}&product_id=${encodeURIComponent(p.id)}`;
          return <li key={p.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-card transition hover:border-brand-200 hover:shadow-md">
            <div className="relative flex h-44 items-center justify-center overflow-hidden bg-ink-50">
              {image ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(image)} alt={safe(p.name)} className="h-full w-full object-cover transition duration-300 hover:scale-105" loading="lazy" /></> : <div className="flex flex-col items-center gap-2 text-ink-400"><Package className="h-9 w-9" /><span className="text-xs">Catalogue available on request</span></div>}
              {category && <span className="absolute bottom-3 left-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink-800 shadow-sm">{safe(category.name_i18n.en || category.slug)}</span>}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="line-clamp-2 min-h-10 text-base font-bold leading-5 text-ink-900">{href ? <Link href={href} className="hover:text-brand-700">{safe(p.name)}</Link> : safe(p.name)}</h3>
              <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-5 text-ink-600">{safe(p.spec || p.packaging || p.description) || "Contact Vexim for product specifications."}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-xs">
                <div><dt className="text-ink-500">MOQ</dt><dd className="mt-1 break-words font-semibold text-ink-800">{safe(p.moq || s.moq_text) || "On request"}</dd></div>
                <div><dt className="text-ink-500">Reference price</dt><dd className="mt-1 break-words font-bold text-brand-800">{synthetic ? "Test data · not a price" : publicProductPrice(p, s) || "On request"}</dd></div>
              </dl>
              <div className="mt-auto flex items-center gap-3 pt-4">
                {href && <Link href={href} className="text-xs font-semibold text-brand-700 hover:underline">View details <span aria-hidden>→</span></Link>}
                {!synthetic && <Link href={rfq} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-2 text-xs font-bold text-white hover:bg-ink-800">Get quote <ArrowRight className="h-3.5 w-3.5" /></Link>}
              </div>
            </div>
          </li>;
        })}
      </ul> : <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-ink-300 bg-white p-6 text-sm text-ink-600"><Package className="h-8 w-8 shrink-0 text-ink-400" /><p>No buyer-ready products are available on this profile yet. Products appear here only after the listing and shareable media meet publication requirements.</p></div>}
    </section>

    <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section id="about" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="about-title">
          <h2 id="about-title" className="text-lg font-bold text-ink-900">About this supplier</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{summary || "Supplier information has not been provided yet. Ask Vexim for details before making a sourcing decision."}</p>
        </section>
        <section id="verification" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="verification-title">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-700" /><h2 id="verification-title" className="text-lg font-bold text-ink-900">Vexim verification</h2></div>
          <p className="mt-2 text-xs leading-5 text-ink-600">Each check is independent. Only approved reviews earn badges; “not reviewed” does not mean a failed check.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {([ [1, "Documents checked"], [2, "Factory visit"], [3, "Delivery history"] ] as const).map(([level, label]) =>
              <div key={level} className={`flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold ${steps.includes(level) ? "border-brand-200 bg-brand-50 text-brand-900" : "border-ink-200 bg-ink-50 text-ink-600"}`}>
                {steps.includes(level) ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <FileCheck2 className="h-4 w-4 shrink-0 text-ink-400" />}
                <span>{label}<span className="block font-normal">{steps.includes(level) ? "Review approved" : "Not reviewed"}</span></span>
              </div>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-500">Verification is limited to the documents, site or shipment in the relevant review. It does not certify every facility or product. Ask Vexim to confirm the certificate holder and its scope for the goods offered.</p>
        </section>
        <section id="factory-visit" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="factory-title">
          <h2 id="factory-title" className="text-lg font-bold text-ink-900">Facilities visited by Vexim</h2>
          {steps.includes(2) ? <><p className="mt-2 text-sm font-semibold text-brand-800">Factory visit review approved</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{safe(s.public_review_summaries[2]) || "Visit details have not been released for public viewing."}</p>
            <p className="mt-2 text-xs text-ink-500">Only the site described in a published summary was reviewed. This is not a certification of other facilities or products.</p></>
            : <p className="mt-2 text-sm text-ink-600">No approved factory visit review is available.</p>}
        </section>
        <section id="delivery-history" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="delivery-title">
          <h2 id="delivery-title" className="text-lg font-bold text-ink-900">Export &amp; delivery evidence</h2>
          {(s.export_markets ?? []).length > 0 && <p className="mt-2 text-sm text-ink-700">Supplier-stated markets (not independently verified): {safe((s.export_markets ?? []).join(", "))}</p>}
          {steps.includes(3) ? <><p className="mt-2 text-sm font-semibold text-brand-800">Delivery evidence review approved</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{safe(s.public_review_summaries[3]) || "Reviewed shipment details have not been released for public viewing."}</p>
            <p className="mt-2 text-xs text-ink-500">A reviewed delivery is not proof of the supplier’s entire export history or a guarantee of future shipments.</p></>
            : <p className="mt-2 text-sm text-ink-600">No approved delivery evidence review is available. Stated markets are not a Vexim-verified export history.</p>}
        </section>
        {s.gallery_images.length > 0 && <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6" aria-labelledby="gallery-title">
          <h2 id="gallery-title" className="text-lg font-bold text-ink-900">Supplier gallery</h2>
          <p className="mt-1 text-xs text-ink-500">Shared supplier images; not evidence of a factory visit.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{s.gallery_images.map((path) => <a key={path} href={mediaUrl(path)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-ink-50 ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(path)} alt={`${name} gallery`} loading="lazy" className="h-32 w-full object-cover transition hover:scale-105 sm:h-40" />
          </a>)}</div>
        </section>}
      </div>
      <aside id="trade" className="scroll-mt-24 space-y-4 lg:sticky lg:top-24" aria-label="Trade details and enquiry">
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Trade at a glance</h2>
          <dl className="mt-2"><Fact icon={Package} label="Typical MOQ (supplier-stated)" value={s.moq_text || ""} />
            <Fact icon={Ship} label="Ports / Incoterms (supplier-stated)" value={[...(s.ports ?? []), ...(s.incoterms ?? [])].join(" · ")} />
            <Fact icon={Clock3} label="Lead time (supplier-stated)" value={s.lead_time_days ? `${s.lead_time_days} days` : ""} />
            <Fact icon={Globe2} label="Export markets (supplier-stated)" value={(s.export_markets ?? []).join(", ")} /></dl>
          {!synthetic && <div className="mt-4 space-y-2"><Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}`} className="flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-ink-800">Request quote <ArrowRight className="h-4 w-4" /></Link>
            <Link href={`/rfq?suppliers=${encodeURIComponent(s.id)}&sample=1`} className="flex items-center justify-center rounded-lg border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">Ask about samples</Link></div>}
          <p className="mt-3 text-xs leading-5 text-ink-500">Enquiries go through Vexim Trade. Supplier contact information is not displayed publicly.</p>
        </div>
      </aside>
    </div>

    {related.length > 0 && <section className="mt-12" aria-labelledby="related-title">
      <h2 id="related-title" className="text-lg font-bold text-ink-900">Explore other suppliers</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{related.map((r) => <li key={r.id}><Link href={`/suppliers/${encodeURIComponent(r.slug || r.id)}`} className="block h-full rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-card">
        <p className="font-bold text-ink-900">{safe(r.display_name || r.name)}</p><p className="mt-1 text-xs text-ink-600">{safe(r.province) || "Vietnam"} · {supplierTypeLabel(r)}</p>
        <div className="mt-3"><PublicVerificationBadges levels={r.approved_verification_steps} compact /></div>
      </Link></li>)}</ul>
    </section>}
  </div>;
}
