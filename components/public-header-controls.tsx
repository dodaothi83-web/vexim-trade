"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { VeximLanguageIcon } from "@/components/brand/vexim-icons";

import { SourcingComposerTrigger } from "@/components/sourcing-composer";
import { PublicSignInLink } from "@/components/public-sign-in-link";
import { usePublicSession } from "@/lib/buyer/public-session-context";

const NAV_LINK = "rounded-full px-3 py-2 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 lg:px-3.5";
const NAV_ACTIVE = "bg-brand-50 text-brand-800 hover:bg-brand-50 hover:text-brand-800";

/** Menu chính: chữ đậm vừa, nền bo tròn khi rê chuột, mục đang mở được tô nhẹ. */
function PrimaryNav({ pathname, isVi }: { pathname: string; isVi: boolean }) {
  const items = [
    { href: isVi ? "/?lang=vi#categories" : "/#categories", label: isVi ? "Danh mục" : "Categories", active: pathname.startsWith("/products") },
    { href: isVi ? "/how-it-works?lang=vi" : "/how-it-works", label: isVi ? "Cách hoạt động" : "How it works", active: pathname.startsWith("/how-it-works") },
    { href: "/how-we-verify", label: isVi ? "Quy trình xác thực" : "How we verify", active: pathname.startsWith("/how-we-verify") || pathname.startsWith("/verify") },
    { href: "/for-suppliers", label: isVi ? "Dành cho nhà cung cấp" : "For suppliers", active: pathname.startsWith("/for-suppliers") },
  ];
  return <nav aria-label={isVi ? "Điều hướng chính" : "Main navigation"} className="ml-2 hidden items-center gap-0.5 whitespace-nowrap text-[12.5px] font-semibold text-ink-700 md:flex lg:ml-5 lg:gap-1 lg:text-[14px]">
    {items.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}
      className={`${NAV_LINK} ${item.active ? NAV_ACTIVE : ""}`}>{item.label}</Link>)}
  </nav>;
}

/**
 * Ô tìm kiếm thu gọn trên header — hiện ở MỌI trang trừ trang chủ (trang chủ đã có ô tìm
 * kiếm lớn trong khối hero, thêm một ô nữa ở header sẽ trùng lặp thừa). Người mua đang xem
 * một trang danh mục/sản phẩm cụ thể giờ có thể tìm thứ khác ngay mà không phải quay về
 * trang chủ trước — đúng cách Alibaba/Global Sources vẫn làm.
 *
 * Chỉ phần ô nhập cho desktop (md+), lấp khoảng trống giữa menu chính và cụm nút bên phải.
 * Icon kính lúp + ô nhập mở rộng cho di động nằm riêng trong cụm nút bên phải (xem
 * `HeaderSearchMobileToggle`) để không bị dính sát logo khi menu chính đang ẩn.
 */
function HeaderSearchDesktopForm({ isVi, isHome }: { isVi: boolean; isHome: boolean }) {
  if (isHome) return null;
  const label = isVi ? "Tìm kiếm" : "Search";
  return (
    <form action="/search" method="get" role="search" aria-label={label}
      className="relative mx-1 hidden min-w-0 flex-1 md:block lg:max-w-sm">
      <input type="hidden" name="lang" value={isVi ? "vi" : "en"} />
      <label className="sr-only" htmlFor="header-search-query">{label}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input id="header-search-query" type="search" name="q" maxLength={120}
        placeholder={isVi ? "Tìm sản phẩm, quy cách, nhà cung cấp..." : "Search products, grades, suppliers..."}
        className="h-10 w-full rounded-full border border-ink-200 bg-ink-50 pl-9 pr-3 text-[13.5px] text-ink-900 transition placeholder:text-ink-500 focus:border-brand-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" />
    </form>
  );
}

