import type { NextConfig } from "next";
// `withSentryConfig` sống ở submodule riêng (@sentry/nextjs/config) kể từ phiên bản SDK
// dùng Next.js 15+ build config tách biệt khỏi runtime SDK chính.
import { withSentryConfig } from "@sentry/nextjs/config";

const isProduction = process.env.NODE_ENV === "production";
/**
 * PUBLIC_SITE_INDEXABLE=true => cho Google index trang công khai khi có đủ hồ sơ.
 * Mặc định false (noindex) đến khi có ≥ 10 hồ sơ đã xác thực được công bố.
 */
const PUBLIC_SITE_INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

const nextConfig: NextConfig = {
  // Cho phép dev server nhận request từ host preview của sandbox
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  images: {
    // Bắt buộc từ Next 16: chỉ cho phép chất lượng mặc định, tránh bị lợi dụng tạo vô số biến thể.
    qualities: [75],
    // Bản thu nhỏ của ảnh sản phẩm (/public-media, CDN giữ 1 giờ) không được sống lâu hơn ảnh gốc:
    // ảnh bị gỡ phải hết hiện trong khoảng 1 giờ. Ảnh tĩnh immutable vẫn theo Cache-Control gốc (7 ngày).
    minimumCacheTTL: 3600,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  /**
   * 301 redirect từ URL cũ sang URL mới của GĐ danh bạ.
   *
   * LƯU Ý: `/cashew` KHÔNG còn nằm trong danh sách này. Đó là trang đích quảng
   * cáo riêng (app/cashew/page.tsx, có canonical "https://www.veximtrade.com/cashew")
   * và form RFQ gắn nguồn lead "Website veximtrade.com/cashew" (xem app/actions.ts).
   * Trước đây `/cashew` bị 301 sang `/products/cashew` — slug danh mục đã đổi
   * thành `cashew-kernels` và `cashew` cũng không nằm trong previous_slugs của
   * danh mục, nên đích đến là một trang 404. Kết quả: mọi quảng cáo trỏ vào
   * /cashew (kèm utm_*, gclid) đều mất tham số qua redirect và rơi vào 404, và
   * canonical của trang đích lại trỏ về chính URL đang bị chặn.
   *
   * Chỉ giữ redirect cho các ĐƯỜNG DẪN CON, vốn là URL cũ của danh mục.
   */
  redirects: async () => [
    {
      // `:path+` (một đoạn trở lên) chứ không phải `:path*`: dạng `*` khớp cả
      // đường dẫn rỗng, tức chính /cashew — đúng thứ cần giữ lại.
      source: "/cashew/:path+",
      destination: "/products/cashew-kernels",
      permanent: true,
    },
  ],
  // Biến môi trường công khai cho middleware
  env: {
    PUBLIC_SITE_INDEXABLE: PUBLIC_SITE_INDEXABLE ? "true" : isProduction ? "false" : "false",
  },
};

// withSentryConfig chỉ thêm bước build (upload source map, gắn release) và một vài rewrite
// nhỏ cho tunnel route — KHÔNG đổi hành vi runtime nếu chưa cấu hình org/project/token.
// Thiếu SENTRY_AUTH_TOKEN (CI, sandbox, máy dev chưa gắn Sentry) → bước upload source map tự
// bỏ qua, build vẫn thành công bình thường. Xem docs/sentry-setup.md.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Build log của Next.js vốn đã nhiều; không cần Sentry plugin log thêm khi không có lỗi.
  silent: true,

  // Chỉ cần khi upload source map (cần org+project+authToken) — tự bỏ qua nếu thiếu.
  widenClientFileUpload: true,

  sourcemaps: {
    // Xoá file .map khỏi output sau khi đã upload lên Sentry, tránh lộ mã nguồn chưa
    // minify cho người ngoài tải trực tiếp từ trình duyệt. Không ảnh hưởng gì khi bước
    // upload bị bỏ qua (thiếu auth token) — khi đó plugin cũng không tự bật source map.
    deleteSourcemapsAfterUpload: true,
  },

  // Giảm dung lượng bundle: loại bỏ code tracing/performance của SDK vì ta chưa dùng tới
  // Sentry Performance Monitoring (chỉ dùng để bắt lỗi).
  bundleSizeOptimizations: {
    excludeTracing: false, // giữ lại vì instrumentation.ts có bật tracesSampleRate
    excludeDebugStatements: true,
  },
});
