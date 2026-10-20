import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { CookieConsentProvider } from "@/components/cookie-consent";
import { PublicSpeedInsights } from "@/components/public-speed-insights";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vexim Trade – Verified Vietnamese food & agriculture sourcing",
    template: "%s · Vexim Trade",
  },
  description:
    "Verified Vietnamese food and agriculture sourcing desk. Browse suppliers or submit a brief to compare quotes from checked Vietnamese suppliers.",
  icons: {
    icon: { url: "/favicon.png", type: "image/png", sizes: "500x500" },
    apple: { url: "/favicon.png", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Site công khai cho buyer là tiếng Anh; CRM, cổng NCC và đăng nhập là tiếng Việt.
  // Middleware gắn x-pathname vì layout gốc không tự biết route hiện tại.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const lang = /^\/(?:crm|supplier|login|auth|quy-che-hoat-dong|dieu-khoan-su-dung|chinh-sach-bao-mat|khieu-nai|thong-tin-chu-quan)(?:\/|$)/.test(pathname) ? "vi" : "en";
  return (
    <html lang={lang}>
      <body>
        <ToastProvider>
          <CookieConsentProvider>
            {children}
            <PublicSpeedInsights />
          </CookieConsentProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
