"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useSearchParams } from "next/navigation";
import { usePublicPathname } from "@/hooks/use-public-pathname";
import { MessageCircle, X } from "lucide-react";
import { VeximMessagesIcon, VeximPlatformSupportIcon, VeximSourcingRequestIcon } from "@/components/brand/vexim-icons";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { SourcingComposerTrigger } from "@/components/sourcing-composer";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { SupportChat } from "@/components/chat/support-chat";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";
import { CHAT_DOCK_CLASS, useChatDock } from "@/components/chat/dock";
import { cx } from "@/components/ui";

const UNREAD_POLL_MS = 30_000;

const COPY = {
  en: { rail: "Quick actions", open: "Open quick actions", close: "Close quick actions", messages: "Messages", sourcing: "Sourcing request", support: "Chat with Vexim", unread: "unread" },
  vi: { rail: "Lối tắt", open: "Mở lối tắt", close: "Đóng lối tắt", messages: "Tin nhắn", sourcing: "Yêu cầu tìm nguồn", support: "Chat với Vexim", unread: "chưa đọc" },
};

/**
 * Thanh công cụ dọc ở cạnh phải các trang công khai, mặc định chỉ hiện icon; di chuột
 * (hoặc dùng bàn phím) vào là mở rộng hiện chữ. Ba việc: đọc và trả lời tin nhắn với nhà
 * cung cấp ngay trên trang, gửi yêu cầu tìm nguồn cho Vexim, và chat với đội Vexim ngay trong
 * hệ thống (nhân viên kinh doanh trả lời trong CRM, mục Chat với người mua).
 *
 * Màn hình hẹp hơn 1440px (điện thoại, laptop nhỏ): thanh dọc ở mép phải đè lên nội dung (khung
 * trang rộng 1280px), nên thu thành MỘT nút tròn ở góc dưới bên phải; bấm mới mở danh sách (có
 * chữ, vì màn hình cảm ứng không di chuột được). Từ 1440px trở lên giữ thanh dọc như cũ.
 */
