"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CHAT_DOCK_CLASS, useChatDock } from "@/components/chat/dock";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";

/**
 * Nút chat với nhà cung cấp trên trang RFQ của người mua: mở khung chat nhanh bám cạnh phải (như
 * nút Chat with supplier trên trang nhà cung cấp), không rời trang RFQ. Đã từng chat với nhà cung
 * cấp này thì mở lại đúng cuộc cũ; câu mở đầu điền sẵn mã RFQ.
 * Vẫn là một liên kết tới trang Tin nhắn: mở tab mới (Ctrl/⌘-click, chuột giữa) hoặc khi JS chưa
 * chạy thì đi thẳng tới trang đầy đủ.
 */
export function RfqSupplierChatButton({ supplierId, supplierName, draft, locale, href, className, testId, children }: {
  supplierId: string;
  supplierName: string;
  /** Câu mở đầu điền sẵn, vd. "Về yêu cầu RFQ-…: ". */
  draft: string;
  locale: "vi" | "en";
  /** Trang Tin nhắn đầy đủ với nhà cung cấp này (buyerRfqChatHref). */
  href: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const supplier = useMemo(() => ({ id: supplierId, name: supplierName }), [supplierId, supplierName]);
  const close = useCallback(() => { dialog.current?.close(); setIsOpen(false); }, []);
  const dockId = `rfq-supplier-chat:${supplierId}`;
  useChatDock(dockId, isOpen, close);

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setIsOpen(true);
    dialog.current?.show();
  }

  const titleId = `rfq-chat-title-${supplierId}`;
  return <>
    <a href={href} onClick={open} aria-haspopup="dialog" data-testid={testId} className={className}>{children}</a>
    <dialog ref={dialog} aria-labelledby={titleId} className={CHAT_DOCK_CLASS} onClose={() => setIsOpen(false)}>
      <h2 id={titleId} className="sr-only">{locale === "vi" ? `Chat với ${supplierName}` : `Chat with ${supplierName}`}</h2>
      {isOpen && <ChatWorkspace side="buyer" variant="popup" labels={BUYER_CHAT_LABELS[locale]} locale={locale === "vi" ? "vi-VN" : "en-GB"}
        supplier={supplier} initialDraft={draft} onClose={close} closeLabel={locale === "vi" ? "Đóng" : "Close"}
        expandHref="/buyer/account/messages" expandLabel={locale === "vi" ? "Mở trang Tin nhắn" : "Open full page"} />}
    </dialog>
  </>;
}
