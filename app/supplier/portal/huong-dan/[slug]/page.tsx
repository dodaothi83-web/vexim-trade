import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, ListOrdered } from "lucide-react";

import { getStore } from "@/lib/db";
import { blocksToHTML } from "@/lib/blocks-to-html";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { guideTopic } from "@/lib/guides/topics";
import { requireGuideReader, toGuideCard } from "@/lib/guides/portal";
import type { SupplierGuide } from "@/lib/types";

export const dynamic = "force-dynamic";

async function readGuide(slug: string): Promise<SupplierGuide | null> {
  try { return await getStore().getSupplierGuideBySlug(slug, { publishedOnly: true }); }
  catch (error) { console.error("[supplier-guides] portal detail", error); return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { m } = await getPortalMessages();
  const guide = await readGuide(decodeURIComponent((await params).slug));
  return { title: guide?.title ?? m.guides.metaTitle, robots: { index: false, follow: false } };
}

export default async function SupplierGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireGuideReader();
  const slug = decodeURIComponent((await params).slug);
  const guide = await readGuide(slug);
  if (!guide) notFound();
  const { locale, intl, m } = await getPortalMessages();
  const copy = m.guides;
  const card = toGuideCard(guide);
  const topic = guideTopic(guide.topic);
  const html = blocksToHTML(normalizeBlocksFromStorage(guide.content));
  const siblings = await getStore().listSupplierGuides({ status: "published" })
    .then((rows) => rows.filter((row) => row.topic === guide.topic && row.id !== guide.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, "vi")).slice(0, 5))
    .catch(() => []);
  const updated = new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(guide.updated_at));

  return <div className="mx-auto max-w-3xl">
    <Link href={`/supplier/portal/huong-dan${topic ? `#${topic.slug}` : ""}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-500 hover:text-brand-800">
      <ArrowLeft className="size-4" aria-hidden="true" />{copy.back}
    </Link>
    <article className="mt-4">
      {topic && <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{topic.label[locale]}</p>}
      <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-ink-900 sm:text-[28px]">{guide.title}</h1>
      {guide.summary && <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{guide.summary}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-500">
        <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden="true" />{fill(copy.minutes, { count: card.minutes })}</span>
        {card.steps > 0 && <span className="inline-flex items-center gap-1"><ListOrdered className="size-4" aria-hidden="true" />{fill(copy.steps, { count: card.steps })}</span>}
        <span>{fill(copy.updated, { date: updated })}</span>
      </p>
      {locale === "en" && <p className="mt-2 text-[13px] text-ink-500">{copy.vietnameseOnly}</p>}
      <div lang="vi" className="card mt-5 px-5 py-6 sm:px-8 [&_h2]:!text-2xl [&_h3]:!text-xl"
        dangerouslySetInnerHTML={{ __html: html }} />
    </article>
    <p className="mt-5 rounded-xl border border-ink-200 bg-white px-4 py-3 text-[13px] text-ink-600">{copy.help}</p>
    {siblings.length > 0 && <section className="mt-8" aria-labelledby="more-guides">
      <h2 id="more-guides" className="text-base font-bold text-ink-900">{copy.moreInTopic}</h2>
      <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
        {siblings.map((row) => <li key={row.id}>
          <Link href={`/supplier/portal/huong-dan/${encodeURIComponent(row.slug)}`} className="block px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50 hover:text-brand-800">{row.title}</Link>
        </li>)}
      </ul>
    </section>}
  </div>;
}
