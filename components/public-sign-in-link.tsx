import Link from "next/link";
import { UserRound } from "lucide-react";

/** Một lối vào chung cho tài khoản nhà cung cấp và nhân viên. */
export function PublicSignInLink({ lang = "en" }: { lang?: "en" | "vi" }) {
  return (
    <Link
      href="/login"
      prefetch={false}
      lang={lang}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2 text-[12px] font-semibold text-ink-800 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:px-3 sm:text-[13px]"
    >
      <UserRound className="hidden h-4 w-4 lg:block" aria-hidden="true" />
      {lang === "vi" ? "Đăng nhập" : "Sign in"}
    </Link>
  );
}
