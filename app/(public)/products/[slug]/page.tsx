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
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const CATEGORY_RFQ_META_SUFFIX =
  "Request a quote from a supplier you choose, or send your requirements and Vexim will shortlist suppliers that match.";

const CATEGORY_EN_TITLES: Record<string, string> = {
  cashew: "Cashew Kernels & Value-Added Cashew",
  "nuts-kernels": "Nutritional Nuts & Kernels",
  macadamia: "Central Highlands Macadamia Nuts",
  coffee: "Green Coffee Beans & Roasted Coffee",
  pepper: "Vietnamese Black & White Pepper",
  "pepper-spices": "Pepper & Natural Spices",
  cinnamon: "Cassia Cinnamon & Star Anise",
  "star-anise": "Lang Son Whole Star Anise",
  coconut: "Ben Tre Coconut Products",
  rice: "Fragrant & Export Rice Products",
  noodles: "Dried Rice Noodles, Vermicelli & Rice Paper",
  "fruit-veg": "Processed & IQF Fruits & Vegetables",
  "dragon-fruit": "Fresh & IQF Dragon Fruit",
  "dried-fruit": "Soft-Dried & Crispy Fruit Snacks",
  seafood: "Frozen Export Seafood",
  pangasius: "Frozen Pangasius Fillets",
  shrimp: "Black Tiger & Vannamei Shrimp",
  honey: "Natural Export Honey",
  tea: "Green Tea, Black Tea & Oolong Tea",
  "processed-foods": "Processed & Packaged Foods",
};

const CATEGORY_SUBGROUPS_EN: Record<string, string[]> = {
  cashew: [
    "Whole white cashew kernels (WW180, WW240, WW320, WW450)",
    "Scorched & broken kernels for bakery & confectionery (WS, LP, SP)",
    "Roasted salted, skin-on & flavored retail cashew (OEM)",
    "Cashew butter & private-label nutritional nut packs",
  ],
  "nuts-kernels": [
    "Export-grade cashew kernels (W240, W320, W450)",
    "Central Highlands macadamia nuts (in-shell & kernel)",
    "Blanched peanuts & dried lotus seeds",
    "Custom roasted & seasoned nut mixes (Private Label)",
  ],
  coffee: [
    "Green Robusta coffee beans (G1, G2, S16, S18 – Wet/Dry)",
    "Cau Dat & Son La washed Arabica green coffee beans",
    "Whole-bean roasted & ground coffee for filter and espresso",
    "Spray-dried & freeze-dried instant coffee (pure & 3-in-1)",
  ],
  pepper: [
    "Whole black pepper (FAQ 500g/l, 550g/l & ASTA grade)",
    "Double-washed white peppercorns (White Pepper)",
    "Steam-sterilised ground & cracked black pepper",
    "Freeze-dried green pepper, red pepper & certified organic pepper",
  ],
  "pepper-spices": [
    "Export-grade black & white peppercorns",
    "Yen Bai cassia cinnamon tubes, split & powder",
    "Lang Son dried star anise & black cardamom",
    "Dried sliced ginger, turmeric & natural spice powders",
  ],
  cinnamon: [
    "Yen Bai cigarette & stick cassia cinnamon (Stick / Cigarette)",
    "Split, broken & pressed-bale cassia cinnamon",
    "High-oil pure cassia cinnamon powder (2% – 4% volatile oil)",
    "Lang Son whole star anise & natural cinnamon essential oil",
  ],
  coconut: [
    "Desiccated coconut (Fine / Medium grade, High Fat)",
    "Canned & aseptic coconut milk, coconut cream & milk powder",
    "UHT pure coconut water, canned coconut water & nata de coco",
    "Cold-pressed Virgin Coconut Oil (VCO) & RBD coconut oil",
  ],
  rice: [
    "Specialty fragrant rice (ST25, ST24 & Jasmine 85)",
    "Long-grain white rice for export (5%, 15%, 25% broken)",
    "Japonica round-grain rice (Sushi) & glutinous rice",
    "Dried rice vermicelli, Pho noodles & export rice paper",
  ],
  seafood: [
    "Frozen Pangasius fillets (Well-trimmed / Untrimmed)",
    "Vannamei & Black Tiger shrimp (HLSO, PD, PTO, Nobashi)",
    "Frozen squid, octopus & breaded value-added seafood",
    "Surimi fish paste & retail-ready frozen seafood packs",
  ],
  "fruit-veg": [
    "IQF frozen tropical fruits (mango, dragon fruit, durian)",
    "Soft-dried & vacuum-fried fruit snacks for export",
    "Aseptic fruit puree & juice concentrates in drums",
    "Export-grade frozen & canned vegetables",
  ],
};

