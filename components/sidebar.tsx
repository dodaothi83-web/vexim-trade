"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Database,
  FileText,
  Globe2,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  Menu,
  Package,
  Pencil,
  Settings2,
  X,
} from "lucide-react";

import { cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/buyers", label: "Buyer", icon: Globe2 },
  { href: "/suppliers", label: "Nhà cung cấp", icon: Package },
  { href: "/products", label: "Sản phẩm NCC", icon: Boxes },
  { href: "/mail", label: "Hộp thư", icon: Mail },
  { href: "/mail/compose", label: "Soạn email", icon: Pencil },
  { href: "/templates", label: "Nội dung email", icon: FileText },
  { href: "/settings", label: "Cài đặt", icon: Settings2 },
];

export function Sidebar({
  dataMode,
  emailMode,
}: {
  dataMode: "supabase" | "local";
  emailMode: "resend" | "local";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-black text-white shadow-sm">
          VX
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-black tracking-tight text-white">
            VEXIM TRADE
          </p>
          <p className="text-[11px] text-brand-200/80">Sale Xuất khẩu CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
                active
                  ? "bg-white/12 text-white shadow-sm"
                  : "text-brand-100/70 hover:bg-white/7 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="block rounded-lg px-2 py-2 transition hover:bg-white/7"
        >
          <p className="mb-1.5 text-[10px] font-bold tracking-wider text-brand-200/60 uppercase">
            Kết nối
          </p>
          <StatusLine
            ok={dataMode === "supabase"}
            icon={<Database className="h-3 w-3" />}
            label={dataMode === "supabase" ? "Supabase" : "Dữ liệu demo (local)"}
          />
          <StatusLine
            ok={emailMode === "resend"}
            icon={<Mail className="h-3 w-3" />}
            label={emailMode === "resend" ? "Resend (veximtrade.com)" : "Email demo (chưa gửi thật)"}
          />
        </Link>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-40 rounded-lg bg-ink-900 p-2 text-white shadow-lg lg:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-gradient-to-b from-ink-900 via-ink-900 to-brand-900 lg:flex">
        {body}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade absolute inset-0 bg-ink-900/50"
            onClick={() => setOpen(false)}
          />
          <aside className="animate-pop absolute inset-y-0 left-0 flex w-64 flex-col bg-gradient-to-b from-ink-900 via-ink-900 to-brand-900">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1 text-brand-200"
              aria-label="Đóng menu"
            >
              <X className="h-5 w-5" />
            </button>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}

function StatusLine({
  ok,
  icon,
  label,
}: {
  ok: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className={cx("shrink-0", ok ? "text-emerald-400" : "text-amber-400")}>{icon}</span>
      <span className="truncate text-[11px] text-brand-100/70">{label}</span>
    </div>
  );
}
