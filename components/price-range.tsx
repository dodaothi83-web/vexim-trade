import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { PriceRangeOutcome } from "@/lib/public/price-range";
import { formatPriceDate } from "@/lib/public/price-range";
import { formatUnitRange, PRICE_UNIT_LABEL } from "@/lib/public/price-units";

/**
 * Khoảng giá tham khảo trên trang danh mục.
 *
 * Đặt ngay dưới phần giới thiệu vì đó là câu buyer hỏi trước tiên, và vì nó chỉ
 * chiếm một dải cao vài dòng, không đẩy danh sách nhà cung cấp xuống.
 *
 * Ba trạng thái, không có trạng thái thứ tư:
 *   - đủ mẫu: hiện khoảng giá kèm số niêm yết và ngày cập nhật;
 *   - thiếu mẫu: ẩn số, nói rõ vì sao, mời gửi yêu cầu;
 *   - không có mẫu nào dùng được: không render gì.
 */
export function PriceRangeStrip({
  outcome,
  categoryName,
  rfqHref,
}: {
  outcome: PriceRangeOutcome;
  categoryName: string;
  rfqHref: string;
}) {
  if (outcome.status === "none") return null;

  if (outcome.status === "too_few") {
    return (
      <section className="mt-6 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3.5 text-[13px] text-ink-600">
        <p className="font-semibold text-ink-800">Reference prices for {categoryName.toLowerCase()}</p>
        <p className="mt-1 leading-relaxed">
          Too few published prices to show a range yet. Send your specification and volume, and you get an actual
          quote from a supplier.
        </p>
      </section>
    );
  }

  const range = outcome.range;
  const updated = formatPriceDate(range.lastUpdated);
  const unitLabel = PRICE_UNIT_LABEL[range.unit].short;

  return (
    <section id="reference-price" className="mt-6 rounded-xl border border-ink-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Reference price</p>
        <p className="text-[12px] text-ink-500">
          {range.sampleSize} published {range.sampleSize === 1 ? "price" : "prices"}
          {updated ? ` · updated ${updated}` : ""}
        </p>
      </div>

      <p className="mt-2 text-[22px] font-black leading-tight text-ink-900 sm:text-[26px]">
        {formatUnitRange(range.low, range.high, range.unit)}
        {range.secondary && (
          <span className="ml-2 align-middle text-[13px] font-semibold text-ink-500">
            ≈ {formatUnitRange(range.secondary.low, range.secondary.high, range.secondary.unit)}
          </span>
        )}
      </p>

      {range.stale && (
        <p className="mt-1.5 text-[12px] font-semibold text-amber-700">
          These prices are more than 45 days old. Confirm before you plan a purchase.
        </p>
      )}

      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-600">
        Prices are what suppliers publish themselves, in USD per {PRICE_UNIT_LABEL[range.unit].long}, not a binding
        offer. Grade, packing and delivery terms move the number, so the quote decides.
      </p>

      <Link
        href={rfqHref}
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline"
      >
        Ask for a quote against your specification
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <span className="sr-only">Prices shown per {unitLabel}.</span>
    </section>
  );
}
