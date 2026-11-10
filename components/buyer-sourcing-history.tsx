import Link from "next/link";
import { sourcingStatusLabel } from "@/lib/sourcing/status";
import type { Rfq, SourcingRequest } from "@/lib/types";

export function BuyerSourcingHistory({ rows, vi, unavailable, preview, linkedRfqs = new Map() }: {
  rows: SourcingRequest[];
  vi: boolean;
  unavailable: boolean;
  preview: boolean;
  /** Only RFQs returned for this authenticated buyer may be linked. */
  linkedRfqs?: Map<string, Pick<Rfq, "id" | "code">>;
}) {
  return <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="font-bold">{vi ? "Yêu cầu tìm nguồn" : "Sourcing requests"}</h2>
    <p className="mt-2 text-sm text-ink-600">{vi
      ? "Yêu cầu ban đầu và tệp riêng tư ở đây. Khi Vexim mở RFQ, báo giá và trao đổi ở trang RFQ liên kết."
      : "Your original request and private files are here. Once Vexim opens an RFQ, quotes and messages appear in its linked page."}</p>
    {unavailable ? <p className="mt-4 text-sm text-amber-800">{vi ? "Chưa tải được lịch sử tìm nguồn. Vui lòng thử lại sau." : "Sourcing history is temporarily unavailable. Please try again later."}</p>
      : !rows.length ? <p className="mt-4 text-sm text-ink-500">{vi ? "Bạn chưa gửi yêu cầu tìm nguồn." : "No sourcing requests yet."}</p>
        : <ul className="mt-4 divide-y divide-ink-100">{(preview ? rows.slice(0, 5) : rows).map((r) => {
          const linked = linkedRfqs.get(r.id);
          return <li key={r.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-500">{r.id.slice(0, 8).toUpperCase()} · {new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(r.created_at))}</span>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{sourcingStatusLabel(r.status, vi)}</span>
            </div>
            <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm">{r.content}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <Link href={`/buyer/account/sourcing/${encodeURIComponent(r.id)}`} className="text-sm font-semibold text-brand-700">{vi ? "Xem yêu cầu ban đầu →" : "View original request →"}</Link>
              {linked && <Link href={`/buyer/account/requests/${encodeURIComponent(linked.id)}`} className="text-sm font-semibold text-brand-700">{vi ? `Xem RFQ ${linked.code} và trao đổi →` : `View RFQ ${linked.code} and messages →`}</Link>}
            </div>
          </li>;
        })}</ul>}
    {preview && rows.length > 5 && <Link href="/buyer/account?tab=vexim" className="text-sm font-semibold text-brand-700">{vi ? "Xem tất cả" : "View all"}</Link>}
  </section>;
}
