import Link from "next/link";
import type { ReactNode } from "react";

import { COMPANY } from "@/lib/config";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-[17px] font-black tracking-tight">
            Veximtrade
          </Link>
          <nav className="flex items-center gap-5 text-[14px] font-semibold text-ink-600">
            <Link href="/" className="hover:text-ink-900">Trang chủ</Link>
            <Link href="/blog" className="hover:text-ink-900">Tin tức</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>

      <footer className="mt-16 border-t border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-5xl px-5 py-8 text-[13px] text-ink-500">
          <p className="font-semibold text-ink-900">{COMPANY.name}</p>
          <p className="mt-1">{COMPANY.address}</p>
          <p className="mt-1">
            <a href={`mailto:${COMPANY.email}`} className="hover:text-ink-900">{COMPANY.email}</a>
            {" · "}
            <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="hover:text-ink-900">{COMPANY.phone}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
