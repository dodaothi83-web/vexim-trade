import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-900 via-ink-900 to-brand-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[15px] font-black text-white shadow-lg">
            VX
          </div>
          <div>
            <p className="text-[17px] leading-tight font-black tracking-tight text-white">
              VEXIM TRADE
            </p>
            <p className="text-[12px] text-brand-200/80">CRM phòng Sale Xuất khẩu</p>
          </div>
        </div>
        <div className="card p-6 shadow-pop">{children}</div>
      </div>
    </main>
  );
}
