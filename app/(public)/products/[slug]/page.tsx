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
  ChevronRight,
  ClipboardCheck,
  Factory,
  FileCheck2,
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

  // Cashew: title / mô tả theo copywriter đã duyệt.
  if (slug === "cashew") {
    const title = "Cashew Suppliers in Vietnam | Factory-Audited Processors | Vexim Trade";
    const description =
      "Find cashew kernel suppliers in Vietnam that our team has visited. W180 to W450, splits and pieces. Request a quote and hear back within one business day.";
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: "/products/cashew" },
      openGraph: {
        title,
        description,
        url: "/products/cashew",
        siteName: "Vexim Trade",
        type: "website",
      },
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

/* ------------------------------------------------------------------ */
/*  Cashew-specific copy theo bản 07/2026. Các số trong [] cần seller */
/*  xác nhận trước khi bật index.                                      */
/* ------------------------------------------------------------------ */

const CASHEW_GRADES = [
  { code: "W180", name: "Whole 180",      count: "[170–180]", uses: "Premium retail and gift packs" },
  { code: "W240", name: "Whole 240",      count: "220–240",    uses: "Premium retail" },
  { code: "W320", name: "Whole 320",      count: "300–320",    uses: "The most traded grade, good balance of size and price" },
  { code: "W450", name: "Whole 450",      count: "400–450",    uses: "Snacks, bakery and confectionery" },
  { code: "SW",   name: "Scorched wholes",count: "Varies",     uses: "Roasted and salted snacks, food processing" },
  { code: "WS",   name: "White splits",   count: "Varies",     uses: "Snacks, chocolate, cereals" },
  { code: "LP",   name: "Large pieces",   count: "Varies",     uses: "Bakery, ice cream" },
  { code: "SP",   name: "Small pieces",   count: "Varies",     uses: "Cashew butter, pastes, food processing" },
];

const CASHEW_FAQS = [
  {
    q: "Do you charge buyers?",
    a: "No. Requesting quotes is free. We charge only for optional services such as pre-shipment inspection when you ask us to arrange them.",
  },
  {
    q: "Can I get samples before ordering?",
    a: "Yes. We can arrange samples from the suppliers you're interested in. Sample cost and courier charges are paid by the buyer; we'll confirm the amount before anything is sent.",
  },
  {
    q: "Can I order less than a full container?",
    a: "Some suppliers accept smaller trial orders. Tell us your volume and we'll find out who can do it.",
  },
  {
    q: "Will suppliers contact me directly?",
    a: "Not until you choose to. Suppliers see your requirements, not your contact details.",
  },
];

/* ------------------------------------------------------------------ */

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const store = (await import("@/lib/db")).getStore();
  const categories = typeof store.listCategories === "function" ? await store.listCategories({ publishedOnly: true }) : [];
  const cat = categories.find((c: Category) => c.slug === slug);
  if (!cat) notFound();

  const suppliers = await listPublicSuppliers({ categorySlug: slug });
  const categoryName = t(cat.name_i18n) || cat.slug;
  const isCashew = slug === "cashew";

  if (isCashew) {
    return <CashewPage cat={cat} suppliers={suppliers} categoryName={categoryName} slug={slug} />;
  }

  // --- Fallback cho các category khác (giữ cấu trúc đơn giản) ---
  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: "Products", href: "/#categories" },
        { label: categoryName },
      ]} />
      <section className="mt-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">
          <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese {categoryName.toLowerCase()}</span>
        </div>
        <h1 className="mt-4 text-[36px] font-black leading-[1.05] text-ink-900 sm:text-[48px]">
          {categoryName} suppliers <span className="text-brand-700">in Vietnam</span>
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-700">
          {t(cat.intro_i18n) || `Verified Vietnamese ${categoryName.toLowerCase()} suppliers. Tell us your spec and we will match you with suitable producers.`}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-[12.5px] text-ink-500">Reply within <strong className="text-ink-800">1 business day</strong></p>
        </div>
      </section>

      <section className="mt-12" id="suppliers">
        <SectionHeader eyebrow="Verified suppliers" title={`${categoryName} suppliers we've checked`}
                      subtitle="Supplier profiles for this category will appear here once our on-site checks are complete." />
        <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-10 text-center">
          <p className="text-[14px] text-ink-600">We are currently visiting producers in this category.</p>
          <p className="mt-2 text-[13px] text-ink-500">In the meantime, send us your requirements and we'll match you directly.</p>
          <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary mt-5 inline-flex">
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ===================== CASHEW PAGE ===================== */

