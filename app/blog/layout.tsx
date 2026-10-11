import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="Veximtrade home" className="shrink-0">
            <Logo className="block h-12 w-[65px]" />
          </Link>
          <nav className="ml-auto hidden items-center gap-7 text-[15px] font-medium text-ink-700 md:flex">
            <Link href="/" className="transition hover:text-brand-700">Home</Link>
            <Link href="/blog" className="transition hover:text-brand-700">News</Link>
          </nav>
          <Link
            href="/#send"
            className="ml-auto flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Start a sourcing request
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">{children}</main>

      <SiteFooter />
    </div>
  );
}
