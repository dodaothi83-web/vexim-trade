import { Inbox } from "lucide-react";
import type { SponsoredRequest } from "@/lib/types";
import { updateSponsoredRequestAction } from "./request-actions";

function stamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date) : "—";
}
const labels: Record<SponsoredRequest["status"], string> = { new: "Mới", contacted: "Đã liên hệ", closed: "Đã kết thúc" };

function RequestRow({ request: r, canManage }: { request: SponsoredRequest; canManage: boolean }) {
  return <li className="px-5 py-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><p className="break-words text-sm font-bold text-ink-900">{r.product_name}</p>
        <p className="mt-1 break-words text-xs leading-5 text-ink-600">{r.supplier_name} · {r.category_name}</p>
        <p className="mt-1 break-all text-xs text-ink-500">{r.requester_email} · {stamp(r.created_at)}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.status === "new" ? "bg-amber-50 text-amber-800" : r.status === "contacted" ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-600"}`}>{labels[r.status]}</span>
    </div>
    {r.note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-700"><strong>Lời nhắn: </strong>{r.note}</p>}
    {canManage && r.status !== "closed" && <div className="mt-3 flex flex-wrap gap-2">
      {r.status === "new" && <form action={updateSponsoredRequestAction}>
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="expected" value="new" /><input type="hidden" name="status" value="contacted" />
        <button type="submit" className="btn btn-soft btn-sm" aria-label={`Đánh dấu đã liên hệ: ${r.product_name}`}>Đã liên hệ</button>
      </form>}
      <form action={updateSponsoredRequestAction}>
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="expected" value={r.status} /><input type="hidden" name="status" value="closed" />
        <button type="submit" className="btn btn-ghost btn-sm" aria-label={`Kết thúc yêu cầu: ${r.product_name}`}>Kết thúc yêu cầu</button>
      </form>
    </div>}
  </li>;
}

export function SponsoredRequestInbox({ requests, available, canManage }: { requests: SponsoredRequest[]; available: boolean; canManage: boolean }) {
  const open = requests.filter((r) => r.status !== "closed").sort((a, b) => Number(a.status !== "new") - Number(b.status !== "new") || b.created_at.localeCompare(a.created_at));
  const closed = requests.filter((r) => r.status === "closed");
  return <section id="yeu-cau-ncc" aria-labelledby="supplier-requests-title" className="mb-5 scroll-mt-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Inbox className="size-5" aria-hidden="true" /></span>
        <div><h2 id="supplier-requests-title" className="text-[15px] font-bold text-ink-900">Yêu cầu tư vấn trước đây</h2><p className="mt-1 text-xs leading-5 text-ink-500">Không nhận yêu cầu mới; dữ liệu cũ được giữ lại để theo dõi.</p></div></div>
      {available && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{open.length} đang xử lý</span>}
    </div>
    {!available ? <p role="alert" className="px-5 py-6 text-sm text-amber-800">Chưa tải được yêu cầu. Kiểm tra kết nối và migration 20261043, sau đó tải lại.</p>
      : !open.length ? <p className="px-5 py-6 text-sm text-ink-500">Không có yêu cầu đang xử lý.</p>
      : <ul className="divide-y divide-ink-100">{open.map((r) => <RequestRow key={r.id} request={r} canManage={canManage} />)}</ul>}
    {available && closed.length > 0 && <details className="border-t border-ink-100"><summary className="cursor-pointer px-5 py-3 text-xs font-bold text-brand-800">Yêu cầu đã kết thúc ({closed.length})</summary><ul className="divide-y divide-ink-100 border-t border-ink-100">{closed.map((r) => <RequestRow key={r.id} request={r} canManage={false} />)}</ul></details>}
    <p className="border-t border-ink-100 px-5 py-3 text-[11px] leading-5 text-ink-500">Các yêu cầu này không tạo hoặc kích hoạt gói. Có thể cập nhật trạng thái để xử lý lịch sử.</p>
  </section>;
}
