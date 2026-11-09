"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { VeximLanguageIcon } from "@/components/brand/vexim-icons";

import { Logo } from "@/components/brand-logo";
import { SourcingComposerTrigger } from "@/components/sourcing-composer";
import { PublicSignInLink } from "@/components/public-sign-in-link";
import { usePublicSession } from "@/lib/buyer/public-session-context";

const NAV_LINK = "shrink-0 rounded-full px-3 py-1.5 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 lg:px-3.5 lg:py-2";
const NAV_ACTIVE = "bg-brand-50 text-brand-800 hover:bg-brand-50 hover:text-brand-800";

/** Logo bấm về trang chủ — dùng chung cho hàng 1 của header (cả trạng thái tải lẫn trạng thái thường). */
function HeaderLogo() {
  return (
    <Link href="/" aria-label="Veximtrade home" className="flex shrink-0 items-center gap-2.5">
      <Logo className="h-10 w-10 sm:h-12 sm:w-12" />
      <span className="hidden flex-col leading-tight sm:flex md:hidden xl:flex">
        <span className="text-[16.5px] font-black tracking-tight text-brand-700" style={{ letterSpacing: "-0.01em" }}>
          Vexim Trade
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          Verified Vietnam Sourcing
        </span>
      </span>
    </Link>
  );
}

/**
 * Menu chính — ĐÃ CHUYỂN XUỐNG hàng thứ hai của header (trước đây chen giữa logo và cụm nút,
 * khiến ô tìm kiếm không còn chỗ để hiện đầy đủ). Hiện ở mọi kích thước màn hình: cuộn ngang
 * khi không đủ chỗ (mobile) thay vì ẩn hẳn như trước — người dùng trên điện thoại giờ cũng bấm
 * được "Categories/How it works/..." mà không phải quay về trang chủ trước.
 */
