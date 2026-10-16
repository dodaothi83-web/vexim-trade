import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import {
  Anchor,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FileCheck2,
  Filter,
  HelpCircle,
  MapPin,
  PackageCheck,
  Scale,
  ShieldCheck,
  Ship,
  Users,
} from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import {
  formatFob,
  listPublicSuppliers,
  mainProductNames,
  supplierTypeLabel,
  verificationBadge,
} from "@/lib/public/catalog";
import { t } from "@/lib/public/i18n";
import type { Category, CategoryColumn, CategoryFact, CategoryFilter, CategoryRow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, resolvedSlug } = await resolveCategory(slug);
  if (!cat) return { title: "Category not found | Vexim Trade", robots: { index: false } };
  const name = t(cat.name_i18n);
  const seoTitle = t(cat.seo_title_i18n) || `${name} Suppliers in Vietnam – Verified | Vexim Trade`;
  const seoDesc = t(cat.seo_desc_i18n) || `Verified Vietnamese ${name.toLowerCase()} suppliers.`;
  return {
    title: { absolute: seoTitle },
    description: seoDesc,
    alternates: { canonical: `/products/${resolvedSlug}` },
    openGraph: { title: seoTitle, description: seoDesc, url: `/products/${resolvedSlug}`, siteName: "Vexim Trade", type: "website", images: cat.hero_image ? [{ url: cat.hero_image }] : undefined },
    robots: { index: !!cat.seo_indexable, follow: true },
  };
}

