import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Khối kêu gọi gửi yêu cầu sourcing, dùng ở sidebar và cuối bài. */
export function ArticleCta({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg bg-ink-900 p-5 text-white ${className}`}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-300">Sourcing request</p>
      <p className="mt-2 text-[17px] leading-snug font-bold">Have a product in mind? Send us your brief.</p>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
        We match it to a Vietnamese producer that fits, and tell you plainly when none does. First reply within one
        working day (UTC+7).
      </p>
      <Link
        href="/#send"
        className="mt-4 flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-brand-700"
      >
        Start a sourcing request
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