async function CashewPage({
  suppliers,
  categoryName,
  slug,
}: {
  cat: Category;
  suppliers: Awaited<ReturnType<typeof listPublicSuppliers>>;
  categoryName: string;
  slug: string;
}) {
  const visitingCount = 0; // set khi đang xác thực NCC ở tỉnh thật; hiện tại 0 để ẩn dòng phụ.

  return (
    <>
      {/* FAQPage schema cho SEO */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: CASHEW_FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Categories", href: "/#categories" },
          { label: categoryName },
        ]} />

        {/* HERO */}
        <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">
              <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">Vietnamese cashew</span>
            </div>
            <h1 className="mt-4 text-[36px] font-black leading-[1.05] text-ink-900 sm:text-[48px] lg:text-[54px]" style={{ letterSpacing: "-0.02em" }}>
              Cashew suppliers
              <br />
              <span className="text-brand-700">in Vietnam</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-700">
              Whole kernels, splits and pieces from Vietnamese processors. Before a supplier appears here, someone from our team visits the factory and checks their business papers and certificates. Tell us the grade and volume you need, and we'll send you a short list with MOQ, lead time and certificates for each supplier.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={`/rfq?category=${encodeURIComponent(slug)}`}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm hover:bg-brand-800">
                Request a quote <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-[12.5px] text-ink-500">We reply within <span className="font-semibold text-ink-800">one business day</span>.</p>
            </div>
            <dl className="mt-8 grid max-w-lg grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
              <HeroStat k="Before listing" v="Factory visits" />
              <HeroStat k="Reply" v="1 business day" />
              <HeroStat k="Language" v="English · Vietnamese" />
            </dl>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50 shadow-sm">
              <Image src="/images/categories/cashew-hero.jpg" alt="Vietnamese cashew kernels, graded" width={1200} height={800}
                     className="h-[320px] w-full object-cover sm:h-[380px] lg:h-[420px]" priority sizes="(max-width: 1024px) 100vw, 45vw" />
            </div>
            <div className="absolute -bottom-4 left-5 right-5 rounded-lg border border-ink-200 bg-white/95 p-4 shadow-md backdrop-blur sm:left-8 sm:right-auto sm:max-w-[360px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">Common grades</p>
              <p className="mt-1 text-[12px] text-ink-500">W180, W240, W320, W450, SW, WS, LP, SP</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"].map((g) => (
                  <span key={g} className="rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-[12px] font-semibold text-ink-700">{g}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* GRADES TABLE */}
        <section className="mt-16">
          <SectionHeader eyebrow="Grade reference"
                        title="Cashew kernel grades"
                        subtitle="Most Vietnamese processors grade to the AFI standard. Counts are per pound and the final spec is agreed in your contract." />
          <div className="mt-6 overflow-x-auto overflow-hidden rounded-xl border border-ink-200">
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
        </section>

        {/* BUYING FROM VIETNAM */}
        <section className="mt-14">
          <SectionHeader eyebrow="Sourcing basics"
                        title="Buying cashew from Vietnam"
                        subtitle="These are typical terms. Each supplier confirms their own in the quote." />
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact icon={Scale} label="Minimum order"
                  value="Usually one 20ft container, about [X] tonnes. Some suppliers accept smaller trial orders of [X]." />
            <Fact icon={PackageCheck} label="Packing"
                  value="[e.g. 2 × 11.34 kg (25 lb) vacuum bags or tins per carton, 22.68 kg (50 lb) per carton]. Other packing on request." />
            <Fact icon={Ship} label="Incoterms"
                  value="FOB Ho Chi Minh City is most common. CIF to your port on request." />
            <Fact icon={Anchor} label="Port and lead time"
                  value="Most shipments leave from Cat Lai, Ho Chi Minh City, about [X–Y] days after the contract is signed." />
            <Fact icon={CalendarRange} label="Supply and season"
                  value="The local harvest runs roughly [February to May], mainly in Binh Phuoc, Dong Nai and the Central Highlands. Many processors also import raw nuts, so kernels are available all year." />
            <Fact icon={Users} label="Payment"
                  value="Often [30% deposit and 70% against a copy of the bill of lading]. Letters of credit are possible with some suppliers." />
          </dl>
        </section>

        {/* VERIFICATION 3 LEVELS */}
        <section className="mt-14 rounded-2xl bg-ink-900 p-6 text-white sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-300">How we check suppliers</p>
              <h2 className="mt-3 text-[26px] font-bold leading-tight sm:text-[32px]">Three levels of checks.</h2>
              <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-white/75">
                The badge on each profile shows exactly what we've checked. Suppliers we're still checking don't get a badge.
              </p>
              <Link href="/how-we-verify"
                    className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-200 hover:text-white">
                How we verify suppliers <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              <Level n="L1" icon={<ClipboardCheck className="h-5 w-5" />} title="Documents checked"
                     body="We check the business registration, tax code and export licence against official records, and make sure certificates are current." />
              <Level n="L2" icon={<Factory className="h-5 w-5" />} title="Factory audited" tone="brand"
                     body="Someone from our team visits the factory, confirms the address and production line, and films a walkthrough. The visit date is shown on the profile." />
              <Level n="L3" icon={<FileCheck2 className="h-5 w-5" />} title="Export proven"
                     body="The supplier has shown us records of past export shipments and has completed at least one order through Vexim." />
            </ol>
          </div>
        </section>

        {/* SUPPLIER LIST */}
        <section className="mt-14" id="suppliers">
          <SectionHeader eyebrow={suppliers.length === 0 ? "Supplier profiles" : "Cashew suppliers we've checked"}
                        title={suppliers.length === 0 ? "Supplier profiles" : `${suppliers.length} cashew supplier${suppliers.length > 1 ? "s" : ""}`}
                        subtitle={suppliers.length === 0
                          ? (<>
                              We're visiting the first group of cashew processors now. Their profiles will appear here once our checks are complete.
                              {visitingCount > 0 && <> Currently visiting {visitingCount} processors in Binh Phuoc, Dong Nai and the Central Highlands.</>}
                              {" "}In the meantime, send us your requirements and we'll match you with suppliers directly.
                            </>)
                          : "Compare MOQ, lead time, grades and certificates. Click through for full profile."} />
          {suppliers.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-ink-200 bg-white p-10 text-center">
              <Factory className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-3 text-[14px] text-ink-600">Profiles coming online after on-site audits.</p>
              <Link href={`/rfq?category=${encodeURIComponent(slug)}`} className="btn btn-primary mt-5 inline-flex">
                Request a quote <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {suppliers.map((s) => {
                const badge = verificationBadge(s);
                const fob = formatFob(s);
                return (
                  <article key={s.id}
                           className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
                    <div className="flex h-32 items-center justify-center bg-gradient-to-br from-brand-50 to-ink-50 text-brand-700">
                      <Factory className="h-10 w-10 opacity-60" />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={
                          badge.tone === "emerald"
                            ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                            : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                        }>
                          {badge.tone === "emerald"
                            ? <ShieldCheck className="h-3 w-3" />
                            : <HelpCircle className="h-3 w-3" />}
                          {badge.text}
                        </span>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">
                          {supplierTypeLabel(s)}
                        </span>
                      </div>
                      <h3 className="mt-2 text-[16.5px] font-bold leading-snug text-ink-900">
                        <Link href={`/suppliers/${s.slug ?? s.id}`} className="hover:text-brand-700">
                          {s.display_name ?? s.name}
                        </Link>
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
                        <Link href={`/suppliers/${s.slug ?? s.id}`}
                              className="flex-1 rounded-md border border-ink-200 px-3 py-2 text-center text-[12.5px] font-semibold text-ink-700 hover:border-ink-900 hover:text-ink-900">
                          View profile
                        </Link>
                        <Link href={`/rfq?suppliers=${s.id}&category=${encodeURIComponent(slug)}`}
                              className="flex-1 rounded-md bg-ink-900 px-3 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-ink-800">
                          Request quote
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <SectionHeader eyebrow="Common questions" title="Questions buyers ask" />
          <ul className="mt-6 divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
            {CASHEW_FAQS.map((f) => (
              <li key={f.q} className="p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-ink-900">{f.q}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">{f.a}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA cuối */}
        <section className="mt-14 overflow-hidden rounded-2xl border border-ink-200 bg-gradient-to-br from-brand-50 via-white to-white">
          <div className="grid gap-6 p-8 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Need a specific grade?</p>
              <h3 className="mt-2 text-[24px] font-bold leading-snug text-ink-900 sm:text-[28px]">Can't find what you need?</h3>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-700">
                Tell us the grade, volume, destination and when you need it. We'll look beyond the suppliers listed here and come back with options, with what we've checked clearly marked for each.
              </p>
              <ul className="mt-4 grid gap-1.5 text-[13.5px] text-ink-700 sm:grid-cols-2">
                {["Matching grade and specs","MOQ and price guidance","Factory visit notes","Help with samples"].map((it) => (
                  <li key={it} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />{it}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex lg:justify-end">
              <Link href={`/rfq?category=${encodeURIComponent(slug)}`}
                    className="inline-flex items-center gap-2 self-start rounded-md bg-brand-700 px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm hover:bg-brand-800">
                Request a quote <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ------------------------------ Helpers ------------------------------ */

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (<p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>)}
        <h2 className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]">{title}</h2>
        {subtitle && <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{subtitle}</p>}
      </div>
    </div>
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

function Fact({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</dt>
        <dd className="mt-1 text-[14px] leading-relaxed text-ink-800">{value}</dd>
      </div>
    </div>
  );
}

function Level({ n, icon, title, body, tone = "neutral" }: {
  n: string; icon: ReactNode; title: string; body: string; tone?: "neutral" | "brand";
}) {
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
