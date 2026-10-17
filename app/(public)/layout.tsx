import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand-logo";
import { getStore } from "@/lib/db";
import { SimpleFooter } from "./simple-footer";

export const dynamic = "force-dynamic";

/**
 * Public site layout.
 *  - Header: logo · nav (Categories / How we verify / For suppliers) · CTA "Request a quote".
 *  - Trang chủ (/) tự render hero + sections + footer đầy đủ trong home.tsx
 *    (industries, links, contact). Các trang khác dùng SimpleFooter gọn
 *    (SimpleFooter tự ẩn ở pathname "/").
 *  - Back-office /crm/* ở route group riêng, không bị bọc bởi layout này.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const store = getStore();
  await store.listCategories({ publishedOnly: true }); // warm cache

  return (
    <div lang="en" className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Veximtrade home" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-9 w-[48px]" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span
                className="text-[16.5px] font-black tracking-tight text-brand-800"
                style={{ letterSpacing: "-0.01em" }}
              >
                Vexim <span className="text-ink-900">Trade</span>
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                Verified Vietnam Sourcing
              </span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 text-[13.5px] font-medium text-ink-700 md:flex">
            <Link href="/#categories" className="hover:text-brand-700">Categories</Link>
            <Link href="/how-we-verify" className="hover:text-brand-700">How we verify</Link>
            <Link href="/for-suppliers" className="hover:text-brand-700">For suppliers</Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/rfq"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-700 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-800"
            >
              Request a quote
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <SimpleFooter />
    </div>
  );
}