function PrimaryNav({ pathname, isVi }: { pathname: string; isVi: boolean }) {
  const items = [
    { href: isVi ? "/?lang=vi#categories" : "/#categories", label: isVi ? "Danh mục" : "Categories", active: pathname.startsWith("/products") },
    { href: isVi ? "/how-it-works?lang=vi" : "/how-it-works", label: isVi ? "Cách hoạt động" : "How it works", active: pathname.startsWith("/how-it-works") },
    { href: "/how-we-verify", label: isVi ? "Quy trình xác thực" : "How we verify", active: pathname.startsWith("/how-we-verify") || pathname.startsWith("/verify") },
    { href: "/for-suppliers", label: isVi ? "Dành cho nhà cung cấp" : "For suppliers", active: pathname.startsWith("/for-suppliers") },
  ];
  return (
    <nav aria-label={isVi ? "Điều hướng chính" : "Main navigation"}
      className="-mx-3 flex items-center gap-0.5 overflow-x-auto whitespace-nowrap px-3 text-[12.5px] font-semibold text-ink-700 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 lg:gap-1 lg:text-[14px] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}
          className={`${NAV_LINK} ${item.active ? NAV_ACTIVE : ""}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Ô tìm kiếm trên header — hiện ở MỌI trang trừ trang chủ (trang chủ đã có ô tìm kiếm lớn
 * trong khối hero, thêm một ô nữa ở header sẽ trùng lặp thừa) và ở MỌI kích thước màn hình,
 * kiểu Alibaba: khung viền rõ ràng + placeholder luôn hiển thị + nút tìm kiếm hình tròn đặc màu
 * thương hiệu — không còn là icon kính lúp ẩn/hiện như trước.
 */
function HeaderSearchBar({ isVi, isHome }: { isVi: boolean; isHome: boolean }) {
  if (isHome) return null;
  const label = isVi ? "Tìm kiếm" : "Search";
  return (
    <form action="/search" method="get" role="search" aria-label={label}
      className="min-w-0 flex-1">
      <input type="hidden" name="lang" value={isVi ? "vi" : "en"} />
      <label className="sr-only" htmlFor="header-search-query">{label}</label>
      <div className="flex h-10 items-center rounded-full border border-ink-300 bg-white pl-3.5 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 sm:h-11">
        <input id="header-search-query" type="search" name="q" maxLength={120}
          placeholder={isVi ? "Tìm sản phẩm, quy cách, nhà cung cấp..." : "Search products, grades, suppliers..."}
          className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-900 placeholder:text-ink-500 focus:outline-none sm:text-[14.5px]" />
        <button type="submit" aria-label={label}
          className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 sm:mr-1.5 sm:h-9 sm:w-9">
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function HeaderControlsInner() {
  const { buyerEmail, buyerCompanyName } = usePublicSession();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = searchParams?.get("lang") === "vi" ? "vi" : "en";
  const isVi = lang === "vi";
  const isHome = pathname === "/";

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
      {/* Hàng 1: logo · ô tìm kiếm · cụm nút bên phải — tất cả cùng một hàng, kể cả trên điện thoại. */}
      <div className="flex items-center gap-2 sm:gap-3">
        <HeaderLogo />

        <HeaderSearchBar isVi={isVi} isHome={isHome} />

        <div className={`flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3 ${isHome ? "ml-auto" : ""}`}>
          {/* Nút icon quả địa cầu mở dropdown chọn ngôn ngữ (Mặc định: Tiếng Anh). Trên điện
              thoại chỉ hiện icon (bỏ chữ EN/VI + mũi tên) để nhường chỗ cho ô tìm kiếm. */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Language switcher / Chuyển đổi ngôn ngữ"
              aria-expanded={open}
              aria-haspopup="menu"
              title={isVi ? "Đổi ngôn ngữ (Tiếng Việt / English)" : "Change language (English / Tiếng Việt)"}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 text-[12.5px] font-bold text-ink-800 transition hover:border-brand-300 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 sm:px-2.5"
            >
              <VeximLanguageIcon size={20} strokeWidth={2.2} className="text-brand-700" />
              <span className="hidden sm:inline">{isVi ? "VI" : "EN"}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-ink-500 sm:block" aria-hidden="true" />
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
      </div>

      {/* Hàng 2: menu chính — tách riêng khỏi hàng tìm kiếm/logo, không còn chen vào giữa. */}
      <PrimaryNav pathname={pathname} isVi={isVi} />
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
      <div className="flex items-center gap-2 sm:gap-3">
        <HeaderLogo />
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
          <button
            type="button"
            aria-label="Language switcher / Chuyển đổi ngôn ngữ"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 text-[12.5px] font-bold text-ink-800 sm:px-2.5"
          >
            <VeximLanguageIcon size={20} strokeWidth={2.2} className="text-brand-700" />
            <span className="hidden sm:inline">EN</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-500 sm:block" aria-hidden="true" />
          </button>

          <span className="mx-0.5 hidden h-6 w-px bg-ink-200 sm:block" aria-hidden="true" />
          <PublicSignInLink buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} />
          <SourcingComposerTrigger />
        </div>
      </div>

      <PrimaryNav pathname="/" isVi={false} />
    </>
  );
}

/**
 * Không còn nhận `buyerEmail`/`buyerCompanyName` từ layout server (trước đây qua
 * getBuyerSession(), buộc layout phải render động). `HeaderControlsInner` giờ tự gọi
 * /api/public/session SAU khi mount — xem lib/buyer/public-session-context.tsx.
 *
 * Trả về HAI hàng (logo+tìm kiếm+nút ở hàng 1, menu chính ở hàng 2) — `PublicHeaderShell`
 * xếp các children theo cột (flex-col), nên cứ thêm "hàng" bằng cách trả về nhiều phần tử
 * cùng cấp ở đây, không cần đổi gì ở layout.tsx.
 */
export function PublicHeaderControls() {
  return (
    <Suspense fallback={<HeaderControlsFallback />}>
      <HeaderControlsInner />
    </Suspense>
  );
}
