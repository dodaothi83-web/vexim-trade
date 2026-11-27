import Link from "next/link";
import { BookOpen, Clock, ListOrdered, Search } from "lucide-react";

import { VeximIcon } from "@/components/brand/vexim-icons";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { guideTopic, type GuideTopic } from "@/lib/guides/topics";
import { listPublishedGuidesByTopic, requireGuideReader, type GuideCard } from "@/lib/guides/portal";
import { matchesGuideQuery } from "@/lib/guides/search";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.guides.metaTitle, robots: { index: false, follow: false } };
}

type Copy = Awaited<ReturnType<typeof getPortalMessages>>["m"]["guides"];
type Lang = "en" | "vi";

const BASE = "/supplier/portal/huong-dan";
const topicHref = (slug: string | null) => slug ? `${BASE}?topic=${encodeURIComponent(slug)}#thu-vien` : `${BASE}#thu-vien`;

/**
 * Trung tâm hướng dẫn, theo cách các học viện người bán (Shopee Uni, Alibaba Seller Learning Center)
 * tổ chức: dải đầu trang có ô tìm kiếm, lộ trình đánh số cho người mới, rồi thư viện với menu chủ đề
 * bên trái và thẻ bài có bìa. Giữ bảng màu navy tiết chế và biểu tượng nghiệp vụ hướng 02 của Vexim.
 */
export default async function SupplierGuidesPage({ searchParams }: { searchParams: Promise<{ topic?: string; q?: string }> }) {
  await requireGuideReader();
  const { locale, m } = await getPortalMessages();
  const copy = m.guides;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const groups = await listPublishedGuidesByTopic({ keepEmpty: true });

  if (groups === null) {
    return <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{copy.unavailable}</p>;
  }
  const total = groups.reduce((sum, group) => sum + group.guides.length, 0);
  const selected = sp.topic && guideTopic(sp.topic) ? sp.topic : null;
  const all = groups.flatMap((group) => group.guides);
  const shown = q ? all.filter((guide) => matchesGuideQuery(guide, q))
    : selected ? groups.find((group) => group.topic.slug === selected)?.guides ?? [] : all;

  return <div className="space-y-8">
    <Hero copy={copy} q={q} lang={locale} />

    {total === 0 ? (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <BookOpen className="size-8 text-brand-600" aria-hidden="true" />
        <p className="mt-3 font-bold text-ink-900">{copy.empty.title}</p>
        <p className="mt-1 max-w-md text-sm text-ink-500">{copy.empty.body}</p>
      </div>
    ) : <>
      {!q && <LearningPath copy={copy} lang={locale} groups={groups} />}

      <section id="thu-vien" aria-labelledby="library-title" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="library-title" className="text-xl font-bold tracking-tight text-ink-900">
            {q ? fill(copy.results.title, { q }) : copy.library.title}
          </h2>
          {q && <Link href={`${BASE}#thu-vien`} className="text-sm font-semibold text-brand-700 hover:underline">{copy.results.clear}</Link>}
        </div>

        <div className={`mt-4 grid gap-5 ${q ? "" : "lg:grid-cols-[240px_minmax(0,1fr)]"}`}>
          {!q && <TopicMenu copy={copy} lang={locale} groups={groups} selected={selected} total={total} />}
          <div className="min-w-0">
            {shown.length === 0
              ? <p className="rounded-xl border border-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-500">{q ? fill(copy.results.none, { q }) : copy.path.soon}</p>
              : <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((guide) => <li key={guide.id}><GuideCardView guide={guide} copy={copy} lang={locale} /></li>)}
              </ul>}
          </div>
        </div>
      </section>
      {locale === "en" && <p className="text-[13px] text-ink-500">{copy.vietnameseOnlyList}</p>}
    </>}
  </div>;
}

