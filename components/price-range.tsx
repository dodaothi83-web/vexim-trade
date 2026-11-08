import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import type { PriceBlockOutcome, PriceRangeResult } from "@/lib/public/price-range";
import { formatPriceDate } from "@/lib/public/price-range";
import { formatUnitRange } from "@/lib/public/price-units";

/**
 * Khoảng giá tham khảo trên trang danh mục.
 *
 * Bố cục ưu tiên trực quan hơn câu chữ: mỗi quy cách một thẻ nhỏ, có thanh dải
 * giá để so sánh bằng mắt thay vì đọc số; mọi lý do loại trừ (giá mồi, thiếu
 * mẫu, thiếu nhà cung cấp) gộp vào đúng một dòng ghi chú thay vì mỗi lý do một
 * đoạn văn riêng.
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

  if (outcome.status === "too_few" || outcome.status === "too_few_suppliers") {
    return (
      <section className="mt-6 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Reference price</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
          Not enough data yet. Send your {categoryName.toLowerCase()} specification and volume to get an accurate
          quote.
        </p>
      </section>
    );
  }

  const rows = outcome.rows;
  const totalSamples = rows.reduce((sum, r) => sum + r.sampleSize, 0);
  const newest = rows.map((r) => r.lastUpdated).filter(Boolean).sort().at(-1) ?? null;
  const updated = formatPriceDate(newest);

  const categoryLow = Math.min(...rows.map((r) => r.low));
  const categoryHigh = Math.max(...rows.map((r) => r.high));
  const notes = buildNotes(outcome);

  return (
    <section id="reference-price" className="mt-6 rounded-xl border border-ink-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Reference price</p>
        <p className="text-[12px] text-ink-500">
          {totalSamples} {totalSamples === 1 ? "price" : "prices"}
          {updated ? ` · updated ${updated}` : ""}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
        {rows.map((range) => (
          <GradeCard key={range.grade ?? `${range.unit}-${range.low}-${range.high}`} range={range} rangeLow={categoryLow} rangeHigh={categoryHigh} />
        ))}
      </div>

      {notes.length > 0 && <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-500">{notes.join(" · ")}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-100 pt-2.5">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-500">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ink-300" aria-hidden="true" />
          Supplier-published reference, not a binding offer.
        </p>
        <Link
          href={rfqHref}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline"
        >
          Request a quote
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/** Một quy cách = một thẻ: nhãn, khoảng giá, thanh dải so sánh, số niêm yết. */
function GradeCard({
  range,
  rangeLow,
  rangeHigh,
}: {
  range: PriceRangeResult;
  rangeLow: number;
  rangeHigh: number;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {range.grade ? (
          <span className="text-[11px] font-black uppercase tracking-wide text-brand-700">{range.grade}</span>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Range</span>
        )}
        {range.stale && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-700">
            Over 45 days
          </span>
        )}
      </div>

      <p className="mt-1 text-[16px] font-bold tabular-nums tracking-tight text-ink-900">
        {formatUnitRange(range.low, range.high, range.unit)}
      </p>
      {range.secondary && (
        <p className="text-[11px] tabular-nums text-ink-400">
          ≈ {formatUnitRange(range.secondary.low, range.secondary.high, range.secondary.unit)}
        </p>
      )}

      <RangeBar low={range.low} high={range.high} min={rangeLow} max={rangeHigh} />

      <p className="mt-1 text-[10.5px] text-ink-400">
        {range.sampleSize} {range.sampleSize === 1 ? "price" : "prices"}
      </p>
    </div>
  );
}

/**
 * Thanh dải giá: vị trí của khoảng [low, high] trong khung [min, max] chung của
 * cả khối, để so sánh các quy cách bằng mắt thay vì phải đọc từng con số.
 */
function RangeBar({ low, high, min, max }: { low: number; high: number; min: number; max: number }) {
  const span = max - min;
  const leftPct = span > 0 ? ((low - min) / span) * 100 : 0;
  const widthPct = span > 0 ? Math.max(((high - low) / span) * 100, 6) : 100;
  return (
    <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-200/70" aria-hidden="true">
      <div
        className="absolute inset-y-0 rounded-full bg-brand-600"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
    </div>
  );
}

/** Gộp mọi lý do loại trừ thành một dòng ghi chú duy nhất, không mỗi lý do một đoạn văn. */
function buildNotes(outcome: Extract<PriceBlockOutcome, { status: "ok" }>): string[] {
  const notes: string[] = [];
  if (outcome.excludedOutliers > 0) {
    notes.push(`${outcome.excludedOutliers} ${outcome.excludedOutliers === 1 ? "outlier" : "outliers"} excluded`);
  }
  if (outcome.unclassified > 0) {
    notes.push(`${outcome.unclassified} ungraded ${outcome.unclassified === 1 ? "listing" : "listings"} excluded`);
  }
  if (outcome.thin.length > 0) {
    notes.push(`${listPhrase(outcome.thin)} pending — too few prices`);
  }
  if (outcome.pendingSuppliers.length > 0) {
    notes.push(`${listPhrase(outcome.pendingSuppliers)} pending — too few different suppliers`);
  }
  return notes;
}

/** "Cassia split and Star anise" — grade labels keep their own spelling and case. */
function listPhrase(items: string[]): string {
  const named = [...items].sort((a, b) => a.localeCompare(b));
  return named.length <= 1 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
}
