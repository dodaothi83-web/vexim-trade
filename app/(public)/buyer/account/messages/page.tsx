import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  return <div lang={vi ? "vi" : "en"} className="bg-slate-50">
    <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-8">
      <Link href="/buyer/account" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" />{vi ? "Tài khoản người mua" : "Buyer account"}</Link>
      <ChatWorkspace side="buyer" labels={BUYER_CHAT_LABELS[vi ? "vi" : "en"]} locale={vi ? "vi-VN" : "en-GB"} initialId={initialId} />
    </div>
  </div>;
}
