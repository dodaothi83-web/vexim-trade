import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { PriceBlockOutcome, PriceRangeResult } from "@/lib/public/price-range";
import { formatPriceDate } from "@/lib/public/price-range";
import { formatUnitRange, PRICE_UNIT_LABEL } from "@/lib/public/price-units";

/**
 * Khoảng giá tham khảo trên trang danh mục.
 *
 * Đặt ngay trên lưới sản phẩm vì đó là câu buyer hỏi trước tiên, và vì nó chỉ
 * chiếm một dải vài dòng, không đẩy danh sách nhà cung cấp xuống.
 *
 * Mỗi quy cách một dòng khi nhận diện được quy cách, vì W180 và W320 chênh nhau
 * khoảng 25 phần trăm và gộp lại thì khoảng giá thành vô nghĩa. Không quy cách
 * nào đủ mẫu thì ẩn số và nói rõ lý do, không gộp lại thành một khoảng sai.
 */
export function PriceRangeStrip({
  outcome,
  categoryName,
  rfqHref,
}: {
  outcome: PriceBlockOutcome;
  categoryName: string;
  rfqHref: string;
}) {
  if (outcome.status === "none") return null;

  if (outcome.status === "too_few") {
    return (
      <section className="mt-6 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3.5 text-[13px] text-ink-600">
        <p className="font-semibold text-ink-800">Reference prices for {categoryName.toLowerCase()}</p>
        <p className="mt-1 leading-relaxed">
          Too few published prices per grade to show a range yet. Send your specification and volume, and you get an
          actual quote from a supplier.
        </p>
      </section>
    );
  }

  const rows = outcome.rows;
  const unit = rows[0]?.unit ?? "kg";
  const singleRow = rows.length === 1;
  const newest = rows.map((r) => r.lastUpdated).filter(Boolean).sort().at(-1) ?? null;
  const totalSamples = rows.reduce((sum, r) => sum + r.sampleSize, 0);
  const updated = formatPriceDate(newest);

  return (
    <section id="reference-price" className="mt-6 rounded-xl border border-ink-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Reference price</p>
        <p className="text-[12px] text-ink-500">
          {totalSamples} published {totalSamples === 1 ? "price" : "prices"}
          {updated ? ` · updated ${updated}` : ""}
        </p>
      </div>

      {singleRow ? (
        <SingleRow range={rows[0]} />
      ) : (
        <ul className="mt-2 divide-y divide-ink-100">
          {rows.map((range) => (
            <li key={range.grade ?? `${range.unit}-${range.low}-${range.high}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
              <span className="text-[15px] font-bold text-ink-900">
                {range.grade && <span className="mr-2 text-[12px] font-black uppercase tracking-wide text-brand-700">{range.grade}</span>}
                {formatUnitRange(range.low, range.high, range.unit)}
              </span>
              <span className="text-[12px] text-ink-500">
                {range.sampleSize} {range.sampleSize === 1 ? "price" : "prices"}
                {range.secondary ? ` · ≈ ${formatUnitRange(range.secondary.low, range.secondary.high, range.secondary.unit)}` : ""}
                {range.stale ? " · older than 45 days" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 1 && rows.some((r) => r.stale) && (
        <p className="mt-1.5 text-[12px] font-semibold text-amber-700">
          Some prices are more than 45 days old. Confirm before you plan a purchase.
        </p>
      )}

      {outcome.thin.length > 0 && (
        <p className="mt-1.5 text-[12px] text-ink-500">
          {listPhrase(outcome.thin)} {outcome.thin.length === 1 ? "has" : "have"} fewer than three published prices so
          far, so no range is shown for {outcome.thin.length === 1 ? "it" : "them"}.
        </p>
      )}

      {outcome.unclassified > 0 && (
        <p className="mt-1.5 text-[12px] text-ink-500">
          {outcome.unclassified} {outcome.unclassified === 1 ? "listing does" : "listings do"} not state a grade, so
          {outcome.unclassified === 1 ? " it is" : " they are"} left out of these ranges.
        </p>
      )}

      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-600">
        Prices are what suppliers publish themselves, in USD per {PRICE_UNIT_LABEL[unit].long}, not a binding offer.
        Grade, packing and delivery terms move the number, so the quote decides.
      </p>

      <Link
        href={rfqHref}
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline"
      >
        Ask for a quote against your specification
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

/** "Cassia split and Star anise" — grade labels keep their own spelling and case. */
function listPhrase(items: string[]): string {
  const named = [...items].sort((a, b) => a.localeCompare(b));
  return named.length <= 1 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
}

function SingleRow({ range }: { range: PriceRangeResult }) {
  // Một dòng vẫn phải nêu quy cách: con số này là của W320 hay của 550 g/l, không
  // phải giá chung cho cả danh mục. Bỏ nhãn đi là nói đúng số nhưng sai phạm vi.
  return (
    <p className="mt-2 text-[22px] font-black leading-tight text-ink-900 sm:text-[26px]">
      {range.grade && (
        <span className="mr-2 align-middle text-[12px] font-black uppercase tracking-wide text-brand-700">{range.grade}</span>
      )}
      {formatUnitRange(range.low, range.high, range.unit)}
      {range.secondary && (
        <span className="ml-2 align-middle text-[13px] font-semibold text-ink-500">
          ≈ {formatUnitRange(range.secondary.low, range.secondary.high, range.secondary.unit)}
        </span>
      )}
      {range.stale && (
        <span className="ml-2 align-middle text-[12px] font-semibold text-amber-700">older than 45 days</span>
      )}
    </p>
  );
}
