"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { CHAT_DOCK_CLASS, useChatDock } from "@/components/chat/dock";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";

/** Câu hỏi chung về nhà cung cấp (không gắn một sản phẩm). */
const QUICK_QUESTIONS = [
  "Do you offer OEM or private label?",
  "Which markets do you export to?",
  "What is your monthly capacity?",
  "Can you send a product catalogue?",
  "Which certificates do you hold?",
];

/**
 * Nút Chat with supplier trên trang nhà cung cấp. Mở khung chat bám cạnh phải; cuộc trò chuyện
 * không gắn sản phẩm. Đã từng chat với nhà cung cấp này thì mở lại đúng cuộc cũ.
 * Trang chỉ hiện nút khi nhà cung cấp có tài khoản cổng đang hoạt động để trả lời.
 */
export function SupplierChatButton({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const supplier = useMemo(() => ({ id: supplierId, name: supplierName }), [supplierId, supplierName]);

  function showChat() { setIsOpen(true); dialog.current?.show(); }
  const close = useCallback(() => { dialog.current?.close(); setIsOpen(false); }, []);
  useChatDock("supplier-chat", isOpen, close);
  function open() {
    const destination = new URL(window.location.href);
    destination.searchParams.set("chat", "1");
    requireBuyer(destination.pathname + destination.search, showChat);
  }
  // Quay lại sau khi đăng nhập (?chat=1) thì mở thẳng khung chat.
  useEffect(() => {
    if (params.get("chat") === "1") open();
  }, [params, email]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <button type="button" onClick={open} aria-label={`Chat with ${supplierName}`}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-800 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800">
      <MessageCircle className="h-4 w-4" aria-hidden="true" />Chat with supplier
    </button>
    <dialog ref={dialog} aria-labelledby="supplier-chat-title" className={CHAT_DOCK_CLASS} onClose={() => setIsOpen(false)}>
      <h2 id="supplier-chat-title" className="sr-only">Chat with {supplierName}</h2>
      {isOpen && <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS.en} locale="en-GB"
        supplier={supplier} quickQuestions={QUICK_QUESTIONS} onClose={close} expandHref="/buyer/account/messages" />}
    </dialog>
  </>;
}