/** Icon kính lúp trong cụm nút bên phải; bấm vào hiện thanh nhập full chiều ngang đè lên header. */
function HeaderSearchMobileToggle({ isVi, isHome }: { isVi: boolean; isHome: boolean }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (isHome) return null;
  const label = isVi ? "Tìm kiếm" : "Search";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={isVi ? "Mở tìm kiếm" : "Open search"}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-700 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 md:hidden">
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-ink-200 bg-white px-3 py-2.5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] md:hidden">
          <form action="/search" method="get" role="search" aria-label={label} className="flex items-center gap-2">
            <input type="hidden" name="lang" value={isVi ? "vi" : "en"} />
            <div className="relative min-w-0 flex-1">
              <label className="sr-only" htmlFor="header-search-query-mobile">{label}</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input ref={inputRef} id="header-search-query-mobile" type="search" name="q" maxLength={120}
                placeholder={isVi ? "Tìm sản phẩm, quy cách, nhà cung cấp..." : "Search products, grades, suppliers..."}
                className="h-11 w-full rounded-full border border-ink-200 bg-ink-50 pl-9 pr-3 text-[15px] text-ink-900 focus:border-brand-400 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" />
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={isVi ? "Đóng tìm kiếm" : "Close search"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-600 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function HeaderControlsInner() {
  const { buyerEmail, buyerCompanyName } = usePublicSession();
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
      <PrimaryNav pathname={pathname} isVi={isVi} />

      <HeaderSearchDesktopForm isVi={isVi} isHome={pathname === "/"} />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:gap-3">
        <HeaderSearchMobileToggle isVi={isVi} isHome={pathname === "/"} />

        {/* Nút icon quả địa cầu mở dropdown chọn ngôn ngữ (Mặc định: Tiếng Anh) */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Language switcher / Chuyển đổi ngôn ngữ"
            aria-expanded={open}
            aria-haspopup="menu"
            title={isVi ? "Đổi ngôn ngữ (Tiếng Việt / English)" : "Change language (English / Tiếng Việt)"}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 text-[12.5px] font-bold text-ink-800 transition hover:border-brand-300 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-expanded:border-brand-300 aria-expanded:bg-brand-50"
          >
            <VeximLanguageIcon size={20} strokeWidth={2.2} className="text-brand-700" />
            <span>{isVi ? "VI" : "EN"}</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
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

        <span className="mx-0.5 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden="true" />
        <PublicSignInLink lang={lang} buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} />
        <SourcingComposerTrigger isVi={isVi} />
      </div>
    </>
  );
}

/**
 * Chỉ hiện trong lúc useSearchParams() ở HeaderControlsInner còn "suspend" (hiếm, thường chỉ
 * vài khung hình đầu khi stream SSR) — usePublicSession() KHÔNG phụ thuộc useSearchParams()
 * nên vẫn gọi được ở đây để hiển thị đúng trạng thái đăng nhập ngay cả trong lúc chờ, thay vì
 * luôn hiện "Sign in" cho người đã đăng nhập.
 */
function HeaderControlsFallback() {
  const { buyerEmail, buyerCompanyName } = usePublicSession();
  return (
    <>
      <PrimaryNav pathname="/" isVi={false} />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:gap-3">
        <button
          type="button"
          aria-label="Language switcher / Chuyển đổi ngôn ngữ"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 text-[12.5px] font-bold text-ink-800"
        >
          <VeximLanguageIcon size={20} strokeWidth={2.2} className="text-brand-700" />
          <span>EN</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
        </button>

        <span className="mx-0.5 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden="true" />
        <PublicSignInLink buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} />
        <SourcingComposerTrigger />
      </div>
    </>
  );
}

/**
 * Không còn nhận `buyerEmail`/`buyerCompanyName` từ layout server (trước đây qua
 * getBuyerSession(), buộc layout phải render động). `HeaderControlsInner` giờ tự gọi
 * /api/public/session SAU khi mount — xem lib/buyer/public-session-context.tsx.
 */
export function PublicHeaderControls() {
  return (
    <Suspense fallback={<HeaderControlsFallback />}>
      <HeaderControlsInner />
    </Suspense>
  );
}
