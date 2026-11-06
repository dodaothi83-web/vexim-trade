"use client";

import { useEffect } from "react";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";

/**
 * Khung chat bám cạnh phải trên máy tính (như Alibaba): không làm tối nền, không khoá trang, người
 * mua vẫn xem và bấm trang phía sau trong lúc chat. Điện thoại: toàn màn hình như trước.
 * Dùng chung cho khung Tin nhắn nhà cung cấp và Chat with Vexim; mỗi lúc chỉ mở một khung.
 */
export const CHAT_DOCK_CLASS = [
  "fixed inset-0 z-50 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-white p-0 text-ink-900",
  "md:inset-auto md:bottom-4 md:right-20 md:top-24 md:h-auto md:w-[min(760px,calc(100vw-7rem))]",
  "md:rounded-2xl md:border md:border-ink-200 md:shadow-2xl md:shadow-brand-900/20 lg:right-24",
].join(" ");

const EVENT = "vexim:chat-dock";

/** Báo các khung khác đóng lại khi khung `id` mở. */
export function announceDock(id: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/**
 * Hành vi chung khi khung đang mở: nhấn Esc để đóng, khung khác mở thì tự đóng, và chỉ khoá
 * cuộn trang trên điện thoại (khung chiếm cả màn hình).
 */
export function useChatDock(id: string, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    announceDock(id);
    const onOther = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener(EVENT, onOther);
    window.addEventListener("keydown", onKey);
    const unlock = window.matchMedia("(max-width: 767px)").matches ? lockDialogScroll() : null;
    return () => { window.removeEventListener(EVENT, onOther); window.removeEventListener("keydown", onKey); unlock?.(); };
  }, [id, open, close]);
}
