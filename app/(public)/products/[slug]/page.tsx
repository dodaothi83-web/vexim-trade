import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  t,
  verificationBadge,
} from "@/lib/public/catalog";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const store = (await import("@/lib/db")).getStore();
  const categories = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: true }) : [];
  const cat = categories.find((c: Category) => c.slug === slug);
  if (!cat) return { title: "Category not found | Vexim Trade", robots: { index: false } };

  if (slug === "cashew") {
    const title = "Cashew Suppliers in Vietnam | Factory-Audited Processors | Vexim Trade";
    const description =
      "Compare Vietnamese cashew kernel suppliers we have audited. W180 to W450, splits and pieces. Request a quote and hear back within one business day.";
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: "/products/cashew" },
      openGraph: { title, description, url: "/products/cashew", siteName: "Vexim Trade", type: "website" },
      robots: { index: false, follow: true },
    };
  }

  const otherTitle = `${t(cat.name_i18n)} Suppliers in Vietnam | Factory-Audited | Vexim Trade`;
  return {
    title: { absolute: otherTitle },
    description: t(cat.seo_desc_i18n),
    robots: { index: false, follow: true },
  };
}

/* ---------------- Cashew copy (07/2026) ---------------- */

const CASHEW_GRADES = [
  { code: "W180", name: "Whole 180",       count: "[170–180]", uses: "Premium retail and gift packs" },
  { code: "W240", name: "Whole 240",       count: "220–240",   uses: "Premium retail" },
  { code: "W320", name: "Whole 320",       count: "300–320",   uses: "The most traded grade, good balance of size and price" },
  { code: "W450", name: "Whole 450",       count: "400–450",   uses: "Snacks, bakery and confectionery" },
  { code: "SW",   name: "Scorched wholes", count: "Varies",    uses: "Roasted and salted snacks, food processing" },
  { code: "WS",   name: "White splits",    count: "Varies",    uses: "Snacks, chocolate, cereals" },
  { code: "LP",   name: "Large pieces",    count: "Varies",    uses: "Bakery, ice cream" },
  { code: "SP",   name: "Small pieces",    count: "Varies",    uses: "Cashew butter, pastes, food processing" },
];

const CASHEW_GRADE_CHIPS = ["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"] as const;

const CASHEW_FAQS = [
  { q: "Do you charge buyers?", a: "No. Requesting quotes is free. We only charge for optional services such as pre-shipment inspection when you ask us to arrange them." },
  { q: "Can I get samples before ordering?", a: "Yes. We can arrange samples from the suppliers you're interested in. Sample cost and courier charges are paid by the buyer; we'll confirm the amount before anything is sent." },
  { q: "Can I order less than a full container?", a: "Some suppliers accept smaller trial orders. Tell us your volume and we'll find out who can do it." },
  { q: "Will suppliers contact me directly?", a: "Not until you choose to. Suppliers see your requirements, not your contact details." },
];

