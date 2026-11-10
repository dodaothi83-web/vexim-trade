import { BuyerEnquiryDetail, type BuyerQuote } from "@/components/buyer-enquiry-detail";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";
import { getStore } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { canBuyerOpenRfqMatch, buyerDirectOutcome, buyerMatchHasNewQuote, buyerMatchHasUpdate, lastPublishedQuote } from "@/lib/rfq/portal-core";
import { rfqChannel } from "@/lib/rfq/channel";
import { RfqMediatedThread } from "@/components/rfq-mediated-thread";
import { canUseMediatedDesk, safeMediatedMessages } from "@/lib/rfq/mediated";
import { buyerVeximMessageAction, buyerVeximReadAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My enquiry | Vexim Trade", robots: { index: false, follow: false } };

export default async function BuyerEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id, next: `/buyer/account/requests/${encodeURIComponent(id)}` });
  // Buyer sees only published snapshots. A pending sourcing quote or revision may
  // already exist on rfq_matches; never derive the public price from that draft.
  const store = getStore();
  const locale = await getLocale();
  const sourcing = rfqChannel(rfq) === "sourcing";
  let quotesUnavailable = false;
  let quotes: BuyerQuote[] = [];
  let preQuoteThreads: Array<Pick<BuyerQuote, "id" | "supplier" | "location" | "href" | "unread"> & { noReply?: boolean }> = [];
  // Direct only: named suppliers who declined, and whether nobody is left to quote.
  const declined: Array<{ id: string; supplier: string }> = [];
  let directOutcome: "declined" | "no_response" | null = null;
  try {
    const [matches, suppliers] = await Promise.all([store.listRfqMatches(rfq.id), store.listSuppliers()]);
    const versions = await store.listRfqQuoteVersions(matches.filter((m) => !!m.sent_to_buyer_at).map((m) => m.id));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
    const named = new Set(rfq.preferred_supplier_ids ?? []);
    const direct = rfqChannel(rfq) === "direct";
    // Only suppliers the buyer named: a legacy staff-added match is not theirs to see.
    if (direct) directOutcome = buyerDirectOutcome(matches.filter((m) => named.has(m.supplier_id)));
    for (const match of matches) {
      const s = supplierMap.get(match.supplier_id);
      const supplierName = s?.display_name ?? s?.trade_name ?? s?.name ?? (locale === "vi" ? "Nhà cung cấp" : "Supplier");
      if (direct && named.has(match.supplier_id) && match.status === "declined" && !!match.sent_to_supplier_at && !match.sent_to_buyer_at) {
        declined.push({ id: match.id, supplier: supplierName });
        continue;
      }
      if (!canBuyerOpenRfqMatch(rfq, match)) continue;
      const details = {
        id: match.id, supplier: supplierName,
        location: s?.province ?? s?.country ?? null,
        href: `/buyer/account/requests/${encodeURIComponent(rfq.id)}/offers/${encodeURIComponent(match.id)}`,
        unread: sourcing ? buyerMatchHasNewQuote(match) : buyerMatchHasUpdate(match),
      };
      const offer = lastPublishedQuote(versions, match);
      if (!offer) {
        if (direct) preQuoteThreads.push({ ...details, noReply: match.status === "no_response" });
        continue;
      }
      quotes.push({ ...details, newQuote: buyerMatchHasNewQuote(match), version: offer.version, note: offer.buyer_note,
        price: `${offer.quote_price} ${offer.quote_currency} / ${offer.quote_unit}`,
        incoterm: offer.quote_incoterm, leadTimeDays: offer.quote_lead_time_days,
        validUntil: offer.quote_valid_until ? offer.quote_valid_until.slice(0, 10) : null });
    }
  } catch (error) {
    console.error("[buyer] quotes unavailable", error);
    quotesUnavailable = true;
  }
  let mediatedThread: React.ReactNode = null;
  if (sourcing) {
    try {
      const messages = safeMediatedMessages(await store.listRfqMediatedMessages(rfq.id));
      mediatedThread = <RfqMediatedThread rfqId={rfq.id} side="buyer" messages={messages}
        lastVisibleAt={messages.at(-1)?.created_at ?? null} canPost={canUseMediatedDesk(rfq, null)} locale={locale}
        sendAction={buyerVeximMessageAction} markRead={buyerVeximReadAction.bind(null, rfq.id)} />;
    } catch (error) {
      console.error("[buyer] Vexim desk unavailable", error);
      mediatedThread = <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {locale === "vi" ? "Tạm thời chưa mở được trao đổi với Vexim. Vui lòng thử lại sau." : "The Vexim conversation is temporarily unavailable. Please try again later."}</p>;
    }
  }
  return <BuyerEnquiryDetail rfq={rfq} buyer={buyer} quotes={quotes} preQuoteThreads={preQuoteThreads}
    declined={declined} directOutcome={directOutcome}
    quotesUnavailable={quotesUnavailable} locale={locale} mediatedThread={mediatedThread} />;
}
