"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  en: { rail: "Quick actions", messages: "Messages", sourcing: "Sourcing request", support: "Chat with Vexim", unread: "unread" },
  vi: { rail: "Lối tắt", messages: "Tin nhắn", sourcing: "Yêu cầu tìm nguồn", support: "Chat với Vexim", unread: "chưa đọc" },
};

/**
 * Thanh công cụ dọc ở cạnh phải các trang công khai, mặc định chỉ hiện icon; di chuột
 * (hoặc dùng bàn phím) vào là mở rộng hiện chữ. Ba việc: đọc và trả lời tin nhắn với nhà
 * cung cấp ngay trên trang, gửi yêu cầu tìm nguồn cho Vexim, và chat với đội Vexim ngay trong
 * hệ thống (nhân viên kinh doanh trả lời trong CRM, mục Chat với người mua).
 */
export function MarketplaceRail() {
  const pathname = usePathname();
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
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
    const [chat, support] = await Promise.all([read("/api/chat?side=buyer"), read("/api/support?peek=1")]);
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

  // Trang Tin nhắn đã có khung chat đầy đủ; thanh nổi sẽ đè lên ô nhập.
  if (pathname?.startsWith("/buyer/account/messages")) return null;

  function openMessages() {
    requireBuyer(window.location.pathname + window.location.search, () => setChatOpen(true));
  }

  function openSupport() {
    requireBuyer(window.location.pathname + window.location.search, () => { setSupportOpen(true); setSupportUnread(0); });
  }

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;
  const supportBadge = supportUnread > 0 ? String(supportUnread) : null;

  return <>
    <nav aria-label={t.rail} lang={isVi ? "vi" : "en"}
      className="group/rail fixed right-0 z-40 bottom-[max(6rem,calc(env(safe-area-inset-bottom,0px)+6rem))] lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2">
      <ul className="flex flex-col overflow-hidden rounded-l-2xl border border-r-0 border-ink-200 bg-white/95 shadow-lg shadow-brand-900/10 backdrop-blur supports-[backdrop-filter]:bg-white/85">
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
    </nav>

    {supportOpen && <SupportChat isVi={isVi} onClose={closeSupport} />}

    {chatOpen && <dialog ref={dialog} aria-label={t.messages} className={CHAT_DOCK_CLASS} onClose={() => setChatOpen(false)}>
      <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS[isVi ? "vi" : "en"]} locale={isVi ? "vi-VN" : "en-GB"}
        onClose={closeChat} closeLabel={isVi ? "Đóng" : "Close"}
        expandHref="/buyer/account/messages" expandLabel={isVi ? "Mở trang Tin nhắn" : "Open full page"} />
    </dialog>}
  </>;
}

const railItemClass = "relative flex h-11 items-center gap-3 px-2.5 text-brand-700 lg:h-14 lg:px-3.5 transition hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600";

/** Chữ ẩn mặc định, hiện khi di chuột hoặc focus bàn phím vào cả thanh. */
function RailContent({ icon, label, badge }: { icon: ReactNode; label: string; badge?: string | null }) {
  return <>
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center lg:h-7 lg:w-7 [&>svg]:h-full [&>svg]:w-full">
      {icon}
      {badge && <span aria-hidden="true" className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10.5px] font-bold leading-[18px] text-white ring-2 ring-white">{badge}</span>}
    </span>
    <span className="max-w-0 overflow-hidden whitespace-nowrap text-[13.5px] font-semibold text-ink-800 opacity-0 transition-all duration-200 group-hover/rail:max-w-[11rem] group-hover/rail:opacity-100 group-focus-within/rail:max-w-[11rem] group-focus-within/rail:opacity-100 motion-reduce:transition-none">{label}</span>
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
