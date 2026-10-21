"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Globe } from "lucide-react";

function HeaderControlsInner() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams?.get("lang") === "vi" ? "vi" : "en";
  const isVi = lang === "vi";

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
    const href = buildLangHref(targetLang);
    router.push(href, { scroll: false });
  }

  return (
    <>
      <nav className="ml-6 hidden items-center gap-6 text-[13.5px] font-medium text-ink-700 md:flex">
        <Link href={isVi ? "/?lang=vi#categories" : "/#categories"} className="hover:text-brand-700">
          {isVi ? "Danh mục" : "Categories"}
        </Link>
        <Link href="/how-we-verify" className="hover:text-brand-700">
          {isVi ? "Quy trình xác thực" : "How we verify"}
        </Link>
        <Link href="/for-suppliers" className="hover:text-brand-700">
          {isVi ? "Dành cho nhà cung cấp" : "For suppliers"}
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
        {/* Nút chuyển đổi song ngữ Anh - Việt (Mặc định: Tiếng Anh - EN) */}
        <div
          role="group"
          aria-label="Language switcher / Chuyển đổi ngôn ngữ"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold shadow-2xs"
        >
          <span className="hidden items-center pl-2 pr-1 text-slate-500 sm:inline-flex" aria-hidden="true">
            <Globe className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            onClick={() => switchLang("en")}
            aria-pressed={!isVi}
            title="Display in English (Default)"
            className={`cursor-pointer rounded-md px-2.5 py-1.5 transition ${
              !isVi
                ? "bg-brand-800 text-white shadow-2xs"
                : "text-slate-600 hover:text-ink-900"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => switchLang("vi")}
            aria-pressed={isVi}
            title="Hiển thị Tiếng Việt"
            className={`cursor-pointer rounded-md px-2.5 py-1.5 transition ${
              isVi
                ? "bg-brand-800 text-white shadow-2xs"
                : "text-slate-600 hover:text-ink-900"
            }`}
          >
            VI
          </button>
        </div>

        <Link
          href="/rfq"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-700 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-800 sm:px-4 sm:text-[13.5px]"
        >
          <span>{isVi ? "Yêu cầu báo giá" : "Request a quote"}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
}

function HeaderControlsFallback() {
  return (
    <>
      <nav className="ml-6 hidden items-center gap-6 text-[13.5px] font-medium text-ink-700 md:flex">
        <Link href="/#categories" className="hover:text-brand-700">Categories</Link>
        <Link href="/how-we-verify" className="hover:text-brand-700">How we verify</Link>
        <Link href="/for-suppliers" className="hover:text-brand-700">For suppliers</Link>
      </nav>

      <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
        <div
          role="group"
          aria-label="Language switcher / Chuyển đổi ngôn ngữ"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold shadow-2xs"
        >
          <span className="hidden items-center pl-2 pr-1 text-slate-500 sm:inline-flex" aria-hidden="true">
            <Globe className="h-3.5 w-3.5" />
          </span>
          <Link
            href="/"
            className="rounded-md bg-brand-800 px-2.5 py-1.5 text-white shadow-2xs"
          >
            EN
          </Link>
          <Link
            href="/?lang=vi"
            className="rounded-md px-2.5 py-1.5 text-slate-600 hover:text-ink-900"
          >
            VI
          </Link>
        </div>

        <Link
          href="/rfq"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-700 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-800 sm:px-4 sm:text-[13.5px]"
        >
          Request a quote
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
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
