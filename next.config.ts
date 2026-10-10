import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép dev server nhận request từ host preview của sandbox
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  experimental: {
    serverActions: {
      // Attachments are sent as base64 through the server action. The 10 MB
      // UI limit expands by roughly 33% during encoding.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
