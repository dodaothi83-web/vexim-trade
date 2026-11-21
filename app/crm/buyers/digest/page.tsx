import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePagePermission } from "@/lib/auth/session";
import type { DigestKind } from "@/lib/buyer/digest";
import { buildDigestMail, digestFor, digestPaused, digestStats, loadDigestData } from "@/lib/buyer/digest-server";
import { readIntroductions, receivesIntroductions } from "@/lib/buyer/introductions";
import { listVerifiedBuyerUsers } from "@/lib/buyer/introductions-server";
import { PauseButton, TestSendButton } from "./controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thư giới thiệu" };

/**
 * CRM: thư giới thiệu hằng tuần cho người mua. Hệ thống tự tổng hợp từ nội dung đã duyệt và tự gửi;
 * trang này để xem trước, xem số liệu, biết nội dung nào còn thiếu, và tạm dừng khi có sự cố.
 */
export default async function BuyerDigestPage({ searchParams }: { searchParams: Promise<{ k?: string; c?: string }> }) {
  const session = await requirePagePermission("buyers.view", "/crm");
  const sp = await searchParams;
  const kind: DigestKind = sp.k === "brief" ? "brief" : "products";
  const now = new Date();
  const [data, users, paused, stats] = await Promise.all([loadDigestData(now), listVerifiedBuyerUsers().catch(() => []), digestPaused().catch(() => false), digestStats().catch(() => ({ sends: 0, clicks: 0, rfqClicks: 0 }))]);
  const receiving = users.filter(receivesIntroductions);
  const rows = data.categories.map((c) => {
    const products = digestFor("products", [c.id], data, new Map(), now);
    const brief = digestFor("brief", [c.id], data, new Map(), now);
    return { ...c, buyers: receiving.filter((u) => readIntroductions(u.introductions).categories?.includes(c.id)).length,
      featured: products?.kind === "products" ? products.featured.length : 0, products: products?.kind === "products" ? products.products.length : 0,
      productsReady: !!products, post: brief?.kind === "brief" ? brief.post.title : null, harvest: !!c.harvest?.windows?.length };
  });
  const selected = data.categories.find((c) => c.id === sp.c) ?? data.categories[0];
  const digest = selected ? digestFor(kind, [selected.id], data, new Map(), now) : null;
  const mail = digest && selected ? buildDigestMail(digest, { email: "preview@veximtrade.com" }, [selected.name], "Preview") : null;
  const untagged = data.posts.filter((p) => !p.categoryIds.length).length;
  const missingHarvest = rows.filter((r) => !r.harvest).map((r) => r.name);
  const stat = (label: string, value: number | string) => <div className="rounded-xl border border-ink-200 bg-white p-4"><p className="text-xs font-semibold text-ink-500">{label}</p><p className="mt-1 text-2xl font-bold text-ink-900">{value}</p></div>;
  const tab = (k: DigestKind, label: string) => <Link href={`/crm/buyers/digest?k=${k}${selected ? `&c=${selected.id}` : ""}`} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${kind === k ? "bg-white text-brand-800 shadow-sm" : "text-ink-600"}`}>{label}</Link>;

  return <>
    <PageHeader title="Thư giới thiệu" sub="Hệ thống tự tổng hợp từ nội dung đã duyệt trên sàn và tự gửi. Nhân viên chỉ làm nội dung: sản phẩm, bài blog, lịch mùa vụ." />
    <section className="card flex flex-wrap items-center gap-3 p-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{paused ? "Đang tạm dừng" : "Đang tự gửi"}</p>
        <p className="mt-0.5 text-xs text-ink-500">Thứ Ba: thư sản phẩm. Thứ Sáu: thư thị trường (người mua chọn 2 thư/tuần). Giờ Việt Nam.</p>
        <p className="mt-0.5 text-xs text-ink-500">Hằng ngày: thư theo hành vi, gộp các cập nhật về sản phẩm đã lưu, nhà cung cấp, RFQ và mùa vụ.</p>
        <p className="mt-0.5 text-xs text-ink-500">Mỗi người mua nhận tối đa 1 thư/ngày và 4 thư/tuần, tính cả thư thứ Ba và thứ Sáu.</p>
      </div>
      <PauseButton paused={paused} canManage={hasPermission(session.role, "buyers.manage")} />
    </section>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stat("Người mua đang nhận", receiving.length)}
      {stat("Thư đã gửi (7 ngày)", stats.sends)}
      {stat("Lượt bấm (7 ngày)", stats.clicks)}
      {stat("Bấm “Request a quote” (7 ngày)", stats.rfqClicks)}
    </div>

    {(untagged > 0 || missingHarvest.length > 0) && <section className="card mt-4 p-5">
      <h2 className="text-sm font-bold text-ink-900">Nội dung nên bổ sung</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
        {untagged > 0 && <li>{untagged} bài blog chưa rõ ngành hàng. Mở bài, chọn “Ngành hàng liên quan” để thư thị trường gửi đúng người.</li>}
        {missingHarvest.length > 0 && <li>Chưa có lịch mùa vụ: {missingHarvest.join(", ")}. Thư của các ngành này chưa có mục mùa vụ.</li>}
      </ul>
    </section>}

    <section className="card mt-4 p-5">
      <h2 className="text-sm font-bold text-ink-900">Theo ngành hàng (tuần này)</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b border-ink-200 text-left text-xs text-ink-500"><th className="py-2">Ngành</th><th className="py-2 text-right">Người mua</th><th className="py-2 text-right">Nhà cung cấp Pro</th><th className="py-2 text-right">Sản phẩm mới</th><th className="py-2">Bài thị trường</th><th className="py-2">Mùa vụ</th><th /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-ink-100">
          <td className="py-2 font-medium text-ink-900">{r.name}</td><td className="py-2 text-right">{r.buyers}</td><td className="py-2 text-right">{r.featured}</td>
          <td className="py-2 text-right">{r.products}{!r.productsReady && <span className="ml-1 text-xs text-amber-700">(chưa đủ, bỏ qua)</span>}</td>
          <td className="max-w-[220px] truncate py-2 text-ink-600">{r.post ?? <span className="text-amber-700">Chưa có</span>}</td>
          <td className="py-2">{r.harvest ? "Có" : <span className="text-amber-700">Chưa có</span>}</td>
          <td className="py-2 text-right"><Link className="font-semibold text-brand-700" href={`/crm/buyers/digest?k=${kind}&c=${r.id}`}>Xem trước</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {selected && <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-sm font-bold text-ink-900">Xem trước: {selected.name}</h2>
        <div className="inline-flex rounded-lg bg-ink-100 p-0.5">{tab("products", "Thư sản phẩm")}{tab("brief", "Thư thị trường")}</div>
        {mail && <TestSendButton kind={kind} categoryId={selected.id} />}
      </div>
      {mail ? <>
        <p className="mt-2 text-xs text-ink-500">Tiêu đề: <b className="text-ink-800">{mail.subject}</b></p>
        <iframe title="Xem trước thư" srcDoc={mail.html} className="mt-3 h-[760px] w-full rounded-xl border border-ink-200 bg-white" />
      </> : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Tuần này ngành này chưa đủ nội dung, hệ thống sẽ không gửi thư này.</p>}
    </section>}
  </>;
}
