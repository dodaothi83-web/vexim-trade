"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleDollarSign, Clock, Eye, Megaphone, X } from "lucide-react";

import { EmptyState, group } from "@/components/ui";
import { buildChartGeometry } from "@/lib/sponsored/chart-geometry";
import { pausePushAction } from "./actions";

export interface BoardRow {
  id: string;
  productName: string;
  supplierName: string;
  categoryName: string;
  surface: "category" | "home";
  status: "draft" | "approved" | "paused";
  state: "pending" | "scheduled" | "live" | "paused" | "ended" | "unavailable";
  startsLabel: string;
  endsLabel: string;
  hoursLeft: number;
  impressions: number;
  clicks: number;
  rate: number;
  priceLabel: string;
  note: string | null;
}

export interface PoolView {
  key: string;
  surface: "category" | "home";
  label: string;
  used: number;
  /** Số gói đang thật sự hiển thị, không tính gói đang tạm dừng. */
  active: number;
  cap: number;
  slots: number;
  free: number;
}

export interface SeriesPoint {
  day: string;
  impressions: number;
}

const STATE_META: Record<BoardRow["state"], { label: string; className: string }> = {
  pending: { label: "Nháp cũ", className: "bg-amber-100 text-amber-900" },
  live: { label: "Đang chạy", className: "bg-emerald-100 text-emerald-900" },
  scheduled: { label: "Chờ tới giờ", className: "bg-sky-100 text-sky-900" },
  paused: { label: "Tạm dừng", className: "bg-ink-100 text-ink-600" },
  ended: { label: "Hết hạn", className: "bg-ink-100 text-ink-500" },
  unavailable: { label: "Không hiển thị", className: "bg-rose-100 text-rose-900" },
};

type TabKey = "all" | "pending" | "scheduled" | "live" | "paused" | "ended" | "unavailable";

const TABS: { key: TabKey; label: string; match: (state: BoardRow["state"]) => boolean }[] = [
  { key: "all", label: "Tất cả", match: () => true },
  { key: "pending", label: "Nháp cũ", match: (s) => s === "pending" },
  { key: "scheduled", label: "Chờ tới giờ", match: (s) => s === "scheduled" },
  { key: "live", label: "Đang chạy", match: (s) => s === "live" },
  { key: "unavailable", label: "Không hiển thị", match: (s) => s === "unavailable" },
  { key: "paused", label: "Tạm dừng", match: (s) => s === "paused" },
  { key: "ended", label: "Hết hạn", match: (s) => s === "ended" },
];

function remaining(row: BoardRow): string {
  if (row.state === "ended") return "đã hết";
  if (row.status === "draft") return "chưa mở";
  const hours = row.hoursLeft;
  if (hours >= 48) return `còn ${Math.floor(hours / 24)} ngày`;
  if (hours >= 1) return `còn ${hours} giờ`;
  return "còn dưới 1 giờ";
}

