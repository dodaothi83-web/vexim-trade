import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingUuid } from "@/lib/sourcing/files";
import { sourcingStatusLabel } from "@/lib/sourcing/status";
import { getLocale } from "@/lib/i18n/server";
import { getStore } from "@/lib/db";
import { findLinkedRfq } from "@/lib/sourcing/to-rfq";
export const metadata = { title: "Sourcing request | Vexim Trade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function SourcingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireBuyerSession(`/buyer/account/sourcing/${id}`);
  if (!sourcingUuid(id)) notFound();
  const vi = (await getLocale()) === "vi";
  const store = sourcingStore(); const account = await store.getBuyerUserByEmail(session.email);
  const row = await store.getSourcingRequest(id);
  if (!account?.verified_at || !row || row.buyer_email !== session.email.trim().toLowerCase()) notFound();
  // Check ownership before looking up the converted RFQ; never link an arbitrary CRM RFQ.
  const ownedRfqs = await getStore().listBuyerRfqsByEmail(session.email).catch((error) => {
    console.error("[buyer] linked sourcing RFQ unavailable", error);
    return [];
  });
  const linked = findLinkedRfq(ownedRfqs, row.id);
  return <main lang={vi ? "vi" : "en"} className="mx-auto max-w-3xl px-5 py-10"><Link href="/buyer/account?tab=vexim" className="text-sm font-semibold text-brand-700">← {vi ? "Tìm nguồn qua Vexim" : "Vexim sourcing"}</Link><section className="mt-5 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">{vi ? "Yêu cầu tìm nguồn" : "Sourcing request"}</h1><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{sourcingStatusLabel(row.status, vi)}</span></div><p className="mt-3 text-xs text-ink-500">{new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.created_at))} · {row.id.slice(0, 8).toUpperCase()}</p><p className="mt-6 whitespace-pre-wrap break-words text-sm leading-7">{row.content}</p>{!!row.attachments.length && <ul className="mt-5 space-y-2 border-t border-ink-100 pt-4">{row.attachments.map((f) => <li key={f.id}><a href={`/api/buyer/sourcing/${row.id}/files/${f.id}`} className="break-all text-sm font-semibold text-brand-700 underline">{f.name}</a><span className="ml-2 text-xs text-ink-500">{Math.ceil(f.size / 1024)} KB</span></li>)}</ul>}{row.buyer_reply && <div className="mt-6 rounded-xl bg-brand-50 p-4"><h2 className="text-sm font-bold">{vi ? "Phản hồi từ Vexim" : "Response from Vexim"}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{row.buyer_reply}</p></div>}
    {linked ? <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-sm text-ink-700">{vi ? "Vexim đã mở RFQ tìm nguồn cho yêu cầu này. Báo giá đã công bố và trao đổi với Vexim nằm trong RFQ liên kết." : "Vexim opened a sourcing RFQ for this request. Published quotes and your Vexim conversation are on the linked RFQ."}</p><Link href={`/buyer/account/requests/${encodeURIComponent(linked.id)}`} className="mt-2 inline-block text-sm font-semibold text-brand-700 underline">{vi ? `Xem RFQ ${linked.code} và trao đổi →` : `View RFQ ${linked.code} and messages →`}</Link></div>
      : <p className="mt-6 text-sm text-ink-600">{vi ? "Chưa có RFQ liên kết hiển thị. Vexim sẽ cập nhật yêu cầu tìm nguồn ở đây." : "No linked RFQ is visible yet. Vexim will update this sourcing request here."}</p>}</section></main>;
}
