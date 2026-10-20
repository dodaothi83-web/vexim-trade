import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  FileStack,
  Layers3,
  Search,
  ShieldCheck,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { listPublishedNews } from "@/lib/blog/queries";
import { listPublicCategoryProducts, type PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts } from "@/lib/public/supplier-product-order";
import { PublicProductCard } from "@/components/public-product-card";
import { CookieSettingsButton } from "@/components/cookie-consent";
import { Logo } from "@/components/brand-logo";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";
import { SocialLinks } from "@/components/social-links";
import type { Category } from "@/lib/types";

/** Ảnh placeholder khi category chưa upload hero_image — màu sắc trung tính, không gây nhầm sản phẩm */
const FALLBACK_HERO = "/images/home/hero-cashew-texture.jpg";

function i18n(m: Category["intro_i18n"] | Category["homepage_kicker_i18n"] | Category["name_i18n"] | null | undefined, fallback = ""): string {
  if (!m || typeof m !== "object") return fallback;
  const v = (m as Record<string, string>).en ?? Object.values(m)[0];
  return typeof v === "string" ? v : fallback;
}

const HOW_IT_WORKS = [
  {
    icon: FileStack,
    title: "Tell us what you need",
    body: "Product, grade, quantity, destination and timing. If you're unsure about Incoterms or payment, we'll suggest what's usual.",
  },
  {
    icon: Search,
    title: "We find suppliers that fit",
    body: "We contact producers we know and check them before they reach you.",
  },
  {
    icon: ClipboardCheck,
    title: "Compare quotes side by side",
    body: "Price, MOQ, lead time and certificates on one page. You decide who to talk to.",
  },
  {
    icon: ShieldCheck,
    title: "Samples, order, shipment",
    body: "We arrange samples and inspection when you want them, then follow the order until it sails.",
  },
];

const PROMISES = [
  { icon: Building2,  title: "Each check stands on its own.", body: "Document checks, factory visits and delivery history are reviewed separately. A badge appears only after that specific review is approved." },
  { icon: Search,     title: "See what we have checked.",     body: "A supplier profile does not imply a factory visit. Look for the individual review results, and ask us about checks still in progress." },
  { icon: Layers3,    title: "Your details stay private.",   body: "Suppliers see your requirements, not your contact information, until you choose to go ahead." },
  { icon: BadgeCheck, title: "We stay with your order.",     body: "Our team follows it through production, paperwork and shipment." },
];

const FAQ = [
  {
    q: "Does it cost anything to request a quote?",
    a: "No. Requesting quotes is free. We only charge for optional services such as pre-shipment inspection when you ask us to arrange them.",
  },
  {
    q: "How fast do you reply?",
    a: "Within one business day for the categories listed above. We come back with suppliers that match, or tell you honestly if we can't match what you're looking for.",
  },
  {
    q: "Will suppliers contact me directly?",
    a: "Not until you choose to. Suppliers see your requirements, not your contact details. You decide who to talk to.",
  },
  {
    q: "Can you handle samples and inspections?",
    a: "Yes. We arrange samples, pre-shipment inspection and loading supervision at cost when you need them.",
  },
];