export function SponsoredBoard({
  rows,
  pools,
  summary,
  canManage,
  flash,
  series,
  metricsAvailable,
  packagesAvailable,
}: {
  rows: BoardRow[];
  pools: PoolView[];
  summary: { live: number; pending: number; impressions7d: number; clicks7d: number; expiring: number };
  canManage: boolean;
  flash: { text: string; bad: boolean } | null;
  series: Record<string, SeriesPoint[]>;
  metricsAvailable: boolean;
  packagesAvailable: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Máy chủ trả về sau mỗi thao tác thì đóng ngăn đang mở, để người dùng thấy kết quả.
  useEffect(() => {
    if (flash) {
      setOpenId(null);
    }
  }, [flash]);

  const counts = useMemo(() => {
    const out = new Map<TabKey, number>();
    for (const item of TABS) out.set(item.key, rows.filter((r) => item.match(r.state)).length);
    return out;
  }, [rows]);

  const visible = useMemo(() => rows.filter((r) => TABS.find((t) => t.key === tab)!.match(r.state)), [rows, tab]);
  const detail = rows.find((r) => r.id === openId) ?? null;
  const categoryPools = pools.filter((pool) => pool.surface === "category");

  return (
    <>
      {flash && (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-[13px] ${
            flash.bad ? "border-rose-300 bg-rose-50 text-rose-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {flash.text}
        </div>
      )}

      {rows.some((row) => row.surface === "home") && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Trang chủ chưa có vị trí tài trợ. Gói trang chủ cũ không hiển thị và không tự thay đổi; cần đối soát với khách.
        </p>
      )}
      {!metricsAvailable && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Chưa tải được số liệu quảng cáo. Vui lòng thử lại; dấu — không có nghĩa là không có lượt.
        </p>
      )}
      {/* Số liệu chính: số đã ghi nhận, không phải tất cả người xem. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Megaphone className="h-4 w-4" />} label="Đang chạy" value={packagesAvailable ? group(summary.live) : "—"} hint={!packagesAvailable ? "chưa tải được gói" : summary.expiring ? `${summary.expiring} gói danh mục hết hạn trong 24 giờ, kể cả gói tạm dừng` : "không gói danh mục nào sắp hết hạn"} />
        <Stat icon={<Clock className="h-4 w-4" />} label="Nháp cũ" value={packagesAvailable ? group(summary.pending) : "—"} hint={packagesAvailable ? "không còn duyệt thủ công" : "chưa tải được gói"} />
        <Stat icon={<Eye className="h-4 w-4" />} label="Hiển thị đã ghi · 7 ngày" value={metricsAvailable ? group(summary.impressions7d) : "—"} hint={metricsAvailable ? "bảy ngày UTC gần nhất" : "chưa tải được số liệu"} />
        <Stat icon={<CircleDollarSign className="h-4 w-4" />} label="Nhấp đã ghi · 7 ngày" value={metricsAvailable ? group(summary.clicks7d) : "—"} hint={!metricsAvailable ? "chưa tải được số liệu" : summary.impressions7d ? `${Math.round((summary.clicks7d / summary.impressions7d) * 1000) / 10}% so với lượt hiển thị` : "chưa có lượt hiển thị ghi nhận"} />
      </div>
      <p className="mt-2 text-[11.5px] leading-5 text-ink-500">
        Thẻ chỉ có thể hiện khi sản phẩm, nhà cung cấp và danh mục còn đủ điều kiện; không phải gói nào cũng được chọn ở mỗi vòng. Số liệu chỉ tính người xem đã đồng ý đo lường tiếp thị, bắt đầu từ khi hệ thống đo lường mới được triển khai và có thể thiếu. Lượt nhấp gồm các liên kết trên thẻ, không phải số người duy nhất.
      </p>

      {/* Bể gói */}
      <section className="card mt-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-bold text-ink-800">Chỗ trống trong bể</h2>
          <p className="text-[12px] text-ink-500">Các gói cũ tiếp tục đến hết thời hạn.</p>
        </div>
        <p className="mt-1 text-[11.5px] leading-5 text-ink-500">Một vòng kéo dài 10 phút. Số ô hiển thị thay đổi theo số sản phẩm công khai; chưa có ước tính số vòng theo số ô mới. Giới hạn bể dưới đây vẫn là quy tắc cũ, chưa áp dụng 4 gói mỗi ô.</p>
        {!packagesAvailable ? (
          <p className="mt-3 text-[13px] text-ink-500">Chưa tải được danh sách gói.</p>
        ) : categoryPools.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-500">Chưa có gói danh mục nào chiếm chỗ lúc này.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryPools.map((pool) => {
              const percent = Math.min(100, Math.round((pool.used / pool.cap) * 100));
              return (
                <div key={pool.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold text-ink-700">
                    <span className="truncate">{pool.label}</span>
                    <span className="shrink-0 text-ink-500">
                      {pool.used}/{pool.cap} gói
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={`h-full rounded-full ${pool.free === 0 ? "bg-rose-500" : "bg-brand-500"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-500">
                    {pool.free === 0 ? "Đã đầy lúc này." : `Còn ${pool.free} chỗ lúc này.`}{" "}
                    {pool.active > 0 ? `${pool.active} gói đang chạy.` : "Không có gói đang chạy."}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Danh sách gói */}
      <section className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                tab === item.key
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-brand-400 hover:text-brand-700"
              }`}
            >
              {item.label}
              <span className={`ml-1.5 ${tab === item.key ? "text-white/70" : "text-ink-400"}`}>{counts.get(item.key) ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="card mt-3 overflow-x-auto">
          {visible.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title={!packagesAvailable ? "Chưa tải được danh sách gói" : rows.length === 0 ? "Chưa có gói nào" : "Không có gói ở mục này"}
              sub={packagesAvailable && rows.length === 0 ? "Chưa có gói sản phẩm nào được ghi nhận." : undefined}
            />
          ) : (
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                  <th className="px-3 py-2.5">Sản phẩm</th>
                  <th className="px-3 py-2.5">Bề mặt</th>
                  <th className="px-3 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Giá gói</th>
                  <th className="px-3 py-2.5 text-right">Hiển thị đã ghi</th>
                  <th className="px-3 py-2.5 text-right">Nhấp đã ghi</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50/60"
                    onClick={() => setOpenId(row.id)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="block max-w-[26ch] truncate font-semibold text-ink-900">{row.productName}</span>
                      <span className="text-[11.5px] text-ink-500">{row.supplierName}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.surface === "home" ? "bg-violet-100 text-violet-900" : "bg-brand-50 text-brand-800"}`}>
                        {row.surface === "home" ? "Trang chủ" : row.categoryName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-700">
                      {row.startsLabel}
                      <span className="block text-[11.5px] text-ink-500">
                        {row.endsLabel} · {remaining(row)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-ink-700">{row.priceLabel}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink-800">{metricsAvailable ? group(row.impressions) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-ink-700">
                      {metricsAvailable ? group(row.clicks) : "—"}
                      {metricsAvailable && row.impressions > 0 && <span className="block text-[11px] text-ink-500">{row.rate}%</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_META[row.state].className}`}>
                        {STATE_META[row.state].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                      <RowActions row={row} canManage={canManage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Ngăn chi tiết */}
      {detail && (
        <Drawer title="Chi tiết gói" onClose={() => setOpenId(null)}>
          <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2.5">
            <p className="text-[13.5px] font-bold text-ink-900">{detail.productName}</p>
            <p className="text-[12px] text-ink-500">
              {detail.supplierName} · {detail.surface === "home" ? "Trang chủ" : detail.categoryName}
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
            <dt className="text-ink-500">Trạng thái</dt>
            <dd>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_META[detail.state].className}`}>
                {STATE_META[detail.state].label}
              </span>
            </dd>
            <dt className="text-ink-500">Bắt đầu</dt>
            <dd className="font-semibold text-ink-800">{detail.startsLabel}</dd>
            <dt className="text-ink-500">Kết thúc</dt>
            <dd className="font-semibold text-ink-800">{detail.endsLabel}</dd>
            <dt className="text-ink-500">Còn lại</dt>
            <dd className="font-semibold text-ink-800">{remaining(detail)}</dd>
            <dt className="text-ink-500">Giá gói</dt>
            <dd className="font-mono font-semibold tabular-nums text-ink-800">{detail.priceLabel}</dd>
            <dt className="text-ink-500">7 ngày</dt>
            <dd className="font-semibold text-ink-800">
              {metricsAvailable ? `${group(detail.impressions)} lượt hiển thị · ${group(detail.clicks)} lượt nhấp đã ghi` : "Chưa tải được số liệu"}
            </dd>
          </dl>

          <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Lượt hiển thị theo ngày (UTC)</h3>
          {metricsAvailable ? <DailyChart points={series[detail.id] ?? []} /> : <p className="mt-2 text-[12px] text-ink-500">Chưa tải được số liệu.</p>}

          {detail.note && <p className="mt-3 text-[12px] leading-5 text-ink-500">{detail.note}</p>}
        </Drawer>
      )}

    </>
  );
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-[22px] font-black leading-tight text-ink-900">{value}</p>
      <p className="text-[11.5px] text-ink-500">{hint}</p>
    </div>
  );
}

function RowActions({ row, canManage }: { row: BoardRow; canManage: boolean }) {
  if (!canManage || row.status !== "approved" || row.state === "ended") return null;
  return <details className="ml-auto min-w-48 text-left">
    <summary className="cursor-pointer text-xs font-semibold text-rose-700 underline">Dừng do vi phạm</summary>
    <form action={pausePushAction} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={row.id} />
      <label className="block text-xs text-ink-600">Lý do vi phạm
        <textarea name="reason" required minLength={5} maxLength={400} rows={2} className="input mt-1 w-full" />
      </label>
      <button type="submit" className="btn btn-ghost btn-sm">Xác nhận dừng</button>
    </form>
  </details>;
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 cursor-default bg-ink-950/40" />
      <div className="relative flex h-full w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <p className="text-[14px] font-bold text-ink-900">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Biểu đồ đường theo ngày.
 *
 * Vẽ bằng SVG để in ra và đọc bằng trình đọc màn hình đều được. Gói mới chạy một
 * ngày thì chỉ có một điểm, và biểu đồ nói đúng như vậy thay vì vẽ một đường phẳng
 * gợi ý đã có bảy ngày dữ liệu.
 */
function DailyChart({ points }: { points: SeriesPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-[12.5px] text-ink-500">
        Chưa có lượt hiển thị nào được ghi.
      </p>
    );
  }

  const geo = buildChartGeometry(points.map((point) => ({ day: point.day, value: point.impressions })));
  const label = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  const total = points.reduce((sum, point) => sum + point.impressions, 0);

  return (
    <figure className="mt-2 rounded-xl border border-ink-200 p-2.5 pb-1">
      <svg
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Lượt hiển thị theo ngày. ${points.map((point) => `${label(point.day)}: ${point.impressions}`).join(", ")}.`}
      >
        <line x1={geo.plot.left} y1={geo.yFor(geo.ceiling)} x2={geo.plot.right} y2={geo.yFor(geo.ceiling)} stroke="#e2e8f0" strokeDasharray="3 4" />
        <line x1={geo.plot.left} y1={geo.yFor(geo.mid)} x2={geo.plot.right} y2={geo.yFor(geo.mid)} stroke="#e2e8f0" strokeDasharray="3 4" />
        <line x1={geo.plot.left} y1={geo.plot.top} x2={geo.plot.left} y2={geo.plot.bottom} stroke="#cbd5e1" />
        <line x1={geo.plot.left} y1={geo.plot.bottom} x2={geo.plot.right} y2={geo.plot.bottom} stroke="#cbd5e1" />

        <text x={geo.plot.left - 6} y={geo.yFor(geo.ceiling) + 4} textAnchor="end" fontSize="10" fill="#64748b">{geo.ceiling}</text>
        <text x={geo.plot.left - 6} y={geo.yFor(geo.mid) + 4} textAnchor="end" fontSize="10" fill="#64748b">{geo.mid}</text>
        <text x={geo.plot.left - 6} y={geo.plot.bottom + 4} textAnchor="end" fontSize="10" fill="#64748b">0</text>
        <text x={geo.plot.left} y={geo.plot.top - 4} fontSize="10" fontWeight="700" fill="#94a3b8">Lượt hiển thị</text>

        <path d={geo.path} fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" />
        {geo.points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="3" fill="#fff" stroke="#0d9488" strokeWidth="2" />
        ))}

        {geo.labelIndices.map((index) => (
          <text key={geo.points[index].day} x={geo.points[index].x} y={geo.plot.bottom + 16} textAnchor="middle" fontSize="10" fill="#64748b">
            {label(geo.points[index].day)}
          </text>
        ))}
        <text x={(geo.plot.left + geo.plot.right) / 2} y={geo.height - 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="#94a3b8">
          Ngày (UTC)
        </text>
      </svg>
      <figcaption className="px-1 py-1 text-[11.5px] text-ink-500">
        {points.length === 1
          ? "Gói mới chạy một ngày nên mới có một điểm."
          : `Tổng ${group(total)} lượt trong ${points.length} ngày.`}
      </figcaption>
    </figure>
  );
}
