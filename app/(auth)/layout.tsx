import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-900 via-ink-900 to-brand-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <Logo tone="white" className="h-20 w-20" />
          <div>
            <p className="text-[17px] leading-tight font-black tracking-tight text-white">
              VEXIM TRADE
            </p>
            <p className="text-[12px] text-brand-200/80">Cổng nhà cung cấp</p>
          </div>
        </div>
        <div className="card p-6 shadow-pop">{children}</div>
        <nav aria-label="Thông tin pháp lý" className="mt-5 flex justify-center gap-5 text-xs font-medium text-brand-100">
          <Link href="/chinh-sach-bao-mat" className="hover:text-white hover:underline">Chính sách bảo mật</Link>
          <Link href="/dieu-khoan-su-dung" className="hover:text-white hover:underline">Điều khoản sử dụng</Link>
        </nav>
      </div>
    </main>
  );
}
