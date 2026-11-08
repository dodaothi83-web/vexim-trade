"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { VeximLanguageIcon } from "@/components/brand/vexim-icons";

import { SourcingComposerTrigger } from "@/components/sourcing-composer";
import { PublicSignInLink } from "@/components/public-sign-in-link";
import { usePublicSession } from "@/lib/buyer/use-public-session";

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

function HeaderControlsFallback() {
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
        <PublicSignInLink buyerEmail={null} buyerCompanyName={null} />
        <SourcingComposerTrigger />
      </div>
    </>
  );
}

/**
 * Không còn nhận `buyerEmail`/`buyerCompanyName` từ layout server (trước đây qua
 * getBuyerSession(), buộc layout phải render động). `HeaderControlsInner` giờ tự gọi
 * /api/public/session SAU khi mount — xem lib/buyer/use-public-session.ts.
 */
export function PublicHeaderControls() {
  return (
    <Suspense fallback={<HeaderControlsFallback />}>
      <HeaderControlsInner />
    </Suspense>
  );
}
