import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { HarvestCalendar } from "@/lib/types";
import {
  HARVEST_MONTH_LABELS,
  buildMonthStates,
  formatReviewedOn,
  harvestHeadline,
  sortHarvestWindows,
  windowDescription,
  windowRangeText,
  type HarvestMonthState,
} from "@/lib/public/harvest";

/**
 * Biểu đồ mùa vụ trên trang danh mục.
 *
 * Vẽ bằng HTML và CSS, không dùng ảnh, để công cụ tìm kiếm đọc được nội dung và
 * trình đọc màn hình đọc được miêu tả. Mười hai cột đủ chỗ ở màn 375px với nhãn
 * tháng ba chữ cái, không phải cuộn ngang.
 *
 * Cùng dữ liệu này sẽ được trang market dùng lại; chỉ khác cách trình bày.
 */
export function HarvestCalendarSection({
  categoryName,
  harvest,
  note,
  marketHref,
}: {
  categoryName: string;
  harvest: HarvestCalendar;
  note?: string;
  /** Chỉ truyền khi trang market đã tồn tại, tránh dẫn người đọc tới đường dẫn 404. */
  marketHref?: string;
}) {
  const windows = sortHarvestWindows(harvest.windows);
  if (windows.length === 0) return null;

  const states = buildMonthStates(windows);
  const headline = harvestHeadline(windows);
  const reviewed = formatReviewedOn(harvest.reviewed_on);

  return (
    <section id="crop-calendar" className="mt-14 rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Crop calendar</p>
          {/* Tránh "cashew kernels is harvested": tên danh mục có thể số nhiều, nên đặt tên làm tân ngữ. */}
          <h2 className="mt-2 max-w-2xl text-[22px] font-bold leading-tight text-ink-900 sm:text-[26px]">
            Crop calendar for {categoryName.toLowerCase()} in Vietnam
          </h2>
        </div>
        <p className="text-[12.5px] font-semibold text-ink-600">{headline}</p>
      </div>

      <div className="mt-6" role="img" aria-label={`Harvest calendar. ${headline}.`}>
        <div className="grid grid-cols-12 gap-[3px] sm:gap-1.5">
          {states.map((state, index) => (
            <div key={HARVEST_MONTH_LABELS[index]} className="flex flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end overflow-hidden rounded bg-ink-50">
                <span className={`w-full rounded ${state === "peak" ? "bg-brand-700" : state === "harvest" ? "bg-brand-300" : "bg-ink-100"}`} style={{ height: barHeight(state) }} />
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-tight text-ink-500 sm:text-[11px]">
                {HARVEST_MONTH_LABELS[index]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-600">
        <Legend className="bg-brand-700" label="Main harvest" />
        <Legend className="bg-brand-300" label="In season" />
        <Legend className="bg-ink-100" label="Outside the season" />
      </div>

      <ul className="mt-5 divide-y divide-ink-100 border-t border-ink-100 text-[13px] text-ink-700">
        {windows.map((window) => (
          <li key={window.id ?? `${window.label}-${window.start_month}`} className="py-2.5">
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <p className="text-[12px] text-ink-500">
          {reviewed ? `Reviewed ${reviewed}.` : "Review date not set. Treat these months as a planning guide."} Months show
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

function barHeight(state: HarvestMonthState): string {
  if (state === "peak") return "100%";
  if (state === "harvest") return "62%";
  return "12%";
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-4 rounded-sm ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
