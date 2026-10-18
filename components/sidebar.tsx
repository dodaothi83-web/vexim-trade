"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  Globe2,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Newspaper,
  Package,
  Settings2,
  ShieldCheck,
  UserSearch,
  X,
  FolderTree,
  FileQuestion,
  ChartNoAxesColumn,
} from "lucide-react";

import { logoutAction } from "@/app/auth-actions";
import { hasPermission, roleMeta, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types";
import { cx } from "@/components/ui";
import { Logo } from "@/components/brand-logo";

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm?: Permission;
  group: "marketplace" | "sales" | "system";
}[] = [
  // Luồng vận hành có thể cần xử lý hằng ngày đứng trước cấu hình và nội dung.
  { href: "/crm/dashboard", label: "Tổng quan sàn", icon: LayoutDashboard, group: "marketplace" },
  { href: "/crm/suppliers", label: "Nhà cung cấp", icon: Package, perm: "suppliers.view", group: "marketplace" },
  { href: "/crm/products", label: "Sản phẩm NCC", icon: Boxes, perm: "products.view", group: "marketplace" },
  { href: "/crm/rfqs", label: "RFQ từ buyer", icon: FileQuestion, perm: "rfq.view", group: "marketplace" },
  { href: "/crm/verifications", label: "Xác minh NCC", icon: ShieldCheck, perm: "verifications.view", group: "marketplace" },
  { href: "/crm/categories", label: "Danh mục sản phẩm", icon: FolderTree, perm: "categories.view", group: "marketplace" },
  { href: "/crm/traffic", label: "Lưu lượng truy cập", icon: ChartNoAxesColumn, perm: "traffic.view", group: "marketplace" },
  { href: "/crm/posts", label: "Blog", icon: Newspaper, perm: "blog.manage", group: "marketplace" },
  { href: "/crm/buyers", label: "Buyer", icon: Globe2, perm: "buyers.view", group: "sales" },
  { href: "/crm/mail", label: "Hộp thư", icon: Mail, perm: "mail.view", group: "sales" },
  { href: "/crm/prospects", label: "Khách hàng mục tiêu", icon: UserSearch, perm: "prospects.manage", group: "sales" },
  { href: "/crm/team", label: "KPI cá nhân", icon: BarChart3, perm: "kpi.view", group: "sales" },
  { href: "/crm/settings", label: "Cài đặt", icon: Settings2, perm: "settings.view", group: "system" },
];
const NAV_GROUPS = [
  { key: "marketplace", label: "VẬN HÀNH SÀN" },
  { key: "sales", label: "SALE · HỖ TRỢ BUYER" },
  { key: "system", label: "HỆ THỐNG" },
] as const;

export function Sidebar({
  dataMode,
  dataDegraded = false,
  emailMode,
  session,
  permissions,
  unreadMail = 0,
  newBuyers = 0,
}: {
  dataMode: "supabase" | "local";
  dataDegraded?: boolean;
  emailMode: "resend" | "local";
  /** Số thư đến chưa đọc — badge ở menu Hộp thư */
  unreadMail?: number;
  /** Buyer mới (giai đoạn lead) chưa xử lý — badge ở menu Buyer */
  newBuyers?: number;
  session: { name: string; email: string; role: UserRole };
  permissions: Permission[];
}) {
  const pathname = usePathname();
  // Những trang phụ vẫn đánh dấu mục cha, dù không chiếm riêng một dòng menu.
  const navPath = pathname === "/crm/pipeline" ? "/crm/buyers" :
    pathname === "/crm/templates" ? "/crm/settings" : pathname;
  const activeHref = NAV.map((i) => i.href)
    .filter((href) => navPath === href || navPath.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const [open, setOpen] = useState(false);

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo tone="white" className="h-[68px] w-[68px]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-black tracking-tight text-white">
            VEXIM TRADE
          </p>
          <p className="text-[11px] text-brand-200/80">Điều hành sàn TMĐT B2B</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-1">
        {NAV_GROUPS.map((group) => {
          const items = NAV.filter((item) => item.group === group.key && (!item.perm || permissions.includes(item.perm) || hasPermission(session.role, item.perm)));
          if (!items.length) return null;
          return (
            <div key={group.key}>
              <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.15em] text-brand-200/50">{group.label}</p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = item.href === activeHref;
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
                      {item.href === "/crm/mail" && unreadMail > 0 && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                          {unreadMail}
                        </span>
                      )}
                      {item.href === "/crm/buyers" && newBuyers > 0 && (
                        <span
                          className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900"
                          title="Buyer mới chưa xử lý"
                        >
                          {newBuyers} mới
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {/* Người dùng đang đăng nhập */}
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2 py-2">
          {/* Bấm vào thẻ tên mình => mở Hồ sơ của tôi */}
          <Link
            href="/crm/settings/profile"
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
