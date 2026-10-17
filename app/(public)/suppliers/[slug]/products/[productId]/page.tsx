import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ImageIcon } from "lucide-react";

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

export default async function TestSupplierProductPreview({ params }: Props) {
  const { slug, productId } = await params;
  const found = await testProduct(slug, productId);
  if (!found) notFound();
  const { supplier, product } = found;
  const image = supplier.product_image_paths[product.id]; // only approved buyer-shareable product image
  const mediaUrl = image ? `/public-media/${image.replace(/^\//, "")}` : null;
  const safe = (value: string | null | undefined) => withoutDirectContacts(value || "");
  return <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6">
    <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}#products`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="size-4" /> Back to supplier profile</Link>
    <div role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
      Test product preview only · Not a commercial offer, verified product or price. Do not place an order from this page.
    </div>
    <h1 className="mt-7 break-words text-3xl font-black text-ink-900">{safe(product.name)}</h1>
    <p className="mt-2 text-sm text-ink-600">{safe(supplier.display_name || supplier.name)} · TEST DATA</p>
    {mediaUrl ? <a href={mediaUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open full photo of ${safe(product.name)}`}
      className="mt-6 flex min-h-64 items-center justify-center overflow-hidden rounded-2xl border border-ink-200 bg-white p-3 focus-visible:outline-2 focus-visible:outline-brand-700 sm:min-h-96">
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl} alt={safe(product.name)} className="max-h-[75vh] w-full object-contain" />
    </a> : <div className="mt-6 flex min-h-64 items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 text-sm text-ink-500"><ImageIcon className="size-6" /> No buyer-shareable product photo</div>}
    {mediaUrl && <p className="mt-2 text-xs text-ink-500">The entire photo is shown without cropping. Open it in a new tab to view its original size.</p>}
    {(product.spec || product.description) && <section className="mt-7 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold text-ink-900">Test description</h2>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{safe(product.spec || product.description)}</p>
    </section>}
  </main>;
}
