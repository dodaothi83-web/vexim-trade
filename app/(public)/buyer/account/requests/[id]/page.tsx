import { BuyerEnquiryDetail, type BuyerQuote } from "@/components/buyer-enquiry-detail";
import { requireOwnedBuyerEnquiry } from "@/lib/buyer/enquiry-access";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "My enquiry | Vexim Trade", robots: { index: false, follow: false } };

export default async function BuyerEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rfq, buyer } = await requireOwnedBuyerEnquiry({ id, next: `/buyer/account/requests/${encodeURIComponent(id)}` });
  // Chỉ báo giá đã thực sự gửi tới người mua (có sent_to_buyer_at); lỗi đọc không làm hỏng trang.
  const store = getStore();
  const quotes: BuyerQuote[] = await Promise.all([store.listRfqMatches(rfq.id), store.listSuppliers()])
    .then(([matches, suppliers]) => {
      const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
      return matches.filter((m) => m.sent_to_buyer_at && m.quote_price != null).map((m) => {
        const s = supplierMap.get(m.supplier_id);
        return {
          id: m.id,
          supplier: s?.display_name ?? s?.trade_name ?? s?.name ?? "Supplier",
          location: s?.province ?? s?.country ?? null,
          price: `${m.quote_price} ${m.quote_currency ?? ""}${m.quote_unit ? ` / ${m.quote_unit}` : ""}`.trim(),
          incoterm: m.quote_incoterm,
          leadTimeDays: m.quote_lead_time_days,
          validUntil: m.quote_valid_until ? m.quote_valid_until.slice(0, 10) : null,
        };
      });
    })
    .catch((error) => { console.error("[buyer] quotes unavailable", error); return []; });
  return <BuyerEnquiryDetail rfq={rfq} buyer={buyer} quotes={quotes} />;
}
