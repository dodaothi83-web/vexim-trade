import Link from "next/link";
import { UserRound } from "lucide-react";

/** Lối vào chọn loại tài khoản từ header công khai. */
export function PublicSignInLink({ lang = "en" }: { lang?: "en" | "vi" }) {
  const label = lang === "vi" ? "Đăng nhập" : "Sign in";
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
