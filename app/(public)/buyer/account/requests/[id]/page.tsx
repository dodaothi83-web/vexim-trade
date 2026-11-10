import { BuyerEnquiryDetail, type BuyerQuote } from "@/components/buyer-enquiry-detail";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";
import { getStore } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { canBuyerOpenRfqMatch, buyerMatchHasNewQuote, buyerMatchHasUpdate, lastPublishedQuote } from "@/lib/rfq/portal-core";
import { rfqChannel } from "@/lib/rfq/channel";

export const dynamic = "force-dynamic";
export const metadata = { title: "My enquiry | Vexim Trade", robots: { index: false, follow: false } };

export default async function BuyerEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id, next: `/buyer/account/requests/${encodeURIComponent(id)}` });
  // Buyer sees only published snapshots. A pending sourcing quote or revision may
  // already exist on rfq_matches; never derive the public price from that draft.
  const store = getStore();
  const locale = await getLocale();
  let quotesUnavailable = false;
  let quotes: BuyerQuote[] = [];
  let preQuoteThreads: Array<Pick<BuyerQuote, "id" | "supplier" | "location" | "href" | "unread">> = [];
  try {
    const [matches, suppliers] = await Promise.all([store.listRfqMatches(rfq.id), store.listSuppliers()]);
    const versions = await store.listRfqQuoteVersions(matches.filter((m) => !!m.sent_to_buyer_at).map((m) => m.id));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
    for (const match of matches) {
      if (!canBuyerOpenRfqMatch(rfq, match)) continue;
      const s = supplierMap.get(match.supplier_id);
      const details = {
        id: match.id, supplier: s?.display_name ?? s?.trade_name ?? s?.name ?? (locale === "vi" ? "Nhà cung cấp" : "Supplier"),
        location: s?.province ?? s?.country ?? null,
        href: `/buyer/account/requests/${encodeURIComponent(rfq.id)}/offers/${encodeURIComponent(match.id)}`,
        unread: buyerMatchHasUpdate(match),
      };
      const offer = lastPublishedQuote(versions, match);
      if (!offer) {
        if (rfqChannel(rfq) === "direct") preQuoteThreads.push(details);
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
  return <BuyerEnquiryDetail rfq={rfq} buyer={buyer} quotes={quotes} preQuoteThreads={preQuoteThreads}
    quotesUnavailable={quotesUnavailable} locale={locale} />;
}
