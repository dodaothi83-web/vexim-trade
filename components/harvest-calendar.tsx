import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { HarvestCalendar } from "@/lib/types";
import {
  HARVEST_MONTH_FULL,
  HARVEST_MONTH_LABELS,
  buildMonthStates,
  type HarvestMonthState,
  formatReviewedOn,
  harvestHeadline,
  sortHarvestWindows,
  windowDescription,
  windowRangeText,
} from "@/lib/public/harvest";

/**
 * Lịch mùa vụ trên trang danh mục — dạng gọn: một hàng 12 ô tháng.
 *
 * Bỏ đồ thị đường cong (2026-11-22, chủ sàn yêu cầu gọn nhất). Màu ô từ nhạt đến
 * đậm: ngoài vụ (xám nhạt) → trong vụ phụ (navy nhạt) → vụ chính (navy đậm), kèm
 * chú thích để buyer biết vụ nào là chính. Điện thoại xếp 2 hàng × 6 tháng để chữ
 * không bị thu nhỏ. Nội dung mùa vụ vẫn có dạng văn bản cho công cụ tìm kiếm và
 * trình đọc màn hình.
 */
const MONTH_CELL: Record<HarvestMonthState, string> = {
  peak: "bg-brand-800 font-bold text-white",
  harvest: "bg-brand-400 font-bold text-brand-900",
  none: "bg-ink-50 font-medium text-ink-500",
};
const MONTH_STATE_LABEL: Record<HarvestMonthState, string> = {
  peak: "Main harvest",
  harvest: "Secondary harvest",
  none: "Outside the season",
};
export function HarvestCalendarSection({
  categoryName,
  harvest,
  note,
  marketHref,
}: {
  categoryName: string;
  harvest: HarvestCalendar;
  note?: string;
  /** Only pass an existing market page, never a 404 target. */
  marketHref?: string;
}) {
  const windows = sortHarvestWindows(harvest.windows);
  if (windows.length === 0) return null;

  const states = buildMonthStates(windows);
  const hasSecondary = states.includes("harvest");
  const headline = harvestHeadline(windows);
  const reviewed = formatReviewedOn(harvest.reviewed_on);
  const sources = harvest.sources ?? [];
  const sourceChecked = harvest.review_origin === "ai" && sources.length > 0;

  return (
    <section id="crop-calendar" className="mt-10 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* Tránh "cashew kernels is harvested": tên danh mục có thể số nhiều, nên đặt tên làm tân ngữ. */}
        <h2 className="text-[18px] font-bold leading-tight text-ink-900 sm:text-[20px]">
          Crop calendar for {categoryName.toLowerCase()} in Vietnam
        </h2>
        <p className="text-[12.5px] font-semibold text-ink-600">{headline}</p>
      </div>

      <ol className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-12" aria-label={`Harvest months for ${categoryName}. ${headline}.`}>
        {states.map((state, index) => (
          <li key={HARVEST_MONTH_LABELS[index]} title={`${HARVEST_MONTH_FULL[index]}: ${MONTH_STATE_LABEL[state]}`}
            className={`rounded-lg py-2.5 text-center text-[13px] ${MONTH_CELL[state]}`}>
            {HARVEST_MONTH_LABELS[index]}
            <span className="sr-only">: {MONTH_STATE_LABEL[state]}</span>
          </li>
        ))}
      </ol>

      {/* Chú thích màu: đậm = vụ chính, nhạt = vụ phụ (chỉ hiện khi có). */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-600" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-brand-800" />Main harvest</span>
        {hasSecondary && <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-brand-400" />Secondary harvest</span>}
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm border border-ink-200 bg-ink-50" />Outside the season</span>
      </div>

      <ul className="mt-3 space-y-1 text-[13px] text-ink-700">
        {windows.map((window) => (
          <li key={window.id ?? `${window.label}-${window.start_month}`}>
            <span className="font-semibold text-ink-900">{window.label}</span>
            <span className="text-ink-500"> · {windowRangeText(window)}</span>
            {window.regions && window.regions.length > 0 && (
              <span className="text-ink-500"> · {window.regions.join(", ")}</span>
            )}
            {window.note && <span className="block text-[12.5px] leading-relaxed text-ink-500">{window.note}</span>}
          </li>
        ))}
      </ul>

      {/* Miêu tả đầy đủ cho trình đọc màn hình, không hiện trên màn hình. */}
      <ul className="sr-only">
        {windows.map((window) => (
          <li key={`sr-${window.id ?? `${window.label}-${window.start_month}`}`}>{windowDescription(window)}</li>
        ))}
      </ul>

      {note && <p className="mt-4 text-[13px] leading-relaxed text-ink-600">{note}</p>}

      {sources.length > 0 && <div className="mt-4 rounded-xl bg-ink-50/70 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Sources for this update</p>
        <ul className="mt-1.5 space-y-1">{sources.map((source) => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-[12.5px] font-medium text-brand-700 hover:underline">{source.title}</a>
        </li>)}</ul>
      </div>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <p className="text-[12px] text-ink-500">
          {reviewed ? `${sourceChecked ? "Sources checked" : "Reviewed"} ${reviewed}.` : "Review date not set. Treat these months as a planning guide."} Months show
          when the crop is harvested, not when it ships.
        </p>
        {marketHref && (
          <Link href={marketHref} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline">
            Prices, grades and import papers for {categoryName.toLowerCase()}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
