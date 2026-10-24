import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";

import { getPublicSupplierBySlug } from "@/lib/public/catalog";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; productId: string }> };

/** Direct, read-only test preview; never a category listing or a commercial product page. */
async function testProduct(slug: string, productId: string) {
  const supplier = await getPublicSupplierBySlug(slug);
  if (!supplier || !isSyntheticSupplier(supplier)) return null;
  const product = supplier.main_products.find((p) => p.id === productId);
  if (!product) return null; // still requires the existing product-review, readiness and media gates
  return { supplier, product };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const found = await testProduct(slug, productId);
  return { title: found ? `Test preview: ${withoutDirectContacts(found.product.name)} | Vexim Trade` : "Not found | Vexim Trade",
    robots: { index: false, follow: false } };
}

function TestFact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 border-b border-ink-100 py-3 text-sm last:border-0 sm:grid-cols-[130px_minmax(0,1fr)]">
    <dt className="text-ink-500">{label}</dt><dd className="min-w-0 break-words font-semibold text-ink-800">{value}</dd>
  </div>;
}

export default async function TestSupplierProductPreview({ params }: Props) {
  const { slug, productId } = await params;
  const found = await testProduct(slug, productId);
  if (!found) notFound();
  const { supplier, product } = found;
  const image = supplier.product_image_paths[product.id]; // only approved buyer-shareable product image
  const mediaUrl = image ? `/public-media/${image.replace(/^\//, "")}` : null;
  const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");
  const profileHref = `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`;

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
    <Link href={`${profileHref}#products`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" /> Back to supplier products</Link>
    <div role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
      Test product preview only · Not a commercial offer, verified product or price. Do not place an order from this page.
    </div>

    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:gap-9">
      <section aria-label="Test product information" className="order-1 min-w-0 lg:order-2">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-800">Test product · Preview only</p>
        <h1 className="mt-2 break-words text-3xl font-black leading-tight text-ink-900 sm:text-4xl">{safe(product.name)}</h1>
        <p className="mt-3 text-sm text-ink-600">These are test entries, not validated specifications or trading terms.</p>
        <dl className="mt-5 rounded-xl border border-ink-200 bg-white px-4 sm:px-5">
          <TestFact label="Specification" value={safe(product.spec) || "Not provided (test data)"} />
          <TestFact label="MOQ" value={safe(product.moq) || "Not provided (test data)"} />
          <TestFact label="Lead time" value={product.lead_time_days != null ? `${product.lead_time_days} days · test data` : "Not provided (test data)"} />
          <TestFact label="Packaging" value={safe(product.packaging) || "Not provided (test data)"} />
          <TestFact label="Price" value="Not shown · test data" />
        </dl>
        <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-600">Test supplier profile</h2>
          <Link href={profileHref} className="mt-2 inline-block break-words text-base font-bold text-brand-800 hover:underline">{safe(supplier.display_name || supplier.name)} →</Link>
          <p className="mt-2 text-xs leading-5 text-ink-600">This profile is test data. No supplier or product verification is asserted here.</p>
        </div>
      </section>
      <section aria-label="Test product photo" className="order-2 min-w-0 lg:order-1">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-ink-200 bg-white p-3">
          {mediaUrl ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl} alt={safe(product.name)} className="h-full w-full object-contain" /></>
            : <div className="flex items-center gap-2 text-sm text-ink-500"><ImageIcon className="size-6" /> No buyer-shareable product photo</div>}
        </div>
        {mediaUrl && <p className="mt-3 text-xs text-ink-600">Photo shown in full, without cropping. <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline">Open original photo <ExternalLink className="size-3" aria-hidden="true" /></a></p>}
      </section>

    </div>

    {(product.description || product.description_detail) && <section className="mt-10 border-t border-ink-200 pt-8" aria-labelledby="test-description-title">
      <h2 id="test-description-title" className="text-2xl font-black text-ink-900">Test description</h2>
      {product.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{safe(product.description)}</p>}
      {product.description_detail && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink-700">{safe(product.description_detail)}</p>}
    </section>}
  </main>;
}