/* ---------------- Page ---------------- */

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const store = (await import("@/lib/db")).getStore();
  const categories = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: true }) : [];
  const cat = categories.find((c: Category) => c.slug === slug);
  if (!cat) notFound();

  // Staff preview xem cả hồ sơ demo; buyer công khai chỉ xem published non-demo.
  // MVP không có session check ở public site → chỉ bật demo khi VEXIM_SHOW_DEMO=true.
  const includeDemo = process.env.VEXIM_SHOW_DEMO === "true";
  const suppliers = await listPublicSuppliers({ categorySlug: slug, includeDemo });
  const categoryName = t(cat.name_i18n) || cat.slug;
  const isDemo = includeDemo && suppliers.some((s) => (s as { is_demo?: boolean }).is_demo);

  if (slug === "cashew") {
    return (
      <CashewPage
        suppliers={suppliers}
        categoryName={categoryName}
        slug={slug}
        isDemo={isDemo}
      />
    );
  }

  // Fallback cho category khác — dùng chung template State B (chưa có NCC), nội dung lấy từ DB.
  const heroImg = cat.hero_image || null;
  const intro = t(cat.intro_i18n) || `Verified Vietnamese ${categoryName.toLowerCase()} suppliers. Tell us your spec and we will match you with suitable producers.`;
  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/#categories" }, { label: categoryName }]} />
      <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
        <div>
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700 ring-1 ring-brand-200">Vietnamese {categoryName.toLowerCase()}</span>
          <h1 className="mt-4 text-[34px] font-black leading-[1.05] text-ink-900 sm:text-[44px]">
            {categoryName} suppliers <span className="text-brand-700">in Vietnam</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-700">{intro}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
            <p className="text-[12.5px] text-ink-500">Reply within <strong className="text-ink-800">1 business day</strong>.</p>
          </div>
          <dl className="mt-8 grid max-w-lg grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
            <MiniStat k="Before listing" v="Factory visits" />
            <MiniStat k="Reply" v="1 business day" />
            <MiniStat k="Language" v="English · Vietnamese" />
          </dl>
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
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary mt-6 w-full justify-center">Start your request <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {heroImg && (
        <div className="mt-10 overflow-hidden rounded-xl border border-ink-200">
          <div className="relative aspect-[21/9] w-full bg-ink-50">
            <Image src={heroImg} alt="" fill sizes="100vw" className="object-cover" />
          </div>
        </div>
      )}

      <section className="mt-10" id="suppliers">
        <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-10 text-center">
          <Factory className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 text-[14px] text-ink-600">We are currently visiting producers in this category.</p>
          <p className="mt-1 text-[13px] text-ink-500">Profiles will appear here after our on-site checks. Send us your requirements in the meantime.</p>
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary mt-5 inline-flex">Request a quote <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:hidden">
        <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14px] font-bold text-white">
          Request a quote <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-400">{k}</dt>
      <dd className="mt-0.5 text-[14.5px] font-bold text-ink-900">{v}</dd>
    </div>
  );
}

/* ===================== CASHEW PAGE ===================== */

function CashewPage({
  suppliers,
  categoryName,
  slug,
  isDemo,
}: {
  suppliers: Awaited<ReturnType<typeof listPublicSuppliers>>;
  categoryName: string;
  slug: string;
  isDemo: boolean;
}) {
  const hasSuppliers = suppliers.length > 0;
  const rfqHref = `/rfq?category=${encodeURIComponent(slug)}`;

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: CASHEW_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }),
        }}
      />

      {isDemo && (
        <div className="sticky top-[60px] z-20 bg-amber-400 px-4 py-2 text-center text-[12px] font-bold text-amber-950 shadow-sm">
          DEMO DATA · Sample profiles for preview only. Not real suppliers.
        </div>
      )}

      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Products", href: "/#categories" }, { label: categoryName }]} />

        {hasSuppliers ? (
          <StateA suppliers={suppliers} slug={slug} categoryName={categoryName} rfqHref={rfqHref} />
        ) : (
          <StateB slug={slug} rfqHref={rfqHref} />
        )}

        {/* Reference sections — dưới danh sách, cho SEO + buyer muốn tìm hiểu */}
        <ReferenceSections slug={slug} rfqHref={rfqHref} />

        {/* Sticky CTA bar (mobile) */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:hidden">
          <Link href={rfqHref} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14px] font-bold text-white">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

/* ------- TRẠNG THÁI A: Đã có NCC — danh sách + filter ngay đầu ------- */

