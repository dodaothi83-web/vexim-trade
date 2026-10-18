import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { SocialLinks } from "@/components/social-links";

/** Public legal documents must load without a session or a working marketplace database. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div lang="en" className="min-h-screen bg-slate-50 text-ink-900">
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-black text-brand-800" aria-label="Vexim Trade home">
          <Logo className="h-12 w-12" /><span>Vexim Trade</span>
        </Link>
        <nav aria-label="Legal pages" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-700">
          <Link href="/thong-tin-chu-quan" className="hover:text-brand-700">Thông tin chủ quản</Link>
          <Link href="/quy-che-hoat-dong" className="hover:text-brand-700">Quy chế hoạt động</Link>
          <Link href="/khieu-nai" className="hover:text-brand-700">Khiếu nại</Link>
          <Link href="/dieu-khoan-su-dung" className="hover:text-brand-700">Điều khoản sử dụng</Link>
          <Link href="/chinh-sach-bao-mat" className="hover:text-brand-700">Chính sách bảo mật</Link>
          <Link href="/privacy-policy" className="hover:text-brand-700">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-brand-700">Terms of Service</Link>
        </nav>
      </div>
    </header>
    <main id="main-content" className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
    <footer className="border-t border-ink-200 bg-white px-5 py-7 text-sm text-ink-600">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 sm:px-3">
        <p>© {new Date().getFullYear()} VEXIM GLOBAL CO., LTD · Số 25/6 Ngõ 51 Ngoạ Long, Tây Tựu, Hà Nội, Việt Nam</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/" className="hover:text-brand-700">Home</Link>
          <a href="mailto:hello@veximtrade.com" className="hover:text-brand-700">hello@veximtrade.com</a>
          <SocialLinks />
        </div>
      </div>
    </footer>
  </div>;
}
