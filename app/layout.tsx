import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { dataStatus, supabaseProbe } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { Sidebar } from "@/components/sidebar";
import { DataConnectionBanner } from "@/components/data-connection-banner";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Ở dev/sandbox: thử Supabase một lần thật nhẹ (HEAD) để biết ngay có kết nối
  // được hay không, tránh việc dữ liệu âm thầm rơi vào kho tạm. Cùng promise với
  // băng cảnh báo bên dưới nên không phát sinh thêm truy vấn.
  try {
    await supabaseProbe();
  } catch {
    /* bỏ qua – chỉ là bước kiểm tra cho có */
  }

  let dbMode: "supabase" | "local" = "local";
  let dbDegraded = false;
  try {
    const status = dataStatus();
    dbMode = status.mode;
    dbDegraded = status.degraded;
  } catch {
    dbMode = "local";
  }
  const mailMode = emailMode();

  return (
    <html lang="vi">
      <body>
        <ToastProvider>
          <Sidebar
            dataMode={dbMode}
            dataDegraded={dbDegraded}
            emailMode={mailMode}
          />
          <div className="lg:pl-60">
            <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-8">
              <DataConnectionBanner />
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
