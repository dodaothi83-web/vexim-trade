import Link from "next/link";
import { LayoutTemplate } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";

/** Thẻ "Nội dung A+ doanh nghiệp" trên "Trang của tôi": mở trang soạn riêng. */
export function CompanyAplusCard({ copy, count }: { copy: AplusMessages["company"]; count: number }) {
  return <section className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-brand-200 bg-white p-4 sm:p-5">
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><LayoutTemplate className="size-5" aria-hidden="true" /></span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-ink-900">{copy.card} {count > 0 && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800">{fill("{count}/10", { count })}</span>}</p>
      <p className="mt-0.5 text-xs leading-5 text-ink-600">{copy.cardBody}</p>
    </div>
    <Link href="/supplier/portal/storefront/company" className="btn btn-primary btn-sm">{copy.open}</Link>
  </section>;
}
