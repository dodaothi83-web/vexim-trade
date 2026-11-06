"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { CHAT_DOCK_CLASS, useChatDock } from "@/components/chat/dock";
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

  // Khung bám cạnh phải, không chặn trang: người mua vẫn xem sản phẩm trong lúc chat.
  function showChat() { setIsOpen(true); dialog.current?.show(); }
  const close = useCallback(() => { dialog.current?.close(); setIsOpen(false); }, []);
  useChatDock("supplier-chat", isOpen, close);
  function open() {
    const destination = new URL(window.location.href);
    destination.searchParams.set("ask", "1");
    requireBuyer(destination.pathname + destination.search, showChat);
  }
  useEffect(() => {
    if (params.get("ask") === "1") open();
  }, [params, email]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <button type="button" onClick={open} aria-label={`Chat with supplier about ${productName}`} className="btn btn-soft min-h-12 w-full justify-center px-2 text-sm font-bold sm:px-4 sm:text-base">
      <MessageCircle className="h-5 w-5 shrink-0" /><span className="sm:hidden">Chat</span><span className="hidden sm:inline">Chat with supplier</span>
    </button>
    <dialog ref={dialog} aria-labelledby="ask-supplier-title" className={CHAT_DOCK_CLASS} onClose={() => setIsOpen(false)}>
      <h2 id="ask-supplier-title" className="sr-only">Chat with {supplierName}</h2>
      {isOpen && <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS.en} locale="en-GB"
        product={product} quickQuestions={QUICK_QUESTIONS} onClose={close} expandHref="/buyer/account/messages" />}
    </dialog>
  </>;
}
