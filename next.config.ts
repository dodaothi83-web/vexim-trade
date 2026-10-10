import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép dev server nhận request từ host preview của sandbox
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
