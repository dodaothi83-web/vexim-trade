import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider } from "@/components/toast";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vexim Trade – Verified Vietnamese food & agriculture sourcing",
    template: "%s · Vexim Trade",
  },
  description:
    "Verified Vietnamese food and agriculture sourcing desk. Submit a brief and get 2–4 audited supplier quotes in 24 business hours.",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
