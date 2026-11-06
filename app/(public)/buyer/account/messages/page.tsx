import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { getLocale } from "@/lib/i18n/server";
import { ChatWorkspace, type ChatLabels } from "@/components/chat/chat-workspace";

export const metadata: Metadata = { title: "Messages | Vexim Trade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABELS: Record<"en" | "vi", ChatLabels> = {
  en: {
    title: "Messages", empty: "No messages yet",
    emptyHint: "Click Ask supplier on any product page to start a conversation with the supplier.",
    pick: "Choose a conversation to read and reply.", placeholder: "Type your message…", send: "Send",
    back: "Back to conversations", about: "About:", unread: "Unread",
    failed: "Message not sent. Please try again.", rateLimited: "You are sending too fast. Wait a few minutes and try again.",
    tooLong: "The message is too long (maximum 4,000 characters).", loadError: "Could not load this conversation. Reload the page to try again.",
    enterHint: "Enter to send, Shift + Enter for a new line.",
    notice: "Your email address is not shared with the supplier. You get an email when they reply.",
  },
  vi: {
    title: "Tin nhắn", empty: "Chưa có tin nhắn",
    emptyHint: "Bấm Ask supplier trên trang sản phẩm để bắt đầu trò chuyện với nhà cung cấp.",
    pick: "Chọn một cuộc trò chuyện để đọc và trả lời.", placeholder: "Nhập tin nhắn…", send: "Gửi",
    back: "Quay lại danh sách", about: "Về:", unread: "Chưa đọc",
    failed: "Chưa gửi được tin. Hãy thử lại.", rateLimited: "Bạn đang gửi quá nhanh. Đợi vài phút rồi thử lại.",
    tooLong: "Tin nhắn quá dài (tối đa 4.000 ký tự).", loadError: "Chưa tải được cuộc trò chuyện. Tải lại trang để thử lại.",
    enterHint: "Enter để gửi, Shift + Enter để xuống dòng.",
    notice: "Email của bạn không được chia sẻ cho nhà cung cấp. Bạn nhận email khi họ trả lời.",
  },
};

/** Tin nhắn của người mua với các nhà cung cấp đã hỏi qua "Ask supplier". */
export default async function BuyerMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const initialId = c && /^[0-9a-f-]{8,64}$/i.test(c) ? c : null;
  await requireBuyerSession(`/buyer/account/messages${initialId ? `?c=${initialId}` : ""}`);
  const vi = (await getLocale()) === "vi";
  return <div lang={vi ? "vi" : "en"} className="bg-slate-50">
    <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8">
      <Link href="/buyer/account" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{vi ? "Tài khoản người mua" : "Buyer account"}</Link>
      <ChatWorkspace side="buyer" labels={LABELS[vi ? "vi" : "en"]} locale={vi ? "vi-VN" : "en-GB"} initialId={initialId} />
    </div>
  </div>;
}
