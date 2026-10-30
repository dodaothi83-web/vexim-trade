"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Globe } from "lucide-react";

import { PublicSignInLink } from "@/components/public-sign-in-link";

function QuoteLink({ isVi = false }: { isVi?: boolean }) {
  const label = isVi ? "Yêu cầu báo giá" : "Request a quote";

  return (
    <Link
      href="/rfq"
      aria-label={label}
      lang={isVi ? "vi" : "en"}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand-700 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 sm:px-4 sm:text-[13.5px]"
    >
      <span className="xl:hidden">{isVi ? "Báo giá" : "Quote"}</span>
      <span className="hidden xl:inline">{label}</span>
      <ArrowRight className="hidden h-3.5 w-3.5 xl:block" aria-hidden="true" />
    </Link>
  );
}

function HeaderControlsInner() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams?.get("lang") === "vi" ? "vi" : "en";
  const isVi = lang === "vi";

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function buildLangHref(targetLang: "en" | "vi"): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (targetLang === "en") {
      params.delete("lang");
    } else {
      params.set("lang", "vi");
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function switchLang(targetLang: "en" | "vi") {
    setOpen(false);
    const href = buildLangHref(targetLang);
    router.push(href, { scroll: false });
  }

  return (
    <>
      <nav className="ml-3 hidden items-center gap-3 whitespace-nowrap text-[12px] font-medium text-ink-700 md:flex lg:ml-6 lg:gap-5 lg:text-[13.5px]">
        <Link href={isVi ? "/?lang=vi#categories" : "/#categories"} className="hover:text-brand-700">
          {isVi ? "Danh mục" : "Categories"}
        </Link>
        <Link href={isVi ? "/how-it-works?lang=vi" : "/how-it-works"} className="hover:text-brand-700">
          {isVi ? "Cách hoạt động" : "How it works"}
        </Link>
        <Link href="/how-we-verify" className="hover:text-brand-700">
          {isVi ? "Quy trình xác thực" : "How we verify"}
        </Link>
        <Link href="/for-suppliers" className="hover:text-brand-700">
          {isVi ? "Dành cho nhà cung cấp" : "For suppliers"}
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:gap-3">
        {/* Nút icon quả địa cầu mở dropdown chọn ngôn ngữ (Mặc định: Tiếng Anh) */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Language switcher / Chuyển đổi ngôn ngữ"
            aria-expanded={open}
            aria-haspopup="menu"
            title={isVi ? "Đổi ngôn ngữ (Tiếng Việt / English)" : "Change language (English / Tiếng Việt)"}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-ink-700 shadow-2xs transition hover:border-brand-300 hover:bg-slate-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <Globe className="h-4.5 w-4.5" />
          </button>

          {open && (
            <div
              role="menu"
              aria-label="Select language / Chọn ngôn ngữ"
              className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => switchLang("en")}
                className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                  !isVi
                    ? "bg-brand-50 font-bold text-brand-900"
                    : "text-ink-700 hover:bg-slate-100"
                }`}
              >
                <span>English</span>
                {!isVi && <Check className="h-3.5 w-3.5 text-brand-700" />}
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => switchLang("vi")}
                className={`mt-0.5 flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                  isVi
                    ? "bg-brand-50 font-bold text-brand-900"
                    : "text-ink-700 hover:bg-slate-100"
                }`}
              >
                <span>Tiếng Việt</span>
                {isVi && <Check className="h-3.5 w-3.5 text-brand-700" />}
              </button>
            </div>
          )}
        </div>

        <PublicSignInLink lang={lang} />
        <QuoteLink isVi={isVi} />
      </div>
    </>
  );
}

function HeaderControlsFallback() {
  return (
    <>
      <nav className="ml-3 hidden items-center gap-3 whitespace-nowrap text-[12px] font-medium text-ink-700 md:flex lg:ml-6 lg:gap-5 lg:text-[13.5px]">
        <Link href="/#categories" className="hover:text-brand-700">Categories</Link>
        <Link href="/how-it-works" className="hover:text-brand-700">How it works</Link>
        <Link href="/how-we-verify" className="hover:text-brand-700">How we verify</Link>
        <Link href="/for-suppliers" className="hover:text-brand-700">For suppliers</Link>
      </nav>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:gap-3">
        <button
          type="button"
          aria-label="Language switcher / Chuyển đổi ngôn ngữ"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-ink-700 shadow-2xs"
        >
          <Globe className="h-4.5 w-4.5" />
        </button>

        <PublicSignInLink />
        <QuoteLink />
      </div>
    </>
  );
}

export function PublicHeaderControls() {
  return (
    <Suspense fallback={<HeaderControlsFallback />}>
      <HeaderControlsInner />
    </Suspense>
  );
}
