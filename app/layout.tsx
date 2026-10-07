import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { dataMode } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { Sidebar } from "@/components/sidebar";
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
  let dbMode: "supabase" | "local" = "local";
  try {
    dbMode = dataMode();
  } catch {
    dbMode = "local";
  }
  const mailMode = emailMode();

  return (
    <html lang="vi">
      <body>
        <ToastProvider>
          <Sidebar dataMode={dbMode} emailMode={mailMode} />
          <div className="lg:pl-60">
            <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-8">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
