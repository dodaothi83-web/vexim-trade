import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, ImageIcon, MessageCircle, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard, type PortalInvite } from "@/lib/supplier-portal/dashboard";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { EmptyRow, date } from "../portal-ui";
import { QUOTE_CURRENCIES, QUOTE_INCOTERMS } from "@/lib/supplier-portal/quote";
import { SupplierQuoteForm } from "./quote-form";
import { RequestDetails } from "./request-details";
import { privateMediaUrl, supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import type { MediaAsset } from "@/lib/types";
import type { RfqBuyerContact } from "@/lib/rfq/buyer-contact";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";

/** Current catalog context, only for a source product belonging to this invited supplier. */
function ProductCard({ item, imageSrc, copy }: {
  item: PortalInvite; imageSrc: string | null; copy: RfqsMessages["product"];
}) {
  if (!item.productId || !item.linkedProduct) return null;
  const facts: Array<[string, string | null]> = [
    [copy.spec, item.linkedProduct.spec], [copy.packaging, item.linkedProduct.packaging],
    [copy.moq, item.linkedProduct.moq],
  ];
  return <section aria-label={copy.title} className="mb-4 rounded-xl border border-ink-200 bg-ink-50/70 p-4">
    <p className="text-[13px] font-bold text-ink-700">{copy.title}</p>
    <div className="mt-3 flex min-w-0 items-start gap-3 sm:gap-4">
      <div className="flex size-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white sm:size-24">
        {imageSrc ? <>
          {/* Private media is served with the supplier's session; it must not be optimized without its auth cookie. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="" loading="lazy" className="size-full object-cover" />
        </> : <ImageIcon className="size-6 text-ink-400" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-[15px] font-bold leading-snug text-ink-900">{item.title}</h3>
        {facts.some(([, value]) => !!value) && <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5">
          {facts.filter(([, value]) => !!value).map(([label, value]) => <div key={label} className="line-clamp-2 min-w-0 break-words">
            <dt className="inline text-ink-600">{label}: </dt><dd className="inline font-semibold text-ink-800">{value}</dd>
          </div>)}
        </dl>}
        <Link href={`/supplier/portal/products/${encodeURIComponent(item.productId)}`}
          className="mt-2 inline-block text-[13px] font-semibold text-brand-700 hover:underline">{copy.view}</Link>
      </div>
    </div>
    <p className="mt-3 border-t border-ink-200 pt-2 text-[12.5px] leading-5 text-ink-600">{copy.note}</p>
  </section>;
}

/** A private snapshot is shown only when this particular RFQ authorized this supplier. */
function BuyerContactDetails({ contact, viaVexim, copy }: { contact: RfqBuyerContact | null; viaVexim: boolean; copy: RfqsMessages["buyer"] }) {
  if (!contact) return viaVexim ? <p className="mt-3 text-[13px] leading-5 text-ink-600">{copy.unavailable}</p>
    : <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">{copy.unavailableDirect}</p>;
  const fields: Array<[string, string | null]> = [
    [copy.company, contact.company], [copy.name, contact.contact_name],
    [copy.email, contact.email], [copy.phone, contact.phone],
    [copy.country, contact.country], [copy.website, contact.website],
    [copy.type, contact.business_type],
  ];
  return <details className="group mt-3 rounded-lg border border-ink-200 bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-brand-800">
      {copy.title}<ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-ink-100 px-4 py-3">
      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {fields.filter(([, value]) => !!value).map(([label, value]) => <div key={label} className="min-w-0 text-sm">
          <dt className="text-ink-600">{label}</dt><dd className="break-words font-semibold text-ink-900">{value}</dd>
        </div>)}
      </dl>
      <p className="mt-3 text-[13px] text-ink-600">{copy.scope}</p>
    </div>
  </details>;
}

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.rfqs.metaTitle, robots: { index: false, follow: false } };
}

/** One place to read a buyer request and answer it; the same invitation is never shown twice. */
export default async function SupplierRfqPage({ searchParams }: {
  searchParams: Promise<{ range?: string; all?: string; report?: string; quote?: string; code?: string }>;
}) {
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
  const mediatedThreads = await optional(copy.degraded.labelMediated, [] as Awaited<ReturnType<typeof store.listRfqMediatedThreads>>,
    () => store.listRfqMediatedThreads([...new Set(invites.map((invite) => invite.rfq_id))]));
  const board = buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days, language: locale, mediatedThreads });
  const pendingIds = new Set(board.tasks.map((task) => task.matchId));
  const history = board.invites.filter((item) => !pendingIds.has(item.matchId));
  const shownHistory = showAll ? history : history.slice(0, 30);
  // Fetch photos for visible, verified source products only. Never infer a product from RFQ text.
  const productIds = [...new Set([...board.tasks, ...shownHistory]
    .map((item) => item.productId).filter((id): id is string => !!id))];
  const media = productIds.length ? await optional(copy.degraded.labelMedia, [] as MediaAsset[],
    () => store.listMediaForProducts(productIds)) : [];
  const productMap = new Map(products.filter((p) => p.supplier_id === supplier.id).map((p) => [p.id, p]));
  const images = supplierVisibleProductMedia(media, supplier.id, access.user.id)
    .filter((asset) => asset.product_id && productMap.has(asset.product_id) && productIds.includes(asset.product_id) &&
      asset.kind === "image" && asset.audience === "buyer");
  const imageByProduct = new Map<string, string>();
  for (const productId of productIds) {
    const candidates = images.filter((asset) => asset.product_id === productId);
    const featured = candidates.find((asset) => asset.id === productMap.get(productId)?.featured_media_id && privateMediaUrl(asset));
    const selected = featured ?? candidates.find((asset) => privateMediaUrl(asset));
    const url = selected && privateMediaUrl(selected);
    if (url) imageByProduct.set(productId, url);
  }

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

    <section aria-labelledby="rfq-pending" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <header className="border-b border-ink-200 px-4 py-4 sm:px-6">
        <h2 id="rfq-pending" className="flex items-center gap-2 text-lg font-bold text-ink-900">
          {copy.tasks.title}<span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-sm text-amber-900">{board.tasks.length}</span>
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-600">{copy.tasks.sub}</p>
      </header>
      {board.tasks.length ? <ul className="divide-y divide-ink-200">
        {board.tasks.map((task) => {
          const overdue = !!task.dueAt && Date.parse(task.dueAt) < Date.now();
          return <li key={task.matchId} className="px-4 py-5 sm:px-6 sm:py-6">
            <article>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-[13px] font-semibold text-ink-600">{task.code}</p>
                <p className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${overdue ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
                  {overdue ? copy.tasks.overdue : copy.tasks.due}{task.dueAt ? date(task.dueAt, intl) : copy.tasks.dueFallback}
                </p>
              </div>
              <ProductCard item={task} imageSrc={task.productId ? imageByProduct.get(task.productId) ?? null : null} copy={copy.product} />
              <RequestDetails item={task} copy={copy.request} />
              <BuyerContactDetails contact={task.buyerContact} viaVexim={task.viaVexim} copy={copy.buyer} />
              <div className="mt-5">
                <p className="mb-2 text-sm text-ink-700">{task.directToBuyer ? copy.tasks.primaryHintDirect : copy.tasks.primaryHint}</p>
                <SupplierQuoteForm matchId={task.matchId} code={task.code} defaults={task.quoteDefaults}
                  currencies={QUOTE_CURRENCIES} incoterms={QUOTE_INCOTERMS} editing={false} direct={task.directToBuyer} copy={copy.quote} />
                <Link href={`/supplier/portal/rfqs/${encodeURIComponent(task.matchId)}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 text-[13px] font-semibold text-brand-800 hover:border-brand-400 hover:bg-brand-50">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />{copy.tasks.conversation}
                  {task.newBuyerMessage && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">{copy.tasks.newMessage}</span>}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

            </article>
          </li>;
        })}
      </ul> : !degraded.includes(copy.degraded.labelInvites) && <EmptyRow>{copy.tasks.empty}</EmptyRow>}
    </section>

    {history.length > 0 && <section aria-labelledby="rfq-history" className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-4 sm:px-6">
        <div>
          <h2 id="rfq-history" className="text-base font-bold text-ink-900">{copy.invites.title} ({history.length})</h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-600">{copy.invites.sub}</p>
        </div>
        {history.length > 30 && !showAll && <Link href="/supplier/portal/rfqs?all=1#rfq-history" className="text-sm font-semibold text-brand-700 hover:underline">{copy.invites.viewAll}</Link>}
      </header>
      <ul className="divide-y divide-ink-100">{shownHistory.map((item) => <li key={item.matchId}>
        <details className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 hover:bg-ink-50 sm:px-6">
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-ink-900">{item.productId ? item.title : item.request.description.slice(0, 110)}</span>
              <span className="mt-1 block text-[13px] text-ink-600">{item.code} · {fill(copy.invites.sentAt, { at: date(item.sentAt, intl) })}</span>
            </span>
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${item.blocked ? "bg-amber-50 text-amber-900" : "bg-brand-50 text-brand-900"}`}>{item.status}</span>
            {item.newBuyerMessage && <span className="rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-900">{copy.invites.newMessage}</span>}
            <ChevronDown className="h-4 w-4 text-ink-500 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-ink-100 px-4 py-5 sm:px-6">
            <ProductCard item={item} imageSrc={item.productId ? imageByProduct.get(item.productId) ?? null : null} copy={copy.product} />
            <RequestDetails item={item} copy={copy.request} />
            <BuyerContactDetails contact={item.buyerContact} viaVexim={item.viaVexim} copy={copy.buyer} />
            {item.quotePrice && <p className="mt-3 text-sm font-semibold text-ink-800">{fill(copy.invites.quoteRecorded, { value: item.quotePrice })}</p>}
            {item.repliedAt && <p className="mt-2 text-[13px] text-ink-600">{fill(copy.invites.replied, { at: date(item.repliedAt, intl) })}</p>}
            <Link href={`/supplier/portal/rfqs/${encodeURIComponent(item.matchId)}`} className="mt-3 inline-flex min-h-10 items-center gap-2 text-[13px] font-semibold text-brand-700 hover:underline">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />{copy.invites.conversation}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {item.canQuote && <div className="mt-4"><SupplierQuoteForm matchId={item.matchId} code={item.code} defaults={item.quoteDefaults}
              currencies={QUOTE_CURRENCIES} incoterms={QUOTE_INCOTERMS} editing={!!item.quotePrice} direct={item.directToBuyer} copy={copy.quote} /></div>}
          </div>
        </details>
      </li>)}</ul>
    </section>}

    {board.invites.length > 0 && <details id="rfq-report" open={sp.report === "1"} className="group mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-700 sm:px-6">
        <TrendingUp className="h-4 w-4" aria-hidden="true" />{copy.report.title}
        <ChevronDown className="ml-auto h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="text-[13px] text-ink-600">{copy.report.sub}</p>
          <nav aria-label={copy.report.rangeAria} className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1">
            {([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal/rfqs?report=1&range=${d}#rfq-report`} aria-current={days === d ? "page" : undefined}
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