function categoryMetaDescription(name: string, storedDescription: string): string {
  const base = storedDescription.trim();
  const fallback = `Compare verified Vietnamese ${name.toLowerCase()} products and suppliers. ${CATEGORY_RFQ_META_SUFFIX}`;
  if (!base) return fallback;

  const hasChosenSupplierPath = /supplier you choose|your chosen supplier|chosen supplier/i.test(base);
  const hasOpenRequestPath = /shortlist/i.test(base);
  if (hasChosenSupplierPath && hasOpenRequestPath) return base;

  if (!hasChosenSupplierPath && !hasOpenRequestPath) {
    const withSuffix = `${base.replace(/[\s.]+$/, "")}. ${CATEGORY_RFQ_META_SUFFIX}`;
    return withSuffix.length <= 185 ? withSuffix : fallback;
  }

  const complement = hasChosenSupplierPath
    ? "If you have not found the right fit, send your requirements and Vexim will shortlist suppliers that match."
    : "You can also request a quote from a supplier you choose.";
  const withComplement = `${base.replace(/[\s.]+$/, "")}. ${complement}`;
  if (withComplement.length <= 185) return withComplement;

  const firstSentence = base.match(/^[^.]+\./)?.[0]?.trim();
  const shortened = firstSentence ? `${firstSentence} ${CATEGORY_RFQ_META_SUFFIX}` : fallback;
  return shortened.length <= 185 ? shortened : fallback;
}

const STANDARD_CATEGORY_FAQS = [
  {
    q: "Can I request a quote from a specific supplier?",
    a: "Yes. Your request goes to that supplier first. If they cannot meet it, Vexim will ask you before suggesting anyone else.",
  },
  {
    q: "How does Vexim match suppliers for an open request?",
    a: "Suppliers are matched on your requirements only, including your specs, quantity and market. Paid listings never affect who Vexim recommends.",
  },
  {
    q: "How are supplier certificates verified on Vexim Trade?",
    a: "When suppliers upload quality certificates (HACCP, ISO 22000, BRC, Halal, FDA, Organic), Vexim's automated recognition scans the certified holder name and expiration date, labeling each certificate as Owner or Partner Entity.",
  },
] as const;

