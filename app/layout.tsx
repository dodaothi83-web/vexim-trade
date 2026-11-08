import type { Metadata, Viewport } from "next";
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
import { LOCALE_COOKIE, LOCALIZED_AUTH_PATH_RE, LOCALIZED_PORTAL_PATH_RE, LEGACY_VIETNAMESE_PATH_RE, LOCALES } from "@/lib/i18n/config";

/**
 * Đặt <html lang> ĐÚNG trước lượt vẽ đầu tiên, KHÔNG đọc cookies()/headers() lúc render.
 *
 * Trước đây RootLayout gọi cookies() + headers() ngay trong thân hàm để tính lang — nhưng
 * gọi một Dynamic API ở BẤT KỲ layout cha nào (kể cả khi kết quả không được dùng tới, như ở
 * mọi trang công khai luôn ra "en") buộc TOÀN BỘ route con render động trên mỗi request —
 * kể cả CRM, cổng NCC, và (quan trọng cho việc đang làm) toàn bộ trang công khai. Đây chính
 * là rào cản thật khiến "/" và app/(public)/layout.tsx không ISR được dù đã bỏ force-dynamic
 * ở đúng hai chỗ đó.
 *
 * Thay bằng: luôn render tĩnh lang="en", rồi một script nhỏ chạy NGAY (trước khi trình duyệt
 * vẽ nội dung, giống kỹ thuật tránh "nhấp nháy" dark-mode) tự sửa lại thuộc tính lang cho
 * đúng khu vực — CRM/cổng NCC luôn tiếng Việt theo tiền tố đường dẫn, khu vực tài khoản theo
 * cookie đã chọn. <html lang> chỉ là gợi ý cho trình đọc màn hình/máy dịch, không ảnh hưởng
 * tới nội dung hay logic trang nào, nên sửa sau vài mili-giây là an toàn.
 */
function htmlLangBootScript(): string {
  return `(function(){try{
    var p=location.pathname;
    var auth=${LOCALIZED_AUTH_PATH_RE.toString()};
    var portal=${LOCALIZED_PORTAL_PATH_RE.toString()};
    var legacyVi=${LEGACY_VIETNAMESE_PATH_RE.toString()};
    var locales=${JSON.stringify(LOCALES)};
    var lang="en";
    if(auth.test(p)||portal.test(p)){
      var m=document.cookie.match(new RegExp("(?:^|; )${LOCALE_COOKIE}=([^;]*)"));
      var v=m?decodeURIComponent(m[1]):"";
      lang=locales.indexOf(v)!==-1?v:"en";
    }else if(legacyVi.test(p)){
      lang="vi";
    }
    document.documentElement.lang=lang;
  }catch(e){}})();`;
}

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

export default function RootLayout({ children }: { children: ReactNode }) {
  // suppressHydrationWarning: script ở <head> có thể đổi lại "lang" ngay sau khi React
  // render (CRM/cổng NCC/khu vực tài khoản) — đây là thay đổi CÓ CHỦ ĐÍCH, không phải
  // lệch dữ liệu máy chủ/trình duyệt, nên tắt cảnh báo hydration riêng cho thuộc tính này.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- xem ghi chú ở htmlLangBootScript() phía trên */}
        <script dangerouslySetInnerHTML={{ __html: htmlLangBootScript() }} />
      </head>
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
