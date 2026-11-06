import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import type { ChatConversation, Supplier } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn người mua ↔ nhà cung cấp" };

const DAY = 24 * 60 * 60_000;

function when(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}

/** Người mua nhắn mà nhà cung cấp chưa trả lời sau 24 giờ. */
function waitingSupplier(c: ChatConversation, now: number) {
  return c.last_sender === "buyer" && !!c.last_message_at && now - Date.parse(c.last_message_at) > DAY;
}

/**
 * Nhân viên theo dõi các cuộc trò chuyện (chỉ đọc). Vexim không nhắn chen vào; trang này để
 * thấy nhà cung cấp nào chậm trả lời và xử lý khi có báo cáo spam.
 */
export default async function CrmMessagesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requirePagePermission("rfq.view", "/crm/dashboard");
  const { filter } = await searchParams;
  const store = getStore();
  const [rows, suppliers] = await Promise.all([
    store.listChatConversations({ limit: 300 }).catch((error) => { console.error("[crm-chat] list failed", error); return [] as ChatConversation[]; }),
    store.listSuppliers().catch(() => [] as Supplier[]),
  ]);
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const now = Date.now();
  const waiting = rows.filter((c) => waitingSupplier(c, now));
  const shown = filter === "waiting" ? waiting : rows;
  return <div className="min-w-0 space-y-4">
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Ask supplier</p>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><MessageCircle className="h-6 w-6 text-brand-700" /> Tin nhắn người mua ↔ nhà cung cấp</h1>
      <p className="mt-2 text-sm text-ink-500">Chỉ xem. Người mua và nhà cung cấp tự trao đổi; nhân viên theo dõi tốc độ trả lời và xử lý báo cáo spam.</p>
    </header>
    <nav className="flex gap-1 border-b border-ink-200 text-[13px] font-semibold">
      <Link href="/crm/messages" aria-current={filter !== "waiting" ? "page" : undefined} className={`border-b-2 px-3 py-2 ${filter !== "waiting" ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500"}`}>Tất cả <span className="rounded-full bg-ink-100 px-1.5 text-[11px]">{rows.length}</span></Link>
      <Link href="/crm/messages?filter=waiting" aria-current={filter === "waiting" ? "page" : undefined} className={`border-b-2 px-3 py-2 ${filter === "waiting" ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500"}`}>Chờ nhà cung cấp quá 24 giờ <span className={`rounded-full px-1.5 text-[11px] ${waiting.length ? "bg-amber-100 text-amber-800" : "bg-ink-100"}`}>{waiting.length}</span></Link>
    </nav>
    {!shown.length ? <p className="rounded-xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500">Chưa có cuộc trò chuyện nào trong nhóm này.</p>
      : <ul className="card divide-y divide-ink-100 overflow-hidden">{shown.map((c) => {
        const s = supplierById.get(c.supplier_id);
        return <li key={c.id}><Link href={`/crm/messages/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ink-50/60">
          <span className="min-w-0 flex-1 basis-full sm:basis-0">
            <span className="block truncate text-[14px] font-semibold text-ink-900">{s?.display_name || s?.name || "Nhà cung cấp"} · {c.buyer_email}</span>
            <span className="mt-0.5 block truncate text-[12px] text-ink-500">{c.product_name ?? "—"} · {c.last_message_preview ?? "Chưa có tin"}</span>
          </span>
          {waitingSupplier(c, now) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Chờ nhà cung cấp</span>}
          <span className="text-[12px] text-ink-500">{c.last_sender === "buyer" ? "Người mua nhắn cuối" : c.last_sender === "supplier" ? "Nhà cung cấp nhắn cuối" : ""}</span>
          <span className="w-28 text-right text-[12px] text-ink-500">{when(c.last_message_at)}</span>
        </Link></li>;
      })}</ul>}
  </div>;
}
