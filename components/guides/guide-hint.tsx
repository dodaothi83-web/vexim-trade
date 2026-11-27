import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";

import { VeximIcon } from "@/components/brand/vexim-icons";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { guidesForTopic } from "@/lib/guides/portal";
import { guideTopic } from "@/lib/guides/topics";

const BASE = "/supplier/portal/huong-dan";

/**
 * Dòng "Hướng dẫn:" dưới tiêu đề trang trong cổng nhà cung cấp (giai đoạn 2, 27/11/2026).
 * Lấy bài đã xuất bản của chủ đề gắn với trang; chưa có bài thì không hiện gì, nên Vexim
 * đăng bài mới là trang tự có gợi ý, không cần sửa code.
 */
export async function GuideHint({ topic }: { topic: string }) {
  const guides = await guidesForTopic(topic);
  if (!guides.length) return null;
  const { m } = await getPortalMessages();
  const copy = m.guides.hint;
  return <nav aria-label={copy.aria} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink-600">
      <BookOpen className="size-3.5 text-brand-700" aria-hidden="true" />{copy.label}
    </span>
    {guides.slice(0, 2).map((guide) => (
      <Link key={guide.id} href={`${BASE}/${encodeURIComponent(guide.slug)}`}
        className="max-w-[18rem] truncate font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600">
        {guide.title}
      </Link>
    ))}
    {guides.length > 2 && <Link href={`${BASE}?topic=${encodeURIComponent(topic)}#thu-vien`} className="font-medium text-ink-500 hover:text-brand-700">
      {fill(copy.all, { count: guides.length })}
    </Link>}
  </nav>;
}

/**
 * Khối "Bắt đầu với Vexim" ở trang tổng quan: bài của chủ đề Bắt đầu, dạng thẻ nhỏ.
 * Chỉ hiện khi đã có bài; trang tổng quan quyết định hiện cho ai (nhà cung cấp mới).
 */
export async function GuideStarter({ className = "" }: { className?: string }) {
  const guides = await guidesForTopic("bat-dau");
  if (!guides.length) return null;
  const { locale, m } = await getPortalMessages();
  const copy = m.guides.starter;
  const topic = guideTopic("bat-dau");
  return <section aria-labelledby="guide-starter" className={`rounded-xl border border-ink-200 bg-white p-4 sm:p-5 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        {topic && <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <VeximIcon name={topic.icon} size={24} strokeWidth={2} />
        </span>}
        <div>
          <h2 id="guide-starter" className="text-[15px] font-bold text-ink-900">{copy.title}</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">{copy.sub}</p>
        </div>
      </div>
      <Link href={BASE} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
        {copy.all}<ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
    <ol className="mt-3 grid gap-2 sm:grid-cols-3" lang="vi">
      {guides.slice(0, 3).map((guide, index) => (
        <li key={guide.id}>
          <Link href={`${BASE}/${encodeURIComponent(guide.slug)}`}
            className="group flex h-full items-start gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{index + 1}</span>
            <span className="text-[13px] font-semibold leading-snug text-ink-800 group-hover:text-brand-800">{guide.title}</span>
          </Link>
        </li>
      ))}
    </ol>
    {locale === "en" && <p className="mt-2 text-[12px] text-ink-500">{m.guides.vietnameseOnlyList}</p>}
  </section>;
}
