import { BuyerEnquiryAuthProvider } from "@/components/buyer-enquiry-auth";
import { BuyerGoogleOneTapGate } from "@/components/buyer-google-one-tap-gate";
import { BuyerSavedProductsProvider } from "@/components/buyer-saved-products";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { PublicHeaderControls } from "@/components/public-header-controls";
import { PublicHeaderShell } from "@/components/public-header-shell";
import { SimpleFooter } from "./simple-footer";
import { MarketplaceRail } from "@/components/marketplace-rail";
import { SiteTrafficBeacon } from "@/components/site-traffic-beacon";
import { ProductComparisonProvider } from "@/components/product-comparison-provider";
import { ProductComparisonTray } from "@/components/product-comparison-tray";

// revalidate=300 (5 phút): layout không còn đọc cookie/phiên lúc render (xem ghi chú dưới) nên có thể
// cache/ISR như mọi trang công khai khác, cùng cửa sổ làm mới với app/(public)/page.tsx.
export const revalidate = 300;

/**
 * Public site layout.
 *  - Header: logo · nav · Language Switcher (EN/VI, default EN) · sign in · CTA "Sourcing request".
 *  - Trang chủ (/) tự render hero + sections + footer đầy đủ trong home.tsx
 *    (industries, links, contact). Các trang khác dùng SimpleFooter gọn
 *    (SimpleFooter tự ẩn ở pathname "/").
 *  - Back-office /crm/* ở route group riêng, không bị bọc bởi layout này.
 *
 * Cá nhân hoá theo người dùng (đăng nhập người mua, gợi ý Google One Tap, danh sách đã lưu)
 * KHÔNG còn đọc ở đây. Trước đây layout gọi getBuyerSession()/getLocale()/hasOneTapSession()
 * (đều đọc cookie) ngay lúc render — bất kỳ lần đọc cookie nào trong cây render cũng buộc
 * Next.js coi toàn bộ nhánh đó là "force-dynamic", nên không trang công khai nào cache/ISR
 * được, dù trang đó không tự đọc cookie. Giờ các phần việc đó do client tự gọi
 * /api/public/session SAU khi HTML tĩnh đã hiển thị (xem lib/buyer/use-public-session.ts,
 * components/public-header-controls.tsx, components/buyer-google-one-tap-gate.tsx) — người
 * mua đã đăng nhập vẫn thấy đúng trạng thái của mình, chỉ trễ một nhịp rất ngắn thay vì chặn
 * toàn bộ trang render động trên mỗi request.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <BuyerSavedProductsProvider>
    <BuyerEnquiryAuthProvider>
    <ProductComparisonProvider>
    <div lang="en" className="min-h-screen bg-white text-ink-900">
      <SiteTrafficBeacon />
      <BuyerGoogleOneTapGate />
      <PublicHeaderShell>
          <Link href="/" aria-label="Veximtrade home" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-12 w-12" />
            <span className="hidden flex-col leading-tight sm:flex md:hidden xl:flex">
              <span
                className="text-[16.5px] font-black tracking-tight text-brand-700"
                style={{ letterSpacing: "-0.01em" }}
              >
                Vexim Trade
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                Verified Vietnam Sourcing
              </span>
            </span>
          </Link>

          <PublicHeaderControls />
      </PublicHeaderShell>

      <main>{children}</main>

      <ProductComparisonTray />
      <Suspense fallback={null}><MarketplaceRail /></Suspense>
      <SimpleFooter />
    </div>
    </ProductComparisonProvider>
    </BuyerEnquiryAuthProvider>
    </BuyerSavedProductsProvider>
  );
}