export default async function HomeContent() {
  const store = getStore();
  const allCategories = await store.listCategories({ publishedOnly: true });
  const supCount = (await store.listSuppliers()).filter((s) => s.status === "published").length;
  // News is secondary to the catalogue: a blog query outage must not take down the homepage.
  const latestPosts = (await listPublishedNews().catch((error) => {
    console.error("[home] could not load published news", error);
    return [];
  })).slice(0, 3);

  // Industries hiện trên khối "What we source": active_on_homepage=true, sort theo sort_order.
  // Cờ active_on_homepage do admin bật trong CRM; chỉ hiện các ngành đội sale trả lời được trong 24h.
  const activeCategories = allCategories
    .filter((c) => c.active_on_homepage)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // Homepage product cards are real buyer-ready offers only, never category hero/demo imagery.
  // Bound catalogue lookups: homepage is not the full category search page.
  const homeCategories = activeCategories.filter((c) => c.public_page_ready).slice(0, 4);
  const productGroups = await Promise.all(homeCategories.map(async (category) => ({
    category, products: await listPublicCategoryProducts(category),
  })));
  const seen = new Set<string>();
  const offers: Array<PublicCategoryProduct & { categorySlug: string }> = [];
  for (const { category, products } of productGroups) for (const p of products) {
    if (p.isDemo || seen.has(p.id)) continue;
    seen.add(p.id);
    offers.push({ ...p, categorySlug: category.slug });
  }
  const homeProducts = arrangeSupplierProducts(offers, 2).shown.slice(0, 8);
  // Every published category card leads to its product listing, including the empty state.
  const heroOf = (c: Category) => c.hero_image || FALLBACK_HERO;

  return (
    <div>
      {/* HERO — ảnh nền hạt điều + overlay đậm để chữ đọc được */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <Image
          src="/images/home/hero-cashew-texture.jpg"
          alt=""
          preload
          fetchPriority="high"
          fill
          sizes="100vw"
          className="object-cover opacity-30"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-900/85 via-brand-900/75 to-ink-900/90" />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 60%, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px, 40px 40px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-start">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.2em] text-brand-100 ring-1 ring-white/20 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                Sourcing from Vietnam
              </span>
              <h1
                className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[58px]"
                style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
              >
                Buy from Vietnamese producers you can trust
              </h1>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-brand-100/90 sm:text-[17px]">
                Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and Vexim will shortlist suppliers that match.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/rfq"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3.5 text-[14.5px] font-bold text-brand-900 shadow-xl shadow-black/25 transition hover:bg-brand-50"
                >
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/how-we-verify"
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10"
                >
                  How we check suppliers
                </Link>
              </div>
              <div className="mt-10 flex items-center gap-4 border-t border-white/15 pt-5 text-[13px] text-brand-100/80">
                {/* Chỉ khoe số hồ sơ công khai khi đã đủ lớn để tạo tin cậy; số nhỏ (vd. 1) gây phản tác dụng. */}
                {supCount >= 10 && (
                  <>
                    <Stat num={String(supCount)} label="published supplier profiles" />
                    <Divider />
                  </>
                )}
                <Stat num="1" label="business day to reply" />
                <Divider />
                <Stat num="EN · VN" label="languages we work in" />
              </div>
            </div>

            {/* Quote card */}
            <div className="relative lg:mt-4">
              <div className="rounded-2xl bg-white/95 p-6 text-ink-900 shadow-2xl shadow-black/30 backdrop-blur">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-accent-600">
                  <ShieldCheck className="h-4 w-4" /> Quotes from checked suppliers
                </div>
                <h3 className="mt-2 text-[22px] font-bold leading-tight">Tell us what you need</h3>
                <p className="mt-1 text-[13.5px] text-ink-600">Free. No account needed.</p>
                <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink-700">
                  <Bullet>Suppliers won't see your company name until you choose to talk.</Bullet>
                  <Bullet>If you haven’t chosen a supplier, we will shortlist suppliers that match your requirements.</Bullet>
                  <Bullet>Each quote shows what we checked ourselves vs. what the supplier told us.</Bullet>
                  <Bullet>We arrange samples and pre-shipment inspection at cost.</Bullet>
                </ul>
                <Link
                  href="/rfq"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14.5px] font-bold text-white transition hover:bg-brand-800"
                >
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-2 text-center text-[11.5px] text-ink-500">You can write in your own language.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES — thẻ có ảnh, 4 cột; badge chỉ khi có sản phẩm công khai trong đúng ngành. */}
      <section id="categories" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-[30px] font-black tracking-tight text-ink-900 sm:text-[36px]">What we source</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
                Product categories we actively work on today. We only list industries where our team can reply within one business day.
                If you don't see yours, send it to us anyway — we'll tell you honestly if we can help.
              </p>
            </div>
            <Link
              href="/rfq"
              className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:text-brand-800"
            >
              Looking for something else? <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {activeCategories.map((c) => {
              // Danh mục đã đăng luôn link /products/[slug]; badge chỉ khi có sản phẩm phù hợp và buyer-ready.
              const href = `/products/${c.slug}`;
              const hasProducts = Boolean(c.public_page_ready);
              const label = i18n(c.name_i18n, c.slug);
              const kicker = i18n(c.homepage_kicker_i18n, "Tell us what you need");
              return (
                <li key={c.slug}>
                  <Link
                    href={href}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
                      <Image
                        src={heroOf(c)}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
                      {hasProducts && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Products available
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600">{kicker}</p>
                      <h3 className="mt-1.5 text-[15.5px] font-bold text-ink-900 group-hover:text-brand-700">{label}</h3>
                      <p className="mt-auto pt-3 text-[12.5px] font-semibold text-brand-700">
                        {hasProducts ? "Browse products →" : "Tell us what you need →"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-[12.5px] leading-relaxed text-ink-500">
            <strong className="text-ink-700">Other Vietnamese products</strong> (shrimp, pangasius, noodles, dried fruit, honey, tea, processed foods): we know good factories in many of these but are still building our supplier notes.
            Send us an RFQ and we'll be honest about what we can cover in 24 hours and what needs a bit more time.
          </p>
        </div>
      </section>

      {homeProducts.length > 0 && <section aria-labelledby="home-products-title" className="bg-ink-50/70">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-brand-700">Buyer-ready listings</p>
              <h2 id="home-products-title" className="mt-2 text-2xl font-black text-ink-900 sm:text-3xl">Explore products</h2>
              <p className="mt-2 text-sm text-ink-600">Real products with buyer-shareable media. Supplier checks and reference prices are shown only where applicable.</p></div>
            <a href="#categories" className="text-sm font-semibold text-brand-700 hover:underline">All categories →</a>
          </div>
          <ul className="mt-6 grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {homeProducts.map((p) => <li key={p.id} className="min-w-0">
              <PublicProductCard href={`/products/${encodeURIComponent(p.categorySlug)}/${encodeURIComponent(p.id)}`}
                imagePath={p.cardImagePath ?? p.imagePaths[0]} name={p.name} moq={p.moq} price={p.price} fob={p.incoterm?.toUpperCase() === "FOB"}
                leadTimeDays={p.leadTimeDays} supplierName={p.supplierName}
                supplierHref={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`}
                verificationSteps={p.verificationSteps} />
            </li>)}
          </ul>
        </div>
      </section>}

      {/* HOW IT WORKS — timeline ngang trên desktop */}
      <section className="bg-ink-50/70">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-[30px] font-black tracking-tight text-ink-900 sm:text-[36px]">Four steps from request to shipment</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">Most buyers hear back from us within one business day.</p>
          </div>

          <ol className="relative mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {/* Đường nối timeline trên desktop */}
            <span aria-hidden className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-ink-200 to-transparent lg:block" />
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title} className="relative lg:px-5">
                <div className="relative flex items-center gap-3">
                  <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white ring-4 ring-ink-50/70 shadow-md">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-500 text-white">
                      <s.icon className="h-5 w-5" />
                    </span>
                  </span>
                  <span className="font-mono text-[11px] font-bold tracking-widest text-accent-600">STEP 0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-[16px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* LATEST NEWS — dữ liệu thật từ /blog; không dùng ảnh chuyến thăm giả hoặc bài nháp. */}
      <section aria-labelledby="home-news-title" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-accent-600">News &amp; insights</p>
              <h2 id="home-news-title" className="mt-2 text-[30px] font-black tracking-tight text-ink-900 sm:text-[36px]">Latest articles</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
                Practical sourcing guides and updates from Vexim Trade. Explore the latest stories from our newsroom.
              </p>
            </div>
            <Link href="/blog" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:text-brand-800">
              View all articles <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {latestPosts.length ? (
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {latestPosts.map((post) => (
                <li key={post.id} className="min-w-0">
                  <article className="h-full">
                    <Link href={`/blog/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
                      <div className="relative aspect-[4/3] overflow-hidden bg-brand-50">
                        {post.featured_image ? (
                          // Blog uploads are public, UUID-named images. Serve responsive card-sized
                          // variants rather than the full 1200–1450px source; other/legacy URLs
                          // remain plain images because they may not be allowed by Next's loader.
                          /^\/blog-media\/blog\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(post.featured_image) ? (
                            <Image
                              src={post.featured_image}
                              alt={post.featured_image_alt || ""}
                              fill
                              sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(50vw - 36px), (max-width: 1279px) calc(33vw - 32px), 400px"
                              className="object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <img src={post.featured_image} alt={post.featured_image_alt || ""} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center gap-3 text-brand-700">
                            <FileStack className="h-7 w-7" aria-hidden="true" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Vexim Trade · News</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        {post.published_at && <time dateTime={post.published_at} className="text-[11.5px] font-bold uppercase tracking-wide text-accent-700">{formatPostDate(post.published_at)}</time>}
                        <h3 className="mt-2 text-[18px] font-bold leading-snug text-ink-900 group-hover:text-brand-700">{post.title}</h3>
                        {post.excerpt && <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-ink-600">{post.excerpt}</p>}
                        <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[13px] font-semibold text-brand-700">Read article <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                      </div>
                    </Link>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-10 rounded-xl border border-dashed border-ink-200 bg-ink-50 p-6 text-sm text-ink-600" role="status">
              No articles published yet. <Link href="/blog" className="font-semibold text-brand-700 underline hover:text-brand-800">Visit our news page</Link> for updates.
            </div>
          )}
        </div>
      </section>

      {/* PROMISES — thẻ bên cạnh ảnh lớn */}
      <section className="bg-brand-900 text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl lg:aspect-[4/5]">
              <Image
                src="/images/home/review-desk.jpg"
                alt="Inspection checklist and product samples"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 ring-1 ring-white/10" />
              <div className="absolute bottom-4 left-4 rounded-lg bg-ink-950/70 px-3 py-2 text-[11.5px] text-white backdrop-blur">
                Verification results are recorded separately for each supplier.
              </div>
            </div>

            <div>
              <h2 className="text-[30px] font-black tracking-tight text-white sm:text-[38px]"
                  style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
                Know what we've checked.
              </h2>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-brand-100/90">
                We're based in Hanoi. Documents, factory visits and delivery history are different reviews.
                We show each approved result on its own, so you can tell what has — and hasn't — been checked.
              </p>

              <ul className="mt-8 space-y-4">
                {PROMISES.map((g) => (
                  <li key={g.title} className="flex gap-4 rounded-xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-white shadow">
                      <g.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-white">{g.title}</h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-brand-100/80">{g.body}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/rfq" className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-brand-900 transition hover:bg-brand-50">
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/for-suppliers" className="inline-flex items-center gap-2 rounded-md border border-white/25 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
                  Are you a Vietnamese supplier?
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-ink-50/70">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-6 lg:px-8">
          <p className="text-center text-[12px] font-bold uppercase tracking-[0.2em] text-accent-600">Questions</p>
          <h2 className="mt-2 text-center text-[30px] font-black tracking-tight text-ink-900 sm:text-[36px]">Frequently asked</h2>

          <ul className="mt-10 divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
            {FAQ.map((f, i) => (
              <li key={f.q} className="p-5 sm:p-6">
                <h3 className="flex items-start gap-3 text-[15.5px] font-bold text-ink-900">
                  <span className="mt-0.5 font-mono text-[12px] font-bold text-accent-600">0{i + 1}</span>
                  {f.q}
                </h3>
                <p className="mt-2 pl-7 text-[14px] leading-relaxed text-ink-600">{f.a}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-accent-500 via-accent-600 to-accent-700 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 10% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 90% 80%, #fff 1px, transparent 1px)",
            backgroundSize: "26px 26px, 38px 38px",
          }}
        />
        <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-20 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-[30px] font-black leading-tight sm:text-[36px]"
                style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
              Not sure where to start?
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/90">
              Send a short note about the product, grade and volume you need. We'll reply within one business day.
            </p>
          </div>
          <Link
            href="/rfq"
            className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-6 py-3.5 text-[14.5px] font-bold text-white shadow-lg transition hover:bg-ink-800"
          >
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* FOOTER — industries list + links + contact */}
      <footer className="border-t border-ink-200 bg-white text-[13px] text-ink-600">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <Logo className="h-10 w-10" />
                <span className="text-[16px] font-black tracking-tight text-ink-900">Vexim Trade</span>
              </div>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-500">
                A sourcing team in Hanoi connecting international buyers with Vietnamese producers.
              </p>
              <p className="mt-5 text-[12.5px] text-ink-400">© 2026 Vexim Global Co., Ltd., Hanoi, Vietnam</p>
              <SocialLinks className="mt-2" />
            </div>

            <FooterCol title="Products">
              {activeCategories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/products/${c.slug}`}
                    className="hover:text-brand-700"
                  >
                    {i18n(c.name_i18n, c.slug)}
                  </Link>
                </li>
              ))}
              <li><Link href="/rfq" className="hover:text-brand-700">Something else →</Link></li>
            </FooterCol>

            <FooterCol title="Company">
              <li><Link href="/how-we-verify" className="hover:text-brand-700">How we verify suppliers</Link></li>
              <li><Link href="/for-suppliers" className="hover:text-brand-700">For Vietnamese suppliers</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-brand-700">Privacy Policy</Link></li>
              <li><Link href="/cookie-policy" className="hover:text-brand-700">Cookie Policy</Link></li>
              <li><CookieSettingsButton className="hover:text-brand-700" /></li>
              <li><Link href="/terms-of-service" className="hover:text-brand-700">Terms of Service</Link></li>
              <li><a href="mailto:contact@veximglobal.com" className="hover:text-brand-700">contact@veximglobal.com</a></li>
            </FooterCol>

            <FooterCol title="Buyers">
              <li><Link href="/rfq" className="hover:text-brand-700">Request a quote</Link></li>
              <li><Link href="/compare" className="hover:text-brand-700">Compare suppliers</Link></li>
              <li><Link href="/rfq" className="hover:text-brand-700">Samples & inspection</Link></li>
            </FooterCol>
          </div>
        </div>
        <PlatformLegalStrip />
      </footer>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div>
      <div className="text-[20px] font-black text-white" style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>{num}</div>
      <div className="text-[11.5px] uppercase tracking-widest text-brand-100/70">{label}</div>
    </div>
  );
}

function Divider() {
  return <span className="h-8 w-px bg-white/20" aria-hidden />;
}

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-ink-900">{title}</h4>
      <ul className="mt-3 space-y-2 text-[13px] text-ink-500">{children}</ul>
    </div>
  );
}
