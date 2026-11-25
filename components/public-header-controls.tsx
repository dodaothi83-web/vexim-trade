"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePublicPathname } from "@/hooks/use-public-pathname";
import { Check, ChevronDown, Menu, Search, X } from "lucide-react";
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
    <Link href="/" aria-label="Vexim Trade home" className="flex shrink-0 items-center gap-2.5">
      <Logo className="h-9 w-9 sm:h-12 sm:w-12" />
      <span className="hidden flex-col leading-tight sm:flex md:hidden xl:flex">
        <span className="text-[16.5px] font-semibold tracking-tight text-brand-700">
          Vexim Trade
        </span>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-500">
          Verified Vietnam Sourcing
        </span>
      </span>
    </Link>
  );
}

/**
 * Menu chính — ở hàng thứ hai của header, CHỈ hiện trên desktop (từ `md` trở lên). Trên điện
 * thoại ẩn hẳn (không render) thay vì cuộn ngang như trước, để nhường chỗ cho ô tìm kiếm và
 * tránh một hàng menu phụ chiếm diện tích màn hình nhỏ; các mục này vẫn có thể tới được từ
 * trang chủ hoặc chân trang trên điện thoại.
 */
/** Các mục menu chính, dùng chung cho hàng menu trên desktop và menu ☰ trên điện thoại. */
function primaryNavItems(pathname: string, isVi: boolean, buyer: boolean) {
  // Người mua đã đăng nhập không cần mục "Dành cho nhà cung cấp" (vẫn có ở chân trang).
  return [
    { href: isVi ? "/?lang=vi#categories" : "/#categories", label: isVi ? "Danh mục" : "Categories", active: pathname.startsWith("/products") },
    { href: isVi ? "/how-it-works?lang=vi" : "/how-it-works", label: isVi ? "Cách hoạt động" : "How it works", active: pathname.startsWith("/how-it-works") },
    { href: "/how-we-verify", label: isVi ? "Quy trình xác thực" : "How we verify", active: pathname.startsWith("/how-we-verify") || pathname.startsWith("/verify") },
    ...(buyer ? [] : [{ href: "/for-suppliers", label: isVi ? "Dành cho nhà cung cấp" : "For suppliers", active: pathname.startsWith("/for-suppliers") }]),
  ];
}

function PrimaryNav({ pathname, isVi, buyer = false }: { pathname: string; isVi: boolean; buyer?: boolean }) {
  const items = primaryNavItems(pathname, isVi, buyer);
  return (
    <nav aria-label={isVi ? "Điều hướng chính" : "Main navigation"}
      className="hidden items-center gap-0.5 whitespace-nowrap text-[12.5px] font-medium text-ink-700 md:flex lg:gap-1 lg:text-[14px]">
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
 * kiểu Alibaba: khung viền rõ ràng + placeholder luôn hiển thị. Nút gửi đổi theo kích thước
 * màn hình: trên điện thoại chỉ icon kính lúp (đỡ chiếm chỗ ô nhập liệu), từ `sm` trở lên hiện
 * chữ "Tìm kiếm"/"Search" cho rõ nghĩa.
 */
function HeaderSearchBar({ isVi, isHome }: { isVi: boolean; isHome: boolean }) {
  const router = useRouter();
  if (isHome) return null;
  const label = isVi ? "Tìm kiếm" : "Search";
  // Điều hướng phía client (không tải lại cả trang): khung chờ của /search hiện ngay khi
  // bấm Tìm. Không có JavaScript thì form GET bình thường vẫn chạy như cũ.
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string") params.append(key, value);
    });
    event.preventDefault();
    router.push(`/search?${params.toString()}`);
  };
  return (
    <form action="/search" method="get" role="search" aria-label={label} onSubmit={submit}
      onFocus={() => router.prefetch("/search")}
      className="min-w-0 flex-1">
      <input type="hidden" name="lang" value={isVi ? "vi" : "en"} />
      <label className="sr-only" htmlFor="header-search-query">{label}</label>
      <div className="flex h-10 min-w-0 items-center rounded-full border border-ink-300 bg-white pl-3.5 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 sm:h-11">
        <input id="header-search-query" type="search" name="q" maxLength={120}
          placeholder={isVi ? "Tìm sản phẩm, quy cách, nhà cung cấp..." : "Search products, grades, suppliers..."}
          className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-900 placeholder:text-ink-500 focus:outline-none sm:text-[14.5px]" />
        <button type="submit" aria-label={label}
          className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-brand-700 text-white transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 sm:mr-1.5 sm:h-9 sm:w-auto sm:px-4">
          <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
          <span className="hidden text-[13.5px] font-semibold sm:inline">{label}</span>
        </button>
      </div>
    </form>
  );
}

/**
 * Menu ☰ trên điện thoại (dưới `md`): menu chính, chọn ngôn ngữ và đăng nhập/tài khoản, để hàng đầu
 * chỉ còn logo, ô tìm kiếm, nút Sourcing và nút ☰, không bóp nghẹt ô tìm kiếm. Desktop không đổi.
 */
