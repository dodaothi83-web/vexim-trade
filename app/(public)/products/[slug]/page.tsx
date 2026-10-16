import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  MapPin,
  Package,
  ShieldCheck,
} from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import {
  DEFAULT_LOCALE,
  formatFob,
  listPublicSuppliers,
  mainProductNames,
  supplierTypeLabel,
  t,
  verificationBadge,
} from "@/lib/public/catalog";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const store = (await import("@/lib/db")).getStore();
  const categories = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: true }) : [];
  const cat = categories.find((c: Category) => c.slug === slug);
  if (!cat) {
    return { title: "Category not found | Veximtrade", robots: { index: false } };
  }
  return {
    title: t(cat.seo_title_i18n) || `${t(cat.name_i18n)} Suppliers in Vietnam – Verified | Veximtrade`,
    description: t(cat.seo_desc_i18n),
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const store = (await import("@/lib/db")).getStore();
  const categories = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: true }) : [];
  const cat = categories.find((c: Category) => c.slug === slug);
  if (!cat) notFound();

  const suppliers = await listPublicSuppliers({ categorySlug: slug });
  const categoryName = t(cat.name_i18n) || cat.slug;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/#products" },
          { label: categoryName },
        ]}
      />

      <header className="mt-6">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          Verified Vietnamese suppliers
        </p>
        <h1
          className="mt-3 text-[38px] font-bold leading-tight text-ink-900 sm:text-[48px]"
          style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
        >
          {categoryName} suppliers in Vietnam
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-700">
          {t(cat.intro_i18n) ||
            `Compare verified Vietnamese ${categoryName.toLowerCase()} suppliers by grade, MOQ, certification and lead time. Request a quote to receive a shortlist.`}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={`/rfq?category=${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-ink-800"
          >
            Start a sourcing request
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/how-we-verify"
            className="inline-flex items-center gap-2 rounded-md border border-ink-300 px-4 py-2.5 text-[14px] font-semibold text-ink-800 transition hover:border-ink-900"
          >
            How we verify
          </Link>
        </div>
      </header>

      {/* Coming-soon block khi chưa NCC published */}
      {suppliers.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-ink-300 bg-ink-50 p-8 text-center">
          <p className="text-[15px] font-semibold text-ink-800">
            Verified {categoryName.toLowerCase()} profiles are being audited.
          </p>
          <p className="mt-2 text-[14px] text-ink-600">
            We are publishing profiles after on-site verification. Send a sourcing request and we will
            reply with a shortlist within the next business day.
          </p>
          <Link
            href={`/rfq?category=${encodeURIComponent(slug)}`}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-800"
          >
            Send a sourcing request
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {suppliers.length > 0 && (
        <section className="mt-10 overflow-hidden rounded-lg border border-ink-200">
          <div className="divide-y divide-ink-100">
            {suppliers.map((s) => {
              const badge = verificationBadge(s);
              const fob = formatFob(s);
              return (
                <article
                  key={s.id}
                  className="grid gap-4 px-5 py-5 transition hover:bg-ink-50/70 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          badge.tone === "emerald"
                            ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                            : "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200"
                        }
                      >
                        {badge.tone === "emerald" ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <HelpCircle className="h-3 w-3" />
                        )}
                        {badge.text}
                      </span>
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11.5px] font-semibold text-ink-700">
                        {supplierTypeLabel(s)}
                      </span>
                      {s.province && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
                          <MapPin className="h-3 w-3" />
                          {s.province}
                        </span>
                      )}
                      {s.founded_year && (
                        <span className="text-[12px] text-ink-500">Est. {s.founded_year}</span>
                      )}
                    </div>
                    <h2
                      className="mt-2 text-[20px] font-bold leading-snug text-ink-900"
                      style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
                    >
                      <Link
                        href={`/suppliers/${s.slug ?? s.id}`}
                        className="transition hover:text-brand-700"
                      >
                        {s.display_name ?? s.name}
                      </Link>
                    </h2>
                    <p className="mt-1 line-clamp-2 max-w-2xl text-[14px] leading-relaxed text-ink-600">
                      {t(s.summary_i18n) || mainProductNames(s.main_products) || "—"}
                    </p>
                    <dl className="mt-3 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-[13px] text-ink-600 sm:grid-cols-4">
                      <Stat label="Main products" value={mainProductNames(s.main_products, 2) || "—"} />
                      <Stat
                        label="MOQ"
                        value={s.moq_text || (s.lead_time_days ? `contact for MOQ` : "—")}
                      />
                      <Stat label="Lead time" value={s.lead_time_days ? `${s.lead_time_days} days` : "—"} />
                      <Stat
                        label="FOB reference"
                        value={fob ?? <span className="italic text-ink-400">On request</span>}
                      />
                    </dl>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Link
                      href={`/suppliers/${s.slug ?? s.id}`}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:text-brand-800"
                    >
                      View profile
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/rfq?suppliers=${s.id}&category=${encodeURIComponent(slug)}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
                    >
                      Request quote
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      data-compare-add={s.id}
                      className="inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-ink-900"
                      disabled
                      title="Compare bar is coming in the next build"
                    >
                      <Package className="h-3.5 w-3.5" />
                      + Compare
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Khối "Can't find the right supplier?" */}
      <section className="mt-12 rounded-lg border border-ink-200 bg-ink-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-bold text-ink-900">Can&apos;t find the right supplier?</h3>
            <p className="mt-1 max-w-lg text-[14px] leading-relaxed text-ink-600">
              Tell us what you need. We will screen suppliers beyond the public list and reply with a
              shortlist marked <em>Stated / Verified / Open</em>.
            </p>
          </div>
          <Link
            href={`/rfq?category=${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-2 self-end rounded-md bg-ink-900 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-800"
          >
            Start a sourcing request
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="text-[13px] font-medium text-ink-800">{value}</dd>
    </div>
  );
}
