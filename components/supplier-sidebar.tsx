"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  ChartNoAxesColumn,
  ClipboardCheck,
  FileText,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  ShieldCheck,
  X,
} from "lucide-react";

import { logoutAction } from "@/app/auth-actions";
import { cx } from "@/components/ui";
import { Logo } from "@/components/brand-logo";

/**
 * Menu trái của cổng nhà cung cấp. Dùng đúng khung, màu và nhịp của menu CRM
 * (`components/sidebar.tsx`) để hai bên đọc như một hệ thống, khác nhau ở mục menu.
 *
 * Tài khoản chưa nộp hồ sơ hoặc chưa được mở quyền chỉ thấy mục Hồ sơ doanh nghiệp:
 * hiện các mục còn lại rồi bấm vào bị đá về trang chờ là trải nghiệm tệ.
 */
const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: "shop" | "verify" | "support";
  /** Chỉ hiện khi cổng đã được Vexim mở quyền. */
  needsApproval?: boolean;
}[] = [
  { href: "/supplier/portal", label: "Tổng quan", icon: LayoutDashboard, group: "shop" },
  { href: "/supplier/portal/products", label: "Sản phẩm", icon: Package, group: "shop", needsApproval: true },
  { href: "/supplier/portal/categories", label: "Danh mục kinh doanh", icon: FolderTree, group: "shop", needsApproval: true },
  { href: "/supplier/portal/traffic", label: "Lượt xem gian hàng", icon: ChartNoAxesColumn, group: "shop", needsApproval: true },
  { href: "/supplier/portal/verification", label: "Xác thực nhà máy L2 · L3", icon: ShieldCheck, group: "verify", needsApproval: true },
  { href: "/supplier/portal#documents", label: "Giấy tờ & chứng nhận L1", icon: FileText, group: "verify" },
  { href: "/supplier/portal#rfqs", label: "RFQ Vexim chuyển", icon: Mail, group: "support", needsApproval: true },
  { href: "/supplier/portal#notices", label: "Thông báo", icon: Bell, group: "support", needsApproval: true },
  { href: "/supplier/portal#tasks", label: "Việc cần làm", icon: ClipboardCheck, group: "support", needsApproval: true },
];

const NAV_GROUPS = [
  { key: "shop", label: "GIAN HÀNG" },
  { key: "verify", label: "XÁC MINH" },
  { key: "support", label: "VIỆC HẰNG NGÀY" },
] as const;

export function SupplierSidebar({
  supplierName,
  email,
  userName,
  approved,
  publicUrl,
}: {
  supplierName: string;
  email: string;
  userName?: string | null;
  approved: boolean;
  publicUrl?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Mục dạng neo (#documents) chỉ đánh dấu khi đang ở đúng trang tổng quan có neo đó.
  const onPortal = pathname === "/supplier/portal";
  const activeHref = NAV.map((item) => item.href.split("#")[0])
    .filter((href) => href !== "/supplier/portal" && (pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0] ?? (onPortal ? "/supplier/portal" : undefined);

  const body = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo tone="white" className="h-[68px] w-[68px]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-tight font-black tracking-tight text-white">VEXIM TRADE</p>
          <p className="text-[11px] text-brand-200/80">Cổng nhà cung cấp</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-1">
        {NAV_GROUPS.map((group) => {
          const items = NAV.filter((item) => item.group === group.key && (!item.needsApproval || approved));
          if (!items.length) return null;
          return (
            <div key={group.key}>
              <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.15em] text-brand-200/50">{group.label}</p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activeHref === item.href.split("#")[0] && !item.href.includes("#");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium",
                        active ? "bg-white/12 text-white shadow-sm" : "text-brand-100/70 hover:bg-white/7 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {publicUrl && (
          <Link
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-[11.5px] font-semibold text-brand-100 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Xem trang công khai
          </Link>
        )}
        <div className="mb-2 rounded-lg bg-white/5 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-brand-200/80">
            <ShieldCheck className="h-3 w-3" />
            {approved ? "CỔNG ĐÃ ĐƯỢC MỞ" : "ĐANG CHỜ VEXIM XÁC NHẬN"}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] font-semibold text-white" title={supplierName}>
            {supplierName}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">
            {initials(userName || email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-white">{userName || email}</span>
            <span className="mt-0.5 block truncate text-[10.5px] text-brand-200/80">{email}</span>
          </span>
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
          <div className="animate-fade absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
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
