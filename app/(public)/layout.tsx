import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand-logo";
import { cx } from "@/components/ui";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Layout cho các trang công khai (danh mục, hồ sơ, so sánh, RFQ, how-we-verify…).
 * Giữ nguyên lang=en, toà nhà trắng-chữ đen kiểu dossier; header giống mẫu trên Arena.
 * Các back-office route nằm trong group (app)/(auth) dùng layout riêng có Sidebar.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const store = getStore();
  const categories = await store.listCategories({ publishedOnly: true });

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* Top bar mảnh giống mẫu Dossier: logo + strip sản phẩm + CTA */}
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-5 py-3.5 sm:px-8">
          <Link href="/" aria-label="Veximtrade home" className="shrink-0">
            <Logo className="h-9 w-[49px]" />
          </Link>
          <span className="hidden text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500 sm:block">
            Veximtrade
          </span>
          <nav className="ml-auto flex items-center gap-2 text-[13px] text-ink-600">
            {categories.slice(0, 5).map((c, i) => (
              <span key={c.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink-300">·</span>}
                <Link
                  href={`/products/${c.slug}`}
                  className="transition hover:text-ink-900"
                >
                  {c.name_i18n?.en ?? c.slug}
                </Link>
              </span>
            ))}
          </nav>
          <Link
            href="/rfq"
            className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-ink-800"
          >
            Start a sourcing request
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <SimpleFooter />
    </div>
  );
}

function SimpleFooter() {
  return (
    <footer className="border-t border-ink-200 bg-white py-8 text-[12.5px] text-ink-500">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 sm:px-8">
        <p>© {new Date().getFullYear()} Veximtrade — VEXIM GLOBAL CO., LTD · Hanoi, Vietnam</p>
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

export const sharedContainer = cx("mx-auto max-w-5xl px-5 sm:px-8");
