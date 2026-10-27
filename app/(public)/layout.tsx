import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { PublicHeaderControls } from "@/components/public-header-controls";
import { getStore } from "@/lib/db";
import { SimpleFooter } from "./simple-footer";
import { WhatsAppChatButton } from "@/components/whatsapp-chat-button";
import { SiteTrafficBeacon } from "@/components/site-traffic-beacon";
import { ProductComparisonProvider } from "@/components/product-comparison-provider";
import { ProductComparisonTray } from "@/components/product-comparison-tray";

export const dynamic = "force-dynamic";

/**
 * Public site layout.
 *  - Header: logo · nav · Language Switcher (EN/VI, default EN) · sign in · CTA "Request a quote".
 *  - Trang chủ (/) tự render hero + sections + footer đầy đủ trong home.tsx
 *    (industries, links, contact). Các trang khác dùng SimpleFooter gọn
 *    (SimpleFooter tự ẩn ở pathname "/").
 *  - Back-office /crm/* ở route group riêng, không bị bọc bởi layout này.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const store = getStore();
  await store.listCategories({ publishedOnly: true }); // warm cache

  return (
    <ProductComparisonProvider>
    <div lang="en" className="min-h-screen bg-white text-ink-900">
      <SiteTrafficBeacon />
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Veximtrade home" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-12 w-12" />
            <span className="hidden flex-col leading-tight sm:flex md:hidden xl:flex">
              <span
                className="text-[16.5px] font-black tracking-tight text-brand-800"
                style={{ letterSpacing: "-0.01em" }}
              >
                Vexim <span className="text-ink-900">Trade</span>
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
                Verified Vietnam Sourcing
              </span>
            </span>
          </Link>

          <PublicHeaderControls />
        </div>
      </header>

      <main>{children}</main>

      <ProductComparisonTray />
      <WhatsAppChatButton />
      <SimpleFooter />
    </div>
    </ProductComparisonProvider>
  );
}
