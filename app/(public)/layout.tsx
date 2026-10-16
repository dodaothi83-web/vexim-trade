import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand-logo";
import { SiteSearch } from "@/components/site-search";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public site layout — marketplace/sàn style.
 *
 *  - Header 2 hàng: hàng trên có logo thương hiệu đậm, ô tìm kiếm lớn ở giữa,
 *    CTA "Start a sourcing request"; hàng dưới là thanh danh mục canh lề với nội dung.
 *  - Container nội dung rộng hơn dossier cũ (max-w-7xl) để chứa lưới thẻ 2–3 cột.
 *  - Back-office nằm ở /crm/* (route thật), không bị public layout bọc.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const store = getStore();
  const categories = await store.listCategories({ publishedOnly: true });

  const catLinks = categories.map((c) => ({
    slug: c.slug,
    name: c.name_i18n?.en ?? c.slug,
  }));

  return (
    <div className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        {/* Hàng 1: logo + search + CTA, canh lề trùng với nội dung (max-w-7xl) */}
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Veximtrade home" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-10 w-[54px]" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span
                className="text-[17px] font-black tracking-tight text-brand-800"
                style={{ letterSpacing: "-0.01em" }}
              >
                Vexim <span className="text-ink-900">Trade</span>
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                Verified Vietnam Sourcing
              </span>
            </span>
          </Link>

          <div className="mx-auto w-full max-w-xl">
            <SiteSearch categories={catLinks} />
          </div>

          <nav className="hidden items-center gap-5 text-[13.5px] font-medium text-ink-700 md:flex">
            <Link href="/how-we-verify" className="hover:text-brand-700">
              How we verify
            </Link>
            <Link href="/for-suppliers" className="hover:text-brand-700">
              For suppliers
            </Link>
          </nav>

          <Link
            href="/rfq"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-700 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-brand-800 md:ml-0"
          >
            Start a sourcing request
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Hàng 2: thanh danh mục */}
        <nav className="border-t border-ink-100 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-5 py-0 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-semibold text-ink-600 hover:text-ink-900"
            >
              All categories
            </Link>
            {catLinks.map((c) => (
              <Link
                key={c.slug}
                href={`/products/${c.slug}`}
                className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-semibold text-ink-700 hover:border-brand-600 hover:text-brand-700"
              >
                {c.name}
              </Link>
            ))}
            <span className="ml-auto hidden shrink-0 py-2.5 text-[12px] text-ink-400 sm:inline">
              More categories coming soon
            </span>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <SimpleFooter />
    </div>
  );
}

function SimpleFooter() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-50 py-10 text-[12.5px] text-ink-500">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 sm:px-6 lg:px-8">
        <p>
          © {new Date().getFullYear()} Veximtrade — VEXIM GLOBAL CO., LTD · Hanoi, Vietnam ·
          Export license pending verification.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/how-we-verify" className="hover:text-ink-900">How we verify</Link>
          <Link href="/for-suppliers" className="hover:text-ink-900">For suppliers</Link>
          <Link href="/blog" className="hover:text-ink-900">Blog</Link>
          <Link href="/login" className="hover:text-ink-900">Staff sign in</Link>
        </div>
      </div>
    </footer>
  );
}
