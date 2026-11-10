import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui";
import { RfqThread, RfqReadTracker } from "@/components/rfq-thread";
import { getLocale } from "@/lib/i18n/server";
import { buyerOfferAccess } from "@/lib/rfq/portal-access";
import { buyerSupplierThreadMessages, canReadRfqThread, canUseRfqThread, lastPublishedQuote, lastVisibleEventAt } from "@/lib/rfq/portal-core";
import { quotePortalCopy } from "@/lib/rfq/portal-copy";
import { rfqChannel } from "@/lib/rfq/channel";
import type { RfqQuoteVersion } from "@/lib/types";
import { buyerRfqMessageAction, buyerRfqReadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quote & conversation | Vexim Trade", robots: { index: false, follow: false } };

export default async function BuyerOfferPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  const { store, rfq, match, supplier } = await buyerOfferAccess(id, matchId);
  const locale = await getLocale();
  const copy = quotePortalCopy[locale];
  const sourcing = rfqChannel(rfq) === "sourcing";
  const versions = await store.listRfqQuoteVersions([match.id]);
  const quote = lastPublishedQuote(versions, match);
  const readable = canReadRfqThread(rfq, match);
  const messages = readable ? buyerSupplierThreadMessages(await store.listRfqThreadMessages(match.id)) : [];
  const lastVisibleAt = lastVisibleEventAt(quote, messages);
  const markRead = buyerRfqReadAction.bind(null, rfq.id, match.id);
  const supplierName = supplier?.display_name ?? supplier?.trade_name ?? supplier?.name ?? (locale === "vi" ? "Nhà cung cấp" : "Supplier");
  const requestUrl = `/buyer/account/requests/${encodeURIComponent(rfq.id)}`;
  const date = (value: string) => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
  const amount = (offer: RfqQuoteVersion) => `${new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", { maximumFractionDigits: 4 }).format(offer.quote_price)} ${offer.quote_currency} / ${offer.quote_unit}`;
  const older = versions.filter((v) => v.match_id === match.id && v.id !== quote?.id).sort((a, b) => b.version - a.version);
  return <div lang={locale} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
    <Breadcrumbs items={[{ label: sourcing ? (locale === "vi" ? "Báo giá từ Vexim" : "Quotes from Vexim") : (locale === "vi" ? "Yêu cầu trực tiếp" : "Direct enquiries"), href: sourcing ? "/buyer/account?tab=vexim" : "/buyer/account?tab=requests" },
      { label: rfq.code, href: requestUrl }, { label: supplierName }]} />
    <Link href={requestUrl} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.backToRequest}</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{sourcing ? (locale === "vi" ? "Báo giá từ Vexim · Nhà cung cấp" : "Quote from Vexim · Supplier") : copy.buyerIntro} · {rfq.code}</p>
        <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{supplierName}</h1>
        {supplier?.province && <p className="mt-1 text-sm text-ink-600">{supplier.province}</p>}
      </div>
      <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${quote ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
        {quote ? `${copy.published} · ${copy.version} ${quote.version}` : copy.noQuote}
      </span>
    </div>
    <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 space-y-5">
        <section aria-label={copy.offersTitle} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-100 px-5 py-4 sm:px-6"><h2 className="text-[15px] font-bold text-ink-900">{copy.offersTitle}</h2></div>
          {quote ? <div className="px-5 py-5 sm:px-6">
            {match.status === "quoted" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{copy.pendingRevision}</p>}
            <p className="text-[12px] font-semibold text-ink-500">{copy.version} {quote.version} · {date(quote.published_at)}</p>
            <p className="mt-1 break-words text-[27px] font-extrabold leading-tight tracking-tight text-brand-900 sm:text-[32px]">{amount(quote)}</p>
            <dl className="mt-5 grid gap-3 border-t border-ink-100 pt-4 text-[13px] sm:grid-cols-3">
              <div><dt className="text-ink-500">{copy.shipping}</dt><dd className="mt-1 font-semibold text-ink-900">{quote.quote_incoterm || "—"}</dd></div>
              <div><dt className="text-ink-500">{copy.delivery}</dt><dd className="mt-1 font-semibold text-ink-900">{quote.quote_lead_time_days ? `${quote.quote_lead_time_days} ${copy.days}` : "—"}</dd></div>
              <div><dt className="text-ink-500">{copy.validUntil}</dt><dd className="mt-1 font-semibold text-ink-900">{quote.quote_valid_until ? date(quote.quote_valid_until) : "—"}</dd></div>
            </dl>
            {quote.buyer_note && <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4"><h3 className="text-[13px] font-bold text-brand-900">{copy.terms}</h3><p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-6 text-ink-800">{quote.buyer_note}</p></div>}
            {!!older.length && <details className="group mt-5 rounded-xl border border-ink-200 px-4 py-3">
              <summary className="cursor-pointer text-[13px] font-semibold text-brand-700">{copy.pastVersions} ({older.length})</summary>
              <ol className="mt-3 space-y-3 border-t border-ink-100 pt-3">{older.map((old) => <li key={old.id} className="rounded-lg bg-ink-50 p-3 text-[13px]">
                <p className="font-semibold text-ink-900">{copy.version} {old.version} · {amount(old)}</p>
                <p className="mt-1 text-ink-600">{date(old.published_at)} · {old.quote_incoterm || "—"} · {old.quote_lead_time_days ? `${old.quote_lead_time_days} ${copy.days}` : "—"}</p>
                {old.buyer_note && <p className="mt-1 whitespace-pre-wrap break-words text-ink-700">{old.buyer_note}</p>}
              </li>)}</ol>
            </details>}
            <p className="mt-4 flex items-start gap-2 text-[12px] leading-5 text-ink-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{copy.quoteProtected}</p>
          </div> : <div className="px-5 py-6 sm:px-6"><p className="text-sm text-ink-700">{copy.noQuote}</p><p className="mt-2 text-[13px] leading-6 text-ink-600">{copy.pendingDirect}</p></div>}
        </section>
        {sourcing && <Link href={`${requestUrl}#vexim-conversation`} className="block rounded-xl border border-brand-200 bg-brand-50 p-4 text-[13px] font-semibold leading-6 text-brand-900 hover:border-brand-400">
          {locale === "vi" ? "Trao đổi về tất cả báo giá trong nhóm này với Vexim. Nhà cung cấp không thấy tin nhắn bạn gửi Vexim." : "Discuss all quotes in this group with Vexim. Suppliers cannot read messages you send to Vexim."} <ArrowRight className="inline h-4 w-4" aria-hidden="true" />
        </Link>}
        {readable ? <div>{sourcing && <p className="mb-3 text-[13px] font-semibold text-ink-600">{locale === "vi" ? "Lịch sử trao đổi trực tiếp trước đây (chỉ đọc)" : "Previous direct conversation (read-only archive)"}</p>}
          <RfqThread rfqId={rfq.id} matchId={match.id} side="buyer" messages={messages} lastVisibleAt={lastVisibleAt}
            canPost={canUseRfqThread(rfq, match)} locale={locale} copy={copy} sendAction={buyerRfqMessageAction} markRead={markRead} /></div>
          : <RfqReadTracker at={lastVisibleAt} markRead={markRead} />}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24">
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-600">{copy.requestDetails}</h2>
          <p className="mt-3 break-words text-[14px] font-semibold leading-6 text-ink-900">{rfq.product_text}</p>
          <dl className="mt-4 space-y-3 border-t border-ink-100 pt-4 text-[13px]">
            {rfq.quantity && rfq.unit && <div><dt className="text-ink-500">{copy.quantity}</dt><dd className="font-semibold text-ink-900">{rfq.quantity} {rfq.unit}</dd></div>}
            {rfq.destination_country && <div><dt className="text-ink-500">{copy.destination}</dt><dd className="font-semibold text-ink-900">{rfq.destination_country}</dd></div>}
          </dl>
          <Link href={requestUrl} className="mt-5 inline-flex min-h-10 items-center gap-1 text-[13px] font-bold text-brand-700 hover:underline">{copy.backToRequest}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>
        <p className="flex items-start gap-2 rounded-xl bg-ink-50 p-4 text-[12px] leading-5 text-ink-600"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{copy.emailFallback}</p>
      </aside>
    </div>
  </div>;
}
