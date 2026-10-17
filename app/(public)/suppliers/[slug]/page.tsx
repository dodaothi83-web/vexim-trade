import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe2,
  HelpCircle,
  MapPin,
  Package,
  Ship,
  Users,
} from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { PublicVerificationBadges } from "@/components/public-verification-badges";
import {
  getPublicSupplierBySlug,
  listPublicSuppliers,
  mainProductNames,
  supplierTypeLabel,
  t,
} from "@/lib/public/catalog";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { productBelongsToCategory, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const s = await getPublicSupplierBySlug(slug);
  if (!s) return { title: "Supplier not found | Veximtrade", robots: { index: false } };
  const name = s.display_name ?? s.name;
  const mainCat = withoutDirectContacts(mainProductNames(s.main_products, 2) || "food products");
  const steps = s.approved_verification_steps;
  const review = steps.length ? [steps.includes(1) && "Supplier documents reviewed", steps.includes(2) && "Factory visit reviewed", steps.includes(3) && "Delivery history reviewed"].filter(Boolean).join("; ") + " by Vexim" : "Supplier profile on Vexim";
  return {
    title: `${name} – ${steps.length ? "Reviewed " : ""}${mainCat} ${supplierTypeLabel(s)} in ${s.province ?? "Vietnam"} | Veximtrade`,
    description: `${review}. ${mainCat}, MOQ ${s.moq_text ?? "contact"}. Request a quote.`,
  };
}