function StateA({
  suppliers,
  slug,
  categoryName,
  rfqHref,
}: {
  suppliers: Awaited<ReturnType<typeof listPublicSuppliers>>;
  slug: string;
  categoryName: string;
  rfqHref: string;
}) {
  return (
    <>
      {/* Compact header — không hero lớn */}
      <section className="mt-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese cashew</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-black leading-[1.05] text-ink-900 sm:text-[42px]">
              {categoryName} suppliers <span className="text-brand-700">in Vietnam</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
              Every supplier below has been checked by our team. Compare MOQ, lead time, grades and certificates side by side.
              Tell us the grade and volume you need, and we&apos;ll arrange quotes directly.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-semibold text-brand-800 ring-1 ring-brand-200">
              {suppliers.length} supplier{suppliers.length > 1 ? "s" : ""}
            </span>
            <Link href={rfqHref} className="hidden sm:inline-flex btn btn-primary">Request a quote <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>

        {/* Grade filter chips — click chỉ scroll (MVP), sau có thể làm filter JS khi supplier card có data-grade */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-ink-500">Grades:</span>
          {CASHEW_GRADE_CHIPS.map((g) => (
            <Link
              key={g}
              href={`${rfqHref}#${g}`}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700"
            >
              {g}
            </Link>
          ))}
        </div>
      </section>

      {/* Filter + grid: sidebar filters trái, supplier cards phải */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Mobile filter toggle */}
        <details className="lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3 text-[13.5px] font-semibold text-ink-800">
            <span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</span>
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="mt-2 rounded-lg border border-ink-200 bg-white p-4">
            <FilterSidebar />
          </div>
        </details>

        <aside className="hidden lg:block">
          <div className="sticky top-[80px] rounded-xl border border-ink-200 bg-white p-5">
            <FilterSidebar />
            <div className="mt-6 border-t border-ink-100 pt-5">
              <Link href={rfqHref} className="btn btn-primary w-full">Request a quote <ArrowRight className="h-4 w-4" /></Link>
              <p className="mt-2 text-center text-[11.5px] text-ink-500">We reply within one business day.</p>
            </div>
          </div>
        </aside>

        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            {suppliers.map((s) => (
              <SupplierCard key={s.id} s={s} slug={slug} />
            ))}
          </div>
        </div>
      </section>

      <CtaBlock slug={slug} compact />
    </>
  );
}

function FilterSidebar() {
  return (
    <div className="space-y-5 text-[13px]">
      <FilterGroup title="Verification">
        {["Export proven (L3)", "Factory audited (L2)", "Documents checked (L1)"].map((l) => (
          <label key={l} className="flex items-center gap-2 text-ink-700">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-700 focus:ring-brand-500" defaultChecked={false} />
            {l}
          </label>
        ))}
      </FilterGroup>
      <FilterGroup title="Supplier type">
        {["Factory", "Trader", "Cooperative"].map((l) => (
          <label key={l} className="flex items-center gap-2 text-ink-700">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-700 focus:ring-brand-500" />
            {l}
          </label>
        ))}
      </FilterGroup>
      <FilterGroup title="FOB visibility">
        <label className="flex items-center gap-2 text-ink-700">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-ink-300 text-brand-700 focus:ring-brand-500" />
          FOB range listed
        </label>
      </FilterGroup>
      <p className="pt-2 text-[11.5px] italic text-ink-400">Filters coming soon — tell us your needs and we&apos;ll shortlist for you.</p>
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

/* ------- TRẠNG THÁI B: Chưa có NCC — form RFQ ngay đầu ------- */

function StateB({ slug, rfqHref }: { slug: string; rfqHref: string }) {
  return (
    <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese cashew</span>
        </div>
        <h1 className="mt-4 text-[34px] font-black leading-[1.05] text-ink-900 sm:text-[44px]">
          Cashew suppliers <span className="text-brand-700">in Vietnam</span>
        </h1>
        <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-700">
          Whole kernels, splits and pieces from Vietnamese processors. Before a supplier appears on this page, someone from our team visits the factory and checks their papers.
          We are building the first batch of cashew supplier profiles now.
        </p>
        <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-600">
          In the meantime, send us your grade and volume — we&apos;ll come back within one business day with 2–4 options from processors we know.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
          <HeroStat k="Before listing" v="Factory visits" />
          <HeroStat k="Reply" v="1 business day" />
          <HeroStat k="Language" v="English · Vietnamese" />
        </div>
      </div>

      {/* Inline lead card: mini RFQ */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-600">
          Tell us what you need
        </p>
        <h2 className="mt-2 text-[20px] font-bold leading-tight text-ink-900">Get matched with cashew suppliers</h2>
        <p className="mt-1 text-[13.5px] text-ink-600">Free. No account needed. We&apos;ll send you 2–4 options within one business day.</p>

        <ul className="mt-5 space-y-2 text-[13.5px] text-ink-700">
          <Bullet>Which grade you need (W180/W240/W320/W450/SW/WS/LP/SP).</Bullet>
          <Bullet>Volume and destination.</Bullet>
          <Bullet>Target price or Incoterms (we&apos;ll suggest if you&apos;re not sure).</Bullet>
          <Bullet>Any certification requirements (BRC, HACCP, Kosher, etc.).</Bullet>
        </ul>

        <Link href={rfqHref} className="btn btn-primary mt-6 w-full justify-center">
          Start your request <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-center text-[11.5px] text-ink-500">You can write in your own language.</p>

        <div className="mt-5 rounded-lg bg-ink-50 p-4 text-[12.5px] text-ink-600">
          <p className="font-semibold text-ink-800">Supplier profiles coming soon.</p>
          <p className="mt-1 leading-relaxed">We are visiting cashew processors in Bình Phước, Đồng Nai and the Central Highlands. Profiles will go live after each factory audit is complete.</p>
        </div>
      </div>
    </section>
  );
}

/* ------- Shared: reference sections (grades / buying / verification / FAQ / CTA) ------- */

function ReferenceSections({ slug, rfqHref }: { slug: string; rfqHref: string }) {
  return (
    <>
      <CollapsibleSection id="grades" eyebrow="Grade reference" title="Cashew kernel grades"
        subtitle="Most Vietnamese processors grade to the AFI standard. Counts are per pound; final spec is agreed in your contract.">
        <div className="overflow-hidden rounded-xl border border-ink-200">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-ink-50 text-[12px] uppercase tracking-[0.08em] text-ink-500">
                <th className="w-20 px-4 py-3 text-left font-semibold">Grade</th>
                <th className="w-44 px-4 py-3 text-left font-semibold">Name</th>
                <th className="w-40 px-4 py-3 text-left font-semibold">Kernels per lb</th>
                <th className="px-4 py-3 text-left font-semibold">Common uses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {CASHEW_GRADES.map((g) => (
                <tr key={g.code} className="hover:bg-ink-50/60">
                  <td className="px-4 py-3 font-black text-brand-800">{g.code}</td>
                  <td className="px-4 py-3 font-medium text-ink-800">{g.name}</td>
                  <td className="px-4 py-3 text-ink-700">{g.count}</td>
                  <td className="px-4 py-3 text-ink-600">{g.uses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-ink-500">Counts and uses to be confirmed by our trading team before publication.</p>
      </CollapsibleSection>

      <CollapsibleSection id="basics" eyebrow="Sourcing basics" title="Buying cashew from Vietnam"
        subtitle="Typical terms. Each supplier confirms their own in the quote.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact icon={Scale} label="Minimum order" value="Usually one 20ft container, about [X] tonnes. Some suppliers accept smaller trial orders of [X]." />
          <Fact icon={PackageCheck} label="Packing" value="[e.g. 2 × 11.34 kg vacuum bags/tins per carton, 22.68 kg/carton]. Other packing on request." />
          <Fact icon={Ship} label="Incoterms" value="FOB Ho Chi Minh City is most common. CIF to your port on request." />
          <Fact icon={Anchor} label="Port and lead time" value="Most shipments leave from Cat Lai, Ho Chi Minh City, about [X–Y] days after contract." />
          <Fact icon={CalendarRange} label="Supply and season" value="Local harvest runs roughly [February to May] in Binh Phuoc, Dong Nai and the Central Highlands. Many processors also import raw nuts, so kernels are available all year." />
          <Fact icon={Users} label="Payment" value="Often [30% deposit, 70% against B/L copy]. L/C is possible with some suppliers." />
        </dl>
      </CollapsibleSection>

      <section id="verification" className="mt-14 rounded-2xl bg-ink-900 p-6 text-white sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-300">How we check suppliers</p>
            <h2 className="mt-3 text-[24px] font-bold leading-tight sm:text-[28px]">Three levels of checks.</h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/75">
              The badge on each profile shows exactly what we&apos;ve checked. Suppliers we&apos;re still checking don&apos;t get a badge.
            </p>
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

      <section id="faq" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Common questions</p>
            <h2 className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[30px]">Questions buyers ask</h2>
          </div>
        </div>
        <ul className="mt-6 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
          {CASHEW_FAQS.map((f) => (
            <li key={f.q} className="p-5 sm:p-6">
              <h3 className="text-[15px] font-bold text-ink-900">{f.q}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">{f.a}</p>
            </li>
          ))}
        </ul>
      </section>

      <CtaBlock slug={slug} />
    </>
  );
}

function CollapsibleSection({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
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

function CtaBlock({ slug, compact }: { slug: string; compact?: boolean }) {
  return (
    <section className={"overflow-hidden rounded-2xl border border-ink-200 bg-gradient-to-br from-brand-50 via-white to-white " + (compact ? "mt-10" : "mt-14")}>
      <div className="grid gap-6 p-8 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Need a specific grade?</p>
          <h3 className="mt-2 text-[24px] font-bold leading-snug text-ink-900 sm:text-[28px]">Can&apos;t find what you need?</h3>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-700">
            Tell us the grade, volume, destination and when you need it. We&apos;ll look beyond the suppliers listed here and come back with options, with what we&apos;ve checked clearly marked.
          </p>
          <ul className="mt-4 grid gap-1.5 text-[13.5px] text-ink-700 sm:grid-cols-2">
            {["Matching grade and specs", "MOQ and price guidance", "Factory visit notes", "Help with samples"].map((it) => (
              <li key={it} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />{it}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex lg:justify-end">
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Helpers ------------------------------ */

function SupplierCard({ s, slug }: { s: Awaited<ReturnType<typeof listPublicSuppliers>>[number]; slug: string }) {
  const badge = verificationBadge(s);
  const fob = formatFob(s);
  const isDemo = (s as { is_demo?: boolean }).is_demo;
  const badgeClass =
    badge.tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : badge.tone === "slate"
        ? "bg-slate-100 text-slate-700 ring-slate-200"
        : "bg-ink-100 text-ink-600 ring-ink-200";

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-brand-50 to-ink-50 text-brand-700">
        <Factory className="h-9 w-9 opacity-60" />
        {isDemo && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow">
            Demo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + badgeClass}>
            {badge.tone === "emerald" ? <ShieldCheck className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />}
            {badge.text}
          </span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">{supplierTypeLabel(s)}</span>
        </div>
        <h3 className="mt-2 text-[16px] font-bold leading-snug text-ink-900">
          <Link href={`/suppliers/${s.slug ?? s.id}`} className="hover:text-brand-700">{s.display_name ?? s.name}</Link>
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-ink-500">
          <MapPin className="h-3.5 w-3.5" />{s.province || "Vietnam"}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
          <CardStat k="Grades" v={mainProductNames(s.main_products, 2) || "—"} />
          <CardStat k="MOQ" v={s.moq_text || "On request"} />
          <CardStat k="Lead time" v={s.lead_time_days ? `${s.lead_time_days} days` : "—"} />
          <CardStat k="FOB ref." v={fob ? fob : "On request"} />
        </dl>
        <div className="mt-auto flex gap-2 pt-4">
          <Link href={`/suppliers/${s.slug ?? s.id}`} className="flex-1 rounded-md border border-ink-200 px-3 py-2 text-center text-[12.5px] font-semibold text-ink-700 hover:border-ink-900 hover:text-ink-900">
            View profile
          </Link>
          <Link href={`/rfq?suppliers=${s.id}&category=${encodeURIComponent(slug)}`} className="flex-1 rounded-md bg-ink-900 px-3 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-ink-800">
            Request quote
          </Link>
        </div>
      </div>
    </article>
  );
}

function HeroStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-400">{k}</dt>
      <dd className="mt-0.5 text-[14.5px] font-bold text-ink-900">{v}</dd>
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{children}</span>
    </li>
  );
}

function Fact({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" /></div>
      <div>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</dt>
        <dd className="mt-1 text-[14px] leading-relaxed text-ink-800">{value}</dd>
      </div>
    </div>
  );
}

function Level({ n, icon, title, body, tone = "neutral" }: { n: string; icon: ReactNode; title: string; body: string; tone?: "neutral" | "brand" }) {
  const active = tone === "brand";
  return (
    <li className={"rounded-xl border p-5 " + (active ? "border-brand-400/40 bg-brand-500/10" : "border-white/15 bg-white/5")}>
      <div className="flex items-center justify-between">
        <div className={"flex h-9 w-9 items-center justify-center rounded-lg " + (active ? "bg-brand-400 text-ink-900" : "bg-white/10 text-white")}>{icon}</div>
        <span className={"text-[11px] font-black " + (active ? "text-brand-200" : "text-white/50")}>{n}</span>
      </div>
      <p className="mt-4 text-[15px] font-bold text-white">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/75">{body}</p>
    </li>
  );
}

function CardStat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-ink-400">{k}</dt>
      <dd className="text-[13px] font-medium text-ink-800">{v}</dd>
    </div>
  );
}
