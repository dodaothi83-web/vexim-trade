import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";

import { Inter } from "next/font/google";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { HOME_META_DESCRIPTION } from "@/lib/public/meta-copy";
import { ToastProvider } from "@/components/toast";
import { CookieConsentProvider } from "@/components/cookie-consent";
import { PublicSpeedInsights } from "@/components/public-speed-insights";
import { NavigationProgress } from "@/components/navigation-progress";
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
/**
 * Font giao diện: Inter (chủ dự án chốt 25/11/2026, thay Be Vietnam Pro). Bản variable phủ đủ
 * 400–700 (và 800/900 cho chỗ cũ còn dùng) nên trình duyệt không phải làm đậm giả; bộ chữ
 * vietnamese + latin-ext để dấu tiếng Việt hiển thị đúng. next/font tải font lúc build và phục vụ
 * từ chính tên miền của sàn: trình duyệt người dùng không gọi Google.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
});

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
    // Google yêu cầu favicon vuông, cạnh là bội số của 48px → khai báo .ico (16/32/48) + PNG 192.
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  },
  // Xác minh quyền sở hữu site trên Bing Webmaster Tools (ChatGPT tìm kiếm dựa trên chỉ mục Bing).
  verification: {
    other: { "msvalidate.01": "8FC6FBCB77B533FC28FF62226228523A" },
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
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* eslint-disable-next-line react/no-danger -- xem ghi chú ở htmlLangBootScript() phía trên */}
        <script dangerouslySetInnerHTML={{ __html: htmlLangBootScript() }} />
      </head>
      <body>
        <ToastProvider>
          <CookieConsentProvider>
            {/* useSearchParams cần Suspense để trang tĩnh/ISR không bị đổi sang render động. */}
            <Suspense fallback={null}><NavigationProgress /></Suspense>
            {children}
            <PublicSpeedInsights />
          </CookieConsentProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
