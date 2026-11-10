import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, ImageIcon, Search, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard, type PortalInvite } from "@/lib/supplier-portal/dashboard";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { EmptyRow, date } from "../portal-ui";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";
import type { MediaAsset } from "@/lib/types";
import { privateMediaUrl, supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.rfqs.metaTitle, robots: { index: false, follow: false } };
}

/** One place to read a buyer request and answer it; the same invitation is never shown twice. */
export default async function SupplierRfqPage({ searchParams }: {
  searchParams: Promise<{ range?: string; page?: string; report?: string; quote?: string; code?: string; q?: string; filter?: string }>;
}) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, user, store } = access;
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
  const filter = ["all", "reply", "quoted", "closed"].includes(sp.filter ?? "") ? sp.filter! : "all";
  const query = (sp.q ?? "").trim().slice(0, 120);
  const mediatedThreads = await optional(copy.degraded.labelMediated, [] as Awaited<ReturnType<typeof store.listRfqMediatedThreads>>,
    () => store.listRfqMediatedThreads([...new Set(invites.map((invite) => invite.rfq_id))]));
  const board = buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days, language: locale, mediatedThreads });
  const pendingIds = new Set(board.tasks.map((task) => task.matchId));
  const isMatch = (item: PortalInvite) => {
    const haystack = `${item.code} ${item.title} ${item.request.description} ${item.quantity} ${item.destination}`.toLocaleLowerCase(locale);
    if (query && !haystack.includes(query.toLocaleLowerCase(locale))) return false;
    if (filter === "reply") return pendingIds.has(item.matchId);
    if (filter === "quoted") return ["quoted", "presented_to_buyer", "selected"].includes(item.matchStatus);
    if (filter === "closed") return ["declined", "not_selected"].includes(item.matchStatus);
    return true;
  };
  const filtered = board.invites.filter(isMatch);
  const visibleTasks = filtered.filter((item) => pendingIds.has(item.matchId)).sort((a, b) => {
    const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    const aOverdue = aDue < Date.now(), bOverdue = bDue < Date.now();
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return aDue - bDue || b.sentAt.localeCompare(a.sentAt);
  });
  const visibleHistory = filtered.filter((item) => !pendingIds.has(item.matchId));
  const historyPageSize = 20;
  const historyPageCount = Math.max(1, Math.ceil(visibleHistory.length / historyPageSize));
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const historyPage = Math.min(requestedPage, historyPageCount);
  const shownHistory = visibleHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const historyCount = board.invites.filter((item) => !pendingIds.has(item.matchId)).length;
  const productMap = new Map(products.filter((product) => product.supplier_id === supplier.id).map((product) => [product.id, product]));
  const productIds = [...new Set([...visibleTasks, ...shownHistory].map((item) => item.productId).filter((id): id is string => !!id))];
  const media = productIds.length ? await optional(copy.degraded.labelMedia, [] as MediaAsset[], () => store.listMediaForProducts(productIds)) : [];
  const visibleMedia = supplierVisibleProductMedia(media, supplier.id, user.id)
    .filter((asset) => asset.product_id && productMap.has(asset.product_id) && productIds.includes(asset.product_id) && asset.kind === "image");
  const imageByProduct = new Map<string, string>();
  for (const productId of productIds) {
    const candidates = visibleMedia.filter((asset) => asset.product_id === productId);
    const featured = candidates.find((asset) => asset.id === productMap.get(productId)?.featured_media_id && privateMediaUrl(asset));
    const selected = featured ?? candidates.find((asset) => privateMediaUrl(asset));
    const url = selected && privateMediaUrl(selected);
    if (url) imageByProduct.set(productId, url);
  }
  const showTasksSection = visibleTasks.length > 0 || (filter === "all" && !query && board.tasks.length === 0 && !degraded.includes(copy.degraded.labelInvites));
  const showHistorySection = historyCount > 0 && (visibleHistory.length > 0 || (filter === "all" && !query));
  const quoteCount = board.invites.filter((item) => ["quoted", "presented_to_buyer", "selected"].includes(item.matchStatus)).length;
  const closedCount = board.invites.filter((item) => ["declined", "not_selected"].includes(item.matchStatus)).length;
  const queryHref = (changes: Record<string, string | null>, anchor?: string) => {
    const params = new URLSearchParams();
    const values: Record<string, string | null> = {
      filter: filter === "all" ? null : filter, q: query || null,
      report: sp.report === "1" ? "1" : null, range: sp.range === "7" || sp.range === "90" ? sp.range : null,
      page: historyPage > 1 ? String(historyPage) : null,
      ...changes,
    };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const search = params.toString();
    return `/supplier/portal/rfqs${search ? `?${search}` : ""}${anchor ? `#${anchor}` : ""}`;
  };
  const summaryTitle = (item: PortalInvite) => item.productId ? item.title : item.request.description.slice(0, 120);
  const summaryCard = (item: PortalInvite, pending = false) => {
    const overdue = pending && !!item.dueAt && Date.parse(item.dueAt) < Date.now();
    return <li key={item.matchId}>
      <Link href={`/supplier/portal/rfqs/${encodeURIComponent(item.matchId)}`}
        className="flex min-h-24 flex-col gap-3 px-4 py-4 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white sm:size-24">
          {item.productId && imageByProduct.get(item.productId) ? <>
            {/* Private catalog media is served with this supplier's session, not via the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageByProduct.get(item.productId)!} alt="" loading="lazy" className="size-full object-cover" />
          </> : <ImageIcon className="size-6 text-ink-400" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold text-ink-900">{summaryTitle(item)}</span>
          <span className="mt-1 block text-[13px] text-ink-600">{item.code} · {fill(copy.invites.sentAt, { at: date(item.sentAt, intl) })}</span>
          <span className="mt-1 block text-[13px] text-ink-700">{item.quantity} · {item.destination}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:justify-end">
          {pending && <span className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${overdue ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
            {overdue ? copy.tasks.overdue : copy.tasks.due}{item.dueAt ? date(item.dueAt, intl) : copy.tasks.dueFallback}
          </span>}
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${item.blocked ? "bg-amber-50 text-amber-900" : "bg-brand-50 text-brand-900"}`}>{item.status}</span>
          {item.newBuyerMessage && <span className="rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-900">{copy.invites.newMessage}</span>}
          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-brand-200 px-3 text-[13px] font-semibold text-brand-800">
            {pending ? copy.tasks.openRequest : copy.invites.openRequest}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>;
  };

  return <div className="mx-auto max-w-5xl">
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{copy.degraded.title}</p>
      <p className="mt-1">{copy.degraded.body}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    {(sp.quote === "sent" || sp.quote === "delivered" || sp.quote === "declined") && /^[A-Za-z0-9-]{1,40}$/.test(sp.code ?? "") &&
      <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
        {fill(sp.quote === "sent" ? copy.quote.sent : sp.quote === "delivered" ? copy.quote.delivered : copy.quote.declined, { code: sp.code! })}
      </div>}
    {sp.quote === "publish_pending" && /^[A-Za-z0-9-]{1,40}$/.test(sp.code ?? "") &&
      <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
        {fill(copy.quote.publishPending, { code: sp.code! })}
      </div>}

    {board.invites.length > 0 && <section aria-label={copy.filters.title} className="mb-5 rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:px-5">
      <form action="/supplier/portal/rfqs" method="get" className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{copy.filters.searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input name="q" type="search" maxLength={120} defaultValue={query} placeholder={copy.filters.searchPlaceholder}
            className="input min-h-11 w-full pl-9" />
        </label>
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        {sp.report === "1" && <input type="hidden" name="report" value="1" />}
        {(sp.range === "7" || sp.range === "90") && <input type="hidden" name="range" value={sp.range} />}
        <button type="submit" className="btn btn-primary min-h-11">{copy.filters.searchButton}</button>
      </form>
      <nav aria-label={copy.filters.statusLabel} className="mt-3 flex flex-wrap gap-2">
        {([
          ["all", copy.filters.all, board.invites.length],
          ["reply", copy.filters.needsReply, board.tasks.length],
          ["quoted", copy.filters.quoted, quoteCount],
          ["closed", copy.filters.closed, closedCount],
        ] as const).map(([key, label, count]) => <Link key={key} href={queryHref({ filter: key === "all" ? null : key, page: null })}
          aria-current={filter === key ? "page" : undefined}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition ${filter === key
            ? "border-brand-700 bg-brand-50 text-brand-900" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50"}`}>
          {label}<span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] tabular-nums">{count}</span>
        </Link>)}
        {(query || filter !== "all") && <Link href={queryHref({ filter: null, q: null, page: null })}
          className="inline-flex min-h-10 items-center px-3 text-[13px] font-semibold text-brand-700 hover:underline">{copy.filters.clear}</Link>}
      </nav>
    </section>}

    {showTasksSection && <section aria-labelledby="rfq-pending" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <header className="border-b border-ink-200 px-4 py-4 sm:px-6">
        <h2 id="rfq-pending" className="flex items-center gap-2 text-lg font-bold text-ink-900">
          {copy.tasks.title}<span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-sm text-amber-900">{visibleTasks.length}</span>
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-600">{copy.tasks.sub}</p>
      </header>
      {visibleTasks.length > 0 ? <ul className="divide-y divide-ink-200">{visibleTasks.map((item) => summaryCard(item, true))}</ul>
        : filter === "all" && !query && board.tasks.length === 0 && !degraded.includes(copy.degraded.labelInvites) ? <EmptyRow>{copy.tasks.empty}</EmptyRow> : null}
    </section>}

    {showHistorySection && <section aria-labelledby="rfq-history" className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-4 sm:px-6">
        <div>
          <h2 id="rfq-history" className="text-base font-bold text-ink-900">{copy.invites.title}</h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-600">{copy.invites.sub}</p>
        </div>

      </header>
      {shownHistory.length > 0 && <ul className="divide-y divide-ink-100">{shownHistory.map((item) => summaryCard(item))}</ul>}
      {historyPageCount > 1 && <nav aria-label={copy.invites.title} className="flex flex-wrap items-center justify-center gap-3 border-t border-ink-200 px-4 py-3 sm:px-6">
        {historyPage > 1 ? <Link href={queryHref({ page: String(historyPage - 1) })}
          className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">{copy.pagination.previous}</Link>
          : <span aria-hidden="true" className="min-h-10 px-3" />}
        <span aria-current="page" className="text-sm font-medium text-ink-600">{fill(copy.pagination.page, { page: historyPage, pages: historyPageCount })}</span>
        {historyPage < historyPageCount ? <Link href={queryHref({ page: String(historyPage + 1) })}
          className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">{copy.pagination.next}</Link>
          : <span aria-hidden="true" className="min-h-10 px-3" />}
      </nav>}
    </section>}
    {board.invites.length > 0 && filtered.length === 0 && <div className="mt-5"><EmptyRow>{copy.filters.noResults}</EmptyRow></div>}

    {board.invites.length > 0 && <details id="rfq-report" open={sp.report === "1"} className="group mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-700 sm:px-6">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />{copy.report.title}
        <ChevronDown className="ml-auto h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="text-[13px] text-ink-600">{copy.report.sub}</p>
          <nav aria-label={copy.report.rangeAria} className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1">
            {([7, 30, 90] as const).map((d) => <Link key={d} href={queryHref({ report: "1", range: String(d) }, "rfq-report")} aria-current={days === d ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-[13px] font-semibold ${days === d ? "bg-white text-brand-800 shadow-sm" : "text-ink-600 hover:text-ink-900"}`}>
              {fill(copy.report.days, { count: d })}
            </Link>)}
          </nav>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4 sm:px-6">
          {([[copy.report.sent, board.report.sent], [copy.report.responded, board.report.responded],
            [copy.report.quoted, board.report.quoted], [copy.report.selected, board.report.selected]] as const).map(([label, value]) =>
            <div key={label} className="rounded-lg bg-ink-50 px-3 py-2.5">
              <p className="text-[13px] text-ink-600">{label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{value}</p>
            </div>)}
        </div>
        {board.report.byProduct.length ? <div className="overflow-x-auto border-t border-ink-200">
          <table className="w-full min-w-[380px] text-left text-sm">
            <thead className="bg-ink-50 text-[13px] font-semibold text-ink-700"><tr><th scope="col" className="px-5 py-2">{copy.report.productHead}</th><th scope="col" className="px-3 py-2 text-right">{copy.report.invitesHead}</th><th scope="col" className="px-5 py-2 text-right">{copy.report.quotedHead}</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{board.report.byProduct.map((row) => <tr key={row.id}>
              <td className="px-5 py-2.5 text-ink-800">{row.name}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{row.sent}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-ink-700">{row.quoted}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyRow>{fill(copy.report.empty, { days })}</EmptyRow>}
        <p className="border-t border-ink-200 px-4 py-3 text-[13px] leading-5 text-ink-600 sm:px-6">{copy.report.footnote}</p>
      </div>
    </details>}
  </div>;
}