function Hero({ copy, q, lang }: { copy: Copy; q: string; lang: Lang }) {
  return <section className="relative overflow-hidden rounded-2xl bg-brand-800 px-5 py-8 text-white sm:px-8 sm:py-10">
    {/* Họa tiết sọc chéo nhạt ở góc, cùng tinh thần dải đầu trang của các học viện người bán, không dùng ảnh minh họa. */}
    <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-56 w-72 rotate-6 opacity-[0.08]"
      style={{ backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 12px)" }} />
    <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-8 hidden gap-3 text-white/25 lg:flex">
      {(["account", "inspection", "samples", "sourcing-request"] as const).map((name, index) => (
        <span key={name} className="flex size-16 items-center justify-center rounded-2xl bg-white/5" style={{ marginBottom: `${index * 14 + 18}px` }}>
          <VeximIcon name={name} size={36} strokeWidth={2} />
        </span>
      ))}
    </div>
    <div className="relative max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-200">{copy.hero.label}</p>
      <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-[30px]">{copy.hero.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-brand-100">{copy.hero.lede}</p>
      <form action={BASE} method="get" role="search" className="mt-5 flex max-w-xl gap-2" lang={lang}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{copy.hero.searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input name="q" defaultValue={q} placeholder={copy.hero.searchPlaceholder} maxLength={80}
            className="h-11 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-300" />
        </label>
        <button type="submit" className="h-11 shrink-0 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-white/20">{copy.hero.searchButton}</button>
      </form>
    </div>
  </section>;
}

function LearningPath({ copy, lang, groups }: { copy: Copy; lang: Lang; groups: Array<{ topic: GuideTopic; guides: GuideCard[] }> }) {
  return <section aria-labelledby="path-title">
    <h2 id="path-title" className="text-xl font-bold tracking-tight text-ink-900">{copy.path.title}</h2>
    <p className="mt-0.5 text-sm text-ink-500">{copy.path.sub}</p>
    <ol className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5">
      {groups.map(({ topic, guides }, index) => {
        const first = guides[0];
        const href = first ? `${BASE}/${encodeURIComponent(first.slug)}` : topicHref(topic.slug);
        return <li key={topic.slug} className="relative">
          {/* Đường nối giữa các chặng trên màn rộng */}
          {index < groups.length - 1 && <span aria-hidden="true" className="absolute left-[calc(50%+28px)] right-[calc(-50%+28px)] top-7 hidden h-px bg-brand-200 lg:block" />}
          <Link href={href} className="group relative flex h-full items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 transition hover:border-brand-300 lg:flex-col lg:gap-2 lg:border-0 lg:bg-transparent lg:p-2 lg:text-center">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 ring-4 ring-ink-50 group-hover:border-brand-400 lg:size-14">
              <VeximIcon name={topic.icon} size={26} strokeWidth={2} />
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white lg:size-6 lg:text-[11px]">{index + 1}</span>
            </span>
            <span className="flex min-w-0 flex-col lg:items-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{fill(copy.path.stage, { n: index + 1 })}</span>
              <span className="font-semibold leading-snug text-ink-900 group-hover:text-brand-800">{topic.label[lang]}</span>
              <span className="text-xs text-ink-500">{guides.length ? fill(copy.path.count, { count: guides.length }) : copy.path.soon}</span>
            </span>
          </Link>
        </li>;
      })}
    </ol>
  </section>;
}

function TopicMenu({ copy, lang, groups, selected, total }: { copy: Copy; lang: Lang; groups: Array<{ topic: GuideTopic; guides: GuideCard[] }>; selected: string | null; total: number }) {
  const items = [{ slug: null as string | null, label: copy.library.all, count: total }, ...groups.map(({ topic, guides }) => ({ slug: topic.slug, label: topic.label[lang], count: guides.length }))];
  return <nav aria-label={copy.library.topicsAria} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
    <ul className="flex gap-2 lg:sticky lg:top-20 lg:flex-col lg:gap-0 lg:overflow-hidden lg:rounded-xl lg:border lg:border-ink-200 lg:bg-white">
      {items.map((item) => {
        const active = item.slug === selected;
        return <li key={item.slug ?? "all"} className="shrink-0 lg:border-b lg:border-ink-100 lg:last:border-b-0">
          <Link href={topicHref(item.slug)} aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition lg:rounded-none lg:border-0 lg:px-4 lg:py-3 ${active
              ? "border-brand-700 bg-brand-700 font-semibold text-white"
              : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50 hover:text-ink-900"}`}>
            <span>{item.label}</span>
            <span className={`text-xs tabular-nums ${active ? "text-brand-100" : "text-ink-400"}`}>{item.count}</span>
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}

function GuideCardView({ guide, copy, lang }: { guide: GuideCard; copy: Copy; lang: Lang }) {
  const topic = guideTopic(guide.topic);
  return <Link href={`${BASE}/${encodeURIComponent(guide.slug)}`}
    className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
    {/* Bìa: nền navy nhạt, sọc chéo ở góc và biểu tượng chủ đề, nhãn chủ đề như bìa khoá học. */}
    <div className="relative flex h-24 items-end justify-between sm:h-28 overflow-hidden bg-brand-50 px-4 pb-3">
      <span aria-hidden="true" className="absolute -left-6 -top-6 h-16 w-40 -rotate-12 opacity-40"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--color-brand-200) 0 2px, transparent 2px 9px)" }} />
      <span className="relative rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-brand-800 shadow-sm">{topic?.label[lang] ?? guide.topic}</span>
      {topic && <span aria-hidden="true" className="relative flex size-16 items-center justify-center rounded-full bg-white/70 text-brand-700 transition group-hover:scale-105">
        <VeximIcon name={topic.icon} size={38} strokeWidth={2} />
      </span>}
    </div>
    <div className="flex flex-1 flex-col p-4">
      <span className="line-clamp-2 font-semibold leading-snug text-ink-900 group-hover:text-brand-800">{guide.title}</span>
      {guide.summary && <span className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-ink-500">{guide.summary}</span>}
      <span className="mt-auto flex items-center justify-end gap-2 pt-3 text-xs text-ink-500">
        {guide.steps > 0 && <><span className="inline-flex items-center gap-1"><ListOrdered className="size-3.5" aria-hidden="true" />{fill(copy.steps, { count: guide.steps })}</span><span aria-hidden="true" className="h-3 w-px bg-ink-200" /></>}
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{fill(copy.minutes, { count: guide.minutes })}</span>
      </span>
    </div>
  </Link>;
}
