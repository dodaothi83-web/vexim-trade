import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand-logo";
import { PublicSignInLink } from "@/components/public-sign-in-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteTrafficBeacon } from "@/components/site-traffic-beacon";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <SiteTrafficBeacon />
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-6 sm:px-8">
          <Link href="/" aria-label="Veximtrade home" className="shrink-0">
            <Logo className="h-[60px] w-[60px]" />
          </Link>
          <nav className="ml-auto hidden items-center gap-7 text-[15px] font-medium text-ink-700 md:flex">
            <Link href="/" className="transition hover:text-brand-700">Home</Link>
            <Link href="/blog" className="transition hover:text-brand-700">News</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3 md:ml-0">
            <PublicSignInLink />
            <Link
              href="/#send"
              aria-label="Request a quote"
              className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-brand-600 px-3 text-[12px] font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:px-5 sm:text-[15px]"
            >
              <span className="sm:hidden">Quote</span>
              <span className="hidden sm:inline">Request a quote</span>
              <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">{children}</main>

      <SiteFooter />
    </div>
  );
}
