"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { usePathname } from "next/navigation";
import { VeximMessagesIcon, VeximPlatformSupportIcon, VeximSourcingRequestIcon } from "@/components/brand/vexim-icons";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { SourcingComposerTrigger } from "@/components/sourcing-composer";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { cx } from "@/components/ui";

/** Đội Vexim (chủ sàn) qua WhatsApp; không phải kênh liên hệ nhà cung cấp. */
const VEXIM_WHATSAPP_URL =
  "https://wa.me/84373685634?text=" +
  encodeURIComponent("Hi Vexim Trade, I would like to ask about sourcing products from Vietnam.");

const UNREAD_POLL_MS = 30_000;

const COPY = {
  en: { rail: "Quick actions", messages: "Messages", sourcing: "Sourcing request", support: "Chat with Vexim", unread: "unread" },
  vi: { rail: "Lối tắt", messages: "Tin nhắn", sourcing: "Yêu cầu tìm nguồn", support: "Chat với Vexim", unread: "chưa đọc" },
};

/**
 * Thanh công cụ dọc ở cạnh phải các trang công khai, mặc định chỉ hiện icon; di chuột
 * (hoặc dùng bàn phím) vào là mở rộng hiện chữ. Ba việc: đọc và trả lời tin nhắn với nhà
 * cung cấp ngay trên trang, gửi yêu cầu tìm nguồn cho Vexim, và chat với đội Vexim.
 */
export function MarketplaceRail({ isVi = false }: { isVi?: boolean }) {
  const t = COPY[isVi ? "vi" : "en"];
  const pathname = usePathname();
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!email) { setUnread(0); return; }
    const res = await fetch("/api/chat?side=buyer", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null) as { unread?: number } | null;
    setUnread(typeof data?.unread === "number" ? data.unread : 0);
  }, [email]);

  // Đếm tin chưa đọc khi tab đang mở; tab ẩn thì không hỏi máy chủ.
  useEffect(() => {
    void refreshUnread();
    const tick = () => { if (document.visibilityState === "visible") void refreshUnread(); };
    const timer = window.setInterval(tick, UNREAD_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refreshUnread]);

  useEffect(() => {
    const node = dialog.current;
    if (!chatOpen || !node) return;
    node.showModal();
    const unlock = lockDialogScroll();
    const onClose = () => { setChatOpen(false); void refreshUnread(); };
    node.addEventListener("close", onClose);
    return () => { node.removeEventListener("close", onClose); unlock(); };
  }, [chatOpen, refreshUnread]);

  // Trang Tin nhắn đã có khung chat đầy đủ; thanh nổi sẽ đè lên ô nhập.
  if (pathname?.startsWith("/buyer/account/messages")) return null;

  function openMessages() {
    requireBuyer(window.location.pathname + window.location.search, () => setChatOpen(true));
  }

  const badge = unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;

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
          <a href={VEXIM_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label={t.support} title={t.support} className={railItemClass}>
            <RailContent label={t.support} icon={<VeximPlatformSupportIcon size={26} strokeWidth={2.2} />} />
          </a>
        </li>
      </ul>
    </nav>

    {chatOpen && <dialog ref={dialog} aria-label={t.messages}
      className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden bg-white p-0 text-ink-900 backdrop:bg-black/40 sm:h-[85dvh] sm:max-h-[760px] sm:w-[calc(100vw-3rem)] sm:max-w-5xl sm:rounded-2xl sm:shadow-2xl"
      onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.current?.close(); } }}>
      <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS[isVi ? "vi" : "en"]} locale={isVi ? "vi-VN" : "en-GB"}
        onClose={() => dialog.current?.close()} closeLabel={isVi ? "Đóng" : "Close"} />
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
