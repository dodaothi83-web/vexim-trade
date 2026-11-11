import Link from "next/link";

import { rfqsMessages } from "@/lib/i18n/portal/rfqs";
import { leadRatingSerious } from "@/lib/rfq/lead-rating";
import type { RfqLeadRating, RfqLeadRatingLevel } from "@/lib/types";

// CRM is Vietnamese-only; reuse the wording the supplier chose from.
const copy = rfqsMessages.vi.leadRating;
const LEVEL: Record<RfqLeadRatingLevel, string> = { good: copy.good, normal: copy.normal, poor: copy.poor };

function tone(rating: RfqLeadRating) {
  if (rating.rating === "good") return "bg-emerald-50 text-emerald-800";
  if (rating.rating === "normal") return "bg-ink-100 text-ink-700";
  return leadRatingSerious(rating) ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900";
}

/** "Tốt 2 · Bình thường 1 · Kém 1 (từ 1 nhà cung cấp)". Counts only: there is deliberately
 * no score, and the number of distinct suppliers matters more than the number of ratings. */
export function leadRatingSummary(ratings: RfqLeadRating[]): string {
  const count = (level: RfqLeadRatingLevel) => ratings.filter((r) => r.rating === level).length;
  const poorSuppliers = new Set(ratings.filter((r) => r.rating === "poor").map((r) => r.supplier_id)).size;
  return [`${LEVEL.good} ${count("good")}`, `${LEVEL.normal} ${count("normal")}`,
    `${LEVEL.poor} ${count("poor")}${poorSuppliers ? ` (từ ${poorSuppliers} nhà cung cấp)` : ""}`].join(" · ");
}

/** Staff-only. Never render this in a buyer or supplier route. */
export function LeadRatingList({ ratings, supplierNames, rfqCodes }: {
  ratings: RfqLeadRating[];
  supplierNames: Map<string, string>;
  /** Buyer page: link each rating to its RFQ. Omit on the RFQ page itself. */
  rfqCodes?: Map<string, string>;
}) {
  return <ul className="space-y-2">
    {ratings.map((rating) => <li key={rating.id} className="rounded-md border border-ink-100 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/crm/suppliers/${rating.supplier_id}`} className="min-w-0 break-words text-[12.5px] font-semibold text-ink-800 hover:underline">
          {supplierNames.get(rating.supplier_id) ?? "Nhà cung cấp"}
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${tone(rating)}`}>{LEVEL[rating.rating]}</span>
      </div>
      {rating.reasons.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] leading-5 text-ink-700">
        {rating.reasons.map((reason) => <li key={reason}>{copy.reasons[reason] ?? reason}</li>)}
      </ul>}
      {rating.note && <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-ink-700">“{rating.note}”</p>}
      <p className="mt-1.5 text-[11px] text-ink-500">
        {new Date(rating.updated_at).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" })}
        {rfqCodes && <> · <Link href={`/crm/rfqs/${rating.rfq_id}`} className="font-semibold text-brand-700 hover:underline">{rfqCodes.get(rating.rfq_id) ?? "RFQ"}</Link></>}
      </p>
    </li>)}
  </ul>;
}

export const LEAD_RATING_STAFF_NOTE = "Nội bộ: người mua không thấy các đánh giá này. Đây là ý kiến của nhà cung cấp, chưa phải kết luận. Hãy đối chiếu trước khi xử lý.";
