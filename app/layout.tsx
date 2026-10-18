import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { PublicSpeedInsights } from "@/components/public-speed-insights";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vexim Trade – Verified Vietnamese food & agriculture sourcing",
    template: "%s · Vexim Trade",
  },
  description:
    "Verified Vietnamese food and agriculture sourcing desk. Submit a brief and get 2–4 audited supplier quotes in 24 business hours.",
  icons: {
    icon: { url: "/favicon.png", type: "image/png", sizes: "500x500" },
    apple: { url: "/favicon.png", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <PublicSpeedInsights />
      </body>
    </html>
  );
}
