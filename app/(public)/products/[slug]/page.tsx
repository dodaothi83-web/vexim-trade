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
  HelpCircle,
  PackageCheck,
  Scale,
  ShieldCheck,
  Ship,
  Users,
} from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { CategoryProductGrid } from "@/components/category-product-grid";
import { pilotPlacement, type PilotPlacement } from "@/lib/sponsored/pilot";
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { t } from "@/lib/public/i18n";
import type { Category, CategoryColumn, CategoryFact, CategoryFilter, CategoryRow } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sanitizeHtml } from "@/lib/public/sanitize";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, resolvedSlug, isPreview } = await resolveCategory(slug);
  if (!cat) return { title: "Category not found | Vexim Trade", robots: { index: false, follow: false } };
  const name = t(cat.name_i18n);
  const seoTitle = t(cat.seo_title_i18n) || `${name} Products in Vietnam | Vexim Trade`;
  const seoDesc = t(cat.seo_desc_i18n) || `Explore Vietnamese ${name.toLowerCase()} products by grade, MOQ and supplier verification.`;
  const indexable = !isPreview && !!cat.seo_indexable;
  return {
    title: { absolute: seoTitle },
    description: seoDesc,
    alternates: { canonical: `/products/${resolvedSlug}` },
    openGraph: { title: seoTitle, description: seoDesc, url: `/products/${resolvedSlug}`, siteName: "Vexim Trade", type: "website", images: cat.hero_image ? [{ url: cat.hero_image }] : undefined },
    robots: { index: indexable, follow: !isPreview },
  };
}

