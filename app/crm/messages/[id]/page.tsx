import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { unansweredEscalated, unansweredNeedsStaff } from "@/lib/chat/core";
import { getStore } from "@/lib/db";
import { markUnansweredHandledAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cuộc trò chuyện" };

function when(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}

/** Đọc một cuộc trò chuyện. Nhân viên không gửi tin từ đây. */
export default async function CrmConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("rfq.view", "/crm/dashboard");
  const { id } = await params;
  const store = getStore();
  const conversation = /^[0-9a-f-]{8,64}$/i.test(id) ? await store.getChatConversation(id) : null;
  if (!conversation) notFound();
  const [messages, supplier] = await Promise.all([store.listChatMessages(conversation.id), store.getSupplier(conversation.supplier_id).catch(() => null)]);
  return <div className="min-w-0 max-w-3xl space-y-4">
    <Link href="/crm/messages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Tin nhắn</Link>
    <header className="card p-4 sm:p-5">
      <h1 className="text-lg font-bold text-ink-900">{supplier?.display_name || supplier?.name || "Nhà cung cấp"} · {conversation.buyer_email}</h1>
      <p className="mt-1 text-sm text-ink-500">Sản phẩm: {conversation.product_name ?? "—"} · Bắt đầu {when(conversation.created_at)}</p>
      {supplier && <Link href={`/crm/suppliers/${supplier.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">Mở hồ sơ nhà cung cấp</Link>}
    </header>
    {unansweredEscalated(conversation) && <section aria-label="Nhà cung cấp chưa trả lời" className="card border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <h2 className="text-[15px] font-bold text-ink-900">Nhà cung cấp chưa trả lời quá 48 giờ</h2>
      <p className="mt-1 text-sm leading-6 text-ink-700">Người mua đã được báo là Vexim đang liên hệ nhà cung cấp. Hãy gọi hoặc nhắn Zalo để họ vào cổng trả lời. Không gửi email hay số điện thoại của nhà cung cấp cho người mua.</p>
      {supplier && <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-ink-500">Người liên hệ</dt><dd className="font-semibold text-ink-900">{supplier.contact_name || "—"}</dd></div>
        <div><dt className="text-xs text-ink-500">Điện thoại</dt><dd className="font-semibold text-ink-900">{supplier.phone || "—"}</dd></div>
        <div><dt className="text-xs text-ink-500">Zalo</dt><dd className="font-semibold text-ink-900">{supplier.zalo || "—"}</dd></div>
      </dl>}
      {unansweredNeedsStaff(conversation)
        ? <form action={markUnansweredHandledAction} className="mt-4">
          <input type="hidden" name="id" value={conversation.id} />
          <button type="submit" className="btn btn-primary">Đã liên hệ nhà cung cấp</button>
        </form>
        : <p className="mt-3 text-sm font-semibold text-ink-700">Đã liên hệ nhà cung cấp lúc {when(conversation.unanswered_handled_at!)}{conversation.unanswered_handled_by ? ` · ${conversation.unanswered_handled_by}` : ""}. Đang chờ họ trả lời.</p>}
    </section>}
    <section className="card space-y-2.5 bg-ink-50/60 p-4 sm:p-5">
      {messages.length === 0 && <p className="text-sm text-ink-500">Chưa có tin nhắn.</p>}
      {messages.map((m) => <div key={m.id} className={`flex flex-col ${m.sender === "supplier" ? "items-end" : "items-start"}`}>
        <span className="mb-0.5 px-1 text-[11px] font-semibold text-ink-500">{m.sender === "supplier" ? "Nhà cung cấp" : "Người mua"}{m.product_name ? ` · về ${m.product_name}` : ""}</span>
        <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-6 shadow-sm ${m.sender === "supplier" ? "bg-emerald-50 text-ink-900 ring-1 ring-emerald-100" : "bg-white text-ink-900 ring-1 ring-ink-100"}`}>{m.body}</div>
        <span className="mt-0.5 px-1 text-[10.5px] text-ink-400">{when(m.created_at)}</span>
      </div>)}
    </section>
  </div>;
}
