import Link from "next/link";
import { BookOpen, ChevronRight, Clock, ListOrdered } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { listPublishedGuidesByTopic, requireGuideReader } from "@/lib/guides/portal";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.guides.metaTitle, robots: { index: false, follow: false } };
}

/** Danh sách hướng dẫn theo chủ đề (kiểu thư viện khoá học, gọn hơn: chủ đề rồi tới bài). */
export default async function SupplierGuidesPage() {
  await requireGuideReader();
  const { locale, m } = await getPortalMessages();
  const copy = m.guides;
  const groups = await listPublishedGuidesByTopic();

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
    {locale === "en" && <p className="mb-4 text-[13px] text-ink-500">{copy.vietnameseOnlyList}</p>}
    {groups === null ? (
      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{copy.unavailable}</p>
    ) : groups.length === 0 ? (
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <BookOpen className="size-8 text-brand-600" aria-hidden="true" />
        <p className="mt-3 font-bold text-ink-900">{copy.empty.title}</p>
        <p className="mt-1 max-w-md text-sm text-ink-500">{copy.empty.body}</p>
      </div>
    ) : (
      <div className="space-y-8">
        {groups.map(({ topic, guides }) => (
          <section key={topic.slug} id={topic.slug} aria-labelledby={`topic-${topic.slug}`} className="scroll-mt-24">
            <h2 id={`topic-${topic.slug}`} className="text-lg font-bold text-ink-900">{topic.label[locale]}</h2>
            <p className="mt-0.5 text-sm text-ink-500">{topic.description[locale]}</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {guides.map((guide) => (
                <li key={guide.id}>
                  <Link href={`/supplier/portal/huong-dan/${encodeURIComponent(guide.slug)}`}
                    className="group flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-4 shadow-card transition hover:border-brand-300 hover:shadow-md">
                    <span className="font-bold leading-snug text-ink-900 group-hover:text-brand-800">{guide.title}</span>
                    {guide.summary && <span className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-ink-600">{guide.summary}</span>}
                    <span className="mt-auto flex items-center gap-3 pt-3 text-[12px] text-ink-500">
                      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{fill(copy.minutes, { count: guide.minutes })}</span>
                      {guide.steps > 0 && <span className="inline-flex items-center gap-1"><ListOrdered className="size-3.5" aria-hidden="true" />{fill(copy.steps, { count: guide.steps })}</span>}
                      <ChevronRight className="ml-auto size-4 text-ink-400 group-hover:text-brand-700" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
  </>;
}
