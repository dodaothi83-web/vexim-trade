"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  FileText,
  Globe2,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Pencil,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

import { logoutAction } from "@/app/auth-actions";
import { roleMeta, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types";
import { cx } from "@/components/ui";

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm?: Permission;
}[] = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, perm: "buyers.view" },
  { href: "/buyers", label: "Buyer", icon: Globe2, perm: "buyers.view" },
  { href: "/suppliers", label: "Nhà cung cấp", icon: Package, perm: "suppliers.view" },
  { href: "/products", label: "Sản phẩm NCC", icon: Boxes, perm: "products.view" },
  { href: "/mail", label: "Hộp thư", icon: Mail, perm: "mail.view" },
  { href: "/mail/compose", label: "Soạn email", icon: Pencil, perm: "mail.send" },
  { href: "/templates", label: "Templates", icon: FileText, perm: "mail.view" },
  { href: "/settings", label: "Cài đặt", icon: Settings2, perm: "settings.view" },
  { href: "/settings/users", label: "Người dùng", icon: UsersRound, perm: "users.manage" },
];

export function Sidebar({
  dataMode,
  dataDegraded = false,
  emailMode,
  session,
  permissions,
  unreadMail = 0,
}: {
  dataMode: "supabase" | "local";
  dataDegraded?: boolean;
  emailMode: "resend" | "local";
  /** Số thư đến chưa đọc — badge ở menu Hộp thư */
  unreadMail?: number;
  session: { name: string; email: string; role: UserRole };
  permissions: Permission[];
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

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-1">
        {NAV.filter((item) => !item.perm || permissions.includes(item.perm)).map((item) => {
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
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition focus-visible:-outline-offset-2",
                active
                  ? "bg-white/12 text-white shadow-sm"
                  : "text-brand-100/70 hover:bg-white/7 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.href === "/mail" && unreadMail > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                  {unreadMail}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {/* Người dùng đang đăng nhập */}
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2 py-2">
          {/* Bấm vào thẻ tên mình => mở Hồ sơ của tôi */}
          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            title="Hồ sơ của tôi"
            className="-my-1 flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 pl-0 transition hover:bg-white/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">
              {initials(session.name || session.email)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-white">
                {session.name || session.email}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-brand-200/80">
                <ShieldCheck className="h-3 w-3" />
                {roleMeta(session.role).label}
              </span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Đăng xuất"
              className="rounded-md p-1.5 text-brand-200/70 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

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

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
