import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  Search,
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
    // Luôn noindex cho đến khi đủ 10 hồ sơ published — middleware cũng thêm X-Robots-Tag,
    // nhưng thẳng vào metadata để phòng trường hợp static build.
    robots: { index: false, follow: true },
  };
}

/* ------------------------------------------------------------------ */
/*  Dữ liệu tĩnh cho trang Cashew (sẽ tách ra khi thêm ngành mới).    */
/* ------------------------------------------------------------------ */

const CASHEW_GRADES: Grade[] = [
  { code: "W180", label: "Whole 180", count: "≤ 180 kernels/lb", desc: "King size — premium gift packs, retail" },
  { code: "W240", label: "Whole 240", count: "220–240/lb", desc: "Large whole kernel — mainstream premium retail" },
  { code: "W320", label: "Whole 320", count: "300–320/lb", desc: "Most traded grade — balanced size / price" },
  { code: "W450", label: "Whole 450", count: "400–450/lb", desc: "Mid-size whole — bakery & confectionery" },
  { code: "SW",   label: "Scorched Wholes", count: "varies", desc: "Whole kernels, slightly scorched — industrial use" },
  { code: "WS",   label: "White Splits",   count: "varies", desc: "Split white kernels — snack, chocolate, cereal" },
  { code: "LP",   label: "Large Pieces",   count: "varies", desc: "Large broken pieces — bakery, ice cream" },
  { code: "SP",   label: "Small Pieces",   count: "varies", desc: "Small pieces — butter, paste, processing" },
];

