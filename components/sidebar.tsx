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
  UploadCloud,
  UserSearch,
  X,
  FolderTree,
  FileQuestion,
  ChartNoAxesColumn,
  Megaphone,
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
  { href: "/crm/products", label: "Sản phẩm nhà cung cấp", icon: Boxes, perm: "products.view", group: "marketplace" },
  { href: "/crm/rfqs", label: "RFQ từ khách mua", icon: FileQuestion, perm: "rfq.view", group: "marketplace" },
  { href: "/crm/verifications", label: "Xác minh nhà cung cấp", icon: ShieldCheck, perm: "verifications.view", group: "marketplace" },
  { href: "/crm/verifications/submissions", label: "Hồ sơ nhà cung cấp tự gửi", icon: UploadCloud, perm: "verifications.view", group: "marketplace" },
  { href: "/crm/categories", label: "Danh mục sản phẩm", icon: FolderTree, perm: "categories.view", group: "marketplace" },
  { href: "/crm/sponsored", label: "Đẩy sản phẩm", icon: Megaphone, perm: "sponsored.view", group: "marketplace" },
  { href: "/crm/traffic", label: "Lưu lượng truy cập", icon: ChartNoAxesColumn, perm: "traffic.view", group: "marketplace" },
  { href: "/crm/posts", label: "Blog", icon: Newspaper, perm: "blog.manage", group: "marketplace" },
  { href: "/crm/buyers", label: "Khách mua", icon: Globe2, perm: "buyers.view", group: "sales" },
  { href: "/crm/mail", label: "Hộp thư", icon: Mail, perm: "mail.view", group: "sales" },
  { href: "/crm/prospects", label: "Khách hàng mục tiêu", icon: UserSearch, perm: "prospects.manage", group: "sales" },
  { href: "/crm/team", label: "KPI cá nhân", icon: BarChart3, perm: "kpi.view", group: "sales" },
  { href: "/crm/settings", label: "Cài đặt", icon: Settings2, perm: "settings.view", group: "system" },
];
const NAV_GROUPS = [
  { key: "marketplace", label: "VẬN HÀNH SÀN" },
  { key: "sales", label: "SALE · HỖ TRỢ KHÁCH MUA" },
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
  pendingSuppliers = 0,
  pendingProducts = 0,
  pendingReviews = 0,
  pendingSubmissions = 0,
  pendingSponsoredRequests = 0,
}: {
  dataMode: "supabase" | "local";
  dataDegraded?: boolean;
  emailMode: "resend" | "local";
  /** Số thư đến chưa đọc — badge ở menu Hộp thư */
  unreadMail?: number;
  /** Buyer mới (giai đoạn lead) chưa xử lý — badge ở menu Buyer */
  newBuyers?: number;
  /** Tài khoản nhà cung cấp chờ Vexim xác nhận quyền cổng — badge ở menu Nhà cung cấp */
  pendingSuppliers?: number;
  /** Sản phẩm nhà cung cấp đã gửi, chờ kiểm nội dung — badge ở menu Sản phẩm */
  pendingProducts?: number;
  /** Đợt kiểm đã nộp, chờ người duyệt — badge ở menu Xác minh */
  pendingReviews?: number;
  /** Hồ sơ nhà cung cấp tự gửi đang chờ đối chiếu — badge ở menu Hồ sơ nhà cung cấp tự gửi */
  pendingSubmissions?: number;
  /** Yêu cầu đẩy sản phẩm mới chờ liên hệ; null nếu chưa đếm được. */
  pendingSponsoredRequests?: number | null;
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
                  // Badge = số việc đang chờ đúng khu vực đó, giống số thư chưa đọc.
                  const badge = item.href === "/crm/mail" ? (unreadMail > 0 ? { text: String(unreadMail), title: "Thư đến chưa đọc" } : null)
                    : item.href === "/crm/buyers" ? (newBuyers > 0 ? { text: `${newBuyers} mới`, title: "Khách mua mới chưa xử lý" } : null)
                    : item.href === "/crm/suppliers" ? (pendingSuppliers > 0 ? { text: `${pendingSuppliers} mới`, title: "Tài khoản nhà cung cấp chưa nộp hồ sơ hoặc chờ xác nhận" } : null)
                    : item.href === "/crm/products" ? (pendingProducts > 0 ? { text: `${pendingProducts} chờ`, title: "Sản phẩm chờ duyệt" } : null)
                    : item.href === "/crm/verifications" ? (pendingReviews > 0 ? { text: `${pendingReviews} chờ`, title: "Đợt kiểm chờ duyệt" } : null)
                    : item.href === "/crm/verifications/submissions" ? (pendingSubmissions > 0 ? { text: `${pendingSubmissions} chờ`, title: "Hồ sơ nhà cung cấp tự gửi chờ đối chiếu" } : null)
                    : item.href === "/crm/sponsored" ? (pendingSponsoredRequests === null ? { text: "!", title: "Chưa tải được yêu cầu đẩy sản phẩm" } : pendingSponsoredRequests > 0 ? { text: `${pendingSponsoredRequests} mới`, title: "Yêu cầu đẩy sản phẩm mới" } : null)
                    : null;
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
                      {badge && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900" title={badge.title} aria-label={badge.title}>
                          {badge.text}
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
        {/* Trạng thái hệ thống: nói thẳng khi email hoặc CSDL chưa sẵn sàng, để không ai
            tưởng thông báo đã gửi trong khi máy chủ chỉ ghi log. */}
        {(emailMode === "local" || dataMode === "local" || dataDegraded) && (
          <div className="mb-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2.5 py-2 text-[11px] leading-4 text-amber-100">
            {dataDegraded && <p>CSDL đang gián đoạn, dữ liệu có thể chưa cập nhật.</p>}
            {!dataDegraded && dataMode === "local" && <p>Đang chạy dữ liệu cục bộ, không phải dữ liệu thật.</p>}
            {emailMode === "local" && <p>Chưa có RESEND_API_KEY: email thông báo chỉ ghi log, không gửi thật.</p>}
          </div>
        )}
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
