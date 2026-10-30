import type { NextConfig } from "next";

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

export default nextConfig;
