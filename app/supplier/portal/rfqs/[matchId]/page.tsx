import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, MessageCircle, ShieldCheck } from "lucide-react";
import { RfqThread } from "@/components/rfq-thread";
import { RfqMediatedThread } from "@/components/rfq-mediated-thread";
import { getPortalMessages } from "@/lib/i18n/server";
import { buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { supplierOfferAccess } from "@/lib/rfq/portal-access";
import { buyerSupplierThreadMessages, canReadRfqThread, canUseRfqThread, lastPublishedQuote, lastVisibleEventAt } from "@/lib/rfq/portal-core";
import { quotePortalCopy } from "@/lib/rfq/portal-copy";
import { rfqChannel } from "@/lib/rfq/channel";
import { canReadMediatedDesk, canUseMediatedDesk, safeMediatedMessages } from "@/lib/rfq/mediated";
import { QUOTE_CURRENCIES, QUOTE_INCOTERMS } from "@/lib/supplier-portal/quote";
import { RequestDetails } from "../request-details";
import { SupplierQuoteForm } from "../quote-form";
import { supplierRfqMessageAction, supplierRfqReadAction, supplierVeximMessageAction, supplierVeximReadAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "RFQ & conversation | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierOfferPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const { supplier, store, rfq, match } = await supplierOfferAccess(matchId);
  const { locale, intl, m } = await getPortalMessages();
  const copy = quotePortalCopy[locale];
  const sourcing = rfqChannel(rfq) === "sourcing";
  // Reuse the supplier-safe projection used on the RFQ board: no access token, CRM notes,
  // foreign product media, unconsented contact or buyer's private target price.
  const [invitations, products, versions] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id), store.listProductsBySupplier(supplier.id),
    store.listRfqQuoteVersions([match.id]),
  ]);
  const item = buildSupplierRfqBoard({ supplierId: supplier.id, invites: invitations.filter((r) => r.id === match.id),
    products, days: 30, language: locale }).invites[0];
  if (!item) return null; // An invitation withdrawn between the access check and projection.
  const quote = lastPublishedQuote(versions, match);
  const readable = canReadRfqThread(rfq, match);
  const messages = readable ? buyerSupplierThreadMessages(await store.listRfqThreadMessages(match.id)) : [];
  const lastVisibleAt = lastVisibleEventAt(null, messages);
  const deskReadable = sourcing && canReadMediatedDesk(rfq, match);
  const deskMessages = deskReadable ? safeMediatedMessages(await store.listRfqMediatedMessages(match.id)) : [];
  const date = (value: string) => new Intl.DateTimeFormat(intl, {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
  const canPost = canUseRfqThread(rfq, match);
  return <div lang={locale} className="mx-auto max-w-6xl">
    <Link href="/supplier/portal/rfqs" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.backToRfqs}</Link>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{copy.supplierIntro} · {rfq.code}</p>
        <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{item.productId ? item.title : item.request.description.slice(0, 120)}</h1>
      </div>
      <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${item.blocked ? "bg-amber-50 text-amber-900" : "bg-brand-50 text-brand-800"}`}>{item.status}</span>
    </div>
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-ink-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <RequestDetails item={item} copy={m.rfqs.request} className="" />
          {item.productId && <Link href={`/supplier/portal/products/${encodeURIComponent(item.productId)}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">{m.rfqs.product.view}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
        </section>
        <section aria-label={copy.offersTitle} className="rounded-2xl border border-ink-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-[15px] font-bold text-ink-900">{copy.offersTitle}</h2>
              <p className="mt-1 text-[13px] text-ink-600">{quote ? `${copy.published} · ${copy.version} ${quote.version} · ${date(quote.published_at)}` : copy.noQuote}</p></div>
            {quote && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-800">{copy.published}</span>}
          </div>
          {quote && <div className="mt-4 rounded-xl bg-brand-50/70 px-4 py-3">
            <p className="break-words text-xl font-extrabold text-brand-900">{quote.quote_price} {quote.quote_currency} / {quote.quote_unit}</p>
            <p className="mt-1 text-[12.5px] text-ink-700">{quote.quote_incoterm || "—"} · {quote.quote_lead_time_days ? `${quote.quote_lead_time_days} ${copy.days}` : "—"}</p>
            {quote.buyer_note && <p className="mt-2 whitespace-pre-wrap break-words border-t border-brand-100 pt-2 text-[13px] text-ink-800">{quote.buyer_note}</p>}
          </div>}
          {match.status === "quoted" && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{quote ? copy.pendingRevision : sourcing ? copy.pendingInitialSourcing : copy.pendingInitialDirect}</p>}
          {item.canQuote && <div className="mt-5 border-t border-ink-100 pt-5">
            <p className="mb-3 text-[13px] text-ink-600">{quote ? (item.directToBuyer ? copy.reviseHint : copy.pendingHint) : m.rfqs.quote.intro}</p>
            <SupplierQuoteForm matchId={match.id} code={rfq.code} defaults={item.quoteDefaults}
              currencies={QUOTE_CURRENCIES} incoterms={QUOTE_INCOTERMS} editing={!!item.quotePrice} direct={item.directToBuyer} copy={m.rfqs.quote} />
          </div>}
          {versions.length > 1 && <details className="mt-4 rounded-lg border border-ink-200 px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-brand-700">{copy.pastVersions} ({versions.length - 1})</summary>
            <ol className="mt-2 space-y-2 border-t border-ink-100 pt-2">{versions.filter((v) => v.id !== quote?.id).sort((a, b) => b.version - a.version).map((v) =>
              <li key={v.id}>{copy.version} {v.version} · {v.quote_price} {v.quote_currency}/{v.quote_unit} · {date(v.published_at)}</li>)}</ol>
          </details>}
        </section>
        {sourcing ? <>
          {deskReadable ? <RfqMediatedThread rfqId={rfq.id} matchId={match.id} side="supplier" messages={deskMessages}
            lastVisibleAt={deskMessages.at(-1)?.created_at ?? null} canPost={canUseMediatedDesk(rfq, match)} locale={locale}
            sendAction={supplierVeximMessageAction} markRead={supplierVeximReadAction.bind(null, match.id)} />
            : <p className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-[13px] text-ink-700">{copy.noConsent}</p>}
          {readable && messages.length > 0 && <div><p className="mb-3 text-[13px] font-semibold text-ink-600">{locale === "vi" ? "Lịch sử trao đổi trực tiếp trước đây (chỉ đọc)" : "Previous direct conversation (read-only archive)"}</p>
            <RfqThread rfqId={rfq.id} matchId={match.id} side="supplier" messages={messages} lastVisibleAt={lastVisibleAt}
              canPost={false} sourcingArchive locale={locale} copy={copy} sendAction={supplierRfqMessageAction}
              markRead={supplierRfqReadAction.bind(null, match.id)} /></div>}
        </> : readable ? <RfqThread rfqId={rfq.id} matchId={match.id} side="supplier" messages={messages} lastVisibleAt={lastVisibleAt}
          canPost={canPost} locale={locale} copy={copy} sendAction={supplierRfqMessageAction}
          markRead={supplierRfqReadAction.bind(null, match.id)} />
          : <div className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-ink-50 p-5 text-[13px] leading-6 text-ink-700"><MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />{copy.noConsent}</div>}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24">
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-600">{m.rfqs.buyer.title}</h2>
          {!sourcing && item.buyerContact ? <dl className="mt-3 space-y-3 text-[13px]">
            <div><dt className="text-ink-500">{m.rfqs.buyer.company}</dt><dd className="break-words font-semibold text-ink-900">{item.buyerContact.company}</dd></div>
            <div><dt className="text-ink-500">{m.rfqs.buyer.name}</dt><dd className="break-words font-semibold text-ink-900">{item.buyerContact.contact_name || "—"}</dd></div>
            <div><dt className="text-ink-500">{m.rfqs.buyer.email}</dt><dd className="break-all font-semibold text-ink-900">{item.buyerContact.email}</dd></div>
            <p className="border-t border-ink-100 pt-3 text-[12px] leading-5 text-ink-500">{m.rfqs.buyer.scope}</p>
          </dl> : <p className="mt-3 text-[13px] leading-6 text-ink-600">{sourcing ? (locale === "vi" ? "Vexim điều phối yêu cầu này. Liên hệ người mua không được chia sẻ; hãy trao đổi với Vexim trong cổng." : "Vexim coordinates this request. Buyer contact is not shared; use the Vexim conversation in your portal.") : m.rfqs.buyer.unavailableDirect}</p>}
        </section>
        {item.dueAt && <p className="flex items-start gap-2 rounded-xl bg-ink-50 p-4 text-[12px] text-ink-700"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />{m.rfqs.tasks.due} {date(item.dueAt)}</p>}
        <p className="flex items-start gap-2 rounded-xl bg-ink-50 p-4 text-[12px] leading-5 text-ink-600"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.emailFallback}</p>
      </aside>
    </div>
  </div>;
}
