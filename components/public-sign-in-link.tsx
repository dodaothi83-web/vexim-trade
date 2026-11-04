"use client";

import Link from "next/link";
import { signOutBuyerAction } from "@/app/(public)/buyer/sign-in/actions";
import { UserRound } from "lucide-react";

/** Lối vào chọn loại tài khoản từ header công khai. */
export function PublicSignInLink({ lang = "en", buyerEmail = null }: { lang?: "en" | "vi"; buyerEmail?: string | null }) {
  const label = lang === "vi" ? "Đăng nhập" : "Sign in";
  if (buyerEmail) return (
    <details className="group relative" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label={lang === "vi" ? "Tài khoản người mua" : "Buyer account"} title={lang === "vi" ? "Tài khoản" : "Your account"}
        className="inline-flex h-10 cursor-pointer list-none items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
        <UserRound className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-900 shadow-pop">
        <p className="text-xs text-ink-500">{lang === "vi" ? "Đã đăng nhập" : "Signed in"}</p>
        <p className="mt-1 break-all font-semibold">{buyerEmail}</p>
        <form action={signOutBuyerAction} className="mt-3 border-t border-ink-200 pt-3">
          <button type="submit" className="btn btn-ghost w-full justify-center">{lang === "vi" ? "Đăng xuất" : "Sign out"}</button>
        </form>
      </div>
    </details>
  );
  return (
    <Link
      href="/register"
      prefetch={false}
      lang={lang}
      aria-label={label}
      title={label}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2 text-[12px] font-semibold text-ink-800 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:px-3 sm:text-[13px]"
    >
      <UserRound className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}