function normalizeCategoryFaqText(text: string): string {
  return text
    .replace(/\b2\s*(?:to|–|-|—)\s*4\s+(?:supplier\s+options|supplier\s+quotes|suppliers|options|quotes)\b/gi, "matching suppliers")
    .replace(/\b2\s*(?:to|–|-|—)\s*4\b/g, "matching suppliers")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryFaqs(raw: unknown): Array<{ q: string; a: string }> {
  const faqs = Array.isArray(raw)
    ? raw
        .map((f) => {
          const item = (f ?? {}) as { q?: unknown; a?: unknown; question?: unknown; answer?: unknown };
          return {
            q: normalizeCategoryFaqText(typeof item.q === "string" ? item.q : typeof item.question === "string" ? item.question : ""),
            a: normalizeCategoryFaqText(typeof item.a === "string" ? item.a : typeof item.answer === "string" ? item.answer : ""),
          };
        })
        .filter((f) => f.q && f.a)
    : [];

  if (faqs.length === 0) return faqs;

  const hasSpecificSupplierFaq = faqs.some((f) =>
    /specific supplier|supplier you choose|goes to (?:that|this) supplier first/i.test(`${f.q} ${f.a}`),
  );
  const hasMatchingBasisFaq = faqs.some((f) =>
    /paid listings|matched on your requirements/i.test(`${f.q} ${f.a}`),
  );

  return [
    ...faqs,
    ...(!hasSpecificSupplierFaq ? [STANDARD_CATEGORY_FAQS[0]] : []),
    ...(!hasMatchingBasisFaq ? [STANDARD_CATEGORY_FAQS[1]] : []),
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { cat, resolvedSlug, isPreview } = await resolveCategory(slug);
  if (!cat) return { title: "Category not found | Vexim Trade", robots: { index: false, follow: false } };
  const name = CATEGORY_EN_TITLES[cat.slug] || t(cat.name_i18n) || cat.slug;
  const seoTitle = t(cat.seo_title_i18n) || `${name} Products & Verified Suppliers in Vietnam | Vexim Trade`;
  const seoDesc = categoryMetaDescription(name, t(cat.seo_desc_i18n));
  const indexable = !isPreview && !!cat.seo_indexable;
  const heroImage = cat.hero_image || "/images/home/hero-cashew-texture.jpg";
  const images = [{ url: heroImage, alt: `${name} products and verified suppliers in Vietnam` }];
  return {
    title: { absolute: seoTitle },
    description: seoDesc,
    alternates: { canonical: `/products/${resolvedSlug}` },
    openGraph: { title: seoTitle, description: seoDesc, url: `/products/${resolvedSlug}`, siteName: "Vexim Trade", type: "website", images },
    twitter: { card: "summary_large_image", title: seoTitle, description: seoDesc, images: [heroImage] },
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
  const { cat, isPreview, resolvedSlug } = await resolveCategory(slug);
  if (!cat) notFound();

  const products = await listPublicCategoryProducts(cat);
  const sponsored = !isPreview ? await pilotPlacement(cat.slug, products) : null;
  const categoryName = CATEGORY_EN_TITLES[cat.slug] || t(cat.name_i18n) || cat.slug;
  const h1 = cat.slug === "cashew" ? "Vietnam Cashew" : (t(cat.h1_i18n) || `Vietnam ${categoryName}`);
  const intro =
    t(cat.intro_i18n) ||
    `Explore export-ready Vietnamese ${categoryName.toLowerCase()} products and verified suppliers. Compare specifications, MOQ, reference FOB pricing, and independent verification badges (business documents & certificate holder status, factory evidence, and export delivery history), then request a quote from the supplier you choose or send your requirements for Vexim to shortlist matching suppliers.`;
  const subgroups = CATEGORY_SUBGROUPS_EN[cat.slug] ?? [];
  // Sanitize body để chặn HTML/script độc từ CMS (chỉ cho p/h2-h4/ul/ol/li/a/strong/em/br).
  const bodyRaw = t(cat.body_i18n);
  const body = bodyRaw ? sanitizeHtml(bodyRaw) : "";
  const isDemo = products.some((p) => p.isDemo);
  const hasProducts = products.length > 0;
  const rfqHref = `/rfq?category=${encodeURIComponent(cat.slug)}`;

  const columns: CategoryColumn[] = Array.isArray(cat.spec_columns) ? (cat.spec_columns as CategoryColumn[]) : [];
  const rows: CategoryRow[] = Array.isArray(cat.spec_rows) ? (cat.spec_rows as CategoryRow[]) : [];
  const facts: CategoryFact[] = Array.isArray(cat.buying_facts) ? (cat.buying_facts as CategoryFact[]) : [];
  const faqs = categoryFaqs(cat.faq_i18n);
  const filters: CategoryFilter[] = Array.isArray(cat.filters) ? (cat.filters as CategoryFilter[]) : [];

  // Schema cho trang danh mục: đường dẫn breadcrumb luôn có; ItemList chỉ khi đã có sản phẩm.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Products", item: `${SITE_URL}/#categories` },
      { "@type": "ListItem", position: 3, name: categoryName, item: `${SITE_URL}/products/${encodeURIComponent(resolvedSlug)}` },
    ],
  };
  const itemListJsonLd = hasProducts ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${categoryName} products`,
    itemListElement: products.map((p, index) => ({
      "@type": "ListItem", position: index + 1, name: p.name,
      url: `${SITE_URL}/products/${encodeURIComponent(cat.slug)}/${encodeURIComponent(p.id)}`,
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }} />}
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
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
            subgroups={subgroups}
            body={body}
            columns={columns}
            rows={rows}
            facts={facts}
            faqs={faqs}
            filters={filters}
            rfqHref={rfqHref}
          />
        ) : (
          <StateB cat={cat} categoryName={categoryName} h1={h1} intro={intro} subgroups={subgroups} rfqHref={rfqHref}
            columns={columns} rows={rows} facts={facts} faqs={faqs} body={body} />
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
  cat, products, sponsored, categoryName, h1, intro, subgroups, body, columns, rows, facts, faqs, filters, rfqHref,
}: {
  cat: Category;
  products: PublicCategoryProduct[]; sponsored: PilotPlacement | null;
  categoryName: string; h1: string; intro: string; subgroups: string[]; body: string | null;
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
            {subgroups.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Key product sub-groups:
                </span>
                {subgroups.map((sub) => (
                  <span
                    key={sub}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                  >
                    {sub}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-800 ring-1 ring-brand-200">
              {products.length} product{products.length > 1 ? "s" : ""}
            </span>
            <Link href={rfqHref} className="hidden sm:inline-flex btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>

        <CategoryProductGrid products={products} categorySlug={cat.slug} grades={grades} sponsored={sponsored} productFields={cat.product_fields ?? []} />
      </section>

      {cat.hero_image && (
        <figure className="mt-10 overflow-hidden rounded-xl border border-ink-200">
          <div className="relative aspect-[21/5] max-h-44 w-full bg-ink-50">
            <Image src={cat.hero_image} alt={t(cat.hero_alt_i18n) || categoryName} fill sizes="100vw" className="object-cover" />
          </div>
          <figcaption className="bg-ink-50 px-3 py-2 text-xs text-ink-600">Category overview image · product photos belong to the individual cards above.</figcaption>
        </figure>
      )}

      <CategoryContentSections columns={columns} rows={rows} facts={facts} faqs={faqs} body={body} categoryName={categoryName} />

      <CtaBlock slug={cat.slug} />
    </>
  );
}

/* ============ Nội dung CMS dùng chung cho cả hai trạng thái ============ */

function CategoryContentSections({ columns, rows, facts, faqs, body, categoryName }: {
  columns: CategoryColumn[]; rows: CategoryRow[]; facts: CategoryFact[];
  faqs: Array<{ q: string; a: string }>; body: string | null; categoryName: string;
}) {
  return (
    <>
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
    </>
  );
}

/* ================== STATE B — chưa có NCC ================== */

function StateB({ cat, categoryName, h1, intro, subgroups, rfqHref, columns, rows, facts, faqs, body }: {
  cat: Category; categoryName: string; h1: string; intro: string; subgroups: string[]; rfqHref: string;
  columns: CategoryColumn[]; rows: CategoryRow[]; facts: CategoryFact[];
  faqs: Array<{ q: string; a: string }>; body: string | null;
}) {
  return (
    <>
    <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese {categoryName.toLowerCase()}</span>
        </div>
        <h1 className="mt-4 text-[34px] font-black leading-[1.05] text-ink-900 sm:text-[44px]">{h1}</h1>
        <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-700">{intro}</p>
        {subgroups.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {subgroups.map((sub) => (
              <span
                key={sub}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-ink-700"
              >
                {sub}
              </span>
            ))}
          </div>
        )}
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
        <p className="mt-1 text-[13.5px] text-ink-600">Free. No account needed. We&apos;ll shortlist suppliers that match your requirements and reply within one business day.</p>
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
    <CategoryContentSections columns={columns} rows={rows} facts={facts} faqs={faqs} body={body} categoryName={categoryName} />
    <CtaBlock slug={cat.slug} />
    </>
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
          <Level n="01" icon={<ClipboardCheck className="h-5 w-5" />} title="Documents & certificates checked" body="Business registration is reviewed and quality certificates (HACCP, ISO 22000, BRC, Halal, FDA…) are scanned for holder status (Owner or Partner Entity) and validity date." />
          <Level n="02" icon={<Factory className="h-5 w-5" />} title="Factory & production verified" tone="brand" body="Production facilities, processing lines, warehouse and geolocation evidence are verified against our 9-point factory checklist." />
          <Level n="03" icon={<FileCheck2 className="h-5 w-5" />} title="Delivery history reviewed" body="Shipment and export delivery documents (B/L, customs declaration, packing list) for completed orders are reviewed. A won enquiry alone does not qualify." />
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
