import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";

/** Public legal documents must load without a session or a working marketplace database. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div lang="en" className="min-h-screen bg-slate-50 text-ink-900">
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-black text-brand-800" aria-label="Vexim Trade home">
          <Logo className="h-9 w-12" /><span>Vexim Trade</span>
        </Link>
        <nav aria-label="Legal pages" className="flex flex-wrap gap-5 text-sm font-semibold text-ink-700">
          <Link href="/privacy-policy" className="hover:text-brand-700">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-brand-700">Terms of Service</Link>
        </nav>
      </div>
    </header>
    <main id="main-content" className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
    <footer className="border-t border-ink-200 bg-white px-5 py-7 text-sm text-ink-600">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 sm:px-3">
        <p>© {new Date().getFullYear()} VEXIM GLOBAL CO., LTD · Hanoi, Vietnam</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/" className="hover:text-brand-700">Home</Link>
          <a href="mailto:hello@veximtrade.com" className="hover:text-brand-700">hello@veximtrade.com</a>
        </div>
      </div>
    </footer>
  </div>;
}
