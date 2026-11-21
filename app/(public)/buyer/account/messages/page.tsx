import type { Metadata } from "next";
import { BuyerAccountNav } from "@/components/buyer-account-nav";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { getLocale } from "@/lib/i18n/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { BUYER_CHAT_LABELS } from "@/lib/chat/buyer-labels";

export const metadata: Metadata = { title: "Messages | Vexim Trade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Tin nhắn của người mua với các nhà cung cấp đã hỏi qua "Ask supplier". */
export default async function BuyerMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const initialId = c && /^[0-9a-f-]{8,64}$/i.test(c) ? c : null;
  await requireBuyerSession(`/buyer/account/messages${initialId ? `?c=${initialId}` : ""}`);
  const vi = (await getLocale()) === "vi";
  // Cùng bố cục với các mục khác của tài khoản người mua: cột menu bên trái, tin nhắn bên phải.
  return <div lang={vi ? "vi" : "en"} className="bg-slate-50">
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)]">
        <BuyerAccountNav active="messages" vi={vi} />
        <div className="min-w-0">
          <h1 className="sr-only">{vi ? "Tin nhắn" : "Messages"}</h1>
          <ChatWorkspace side="buyer" labels={BUYER_CHAT_LABELS[vi ? "vi" : "en"]} locale={vi ? "vi-VN" : "en-GB"} initialId={initialId} />
        </div>
      </div>
    </div>
  </div>;
}
