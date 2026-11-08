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
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // 301 redirect từ URL cũ sang URL mới của GĐ danh bạ
  redirects: async () => [
    {
      source: "/cashew",
      destination: "/products/cashew",
      permanent: true,
    },
    {
      source: "/cashew/:path*",
      destination: "/products/cashew",
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