const BUYING_FACTS: Fact[] = [
  { icon: Scale,    label: "MOQ",             value: "1×20' FCL (~18 MT) or 500 kg sample order" },
  { icon: PackageCheck, label: "Packaging",   value: "10 kg / 11.34 kg (25 lb) vacuum-sealed tins in cartons; bulk PE bags on request" },
  { icon: Ship,     label: "Incoterms",       value: "FOB Saigon Port / CIF destination port; FAS, EXW on request" },
  { icon: CalendarRange, label: "Season",    value: "Main crop Feb–Apr (Tay Nguyen / Dong Nai); supplementary Aug–Oct" },
  { icon: Anchor,   label: "Port",            value: "Cat Lai (Ho Chi Minh City) · lead time 15–25 days after contract" },
  { icon: Users,    label: "Payment",         value: "30% TT deposit · 70% against copy B/L; L/C at sight for regular buyers" },
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

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-8 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/#products" },
          { label: categoryName },
        ]}
      />

      {/* ===================== HERO 2 cột ===================== */}
      <section className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            <span className="inline-flex h-5 items-center rounded-full bg-brand-50 px-2 ring-1 ring-brand-200">
              Vietnamese {categoryName.toLowerCase()}
            </span>
            <span className="text-ink-400">·</span>
            <span className="text-ink-500">Factory-audited list</span>
          </div>

          <h1
            className="mt-4 text-[36px] font-black leading-[1.05] text-ink-900 sm:text-[48px] lg:text-[54px]"
            style={{ letterSpacing: "-0.02em" }}
          >
            {categoryName} suppliers
            <br />
            <span className="text-brand-700">in Vietnam.</span>
          </h1>

          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-700">
            Every supplier is <strong className="text-ink-900">factory-audited before listing</strong> —
            on-site visit, business registration check and document cross-check by our Hanoi desk.
            Request a quote to receive a shortlist with MOQ, lead time and certification status.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/rfq?category=${encodeURIComponent(slug)}`}
              className="inline-flex items-center gap-2 rounded-md bg-brand-700 px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              Request a quote
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-[12.5px] text-ink-500">
              Reply within <span className="font-semibold text-ink-800">1 business day</span>
            </p>
          </div>

          <dl className="mt-8 grid max-w-md grid-cols-3 gap-x-6 gap-y-3 border-t border-ink-200 pt-5 text-[13px]">
            <HeroStat k="Factory audits" v="On-site" />
            <HeroStat k="Average reply" v="< 24h" />
            <HeroStat k="Language"    v="EN · CN · EU" />
          </dl>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-ink-50 shadow-sm">
            <Image
              src={isCashew ? "/images/categories/cashew-hero.jpg" : "/images/categories/cashew-hero.jpg"}
              alt={`Vietnamese ${categoryName} kernels — factory graded`}
              width={1200}
              height={800}
              className="h-[320px] w-full object-cover sm:h-[380px] lg:h-[420px]"
              priority
              sizes="(max-width: 1024px) 100vw, 45vw"
            />
          </div>
          <div className="absolute -bottom-4 left-5 right-5 rounded-lg border border-ink-200 bg-white/95 p-4 shadow-md backdrop-blur sm:left-8 sm:right-auto sm:max-w-[280px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
              Common grades today
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"].map((g) => (
                <span
                  key={g}
                  className="rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 text-[12px] font-semibold text-ink-700"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== BẢNG PHÂN LOẠI HẠT ===================== */}
      {isCashew && (
        <section className="mt-16">
          <SectionHeader
            eyebrow="Grade reference"
            title="Vietnamese cashew kernel grades at a glance"
            subtitle="US AFI-standard grading, kernels per pound counts indicative. Final spec per contract."
          />
          <div className="mt-6 overflow-hidden rounded-xl border border-ink-200">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="bg-ink-50 text-[12px] uppercase tracking-[0.08em] text-ink-500">
                  <th className="w-24 px-4 py-3 text-left font-semibold">Grade</th>
                  <th className="w-40 px-4 py-3 text-left font-semibold">Name</th>
                  <th className="w-44 px-4 py-3 text-left font-semibold">Count / lb</th>
                  <th className="px-4 py-3 text-left font-semibold">Typical use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {CASHEW_GRADES.map((g) => (
                  <tr key={g.code} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3 font-black text-brand-800">{g.code}</td>
                    <td className="px-4 py-3 font-medium text-ink-800">{g.label}</td>
                    <td className="px-4 py-3 text-ink-700">{g.count}</td>
                    <td className="px-4 py-3 text-ink-600">{g.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===================== BUYING FROM VIETNAM ===================== */}
      {isCashew && (
        <section className="mt-14">
          <SectionHeader
            eyebrow="Sourcing basics"
            title={`Buying ${categoryName.toLowerCase()} from Vietnam`}
            subtitle="Reference terms you can expect from verified suppliers. Final terms are confirmed on the quote."
          />
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BUYING_FACTS.map((f) => (
              <div
                key={f.label}
                className="flex gap-3 rounded-xl border border-ink-200 bg-white p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                    {f.label}
                  </dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-ink-800">{f.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ===================== QUY TRÌNH XÁC MINH 3 CẤP ===================== */}
      <section className="mt-14 rounded-2xl bg-ink-900 p-6 text-white sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              Verification levels
            </p>
            <h2 className="mt-3 text-[26px] font-bold leading-tight sm:text-[32px]">
              Three tiers of supplier verification.
            </h2>
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-white/75">
              Badges on supplier profiles reflect exactly what we checked. Profiles currently being
              audited are shown without a name or Verified badge until on-site review is signed off
              (4-eyes rule).
            </p>
            <Link
              href="/how-we-verify"
              className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-200 hover:text-white"
            >
              Full verification process
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            <Level
              n="L1"
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="Documents"
              body="Business registration, tax code & export license cross-checked against government registries."
            />
            <Level
              n="L2"
              icon={<Factory className="h-5 w-5" />}
              title="On-site audit"
              body="Inspector visits the factory, records a video walkthrough, confirms address & production line."
              tone="brand"
            />
            <Level
              n="L3"
              icon={<FileCheck2 className="h-5 w-5" />}
              title="Certificates & samples"
              body="HACCP / BRC / organic checked with the issuer; samples pulled for QC before the profile goes fully public."
            />
          </ol>
        </div>
      </section>

      {/* ===================== LƯỚI THẺ NCC ===================== */}
      <section className="mt-14" id="suppliers">
        <SectionHeader
          eyebrow={suppliers.length === 0 ? "Profiles coming online" : "Verified suppliers"}
          title={suppliers.length === 0
            ? `${categoryName} profiles under audit`
            : `${suppliers.length} ${categoryName.toLowerCase()} supplier${suppliers.length > 1 ? "s" : ""}`}
          subtitle={
            suppliers.length === 0
              ? "We are finalising on-site audits for the first batch of cashew processors. Public profiles will appear below as they are approved."
              : "Compare MOQ, lead time, grades and certifications. Click through for full profile."
          }
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Bộ lọc trái */}
          <aside className="h-fit rounded-xl border border-ink-200 bg-white p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Refine
            </p>
            <FilterGroup title="Verification">
              <FilterCheckbox label="L2 — On-site audited" disabled />
              <FilterCheckbox label="L3 — Certificates & samples" disabled />
              <FilterCheckbox label="Under audit" disabled defaultChecked />
            </FilterGroup>
            <FilterGroup title="Supplier type">
              <FilterCheckbox label="Manufacturer" disabled />
              <FilterCheckbox label="Trading company" disabled />
              <FilterCheckbox label="Cooperative" disabled />
            </FilterGroup>
            <FilterGroup title="Grade">
              {["W180", "W240", "W320", "W450", "SW/WS", "LP/SP"].map((g) => (
                <FilterCheckbox key={g} label={g} disabled />
              ))}
            </FilterGroup>
            <p className="mt-4 rounded-md bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-500">
              Filters activate when the first profiles are published. Need something specific now?{" "}
              <Link href="/rfq" className="font-semibold text-brand-700 underline underline-offset-2">
                Send an RFQ
              </Link>
              .
            </p>
          </aside>

          {/* Lưới thẻ */}
          {suppliers.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} seed={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {suppliers.map((s) => {
                const badge = verificationBadge(s);
                const fob = formatFob(s);
                return (
                  <article
                    key={s.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md"
                  >
                    <div className="flex h-32 items-center justify-center bg-gradient-to-br from-brand-50 to-ink-50 text-brand-700">
                      <Factory className="h-10 w-10 opacity-60" />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            badge.tone === "emerald"
                              ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                              : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
                          }
                        >
                          {badge.tone === "emerald" ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <HelpCircle className="h-3 w-3" />
                          )}
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
                        <MapPin className="h-3.5 w-3.5" />
                        {s.province || "Vietnam"}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                        <CardStat k="Grades" v={mainProductNames(s.main_products, 2) || "—"} />
                        <CardStat k="MOQ" v={s.moq_text || "On request"} />
                        <CardStat k="Lead time" v={s.lead_time_days ? `${s.lead_time_days} days` : "—"} />
                        <CardStat k="FOB ref." v={fob ? fob : "On request"} />
                      </dl>
                      <div className="mt-auto flex gap-2 pt-4">
                        <Link
                          href={`/suppliers/${s.slug ?? s.id}`}
                          className="flex-1 rounded-md border border-ink-200 px-3 py-2 text-center text-[12.5px] font-semibold text-ink-700 hover:border-ink-900 hover:text-ink-900"
                        >
                          View profile
                        </Link>
                        <Link
                          href={`/rfq?suppliers=${s.id}&category=${encodeURIComponent(slug)}`}
                          className="flex-1 rounded-md bg-ink-900 px-3 py-2 text-center text-[12.5px] font-semibold text-white hover:bg-ink-800"
                        >
                          Request quote
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ===================== CAN'T FIND ===================== */}
      <section className="mt-14 overflow-hidden rounded-2xl border border-ink-200 bg-gradient-to-br from-brand-50 via-white to-white">
        <div className="grid gap-6 p-8 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">
              Need help sourcing?
            </p>
            <h3 className="mt-2 text-[24px] font-bold leading-snug text-ink-900 sm:text-[28px]">
              Can&apos;t find the right supplier?
            </h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-700">
              Tell us your grade, volume, destination and timeline. Our desk screens suppliers beyond
              the public list and replies with a shortlist — with audit status, MOQ, lead time and
              certifications clearly marked for each.
            </p>
            <ul className="mt-4 grid gap-1.5 text-[13.5px] text-ink-700 sm:grid-cols-2">
              {[
                "Grade & spec matching",
                "MOQ and pricing reference",
                "Factory audit notes",
                "Sample coordination",
              ].map((it) => (
                <li key={it} className="flex items-start gap-1.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  {it}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex lg:justify-end">
            <Link
              href={`/rfq?category=${encodeURIComponent(slug)}`}
              className="inline-flex items-center gap-2 self-start rounded-md bg-brand-700 px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm hover:bg-brand-800"
            >
              Request a quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ Helpers ------------------------------ */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{subtitle}</p>
        )}
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

function Level({
  n,
  icon,
  title,
  body,
  tone = "neutral",
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "neutral" | "brand";
}) {
  const active = tone === "brand";
  return (
    <li
      className={
        "rounded-xl border p-5 " +
        (active
          ? "border-brand-400/40 bg-brand-500/10"
          : "border-white/15 bg-white/5")
      }
    >
      <div className="flex items-center justify-between">
        <div
          className={
            "flex h-9 w-9 items-center justify-center rounded-lg " +
            (active ? "bg-brand-400 text-ink-900" : "bg-white/10 text-white")
          }
        >
          {icon}
        </div>
        <span className={"text-[11px] font-black " + (active ? "text-brand-200" : "text-white/50")}>
          {n}
        </span>
      </div>
      <p className="mt-4 text-[15px] font-bold text-white">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/75">{body}</p>
    </li>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-ink-100 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
        {title}
      </p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  label,
  disabled,
  defaultChecked,
}: {
  label: string;
  disabled?: boolean;
  defaultChecked?: boolean;
}) {
  return (
    <label
      className={
        "flex items-center gap-2 text-[13px] " +
        (disabled ? "cursor-not-allowed text-ink-400" : "cursor-pointer text-ink-700")
      }
    >
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

function CardStat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wider text-ink-400">{k}</dt>
      <dd className="text-[13px] font-medium text-ink-800">{v}</dd>
    </div>
  );
}

/**
 * Thẻ placeholder cho trạng thái "đang xác minh" — chỉ hiện tỉnh + trạng thái,
 * không tên NCC, không badge Verified, phù hợp với yêu cầu GĐ1.
 */
function SkeletonCard({ seed }: { seed: number }) {
  const provinces = ["Binh Phuoc", "Dong Nai", "Binh Duong", "Dak Lak", "Lam Dong", "Tay Ninh"];
  const province = provinces[seed % provinces.length];
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-dashed border-ink-200 bg-white">
      <div className="flex h-32 items-center justify-center bg-ink-50 text-ink-300">
        <PackageCheck className="h-8 w-8 animate-pulse" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
            <Search className="h-3 w-3" />
            Under audit
          </span>
        </div>
        <h3 className="mt-2 text-[16px] font-bold leading-snug text-ink-400">
          Supplier #{String(seed + 1).padStart(2, "0")}
        </h3>
        <p className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-ink-500">
          <MapPin className="h-3.5 w-3.5" />
          {province}, Vietnam
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
          <CardStat k="Grades" v={<span className="text-ink-400">TBA</span>} />
          <CardStat k="MOQ" v={<span className="text-ink-400">TBA</span>} />
          <CardStat k="Lead time" v={<span className="text-ink-400">TBA</span>} />
          <CardStat k="FOB ref." v={<span className="text-ink-400">On request</span>} />
        </dl>
        <div className="mt-auto pt-4">
          <p className="rounded-md bg-ink-50 px-3 py-2 text-center text-[12px] text-ink-500">
            Profile pending on-site verification
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Types ------------------------------ */

interface Grade {
  code: string;
  label: string;
  count: string;
  desc: string;
}

interface Fact {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}
