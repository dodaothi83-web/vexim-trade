import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, PackageSearch, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { EmptyRow, Panel, date } from "../portal-ui";
import { SupplierRfqReply } from "@/components/supplier-rfq-reply";
import { QUOTE_CURRENCIES, QUOTE_INCOTERMS } from "@/lib/supplier-portal/quote";
import { SupplierQuoteForm } from "./quote-form";
import type { RfqBuyerContact } from "@/lib/rfq/buyer-contact";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";

/** Only a server-side, consented snapshot reaches this authenticated supplier page. */
function BuyerContactDetails({ contact, copy }: { contact: RfqBuyerContact | null; copy: RfqsMessages["buyer"] }) {
  if (!contact) return <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-600">{copy.unavailable}</p>;
  const fields = [
    [copy.company, contact.company], [copy.name, contact.contact_name],
    [copy.email, contact.email], [copy.phone, contact.phone],
    [copy.country, contact.country], [copy.website, contact.website],
    [copy.type, contact.business_type],
  ];
  return <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
    <p className="mb-2 text-xs font-bold text-brand-800">{copy.title}</p>
    <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-ink-500">{label}</dt><dd className="break-words font-semibold text-ink-900">{value || copy.notProvided}</dd>
      </div>)}
    </dl>
  </div>;
}

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.rfqs.metaTitle, robots: { index: false, follow: false } };
}

/**
 * Một trang cho toàn bộ công việc RFQ: việc cần trả lời, danh sách đã chuyển và báo cáo.
 * Trang tổng quan chỉ hiện số đếm rồi dẫn sang đây.
 */
