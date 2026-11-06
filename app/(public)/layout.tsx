import { BuyerEnquiryAuthProvider } from "@/components/buyer-enquiry-auth";
import { buyerAuthMessages } from "@/lib/i18n/buyer-auth";
import { BuyerGoogleOneTap } from "@/components/buyer-google-one-tap";
import { googleOneTapClientId, hasOneTapSession } from "@/lib/auth/google-one-tap";
import { BuyerSavedProductsProvider } from "@/components/buyer-saved-products";
import { getLocale } from "@/lib/i18n/server";
import { getBuyerSession, getBuyerUser } from "@/lib/auth/buyer-session";
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { PublicHeaderControls } from "@/components/public-header-controls";
import { getStore } from "@/lib/db";
import { SimpleFooter } from "./simple-footer";
import { MarketplaceRail } from "@/components/marketplace-rail";
import { SiteTrafficBeacon } from "@/components/site-traffic-beacon";
import { ProductComparisonProvider } from "@/components/product-comparison-provider";
import { ProductComparisonTray } from "@/components/product-comparison-tray";

export const dynamic = "force-dynamic";

/**
 * Public site layout.
 *  - Header: logo · nav · Language Switcher (EN/VI, default EN) · sign in · CTA "Sourcing request".
 *  - Trang chủ (/) tự render hero + sections + footer đầy đủ trong home.tsx
 *    (industries, links, contact). Các trang khác dùng SimpleFooter gọn
 *    (SimpleFooter tự ẩn ở pathname "/").
 *  - Back-office /crm/* ở route group riêng, không bị bọc bởi layout này.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const buyerSession = await getBuyerSession();
  const oneTapClientId = googleOneTapClientId();
  const showOneTap = oneTapClientId && !buyerSession && !(await hasOneTapSession());
  const locale = await getLocale();
  // A profile lookup failure must not prevent public pages from loading.
  const buyerAccount = buyerSession ? await getBuyerUser().catch(() => null) : null;
  const store = getStore();
  await store.listCategories({ publishedOnly: true }); // warm cache

  return (
    <BuyerSavedProductsProvider sessionKey={buyerSession?.email ?? "guest"} isVi={locale === "vi"}>
    <BuyerEnquiryAuthProvider buyerEmail={buyerSession?.email ?? null} locale={locale} messages={buyerAuthMessages[locale]}>
    <ProductComparisonProvider>
    <div lang="en" className="min-h-screen bg-white text-ink-900">
      <SiteTrafficBeacon />
      {showOneTap && <BuyerGoogleOneTap clientId={oneTapClientId} isVi={locale === "vi"} />}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6 lg:px-8">
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

          <PublicHeaderControls buyerEmail={buyerSession?.email ?? null} buyerCompanyName={buyerAccount?.company_name ?? null} />
        </div>
      </header>

      <main>{children}</main>

      <ProductComparisonTray />
      <MarketplaceRail isVi={locale === "vi"} />
      <SimpleFooter />
    </div>
    </ProductComparisonProvider>
    </BuyerEnquiryAuthProvider>
    </BuyerSavedProductsProvider>
  );
}
