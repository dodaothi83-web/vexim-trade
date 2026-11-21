import { Activity, Eye, MessageSquareQuote } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { TrafficMessages } from "@/lib/i18n/portal/traffic";
import type { SupplierPerformance } from "@/lib/supplier-portal/performance";
import { percentChange } from "@/lib/supplier-portal/traffic-report";

type Report = { total: number; profile: number; product: number };

/**
 * Ba số chính của trang "Lượt xem gian hàng": lượt xem (tăng/giảm so với kỳ trước, phần đến từ email
 * marketing của Vexim), yêu cầu báo giá nhận được, và chia hồ sơ / sản phẩm.
 */
export function TrafficSummary({ report, performance, copy, days, intl }: { report: Report; performance: SupplierPerformance | null; copy: TrafficMessages; days: number; intl: string }) {
  const format = (n: number) => new Intl.NumberFormat(intl).format(n);
  const change = (current: number, previous: number) => {
    const pct = percentChange(current, previous);
    if (pct === null) return current > 0 ? { text: copy.kpi.noCompare, tone: "text-ink-500" } : null;
    if (pct === 0) return { text: fill(copy.kpi.same, { days }), tone: "text-ink-500" };
    return pct > 0 ? { text: `▲ ${fill(copy.kpi.up, { pct, days })}`, tone: "text-emerald-700" } : { text: `▼ ${fill(copy.kpi.down, { pct: Math.abs(pct), days })}`, tone: "text-rose-700" };
  };
  const card = "rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6";
  const icon = (Icon: typeof Activity, tone: string) => <span className={`inline-flex size-10 items-center justify-center rounded-xl ${tone}`}><Icon className="size-5" aria-hidden="true" /></span>;
  const views = performance ? change(performance.views.current, performance.views.previous) : null;
  const rfqs = performance ? change(performance.rfqs.current, performance.rfqs.previous) : null;
  return <div className="mt-6 grid gap-4 sm:grid-cols-3">
    <div className={card}>
      {icon(Activity, "bg-brand-50 text-brand-700")}
      <p className="mt-5 text-3xl font-black tabular-nums text-ink-900">{format(report.total)}</p>
      <p className="mt-1 text-sm font-medium text-ink-600">{copy.kpi.views}</p>
      {views && <p className={`mt-2 text-xs font-semibold ${views.tone}`}>{views.text}</p>}
      {!!performance?.emailClicks && <p className="mt-1 text-xs text-ink-600">{fill(copy.kpi.email, { count: format(performance.emailClicks) })}</p>}
    </div>
    <div className={card}>
      {icon(MessageSquareQuote, "bg-emerald-50 text-emerald-700")}
      <p className="mt-5 text-3xl font-black tabular-nums text-ink-900">{format(performance?.rfqs.current ?? 0)}</p>
      <p className="mt-1 text-sm font-medium text-ink-600">{copy.kpi.rfqs}</p>
      {rfqs && <p className={`mt-2 text-xs font-semibold ${rfqs.tone}`}>{rfqs.text}</p>}
    </div>
    <div className={card}>
      {icon(Eye, "bg-sky-50 text-sky-700")}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div><p className="text-3xl font-black tabular-nums text-ink-900">{format(report.profile)}</p><p className="mt-1 text-sm font-medium text-ink-600">{copy.kpi.profile}</p></div>
        <div><p className="text-3xl font-black tabular-nums text-ink-900">{format(report.product)}</p><p className="mt-1 text-sm font-medium text-ink-600">{copy.kpi.product}</p></div>
      </div>
    </div>
  </div>;
}

/** Quốc gia xem nhiều nhất (5 nước), theo mã quốc gia; không có danh tính người xem. */
export function TrafficCountries({ performance, copy, days, intl }: { performance: SupplierPerformance | null; copy: TrafficMessages; days: number; intl: string }) {
  const format = (n: number) => new Intl.NumberFormat(intl).format(n);
  const regions = (() => { try { return new Intl.DisplayNames([intl], { type: "region" }); } catch { return null; } })();
  const name = (code: string) => { try { return regions?.of(code) ?? code; } catch { return code; } };
  const list = performance?.countries ?? [];
  const total = Math.max(1, list.reduce((n, x) => n + x.views, 0));
  return <section className="mt-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="traffic-countries">
    <h2 id="traffic-countries" className="text-lg font-bold text-ink-900">{copy.countries.title}</h2>
    <p className="mt-1 text-xs text-ink-500">{fill(copy.countries.sub, { days })}</p>
    {list.length ? <ol className="mt-4 grid gap-x-8 sm:grid-cols-2">
      {list.slice(0, 5).map((c, i) => <li key={c.code} className="border-b border-ink-100 py-2.5">
        <div className="flex items-center gap-3 text-sm"><span className="w-5 text-xs font-bold text-ink-400">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{name(c.code)}</span>
          <span className="font-bold tabular-nums text-brand-800">{format(c.views)}</span></div>
        <div className="ml-8 mt-1.5 h-1.5 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.round((c.views / total) * 100)}%` }} /></div>
      </li>)}
    </ol> : <p className="mt-4 text-sm text-ink-500">{copy.countries.empty}</p>}
    <p className="mt-3 text-xs text-ink-500">{copy.countries.note}</p>
  </section>;
}
