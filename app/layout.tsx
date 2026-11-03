import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/400-italic.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "@fontsource/be-vietnam-pro/900.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { HOME_META_DESCRIPTION } from "@/lib/public/meta-copy";
import { ToastProvider } from "@/components/toast";
import { CookieConsentProvider } from "@/components/cookie-consent";
import { PublicSpeedInsights } from "@/components/public-speed-insights";
import { SITE_URL } from "@/lib/site";
import { LOCALE_COOKIE, isLocalizedAuthPath, resolveLocale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Vexim Trade – Find Verified Food & Agricultural Products and Suppliers in Vietnam",
    template: "%s · Vexim Trade",
  },
  description: HOME_META_DESCRIPTION,
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
  // Khu vực tài khoản đã đa ngôn ngữ: người dùng chọn bằng công tắc ngôn ngữ, lưu vào cookie.
  // Cookie phải thắng quy tắc theo tiền tố đường dẫn bên dưới, nếu không trình đọc màn hình
  // và công cụ dịch sẽ đọc sai ngôn ngữ của trang.
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const legacyVietnamese = /^\/(?:crm|supplier|login|auth|quy-che-hoat-dong|dieu-khoan-su-dung|chinh-sach-bao-mat|khieu-nai|thong-tin-chu-quan)(?:\/|$)/.test(pathname);
  // Chưa có cookie thì dùng ngôn ngữ mặc định (tiếng Anh) cho khu vực tài khoản; chỉ những
  // khu vực còn tiếng Việt (CRM, cổng NCC) mới theo tiền tố đường dẫn.
  const lang = isLocalizedAuthPath(pathname)
    ? resolveLocale(cookieLocale)
    : legacyVietnamese
      ? "vi"
      : "en";
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