export default async function SupplierRfqPage({ searchParams }: { searchParams: Promise<{ range?: string; all?: string; quote?: string; code?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, store } = access;
  const { locale, intl, m } = await getPortalMessages();
  const copy = m.rfqs;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] could not read ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [invites, products] = await Promise.all([
    optional(copy.degraded.labelInvites, [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional(copy.degraded.labelProducts, [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
  ]);

  const sp = await searchParams;
  const days: 7 | 30 | 90 = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
  const showAll = sp.all === "1";
  const board = buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days, language: locale });
  const shown = showAll ? board.invites : board.invites.slice(0, 30);

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub}
      actions={<>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900">{fill(copy.badge.tasks, { count: board.tasks.length })}</span>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-bold text-ink-700">{fill(copy.badge.invites, { count: board.invites.length })}</span>
      </>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{copy.degraded.title}</p>
      <p className="mt-1">{copy.degraded.body}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    {(sp.quote === "sent" || sp.quote === "delivered" || sp.quote === "declined") && /^[A-Za-z0-9-]{1,40}$/.test(sp.code ?? "") &&
      <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
        {fill(sp.quote === "sent" ? copy.quote.sent : sp.quote === "delivered" ? copy.quote.delivered : copy.quote.declined, { code: sp.code! })}
      </div>}

    <div className="space-y-5">
      <Panel icon={<Mail className="h-4 w-4 text-brand-700" />} title={copy.tasks.title} count={board.tasks.length}
        sub={copy.tasks.sub} flush>
        {board.tasks.length ? <ul className="divide-y divide-ink-100">
          {board.tasks.map((task) => {
            const overdue = !!task.dueAt && Date.parse(task.dueAt) < Date.now();
            return <li key={task.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                <Mail className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{task.title}</span>
                <span className="mt-0.5 block text-xs text-ink-500">{task.code} · {task.quantity} · {task.destination}</span>
                <span className={`mt-0.5 block text-xs ${overdue ? "font-semibold text-rose-700" : "text-ink-500"}`}>
                  {overdue ? copy.tasks.overdue : copy.tasks.due}{task.dueAt ? date(task.dueAt, intl) : copy.tasks.dueFallback}
                </span>
                <BuyerContactDetails contact={task.buyerContact} copy={copy.buyer} />
              </span>
              <SupplierRfqReply address={supplierReplyAddress(task.code, task.matchId)} subject={fill(copy.tasks.subject, { code: task.code })}
                labels={{ gmail: copy.tasks.replyGmail, app: copy.tasks.replyApp, copy: copy.tasks.copyAddress, copied: copy.tasks.copied }} />
              {task.canQuote && <SupplierQuoteForm matchId={task.matchId} code={task.code} defaults={task.quoteDefaults}
                currencies={QUOTE_CURRENCIES} incoterms={QUOTE_INCOTERMS} editing={false} direct={task.directToBuyer} copy={copy.quote} />}
            </li>;
          })}</ul> : <EmptyRow>{copy.tasks.empty}</EmptyRow>}
        {board.tasks.length > 0 && <p className={`border-t border-ink-100 px-5 py-2.5 text-[11.5px] leading-4 ${supplier.email ? "text-ink-500" : "font-semibold text-rose-700"}`}>
          {supplier.email ? fill(copy.tasks.replyHint, { email: supplier.email }) : copy.tasks.replyHintNoEmail}
        </p>}
      </Panel>

      <Panel icon={<PackageSearch className="h-4 w-4 text-brand-700" />} title={copy.invites.title} count={board.invites.length}
        sub={copy.invites.sub}
        action={board.invites.length > 30 && !showAll ? <Link href="/supplier/portal/rfqs?all=1" className="text-xs font-bold text-brand-700 hover:underline">{copy.invites.viewAll}</Link> : undefined} flush>
        {board.invites.length ? <ul className="divide-y divide-ink-100">
          {shown.map((item) => <li key={item.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{item.title}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{item.code} · {item.quantity} · {item.destination} · {fill(copy.invites.sentAt, { at: date(item.sentAt, intl) })}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{fill(copy.invites.due, { at: item.dueAt ? date(item.dueAt, intl) : copy.tasks.dueFallback })}{item.quotePrice ? ` · ${fill(copy.invites.quoteRecorded, { value: item.quotePrice })}` : ""}</span>
              {item.repliedAt && <span className="mt-0.5 block text-xs font-semibold text-emerald-700">{fill(copy.invites.replied, { at: date(item.repliedAt, intl) })}</span>}
              <BuyerContactDetails contact={item.buyerContact} copy={copy.buyer} />
            </span>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800">{item.status}</span>
            {item.canQuote && item.quotePrice && <SupplierQuoteForm matchId={item.matchId} code={item.code} defaults={item.quoteDefaults}
              currencies={QUOTE_CURRENCIES} incoterms={QUOTE_INCOTERMS} editing direct={item.directToBuyer} copy={copy.quote} />}
          </li>)}</ul> : <EmptyRow>{copy.invites.empty}</EmptyRow>}
      </Panel>

      <Panel icon={<TrendingUp className="h-4 w-4 text-brand-700" />} title={copy.report.title}
        sub={copy.report.sub}
        flush
        action={<nav aria-label={copy.report.rangeAria} className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1">
          {([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal/rfqs?range=${d}`} aria-current={days === d ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${days === d ? "bg-white text-brand-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}>{fill(copy.report.days, { count: d })}</Link>)}
        </nav>}>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {([[copy.report.sent, board.report.sent], [copy.report.responded, board.report.responded],
            [copy.report.quoted, board.report.quoted], [copy.report.selected, board.report.selected]] as const).map(([label, value]) =>
            <div key={label} className="rounded-lg bg-ink-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-ink-600">{label}</p>
              <p className="mt-1 text-2xl leading-none font-black tabular-nums text-ink-900">{value}</p>
            </div>)}
        </div>
        {board.report.byProduct.length ? <div className="overflow-x-auto border-t border-ink-200">
          <table className="w-full min-w-[380px] text-left text-sm">
            <thead className="bg-ink-50 text-[11px] font-semibold text-ink-600"><tr><th scope="col" className="px-5 py-2">{copy.report.productHead}</th><th scope="col" className="px-3 py-2 text-right">{copy.report.invitesHead}</th><th scope="col" className="px-5 py-2 text-right">{copy.report.quotedHead}</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{board.report.byProduct.map((row) => <tr key={row.id}>
              <td className="px-5 py-2.5 text-ink-800">{row.name}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{row.sent}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-ink-700">{row.quoted}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyRow>{fill(copy.report.empty, { days })}</EmptyRow>}
        <p className="border-t border-ink-200 px-5 py-2.5 text-[11px] leading-4 text-ink-500">{copy.report.footnote}</p>
      </Panel>
    </div>
  </>;
}
