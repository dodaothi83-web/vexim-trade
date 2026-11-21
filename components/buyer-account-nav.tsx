import Link from "next/link";
import { ClipboardList, Headphones, Heart, LayoutDashboard, MessageCircle, Search, UserRound } from "lucide-react";

/**
 * Cột menu "Buyer account" dùng chung cho mọi mục của tài khoản người mua (Tổng quan, Tin nhắn, RFQ
 * trực tiếp, Tìm nguồn, Đã lưu, Tài khoản). Điện thoại: một hàng cuộn ngang; máy tính: cột dọc dính.
 */
export type BuyerAccountTab = "overview" | "messages" | "requests" | "vexim" | "saved" | "profile";

const NAV = [
  { id: "overview", icon: LayoutDashboard }, { id: "messages", icon: MessageCircle }, { id: "requests", icon: ClipboardList },
  { id: "vexim", icon: Headphones }, { id: "saved", icon: Heart }, { id: "profile", icon: UserRound },
] as const;

export function buyerAccountHref(id: BuyerAccountTab): string {
  return id === "overview" ? "/buyer/account" : id === "messages" ? "/buyer/account/messages" : `/buyer/account?tab=${id}`;
}

export function BuyerAccountNav({ active, vi, unread = {} }: { active: BuyerAccountTab; vi: boolean; unread?: Partial<Record<BuyerAccountTab, number>> }) {
  const labels: Record<BuyerAccountTab, string> = {
    overview: vi ? "Tổng quan" : "Overview", messages: vi ? "Tin nhắn" : "Messages", requests: vi ? "RFQ trực tiếp" : "Direct RFQs",
    vexim: vi ? "Tìm nguồn" : "Sourcing", saved: vi ? "Đã lưu" : "Saved", profile: vi ? "Tài khoản" : "Account",
  };
  return <aside className="min-w-0 lg:sticky lg:top-24">
    <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-ink-500 lg:mb-4">{vi ? "Tài khoản người mua" : "Buyer account"}</p>
    <nav aria-label={vi ? "Điều hướng tài khoản" : "Account navigation"} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {NAV.map(({ id, icon: Icon }) => {
        const count = unread[id] ?? 0;
        return <Link key={id} href={buyerAccountHref(id)} aria-current={active === id ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold lg:gap-3 ${active === id ? "bg-white text-brand-700 shadow-sm" : "text-ink-600 hover:bg-white"}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />{labels[id]}
          {count > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 lg:ml-auto"
            aria-label={vi ? `${count} yêu cầu có cập nhật mới` : `${count} enquiries with new updates`}>{count}</span>}
        </Link>;
      })}
    </nav>
    <Link href="/#categories" className="mt-5 hidden items-center gap-2 px-3 text-sm font-semibold text-brand-700 lg:flex"><Search className="h-4 w-4" />{vi ? "Khám phá sản phẩm" : "Explore products"}</Link>
  </aside>;
}