/** Tìm category theo slug hoặc previous_slug — nếu trúng previous_slug sẽ 301 sang slug hiện tại. */
async function resolveCategory(slug: string) {
  const store = (await import("@/lib/db")).getStore();
  const all = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: false }) : [];
  let cat = (all as Category[]).find((c) => c.slug === slug);
  if (!cat) {
    // Tìm trong previous_slugs → 301
    cat = (all as Category[]).find((c) => Array.isArray(c.previous_slugs) && c.previous_slugs.includes(slug));
    if (cat) permanentRedirect(`/products/${cat.slug}`);
  }
  // Chỉ hiện trang cho category published (draft chỉ cho staff preview — MVP chặn luôn).
  if (!cat || (cat.status === "draft" || !cat.is_published)) return { cat: null, resolvedSlug: slug };
  return { cat, resolvedSlug: cat.slug };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const { cat } = await resolveCategory(slug);
  if (!cat) notFound();

  const includeDemo = process.env.VEXIM_SHOW_DEMO === "true";
  const suppliers = await listPublicSuppliers({ categorySlug: cat.slug, includeDemo });
  const categoryName = t(cat.name_i18n) || cat.slug;
  const h1 = t(cat.h1_i18n) || `${categoryName} suppliers in Vietnam`;
  const intro = t(cat.intro_i18n) || `Verified Vietnamese ${categoryName.toLowerCase()} suppliers.`;
  const body = t(cat.body_i18n);
  const isDemo = includeDemo && suppliers.some((s) => (s as { is_demo?: boolean }).is_demo);
  const hasSuppliers = suppliers.length > 0;
  const rfqHref = `/rfq?category=${encodeURIComponent(cat.slug)}`;

  const columns: CategoryColumn[] = Array.isArray(cat.spec_columns) ? (cat.spec_columns as CategoryColumn[]) : [];
  const rows: CategoryRow[] = Array.isArray(cat.spec_rows) ? (cat.spec_rows as CategoryRow[]) : [];
  const facts: CategoryFact[] = Array.isArray(cat.buying_facts) ? (cat.buying_facts as CategoryFact[]) : [];
  const faqs = Array.isArray(cat.faq_i18n)
    ? (cat.faq_i18n as Array<{ q?: string; a?: string; question?: string; answer?: string }>)
        .map((f) => ({ q: f.q ?? f.question ?? "", a: f.a ?? f.answer ?? "" }))
        .filter((f) => f.q && f.a)
    : [];
  const filters: CategoryFilter[] = Array.isArray(cat.filters) ? (cat.filters as CategoryFilter[]) : [];

  return (
    <>
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            }),
          }}
        />
      )}
      {isDemo && (
        <div className="sticky top-[60px] z-20 bg-amber-400 px-4 py-2 text-center text-[12px] font-bold text-amber-950 shadow-sm">
          DEMO DATA · Sample profiles for preview only. Not real suppliers.
        </div>
      )}
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/#categories" }, { label: categoryName }]} />
        {hasSuppliers ? (
          <StateA
            cat={cat}
            suppliers={suppliers}
            categoryName={categoryName}
            h1={h1}
            intro={intro}
            body={body}
            columns={columns}
            rows={rows}
            facts={facts}
            faqs={faqs}
            filters={filters}
            rfqHref={rfqHref}
          />
        ) : (
          <StateB cat={cat} categoryName={categoryName} h1={h1} intro={intro} rfqHref={rfqHref} />
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:hidden">
          <Link href={rfqHref} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14px] font-bold text-white">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

/* ================== STATE A — đã có NCC ================== */

function StateA({
  cat, suppliers, categoryName, h1, intro, body, columns, rows, facts, faqs, filters, rfqHref,
}: {
  cat: Category;
  suppliers: Awaited<ReturnType<typeof listPublicSuppliers>>;
  categoryName: string; h1: string; intro: string; body: string | null;
  columns: CategoryColumn[];
  rows: CategoryRow[];
  facts: CategoryFact[];
  faqs: Array<{ q: string; a: string }>;
  filters: CategoryFilter[];
  rfqHref: string;
}) {
  const grades: string[] = [];
  for (const f of filters) {
    if ((f.key || "").toLowerCase().includes("grade") && Array.isArray(f.options)) {
      for (const o of f.options) grades.push(typeof o === "string" ? o : o.label);
    }
  }
  return (
    <>
      <section className="mt-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese {categoryName.toLowerCase()}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-black leading-[1.05] text-ink-900 sm:text-[42px]">
              <span className="text-brand-700">Vietnam </span>{h1.replace(/^Vietnam\s+/i, "").replace(/\s*in Vietnam$/i, "")}
              {/in Vietnam/i.test(h1) ? null : <span className="text-brand-700"> in Vietnam</span>}
            </h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">{intro}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-800 ring-1 ring-brand-200">
              {suppliers.length} supplier{suppliers.length > 1 ? "s" : ""}
            </span>
            <Link href={rfqHref} className="hidden sm:inline-flex btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>

        {cat.hero_image && (
          <div className="mt-5 overflow-hidden rounded-xl border border-ink-200">
            <div className="relative aspect-[21/9] w-full bg-ink-50">
              <Image src={cat.hero_image} alt={t(cat.hero_alt_i18n) || categoryName} fill sizes="100vw" className="object-cover" priority />
            </div>
          </div>
        )}

        {grades.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-ink-500">Grades:</span>
            {grades.map((g) => (
              <Link key={g} href={`${rfqHref}#${g}`} className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700">
                {g}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        <details className="lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3 text-[13.5px] font-semibold text-ink-800">
            <span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="mt-2 rounded-lg border border-ink-200 bg-white p-4"><FilterSidebar filters={filters} rfqHref={rfqHref} /></div>
        </details>
        <aside className="hidden lg:block">
          <div className="sticky top-[80px] rounded-xl border border-ink-200 bg-white p-5">
            <FilterSidebar filters={filters} rfqHref={rfqHref} />
            <div className="mt-6 border-t border-ink-100 pt-5">
              <Link href={rfqHref} className="btn btn-primary w-full">Request a quote <ArrowRight className="h-4 w-4" /></Link>
              <p className="mt-2 text-center text-[11.5px] text-ink-500">We reply within one business day.</p>
            </div>
          </div>
        </aside>
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            {suppliers.map((s) => (<SupplierCard key={s.id} s={s} slug={cat.slug} />))}
          </div>
        </div>
      </section>

      {columns.length > 0 && rows.length > 0 && (
        <CollapsibleSection id="specs" eyebrow="Grade reference" title={`${categoryName} specification`} subtitle="Reference spec from the supplier's spec sheet. Final terms are agreed in your contract.">
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-ink-50 text-[12px] uppercase tracking-[0.08em] text-ink-500">
                  {columns.map((c) => (
                    <th key={c.key} className={"px-4 py-3 text-left font-semibold " + (c.width ?? "")}>
                      {c.label || c.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-ink-50/60">
                    {columns.map((c) => {
                      const val = r.values?.[c.key] ?? "";
                      return (
                        <td key={c.key} className={"px-4 py-3 " + (c.emphasis ? "font-black text-brand-800" : "text-ink-700")}>{val}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {facts.length > 0 && (
        <CollapsibleSection id="basics" eyebrow="Sourcing basics" title={`Buying ${categoryName.toLowerCase()} from Vietnam`} subtitle="Typical terms. Each supplier confirms their own in the quote.">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((f) => (
              <Fact key={f.key || f.label} icon={iconByName(f.icon)} label={f.label} value={f.value} />
            ))}
          </dl>
        </CollapsibleSection>
      )}

      <VerificationSection />

      {body && (
        <section id="about" className="mt-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">About this category</p>
          <h2 className="mt-2 text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">{categoryName} from Vietnam</h2>
          <div className="prose prose-ink mt-4 max-w-none text-[15px] leading-relaxed text-ink-700" dangerouslySetInnerHTML={{ __html: body }} />
        </section>
      )}

      {faqs.length > 0 && (
        <section id="faq" className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Common questions</p>
              <h2 className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[30px]">Questions buyers ask</h2>
            </div>
          </div>
          <ul className="mt-6 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
            {faqs.map((f) => (
              <li key={f.q} className="p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-ink-900">{f.q}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">{f.a}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CtaBlock slug={cat.slug} />
    </>
  );
}

/* ================== STATE B — chưa có NCC ================== */

function StateB({ cat, categoryName, h1, intro, rfqHref }: { cat: Category; categoryName: string; h1: string; intro: string; rfqHref: string }) {
  return (
    <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese {categoryName.toLowerCase()}</span>
        </div>
        <h1 className="mt-4 text-[34px] font-black leading-[1.05] text-ink-900 sm:text-[44px]">{h1}</h1>
        <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-700">{intro}</p>
        <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-600">
          Before a supplier appears on this page, someone from our team visits the facility and checks their papers. We are building out the verified list now — tell us your spec and we will match you with suitable producers.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={rfqHref} className="btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          <p className="text-[12.5px] text-ink-500">Reply within <strong className="text-ink-800">1 business day</strong>.</p>
        </div>
        <dl className="mt-8 grid max-w-lg grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
          <HeroStat k="Before listing" v="Factory visits" />
          <HeroStat k="Reply" v="1 business day" />
          <HeroStat k="Language" v="English · Vietnamese" />
        </dl>
        {cat.hero_image && (
          <div className="mt-8 overflow-hidden rounded-xl border border-ink-200">
            <div className="relative aspect-[21/9] w-full bg-ink-50">
              <Image src={cat.hero_image} alt={t(cat.hero_alt_i18n) || categoryName} fill sizes="100vw" className="object-cover" priority />
            </div>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600">Tell us what you need</p>
        <h2 className="mt-2 text-[20px] font-bold leading-tight text-ink-900">Get matched with {categoryName.toLowerCase()} suppliers</h2>
        <p className="mt-1 text-[13.5px] text-ink-600">Free. No account needed. We&apos;ll send you 2–4 options within one business day.</p>
        <ul className="mt-5 space-y-2 text-[13.5px] text-ink-700">
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Spec and grade you need.</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Volume and destination.</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Certifications required (BRC, HACCP, organic…).</li>
        </ul>
        <Link href={rfqHref} className="btn btn-primary mt-6 w-full justify-center">Start your request <ArrowRight className="h-4 w-4" /></Link>
        <div className="mt-5 rounded-lg bg-ink-50 p-4 text-[12.5px] text-ink-600">
          <p className="font-semibold text-ink-800">Supplier profiles coming soon.</p>
          <p className="mt-1 leading-relaxed">We are visiting producers in this category. Profiles will appear here after each on-site check. Send us your requirements in the meantime.</p>
        </div>
      </div>
    </section>
  );
}

/* ================== Shared components ================== */

function FilterSidebar({ filters, rfqHref }: { filters: CategoryFilter[]; rfqHref: string }) {
  const groups: CategoryFilter[] = filters.length > 0 ? filters : [
    { key: "verification", label: "Verification", options: [{ value: "l3", label: "Export proven (L3)" }, { value: "l2", label: "Factory audited (L2)" }, { value: "l1", label: "Documents checked (L1)" }] },
    { key: "type", label: "Supplier type", options: [{ value: "factory", label: "Factory" }, { value: "trader", label: "Trader" }, { value: "coop", label: "Cooperative" }] },
  ];
  return (
    <div className="space-y-5 text-[13px]">
      {groups.map((g) => (
        <FilterGroup key={g.key} title={g.label}>
          {(g.options ?? []).map((opt) => {
            const key = typeof opt === "string" ? opt : opt.value;
            const label = typeof opt === "string" ? opt : opt.label;
            return (
              <label key={key} className="flex items-center gap-2 text-ink-700">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-700 focus:ring-brand-500" />{label}
              </label>
            );
          })}
        </FilterGroup>
      ))}
      <Link href={rfqHref} className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand-700 lg:hidden">Can&apos;t find it? Tell us →</Link>
      {filters.length === 0 && <p className="pt-2 text-[11.5px] italic text-ink-400">Filters coming soon — tell us your needs and we&apos;ll shortlist for you.</p>}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{title}</h4>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function CollapsibleSection({ id, eyebrow, title, subtitle, children }: { id: string; eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-14">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
            <h2 className="mt-2 text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">{title}</h2>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">{subtitle}</p>
          </div>
          <ChevronDown className="mt-2 h-5 w-5 shrink-0 text-ink-400 transition group-open:rotate-180" />
        </summary>
        <div className="mt-6">{children}</div>
      </details>
    </section>
  );
}

function VerificationSection() {
  return (
    <section id="verification" className="mt-14 rounded-2xl bg-ink-900 p-6 text-white sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-300">How we check suppliers</p>
          <h2 className="mt-3 text-[24px] font-bold leading-tight sm:text-[28px]">Three levels of checks.</h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/75">The badge on each profile shows exactly what we&apos;ve checked. Suppliers we&apos;re still checking don&apos;t get a badge.</p>
          <Link href="/how-we-verify" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-200 hover:text-white">
            Read the full process <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          <Level n="L1" icon={<ClipboardCheck className="h-5 w-5" />} title="Documents checked" body="We verify business registration, tax code, export licence and certificates against official records." />
          <Level n="L2" icon={<Factory className="h-5 w-5" />} title="Factory audited" tone="brand" body="Someone from our team visits the factory, confirms the address and production line." />
          <Level n="L3" icon={<FileCheck2 className="h-5 w-5" />} title="Export proven" body="The supplier has shown records of past export shipments and completed at least one order through Vexim." />
        </ol>
      </div>
    </section>
  );
}

function CtaBlock({ slug, compact }: { slug: string; compact?: boolean }) {
  return (
    <section className={"overflow-hidden rounded-2xl border border-ink-200 bg-gradient-to-br from-brand-50 via-white to-white " + (compact ? "mt-10" : "mt-14")}>
      <div className="grid gap-6 p-8 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Need a specific spec?</p>
          <h3 className="mt-2 text-[24px] font-bold leading-snug text-ink-900 sm:text-[28px]">Can&apos;t find what you need?</h3>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-700">Tell us the grade, volume, destination and when you need it. We&apos;ll look beyond the suppliers listed here and come back with options, with what we&apos;ve checked clearly marked.</p>
          <ul className="mt-4 grid gap-1.5 text-[13.5px] text-ink-700 sm:grid-cols-2">
            {["Matching grade and specs", "MOQ and price guidance", "Factory visit notes", "Help with samples"].map((it) => (
              <li key={it} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />{it}</li>
            ))}
          </ul>
        </div>
        <div className="flex lg:justify-end">
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}

function SupplierCard({ s, slug }: { s: Awaited<ReturnType<typeof listPublicSuppliers>>[number]; slug: string }) {
  const badge = verificationBadge(s);
  const fob = formatFob(s);
  const isDemo = (s as { is_demo?: boolean }).is_demo;
  const badgeClass =
    badge.tone === "emerald" ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : badge.tone === "slate" ? "bg-slate-100 text-slate-700 ring-slate-200"
    : "bg-ink-100 text-ink-600 ring-ink-200";
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-brand-50 to-ink-50 text-brand-700">
        <Factory className="h-9 w-9 opacity-60" />
        {isDemo && <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow">Demo</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + badgeClass}>
            {badge.tone === "emerald" ? <ShieldCheck className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}{badge.text}
          </span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">{supplierTypeLabel(s)}</span>
        </div>
        <h3 className="mt-2 text-[16px] font-bold leading-snug text-ink-900">
          <Link href={`/suppliers/${s.slug ?? s.id}`} className="hover:text-brand-700">{s.display_name ?? s.name}</Link>
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-ink-500"><MapPin className="h-3.5 w-3.5" />{s.province || "Vietnam"}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
          <CardStat k="Grades" v={mainProductNames(s.main_products, 2) || "—"} />
          <CardStat k="MOQ" v={s.moq_text || "On request"} />
          <CardStat k="Lead time" v={s.lead_time_days ? `${s.lead_time_days} days` : "—"} />
          <CardStat k="FOB ref." v={fob ? fob : "On request"} />
        </dl>
        <div className="mt-auto flex gap-2 pt-4">
          <Link href={`/suppliers/${s.slug ?? s.id}`} className="flex-1 rounded-md border border-ink-200 px-3 py-2 text-center text-[12.5px] font-semibold text-ink-700 hover:border-ink-900 hover:text-ink-900">View profile</Link>
          <Link href={`/rfq?suppliers=${s.id}&category=${encodeURIComponent(slug)}`} className="flex-1 rounded-md bg-ink-900 px-3 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-ink-800">Request quote</Link>
        </div>
      </div>
    </article>
  );
}

function HeroStat({ k, v }: { k: string; v: string }) {
  return (<div><dt className="text-[11px] uppercase tracking-wider text-ink-400">{k}</dt><dd className="mt-0.5 text-[14.5px] font-bold text-ink-900">{v}</dd></div>);
}

function Fact({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (<div className="flex gap-3 rounded-xl border border-ink-200 bg-white p-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></div><div><dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</dt><dd className="mt-1 text-[14px] leading-relaxed text-ink-800">{value}</dd></div></div>);
}

function Level({ n, icon, title, body, tone = "neutral" }: { n: string; icon: ReactNode; title: string; body: string; tone?: "neutral" | "brand" }) {
  const active = tone === "brand";
  return (<li className={"rounded-xl border p-5 " + (active ? "border-brand-400/40 bg-brand-500/10" : "border-white/15 bg-white/5")}><div className="flex items-center justify-between"><div className={"flex h-9 w-9 items-center justify-center rounded-lg " + (active ? "bg-brand-400 text-ink-900" : "bg-white/10 text-white")}>{icon}</div><span className={"text-[11px] font-black " + (active ? "text-brand-200" : "text-white/50")}>{n}</span></div><p className="mt-4 text-[15px] font-bold text-white">{title}</p><p className="mt-1 text-[13px] leading-relaxed text-white/75">{body}</p></li>);
}

function CardStat({ k, v }: { k: string; v: ReactNode }) {
  return (<div><dt className="text-[10.5px] uppercase tracking-wider text-ink-400">{k}</dt><dd className="text-[13px] font-medium text-ink-800">{v}</dd></div>);
}

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  scale: Scale, package: PackageCheck, ship: Ship, anchor: Anchor, calendar: CalendarRange, users: Users,
  factory: Factory, check: CheckCircle2, shield: ShieldCheck,
};
function iconByName(name?: string): ComponentType<{ className?: string }> {
  if (!name) return CheckCircle2;
  return ICON_MAP[name.toLowerCase()] ?? CheckCircle2;
}
