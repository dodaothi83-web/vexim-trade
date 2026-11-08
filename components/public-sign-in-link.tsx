"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOutBuyerAction } from "@/app/(public)/buyer/sign-in/actions";
import { VeximAccountIcon } from "@/components/brand/vexim-icons";
import { usePublicSessionActions } from "@/lib/buyer/public-session-context";

/** Lối vào chọn loại tài khoản từ header công khai. */
export function PublicSignInLink({ lang = "en", buyerEmail = null, buyerCompanyName = null }: { lang?: "en" | "vi"; buyerEmail?: string | null; buyerCompanyName?: string | null }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardNavigation = useRef(false);
  const { setSignedOut } = usePublicSessionActions();
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const closeMenu = () => {
    cancelClose();
    if (menuRef.current) menuRef.current.open = false;
  };

  useEffect(() => {
    if (!buyerEmail) return;
    const dismissOutside = (event: PointerEvent | FocusEvent) => {
      const menu = menuRef.current;
      if (menu?.open && event.target && !menu.contains(event.target as Node)) {
        cancelClose();
        menu.open = false;
      }
    };
    // Capture also handles clicks in components that stop event propagation.
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => {
      cancelClose();
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
    };
  }, [buyerEmail]);

  const initial = Array.from((buyerCompanyName?.trim() || buyerEmail?.trim() || "V").normalize("NFC"))[0].toLocaleUpperCase(lang);
  const label = lang === "vi" ? "Đăng nhập" : "Sign in";
  if (buyerEmail) return (
    <details ref={menuRef} className="group relative"
      onPointerEnter={(event) => {
        cancelClose();
        if (event.pointerType === "mouse" && window.matchMedia("(any-hover: hover)").matches) {
          keyboardNavigation.current = false;
          if (menuRef.current) menuRef.current.open = true;
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        cancelClose();
        closeTimer.current = setTimeout(() => {
          closeTimer.current = null;
          if (keyboardNavigation.current && menuRef.current?.contains(document.activeElement)) return;
          closeMenu();
        }, 250);
      }}
      onPointerDown={() => { keyboardNavigation.current = false; }}
      onKeyDown={(event) => {
        keyboardNavigation.current = true;
        if (event.key === "Escape") {
          closeMenu();
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}>
      <summary aria-label={lang === "vi" ? "Tài khoản người mua" : "Buyer account"} title={lang === "vi" ? "Đã đăng nhập. Tài khoản của bạn" : "Signed in. Your account"}
        className="relative inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-brand-700 transition hover:bg-brand-50 group-open:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
        <VeximAccountIcon size={26} strokeWidth={2.2} />
        {/* Đã đăng nhập: chữ cái đầu công ty trong một chấm nhỏ, thay cho khối tròn đặc to. */}
        <span className="absolute bottom-1 right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white" aria-hidden="true">{initial}</span>
      </summary>
      <div className="absolute right-0 top-full z-50 w-64 pt-2">
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-sm text-ink-900 shadow-pop">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[15px] font-bold text-brand-800 ring-1 ring-brand-100" aria-hidden="true">{initial}</span>
            <div className="min-w-0">
              <p className="text-xs text-ink-500">{lang === "vi" ? "Đã đăng nhập" : "Signed in"}</p>
              {buyerCompanyName?.trim() && <p className="truncate font-semibold">{buyerCompanyName.trim()}</p>}
              <p className={buyerCompanyName?.trim() ? "truncate text-xs text-ink-600" : "break-all font-semibold"}>{buyerEmail}</p>
            </div>
          </div>
          <nav aria-label={lang === "vi" ? "Tài khoản" : "Account"} className="mt-3 flex flex-col gap-1 border-t border-ink-200 pt-2">
            <Link onClick={closeMenu} href="/buyer/account" className="rounded-lg px-2 py-2 hover:bg-brand-50">{lang === "vi" ? "Tổng quan" : "Overview"}</Link>
            <Link onClick={closeMenu} href="/buyer/account?tab=requests" className="rounded-lg px-2 py-2 hover:bg-brand-50">{lang === "vi" ? "Yêu cầu của tôi" : "My requests"}</Link>
            <Link onClick={closeMenu} href="/buyer/account?tab=saved" className="rounded-lg px-2 py-2 hover:bg-brand-50">{lang === "vi" ? "Sản phẩm đã lưu" : "Saved products"}</Link>
            <Link onClick={closeMenu} href="/buyer/account?tab=profile" className="rounded-lg px-2 py-2 hover:bg-brand-50">{lang === "vi" ? "Thông tin tài khoản" : "Account details"}</Link>
          </nav>
          <form onSubmit={() => { closeMenu(); setSignedOut(); }} action={signOutBuyerAction} className="mt-3 border-t border-ink-200 pt-3">
            {/* Đăng xuất qua Server Action luôn thành công và redirect("/") tới CÙNG layout
                công khai (không remount) — setSignedOut() cập nhật lạc quan ngay lập tức
                cho header/saved-products thay vì chờ điều hướng hoàn tất. */}
            <button type="submit" className="btn btn-ghost w-full justify-center">{lang === "vi" ? "Đăng xuất" : "Sign out"}</button>
          </form>
        </div>
      </div>
    </details>
  );
  return (
    <Link
      href="/sign-in"
      prefetch={false}
      lang={lang}
      aria-label={label}
      title={label}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[14px] font-semibold text-ink-800 transition hover:bg-ink-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 xl:px-3.5"
    >
      <VeximAccountIcon size={22} strokeWidth={2.2} aria-hidden="true" className="text-brand-700" />
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}
