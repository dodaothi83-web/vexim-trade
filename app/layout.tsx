import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: {
    default: "Vexim Trade – CRM Sale Xuất khẩu",
    template: "%s · Vexim Trade CRM",
  },
  description:
    "Quản lý pipeline buyer, nhà cung cấp và tự động gửi email cập nhật tiến độ đơn hàng xuất khẩu.",
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