function MobileMenu({ pathname, isVi, buyerEmail, langHref }: {
  pathname: string; isVi: boolean; buyerEmail: string | null; langHref: (lang: "en" | "vi") => string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Đổi trang thì đóng menu (đồng bộ theo pathname, cách React khuyên thay cho useEffect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setOpen(false); }
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const items = primaryNavItems(pathname, isVi, !!buyerEmail);
  const close = () => setOpen(false);
  const langLink = (target: "en" | "vi", label: string) => {
    const active = (target === "vi") === isVi;
    return <Link href={langHref(target)} scroll={false} onClick={close} aria-current={active ? "true" : undefined}
      className={`flex h-10 flex-1 items-center justify-center rounded-lg text-[14px] font-medium transition ${active ? "bg-brand-700 text-white" : "bg-ink-50 text-ink-800 hover:bg-ink-100"}`}>{label}</Link>;
  };
  return <div className="md:hidden">
    <button ref={buttonRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="public-mobile-menu"
      aria-label={open ? (isVi ? "Đóng menu" : "Close menu") : (isVi ? "Mở menu" : "Open menu")}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-800 transition hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-expanded:bg-ink-50">
      {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
    </button>
    {open && <div ref={panelRef} id="public-mobile-menu"
      className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-64px)] overflow-y-auto border-b border-ink-200 bg-white px-4 pb-5 pt-2 shadow-[0_18px_30px_-18px_rgba(15,23,42,0.35)]">
      <nav aria-label={isVi ? "Điều hướng chính" : "Main navigation"} className="flex flex-col">
        {items.map((item) => <Link key={item.href} href={item.href} onClick={close} aria-current={item.active ? "page" : undefined}
          className={`flex h-11 items-center border-b border-ink-100 text-[15px] font-medium ${item.active ? "text-brand-800" : "text-ink-800"}`}>{item.label}</Link>)}
      </nav>
      <p className="mt-4 text-[12px] font-medium text-ink-500">{isVi ? "Ngôn ngữ" : "Language"}</p>
      <div className="mt-2 flex gap-2">{langLink("en", "English")}{langLink("vi", "Tiếng Việt")}</div>
      {buyerEmail
        ? <Link href="/buyer/account" onClick={close} className="mt-4 flex h-11 items-center justify-center rounded-lg border border-ink-200 text-[15px] font-semibold text-ink-900">{isVi ? "Tài khoản của tôi" : "My account"}</Link>
        : <Link href="/sign-in" prefetch={false} onClick={close} className="mt-4 flex h-11 items-center justify-center rounded-lg border border-ink-200 text-[15px] font-semibold text-ink-900">{isVi ? "Đăng nhập" : "Sign in"}</Link>}
    </div>}
  </div>;
}

function HeaderControlsInner() {
  const { buyerEmail, buyerCompanyName } = usePublicSession();
  const pathname = usePublicPathname() || "/";
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
          {/* Nút quả địa cầu mở dropdown chọn ngôn ngữ (mặc định Tiếng Anh). Chỉ từ `md`: trên điện
              thoại ngôn ngữ và đăng nhập nằm trong menu ☰ để không bóp nghẹt ô tìm kiếm. */}
          <div ref={dropdownRef} className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Language switcher / Chuyển đổi ngôn ngữ"
              aria-expanded={open}
              aria-haspopup="menu"
              title={isVi ? "Đổi ngôn ngữ (Tiếng Việt / English)" : "Change language (English / Tiếng Việt)"}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 text-[12.5px] font-semibold text-ink-800 transition hover:border-brand-300 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 sm:px-2.5"
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

          <span className="mx-0.5 hidden h-6 w-px bg-ink-200 md:block" aria-hidden="true" />
          <div className="hidden md:block"><PublicSignInLink lang={lang} buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} /></div>
          <SourcingComposerTrigger isVi={isVi} />
          <MobileMenu pathname={pathname} isVi={isVi} buyerEmail={buyerEmail ?? null} langHref={buildLangHref} />
        </div>
      </div>

      {/* Hàng 2: menu chính — tách riêng khỏi hàng tìm kiếm/logo, không còn chen vào giữa. */}
      <PrimaryNav pathname={pathname} isVi={isVi} buyer={!!buyerEmail} />
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
            className="hidden h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2 text-[12.5px] font-semibold text-ink-800 sm:px-2.5 md:inline-flex"
          >
            <VeximLanguageIcon size={20} strokeWidth={2.2} className="text-brand-700" />
            <span className="hidden sm:inline">EN</span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-500 sm:block" aria-hidden="true" />
          </button>

          <span className="mx-0.5 hidden h-6 w-px bg-ink-200 md:block" aria-hidden="true" />
          <div className="hidden md:block"><PublicSignInLink buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} /></div>
          <SourcingComposerTrigger />
          <span className="inline-flex h-10 w-10 items-center justify-center text-ink-800 md:hidden" aria-hidden="true"><Menu className="h-5 w-5" /></span>
        </div>
      </div>

      <PrimaryNav pathname="/" isVi={false} buyer={!!buyerEmail} />
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