/** Tìm category theo slug hoặc previous_slug — nếu trúng previous_slug sẽ 301 sang slug hiện tại. */
async function resolveCategory(slug: string) {
  const store = (await import("@/lib/db")).getStore();
  const session = await getSession();
  const isStaff = !!(session && hasPermission(session.role, "categories.manage"));
  const all = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: false }) : [];
  let cat = (all as Category[]).find((c) => c.slug === slug);
  if (!cat) {
    // Tìm trong previous_slugs → 301
    cat = (all as Category[]).find((c) => Array.isArray(c.previous_slugs) && c.previous_slugs.includes(slug));
    if (cat) permanentRedirect(`/products/${cat.slug}`);
  }
  if (!cat) return { cat: null, resolvedSlug: slug, isStaff, isPreview: false };
  const isPublished = cat.status === "published" && cat.is_published;
  // Người ngoài chỉ xem được category published; staff có categories.manage được xem trước nháp.
  if (!isPublished && !isStaff) return { cat: null, resolvedSlug: slug, isStaff, isPreview: false };
  return { cat, resolvedSlug: cat.slug, isStaff, isPreview: !isPublished };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const { cat, isPreview } = await resolveCategory(slug);
  if (!cat) notFound();

  const products = await listPublicCategoryProducts(cat);
  const sponsored = !isPreview ? await pilotPlacement(cat.slug, products) : null;
  const categoryName = t(cat.name_i18n) || cat.slug;
  const h1 = cat.slug === "cashew" ? "Vietnam Cashew" : (t(cat.h1_i18n) || `Vietnam ${categoryName}`);
  const intro = t(cat.intro_i18n) || `Explore Vietnamese ${categoryName.toLowerCase()} products. Supplier verification is shown on each listing.`;
  // Sanitize body để chặn HTML/script độc từ CMS (chỉ cho p/h2-h4/ul/ol/li/a/strong/em/br).
  const bodyRaw = t(cat.body_i18n);
  const body = bodyRaw ? sanitizeHtml(bodyRaw) : "";
  const isDemo = products.some((p) => p.isDemo);
  const hasProducts = products.length > 0;
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
      {isPreview && (
        <div className="sticky top-[60px] z-20 bg-amber-100 px-4 py-2 text-center text-[12px] font-bold text-amber-900 shadow-sm ring-1 ring-amber-300">
          XEM TRƯỚC (NHÁP) – Chỉ nhân viên đăng nhập mới thấy trang này. Khách quốc tế sẽ thấy 404 cho đến khi Quản trị chuyển sang Đã đăng.
        </div>
      )}
      {isDemo && (
        <div className="sticky top-[60px] z-20 bg-amber-400 px-4 py-2 text-center text-[12px] font-bold text-amber-950 shadow-sm">
          DEMO DATA · Sample profiles for preview only. Not real suppliers.
        </div>
      )}
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/#categories" }, { label: categoryName }]} />
        {hasProducts ? (
          <StateA
            cat={cat}
            products={products}
            sponsored={sponsored}
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
  cat, products, sponsored, categoryName, h1, intro, body, columns, rows, facts, faqs, filters, rfqHref,
}: {
  cat: Category;
  products: PublicCategoryProduct[]; sponsored: PilotPlacement | null;
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
              {h1}
            </h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">{intro}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-800 ring-1 ring-brand-200">
              {products.length} product{products.length > 1 ? "s" : ""}
            </span>
            <Link href={rfqHref} className="hidden sm:inline-flex btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>

        <CategoryProductGrid products={products} categorySlug={cat.slug} grades={grades} rfqHref={rfqHref} sponsored={sponsored} />
      </section>

      {cat.hero_image && (
        <figure className="mt-10 overflow-hidden rounded-xl border border-ink-200">
          <div className="relative aspect-[21/5] max-h-44 w-full bg-ink-50">
            <Image src={cat.hero_image} alt={t(cat.hero_alt_i18n) || categoryName} fill sizes="100vw" className="object-cover" />
          </div>
          <figcaption className="bg-ink-50 px-3 py-2 text-xs text-ink-600">Category overview image · product photos belong to the individual cards above.</figcaption>
        </figure>
      )}

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
          No buyer-ready products are listed in this category yet. Tell us your spec and we will check suitable producers and their supporting documents before recommending a match.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={rfqHref} className="btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          <p className="text-[12.5px] text-ink-500">Reply within <strong className="text-ink-800">1 business day</strong>.</p>
        </div>
        <dl className="mt-8 grid max-w-lg grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
          <HeroStat k="Before listing" v="Product review" />
          <HeroStat k="Reply" v="1 business day" />
          <HeroStat k="Language" v="English · Vietnamese" />
        </dl>
        {cat.hero_image && (
          <figure className="mt-8 overflow-hidden rounded-xl border border-ink-200">
            <div className="relative aspect-[21/9] w-full bg-ink-50">
              <Image src={cat.hero_image} alt={t(cat.hero_alt_i18n) || categoryName} fill sizes="100vw" className="object-cover" priority />
            </div>
            <figcaption className="bg-ink-50 px-3 py-2 text-xs text-ink-600">Category overview image, not a product listing. Individual product photos appear with buyer-ready offers.</figcaption>
          </figure>
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
          <p className="font-semibold text-ink-800">Product listings coming soon.</p>
          <p className="mt-1 leading-relaxed">Products appear here after their category and buyer-shareable information are reviewed. Send us your requirements in the meantime.</p>
        </div>
      </div>
    </section>
  );
}

/* ================== Shared components ================== */

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
          <h2 className="mt-3 text-[24px] font-bold leading-tight sm:text-[28px]">Three evidence-based checks.</h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/75">The badge on each profile shows exactly what we&apos;ve checked. Suppliers we&apos;re still checking don&apos;t get a badge.</p>
          <Link href="/how-we-verify" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-200 hover:text-white">
            Read the full process <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          <Level n="01" icon={<ClipboardCheck className="h-5 w-5" />} title="Documents checked" body="Our team reviews business registration and relevant supporting certificates." />
          <Level n="02" icon={<Factory className="h-5 w-5" />} title="Factory visited" tone="brand" body="A team member records the factory location, facilities and visual evidence." />
          <Level n="03" icon={<FileCheck2 className="h-5 w-5" />} title="Delivery history reviewed" body="Shipment and delivery documents for a completed order are checked. A won enquiry alone does not qualify." />
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
