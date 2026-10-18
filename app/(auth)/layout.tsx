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
            <p className="text-[12px] text-brand-200/80">Cổng nhân viên &amp; nhà cung cấp</p>
          </div>
        </div>
        <div className="card p-6 shadow-pop">{children}</div>
        <nav aria-label="Legal information" className="mt-5 flex justify-center gap-5 text-xs font-medium text-brand-100">
          <Link href="/privacy-policy" className="hover:text-white hover:underline">Privacy Policy</Link>
          <Link href="/terms-of-service" className="hover:text-white hover:underline">Terms of Service</Link>
        </nav>
      </div>
    </main>
  );
}
