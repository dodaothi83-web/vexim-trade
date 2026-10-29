import type { PublicQuantityOffer } from "@/lib/products/quantity-public-projection";

/** Buyer-facing detail view for an approved quantity offer. */
export function QuantityPriceTable({ offer }: { offer: PublicQuantityOffer }) {
  const date = offer.confirmedAt ? new Date(offer.confirmedAt) : null;
  const validDate = date && Number.isFinite(date.getTime()) ? date : null;
  const updated = validDate ? new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
  }).format(validDate) : null;
  return <section id="reference-price" className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
      <h2 className="text-sm font-bold text-ink-900">Reference pricing</h2>
      <p className="mt-1 text-xs text-ink-500">Grade {offer.grade} · {offer.incoterm} · MOQ {offer.moq}</p>
    </div>
    {!offer.price ? <p className="px-5 py-4 text-sm font-medium text-ink-500">Price on request</p> : <>
      <div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm">
        <thead className="border-b border-ink-100 bg-ink-50/40 text-[11px] font-bold uppercase tracking-wider text-ink-500">
          <tr><th className="px-5 py-2.5">Quantity from</th><th className="px-4 py-2.5">To</th><th className="px-5 py-2.5">Price</th></tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{offer.tiers.map((tier, index) => <tr key={index}>
          <td className="px-5 py-3 text-ink-800">{tier.from}</td><td className="px-4 py-3 text-ink-800">{tier.to ?? "and above"}</td>
          <td className="whitespace-nowrap px-5 py-3 font-bold tabular-nums tracking-tight text-brand-800">{tier.price}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
        {updated && <p>Price updated {updated}</p>}
        {offer.stale && (offer.daysSinceConfirmed !== null ? <p className="mt-1">Last updated {offer.daysSinceConfirmed} days ago</p> : <p className="mt-1">Confirmation date unavailable</p>)}
      </div>
    </>}
  </section>;
}