export default async function SupplierProfile({ params }: PageProps) {
  const { slug } = await params;
  const s = await getPublicSupplierBySlug(slug);
  if (!s) notFound();

  const categories = (await getStore().listCategories({ publishedOnly: true }))
    .filter((c) => c.status === "published" && c.is_published);
  const productCategory = (p: typeof s.main_products[number]) =>
    categories.find((c) => productBelongsToCategory(p, c, categories));
  const name = withoutDirectContacts(s.display_name ?? s.name);
  const coverUrl = s.cover_image ? `/public-media/${s.cover_image.replace(/^\//, "")}` : null;
  const profileUrl = s.profile_image ? `/public-media/${s.profile_image.replace(/^\//, "")}` : null;
  const publicMedia = (p: string) => `/public-media/${p.replace(/^\//, "")}`;

  // Related public suppliers; approved reviews are displayed independently.
  const related = (await listPublicSuppliers())
    .filter((x) => x.id !== s.id)
    .slice(0, 4);

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: `${SITE_URL}/suppliers/${s.slug || s.id}`,
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: s.province ?? undefined,
        addressCountry: "VN",
      },
    },
    foundingDate: s.founded_year ? String(s.founded_year) : undefined,
    numberOfEmployees:
      typeof s.employees === "number" && s.employees > 0
        ? { "@type": "QuantitativeValue", value: s.employees }
        : undefined,
    makesOffer: s.main_products.map((p) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Product", name: withoutDirectContacts(p.name), description: p.spec ? withoutDirectContacts(p.spec) : undefined },
    })),
  };

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/#products" },
          { label: "Profile" },
        ]}
      />

      {/* Cover + profile header */}
      <section className="mt-6 overflow-hidden rounded-xl border border-ink-200 bg-white">
        {coverUrl && (
          <div className="relative h-48 w-full bg-ink-100 sm:h-64">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>
        )}
        <div className={"flex flex-wrap items-end gap-5 p-5 sm:p-7 " + (coverUrl ? "-mt-12" : "")}>
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border-4 border-white bg-white shadow-md ring-1 ring-ink-200 sm:h-28 sm:w-28">
            {profileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-ink-300">{(s.display_name ?? s.name).slice(0,1).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
          <PublicVerificationBadges levels={s.approved_verification_steps} />
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-700">
            {supplierTypeLabel(s)}
          </span>
          {s.private_label && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
              Private label
            </span>
          )}
        </div>
        <h1
          className="mt-4 text-[38px] font-bold leading-tight text-ink-900 sm:text-[46px]"
          style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
        >
          {name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-ink-600">
          {s.province && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-ink-400" />
              {s.province}, Vietnam
            </span>
          )}
          {s.founded_year && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-ink-400" />
              Founded {s.founded_year}
            </span>
          )}
          {typeof s.employees === "number" && s.employees > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-ink-400" />
              {s.employees} employees
            </span>
          )}
        </div>
            <p className="mt-4 max-w-3xl text-[16px] leading-relaxed text-ink-700">
              {withoutDirectContacts(t(s.summary_i18n) || mainProductNames(s.main_products))}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        {/* Cột trái: 3 tab SSR (không cần JS ỏ bước này vì chỉ có một trang, in sẵn) */}
        <div>
          <section id="products" className="scroll-mt-24">
            <h2 className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Products &amp; specifications
            </h2>
            <div className="mt-4 overflow-hidden rounded-md border border-ink-200">
              <table className="w-full text-[14px]">
                <thead className="bg-ink-50 text-[12px] uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-left font-semibold">Spec</th>
                    <th className="px-4 py-2 text-left font-semibold">MOQ</th>
                    <th className="px-4 py-2 text-left font-semibold">FOB ref.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {s.main_products.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-ink-400">
                        Product details being audited. Request a quote to receive the spec sheet.
                      </td>
                    </tr>
                  )}
                  {s.main_products.map((p) => {
                    const category = productCategory(p);
                    return <tr key={p.id}>
                      <td className="px-4 py-3 align-top font-semibold text-ink-900">
                        {category ? <Link href={`/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(p.id)}`} className="text-brand-700 hover:underline">{withoutDirectContacts(p.name)}</Link> : withoutDirectContacts(p.name)}
                      </td>
                      <td className="px-4 py-3 align-top text-ink-700">
                        {withoutDirectContacts(p.spec || p.packaging || "On request")}
                      </td>
                      <td className="px-4 py-3 align-top text-ink-700">
                        {withoutDirectContacts(p.moq || s.moq_text || "On request")}
                      </td>
                      <td className="px-4 py-3 align-top text-ink-700">
                        {publicProductPrice(p, s) || "On request"}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Verification
            </h2>

            <p className="mt-4 text-[14px] leading-relaxed text-ink-700">
              These checks are independent. Only approved checks earn badges; a check not yet reviewed is not a failed review.
            </p>
            <ul className="mt-5 grid gap-2 text-[14px] text-ink-700 sm:grid-cols-2">
              {([
                { level: 1, label: "Supplier documents reviewed" },
                { level: 2, label: "Factory visit reviewed" },
                { level: 3, label: "Delivery documents reviewed" },
              ] as const).map((item) => {
                const checked = s.approved_verification_steps.includes(item.level);
                return <li key={item.level} className="flex items-start gap-2">
                  {checked ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" /> : <HelpCircle className="mt-0.5 h-4 w-4 text-ink-400" />}
                  {item.label} {checked ? "" : "(not reviewed)"}
                </li>;
              })}
            </ul>
          </section>

          <section id="factory-visit" className="mt-10 scroll-mt-24" aria-labelledby="factory-visit-title">
            <h2 id="factory-visit-title" className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">Facility visited by Vexim</h2>
            {s.approved_verification_steps.includes(2) ? <>
              <p className="mt-3 text-sm font-semibold text-emerald-800">Factory visit review approved for this supplier</p>
              {s.public_review_summaries[2] ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{s.public_review_summaries[2]}</p>
                : <p className="mt-2 text-sm text-ink-600">Visit details have not been released for public viewing.</p>}
              <p className="mt-2 text-xs text-ink-500">Only the site and observations described above were reviewed. This is not a certification of every product or facility.</p>
            </> : <p className="mt-3 text-sm text-ink-600">No approved factory visit review is available.</p>}
          </section>

          <section id="delivery-history" className="mt-10 scroll-mt-24" aria-labelledby="delivery-history-title">
            <h2 id="delivery-history-title" className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">Export experience &amp; delivery evidence</h2>
            {(s.export_markets ?? []).length > 0 && <p className="mt-3 text-sm text-ink-700">Supplier-stated markets (not independently verified): {withoutDirectContacts((s.export_markets ?? []).join(", "))}</p>}
            {s.approved_verification_steps.includes(3) ? <>
              <p className="mt-3 text-sm font-semibold text-emerald-800">Delivery evidence review approved for this supplier</p>
              {s.public_review_summaries[3] ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{s.public_review_summaries[3]}</p>
                : <p className="mt-2 text-sm text-ink-600">Reviewed shipment details have not been released for public viewing.</p>}
              <p className="mt-2 text-xs text-ink-500">A reviewed delivery is not automatically a verified export or proof of the supplier's entire export history. It does not guarantee future shipments.</p>
            </> : <p className="mt-3 text-sm text-ink-600">No approved delivery evidence review is available. Stated markets are not a Vexim-verified export history.</p>}
          </section>

          <section className="mt-10">
            <h2 className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Documents &amp; certifications
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-600">
              Certifications vary by product and producing facility. A supplier verification badge does not mean the trading company holds HACCP, ISO or another named certificate. Ask Vexim to confirm the certificate holder and the link to the goods being offered.
            </p>
          </section>

          {s.gallery_images.length > 0 && (
            <section className="mt-10">
              <h2 className="border-b border-ink-200 pb-2 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-500">
                Supplier gallery
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {s.gallery_images.map((p) => (
                  <a key={p} href={publicMedia(p)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md ring-1 ring-ink-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicMedia(p)} alt="" className="h-36 w-full object-cover transition hover:scale-[1.02] sm:h-44" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar CTA */}
        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <div className="rounded-lg border border-ink-200 bg-white p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-500">
              Work with this supplier
            </p>
            <div className="mt-3 space-y-2 text-[14px] text-ink-700">
              <InfoRow icon={<Package className="h-4 w-4" />} label="MOQ" value={s.moq_text || "On request"} />
              <InfoRow
                icon={<Ship className="h-4 w-4" />}
                label="Port / Incoterm"
                value={
                  [
                    (s.ports ?? []).join(", ") || null,
                    (s.incoterms ?? []).join(", ") || null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "On request"
                }
              />
              <InfoRow
                icon={<Clock className="h-4 w-4" />}
                label="Lead time"
                value={s.lead_time_days ? `${s.lead_time_days} days` : "On request"}
              />
              <InfoRow
                icon={<Globe2 className="h-4 w-4" />}
                label="Supplier-stated export markets"
                value={(s.export_markets ?? []).join(", ") || "On request"}
              />
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/rfq?suppliers=${s.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-800"
              >
                Request quote
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/rfq?suppliers=${s.id}&sample=1`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-ink-300 px-4 py-2 text-[14px] font-semibold text-ink-800 hover:border-ink-900"
              >
                Request a sample
              </Link>
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              All communication goes through your Vexim Trade desk — supplier contact details are not
              displayed publicly.
            </p>
          </div>

          <div className="rounded-lg border border-ink-200 bg-ink-50 p-5">
            <p className="text-[13px] font-semibold text-ink-900">Your Vexim contact</p>
            <p className="mt-1 text-[13px] text-ink-600">
              A dedicated export desk specialist will reply within one business day with a shortlist
              and next steps.
            </p>
          </div>
        </aside>
      </div>

      <section className="mt-14">
        <h3 className="text-[15px] font-semibold text-ink-800">Similar suppliers</h3>
        {related.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-500">More supplier profiles will appear as they are verified and published.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => {
              const rProfile = r.profile_image ? `/public-media/${r.profile_image.replace(/^\//,"")}` : null;
              return (
                <li key={r.id}>
                  <Link href={`/suppliers/${encodeURIComponent(r.slug || r.id)}`} className="block overflow-hidden rounded-lg border border-ink-200 bg-white transition hover:shadow-md">
                    <div className="flex h-32 items-center justify-center bg-ink-50">
                      {rProfile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rProfile} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-ink-300">{(r.display_name ?? r.name).slice(0,1)}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <PublicVerificationBadges levels={r.approved_verification_steps} compact />
                      <p className="mt-1 truncate text-[13.5px] font-bold text-ink-900">{r.display_name ?? r.name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-500">{r.province ?? "Vietnam"} · {supplierTypeLabel(r)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div>
        <p className="text-[11.5px] uppercase tracking-wider text-ink-400">{label}</p>
        <p className="text-[14px] font-medium text-ink-800">{value}</p>
      </div>
    </div>
  );
}