export function MarketplaceRail() {
  const pathname = usePublicPathname();
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);
  const params = useSearchParams();
  // "?lang=vi" là nguồn ngôn ngữ duy nhất của trang công khai (xem public-header-controls.tsx);
  // trước đây nhận isVi qua prop từ layout (dựa trên cookie getLocale()), giờ đọc lại tại đây
  // để layout không còn phải đọc cookie lúc render (điều kiện để cache/ISR trang công khai).
  const isVi = params?.get("lang") === "vi";
  const t = COPY[isVi ? "vi" : "en"];

  const refreshUnread = useCallback(async () => {
    if (!email) { setUnread(0); setSupportUnread(0); return; }
    const read = async (url: string) => {
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json().catch(() => null) as { unread?: number } | null;
      return typeof data?.unread === "number" ? data.unread : 0;
    };
    const [chat, support] = await Promise.all([read("/api/chat?side=buyer&peek=1"), read("/api/support?peek=1")]);
    if (chat !== null) setUnread(chat);
    if (support !== null) setSupportUnread(support);
  }, [email]);

  // Đếm tin chưa đọc khi tab đang mở; tab ẩn thì không hỏi máy chủ.
  useEffect(() => {
    void refreshUnread();
    const tick = () => { if (document.visibilityState === "visible") void refreshUnread(); };
    const timer = window.setInterval(tick, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refreshUnread]);

  // Khung chat đang mở vừa tải danh sách (hoặc đọc một cuộc): cập nhật huy hiệu ngay, khỏi chờ lượt hỏi sau.
  useEffect(() => {
    const onUnread = (event: Event) => {
      const detail = (event as CustomEvent<{ side?: string; unread?: number }>).detail;
      if (detail?.side === "buyer" && typeof detail.unread === "number") setUnread(detail.unread);
    };
    window.addEventListener("vexim:chat-unread", onUnread);
    return () => window.removeEventListener("vexim:chat-unread", onUnread);
  }, []);

  // Khung tin nhắn bám cạnh phải, không chặn trang (như Alibaba).
  useEffect(() => {
    const node = dialog.current;
    if (chatOpen && node && !node.open) node.show();
  }, [chatOpen]);
  const closeChat = useCallback(() => { dialog.current?.close(); setChatOpen(false); void refreshUnread(); }, [refreshUnread]);
  useChatDock("messages", chatOpen, closeChat);

  // Link "Reply on Vexim" trong email báo tin của đội Vexim mở thẳng khung chat.
  useEffect(() => {
    if (params.get("support") === "1") requireBuyer(window.location.pathname + window.location.search, () => setSupportOpen(true));
  }, [params, email]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeSupport = useCallback(() => { setSupportOpen(false); void refreshUnread(); }, [refreshUnread]);

  // Danh sách thu gọn (màn hình hẹp): bấm ra ngoài hoặc Esc thì đóng.
  useEffect(() => {
    if (!railOpen) return;
    const onPointer = (event: MouseEvent) => { if (!railRef.current?.contains(event.target as Node)) setRailOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setRailOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [railOpen]);

  // Trang Tin nhắn đã có khung chat đầy đủ; thanh nổi sẽ đè lên ô nhập.
  if (pathname?.startsWith("/buyer/account/messages")) return null;

  function openMessages() {
    setRailOpen(false);
    requireBuyer(window.location.pathname + window.location.search, () => setChatOpen(true));
  }

  function openSupport() {
    setRailOpen(false);
    requireBuyer(window.location.pathname + window.location.search, () => { setSupportOpen(true); setSupportUnread(0); });
  }

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;
  const supportBadge = supportUnread > 0 ? String(supportUnread) : null;
  const totalUnread = unread + supportUnread;

  return <>
    <nav ref={railRef} aria-label={t.rail} lang={isVi ? "vi" : "en"} data-open={railOpen ? "true" : "false"}
      className="group/rail fixed right-4 z-40 flex flex-col items-end gap-2 bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] min-[1440px]:right-0 min-[1440px]:bottom-auto min-[1440px]:top-1/2 min-[1440px]:-translate-y-1/2">
      <ul id="marketplace-rail-list" className={cx(railOpen ? "flex" : "hidden",
        "order-1 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white/95 shadow-lg shadow-brand-900/10 backdrop-blur supports-[backdrop-filter]:bg-white/85",
        "min-[1440px]:order-none min-[1440px]:flex min-[1440px]:rounded-none min-[1440px]:rounded-l-2xl min-[1440px]:border-r-0")}>
        <RailItem label={t.messages} onClick={openMessages} badge={badge} badgeLabel={badge ? `${badge} ${t.unread}` : null}
          icon={<VeximMessagesIcon size={26} strokeWidth={2.2} />} />
        <li className="border-t border-ink-100">
          <SourcingComposerTrigger isVi={isVi} renderTrigger={({ onClick, ref }) =>
            <RailButton ref={ref} label={t.sourcing} onClick={onClick} icon={<VeximSourcingRequestIcon size={26} strokeWidth={2.2} />} haspopup />} />
        </li>
        <li className="border-t border-ink-100">
          <button type="button" onClick={openSupport} aria-expanded={supportOpen} aria-label={supportBadge ? `${t.support}, ${supportBadge} ${t.unread}` : t.support} title={t.support} className={cx(railItemClass, "w-full", supportOpen && "bg-brand-50")}>
            <RailContent label={t.support} badge={supportBadge} icon={<VeximPlatformSupportIcon size={26} strokeWidth={2.2} />} />
          </button>
        </li>
      </ul>
      {/* Nút tròn mở/đóng danh sách, chỉ ở màn hình hẹp hơn 1440px. */}
      <button type="button" onClick={() => setRailOpen((value) => !value)} aria-expanded={railOpen} aria-controls="marketplace-rail-list"
        aria-label={totalUnread > 0 ? `${railOpen ? t.close : t.open}, ${totalUnread} ${t.unread}` : (railOpen ? t.close : t.open)}
        className="relative order-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-900/25 transition hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-[1440px]:hidden">
        {railOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        {!railOpen && totalUnread > 0 && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white ring-2 ring-white">{totalUnread > 99 ? "99+" : totalUnread}</span>}
      </button>
    </nav>

    {supportOpen && <SupportChat isVi={isVi} onClose={closeSupport} />}

    {chatOpen && <dialog ref={dialog} aria-label={t.messages} className={CHAT_DOCK_CLASS} onClose={() => setChatOpen(false)}>
      <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS[isVi ? "vi" : "en"]} locale={isVi ? "vi-VN" : "en-GB"}
        onClose={closeChat} closeLabel={isVi ? "Đóng" : "Close"}
        expandHref="/buyer/account/messages" expandLabel={isVi ? "Mở trang Tin nhắn" : "Open full page"} />
    </dialog>}
  </>;
}

const railItemClass = "relative flex h-12 items-center gap-3 px-3.5 text-brand-700 min-[1440px]:h-14 transition hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600";

/** Chữ ẩn mặc định, hiện khi di chuột hoặc focus bàn phím vào cả thanh. */
function RailContent({ icon, label, badge }: { icon: ReactNode; label: string; badge?: string | null }) {
  return <>
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center min-[1440px]:h-7 min-[1440px]:w-7 [&>svg]:h-full [&>svg]:w-full">
      {icon}
      {badge && <span aria-hidden="true" className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-white">{badge}</span>}
    </span>
    {/* Màn hình hẹp (danh sách mở bằng nút tròn): luôn hiện chữ. Từ 1440px: chữ hiện khi di chuột/focus. */}
    <span className="max-w-[11rem] overflow-hidden whitespace-nowrap text-[14px] font-medium text-ink-800 transition-all duration-200 min-[1440px]:max-w-0 min-[1440px]:opacity-0 min-[1440px]:group-hover/rail:max-w-[11rem] min-[1440px]:group-hover/rail:opacity-100 min-[1440px]:group-focus-within/rail:max-w-[11rem] min-[1440px]:group-focus-within/rail:opacity-100 motion-reduce:transition-none">{label}</span>
  </>;
}

function RailItem({ icon, label, onClick, badge, badgeLabel }: { icon: ReactNode; label: string; onClick: () => void; badge: string | null; badgeLabel: string | null }) {
  return <li>
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={badgeLabel ? `${label}, ${badgeLabel}` : label} title={label} className={cx(railItemClass, "w-full")}>
      <RailContent icon={icon} label={label} badge={badge} />
    </button>
  </li>;
}

function RailButton({ ref, icon, label, onClick, haspopup }: { ref: Ref<HTMLButtonElement>; icon: ReactNode; label: string; onClick: () => void; haspopup?: boolean }) {
  return <button ref={ref} type="button" onClick={onClick} aria-haspopup={haspopup ? "dialog" : undefined} aria-label={label} title={label} className={cx(railItemClass, "w-full")}>
    <RailContent icon={icon} label={label} />
  </button>;
}
