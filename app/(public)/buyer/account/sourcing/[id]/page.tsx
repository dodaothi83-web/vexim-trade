import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBuyerSession } from "@/lib/auth/buyer-session";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingUuid } from "@/lib/sourcing/files";
import { sourcingStatusLabel } from "@/lib/sourcing/status";
import { getLocale } from "@/lib/i18n/server";
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
  return <main className="mx-auto max-w-3xl px-5 py-10"><Link href="/buyer/account?tab=requests" className="text-sm font-semibold text-brand-700">← {vi ? "Yêu cầu của tôi" : "My enquiries"}</Link><section className="mt-5 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold">{vi ? "Yêu cầu tìm nguồn" : "Sourcing request"}</h1><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{sourcingStatusLabel(row.status, vi)}</span></div><p className="mt-3 text-xs text-ink-500">{new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.created_at))} · {row.id.slice(0, 8).toUpperCase()}</p><p className="mt-6 whitespace-pre-wrap break-words text-sm leading-7">{row.content}</p>{!!row.attachments.length && <ul className="mt-5 space-y-2 border-t border-ink-100 pt-4">{row.attachments.map((f) => <li key={f.id}><a href={`/api/buyer/sourcing/${row.id}/files/${f.id}`} className="break-all text-sm font-semibold text-brand-700 underline">{f.name}</a><span className="ml-2 text-xs text-ink-500">{Math.ceil(f.size / 1024)} KB</span></li>)}</ul>}{row.buyer_reply && <div className="mt-6 rounded-xl bg-brand-50 p-4"><h2 className="text-sm font-bold">{vi ? "Phản hồi từ Vexim" : "Response from Vexim"}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{row.buyer_reply}</p></div>}</section></main>;
}
