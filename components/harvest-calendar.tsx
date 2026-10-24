import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { HarvestCalendar } from "@/lib/types";
import {
  HARVEST_MONTH_FULL,
  HARVEST_MONTH_LABELS,
  buildHarvestChartGeometry,
  buildMonthStates,
  formatReviewedOn,
  harvestHeadline,
  sortHarvestWindows,
  windowDescription,
  windowRangeText,
} from "@/lib/public/harvest";

/**
 * Biểu đồ mùa vụ trên trang danh mục.
 *
 * SVG giữ nhãn hai trục và đường cong ở cùng một hệ tọa độ. Trên màn hình hẹp,
 * khung cuộn ngang để chữ không bị thu nhỏ. Nội dung mùa vụ vẫn có dạng văn bản
 * cho công cụ tìm kiếm và trình đọc màn hình.
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
  /** Only pass an existing market page, never a 404 target. */
  marketHref?: string;
}) {
  const windows = sortHarvestWindows(harvest.windows);
  if (windows.length === 0) return null;

  const states = buildMonthStates(windows);
  const chart = buildHarvestChartGeometry(states);
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

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-100 bg-ink-50/40 px-2 py-3">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-auto w-full min-w-[720px]"
          role="img"
          aria-label={`Harvest activity by month for ${categoryName}. ${headline}. The vertical axis shows outside the season, in season and main harvest. The horizontal axis shows January to December.`}
        >
          <title>{`Harvest activity by month for ${categoryName}`}</title>
          <path d={chart.areaPath} fill="var(--color-brand-700)" opacity={0.08} />

          {chart.ticks.map((tick) => (
            <g key={tick.state}>
              <line
                x1={chart.left} x2={chart.right} y1={tick.y} y2={tick.y}
                stroke="var(--color-ink-200)" strokeWidth={1} strokeDasharray={tick.state === "none" ? undefined : "4 5"}
              />
              <line
                x1={chart.left - 6} x2={chart.left} y1={tick.y} y2={tick.y}
                stroke="var(--color-ink-400)" strokeWidth={1.2}
              />
              <text
                x={chart.left - 12} y={tick.y + 4} textAnchor="end"
                fontSize={12} fontWeight={600} fill="var(--color-ink-500)"
              >
                {tick.label}
              </text>
            </g>
          ))}

          <line
            x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.bottom}
            stroke="var(--color-ink-400)" strokeWidth={1.2}
          />
          <line
            x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom}
            stroke="var(--color-ink-400)" strokeWidth={1.2}
          />
          <path
            d={chart.path} fill="none" stroke="var(--color-brand-700)"
            strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
          />

          {chart.points.map((point) => (
            <g key={`month-${point.month}`}>
              <line
                x1={point.x} x2={point.x} y1={chart.bottom} y2={chart.bottom + 6}
                stroke="var(--color-ink-400)" strokeWidth={1}
              />
              <text
                x={point.x} y={205} textAnchor="middle"
                fontSize={12} fontWeight={600} fill="var(--color-ink-500)"
              >
                {HARVEST_MONTH_LABELS[point.month - 1]}
              </text>
            </g>
          ))}

          {chart.points.map((point) => (
            <circle
              key={`point-${point.month}`} cx={point.x} cy={point.y} r={5}
              fill={point.state === "peak" ? "var(--color-brand-700)" : point.state === "harvest" ? "var(--color-brand-300)" : "#fff"}
              stroke={point.state === "none" ? "var(--color-ink-400)" : "var(--color-brand-700)"} strokeWidth={2}
            >
              <title>{`${HARVEST_MONTH_FULL[point.month - 1]}: ${point.label}`}</title>
            </circle>
          ))}

          <text
            transform={`translate(22 ${(chart.top + chart.bottom) / 2}) rotate(-90)`} textAnchor="middle"
            fontSize={12} fontWeight={700} fill="var(--color-ink-600)"
          >
            Harvest activity
          </text>
          <text
            x={(chart.left + chart.right) / 2} y={239} textAnchor="middle"
            fontSize={12} fontWeight={700} fill="var(--color-ink-600)"
          >
            Month
          </text>
        </svg>
      </div>
      <p className="mt-2 text-[11px] text-ink-500 md:hidden">Scroll to see all months.</p>

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
