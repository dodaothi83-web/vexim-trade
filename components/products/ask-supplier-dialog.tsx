"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { ChatWorkspace, type ChatDraftProduct } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";

/** Câu hỏi hay gặp; bấm là chèn vào ô nhập, người mua sửa tiếp được. */
const QUICK_QUESTIONS = [
  "What is your best price for one container?",
  "What is the minimum order quantity?",
  "What is the lead time after the order is confirmed?",
  "Can you send samples?",
  "Which certificates do you have for this product?",
];

/**
 * "Ask supplier" mở cửa sổ chat ngay trên trang sản phẩm: thẻ sản phẩm đính kèm sẵn phía
 * trên ô nhập, gửi xong tin hiện luôn trong khung và người mua chat tiếp mà không rời trang.
 * Đã từng hỏi nhà cung cấp này thì cửa sổ mở lại đúng cuộc cũ; cột trái là các cuộc khác.
 */
export function AskSupplierDialog({ productId, productName, supplierName, grade, imageUrl }: {
  category: string; productId: string; productName: string; supplierId: string;
  supplierName: string; grade: string; imageUrl: string | null; quoteHref: string;
}) {
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const product = useMemo<ChatDraftProduct>(() => ({
    id: productId, name: productName, imageUrl, supplierName, detail: [supplierName, grade].filter(Boolean).join(" · "),
  }), [productId, productName, imageUrl, supplierName, grade]);

  function showChat() { setIsOpen(true); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); }
  function open() {
    const destination = new URL(window.location.href);
    destination.searchParams.set("ask", "1");
    requireBuyer(destination.pathname + destination.search, showChat);
  }
  useEffect(() => {
    if (params.get("ask") === "1") open();
  }, [params, email]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let unlock: (() => void) | null = null;
    const sync = () => {
      if (element.open && !unlock) unlock = lockDialogScroll();
      else if (!element.open && unlock) { unlock(); unlock = null; }
      // Đóng cửa sổ là dừng hỏi tin mới; mở lại thì tải lại cuộc trò chuyện.
      if (!element.open) setIsOpen(false);
    };
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(element, { attributes: true, attributeFilter: ["open"] });
    return () => { observer.disconnect(); unlock?.(); };
  }, []);
  return <>
    <button type="button" onClick={open} aria-label={`Ask supplier about ${productName}`} className="btn btn-soft min-h-12 w-full justify-center px-2 text-sm font-bold sm:px-4 sm:text-base">
      <MessageCircle className="h-5 w-5 shrink-0" />Ask supplier
    </button>
    <dialog ref={dialog} aria-labelledby="ask-supplier-title" className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden bg-white p-0 text-ink-900 backdrop:bg-black/40 sm:h-[85dvh] sm:max-h-[760px] sm:w-[calc(100vw-3rem)] sm:max-w-5xl sm:rounded-2xl sm:shadow-2xl"
      onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <h2 id="ask-supplier-title" className="sr-only">Chat with {supplierName}</h2>
      {isOpen && <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS.en} locale="en-GB"
        product={product} quickQuestions={QUICK_QUESTIONS} onClose={close} />}
    </dialog>
  </>;
}
