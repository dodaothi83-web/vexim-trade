import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierNoticeFeed } from "@/lib/supplier-portal/dashboard";
import { migrationHint } from "@/lib/db/migration-hints";
import { markSupplierNoticeReadAction } from "../notice-actions";
import { EmptyRow, Panel, date } from "../portal-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thông báo | Vexim Trade", robots: { index: false, follow: false } };

/**
 * Nơi duy nhất hiển thị danh sách thông báo. Chuông ở thanh trên chỉ tóm tắt và dẫn
 * về đây, nên không trang nào khác phải mang theo danh sách này.
 */
export default async function SupplierNotificationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, reviews, user, store } = access;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] chưa đọc được ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [invites, reads, products, certificates, requests, submissions] = await Promise.all([
    optional("danh sách RFQ được chuyển", [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional("trạng thái đã đọc thông báo", [] as Awaited<ReturnType<typeof store.listSupplierNoticeReads>>,
      () => store.listSupplierNoticeReads(supplier.id)),
    optional("sản phẩm", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("yêu cầu kiểm định", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("hồ sơ tự gửi", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
  ]);
  // Chưa đọc được dấu đã đọc thì không hiện nút đánh dấu: bấm vào cũng không lưu được.
  const readsKnown = !degraded.includes("trạng thái đã đọc thông báo");
  const feed = buildSupplierNoticeFeed({ supplierId: supplier.id, supplier, invites, reads, products, certificates, reviews, requests, submissions });
  const showAll = (await searchParams).all === "1";
  const shown = showAll ? feed.notices : feed.notices.slice(0, 40);

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Thông báo"
      sub={`RFQ, kết quả kiểm tra, sản phẩm và chứng nhận của ${supplier.name}.`}
      actions={<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${readsKnown && feed.unreadCount ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700"}`}>
        {readsKnown && feed.unreadCount ? <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        {readsKnown ? (feed.unreadCount ? `${feed.unreadCount} chưa đọc` : "Đã đọc hết") : "Chưa đọc được dấu đã đọc"}
      </span>} />

    {!readsKnown && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Chưa đọc được dấu đã đọc nên mọi thông báo đang hiện như chưa đọc</p>
      <p className="mt-1">Nội dung thông báo vẫn đúng. Vexim cần kiểm tra cấu hình bảng dấu đã đọc; nút đánh dấu tạm ẩn để không bấm vào chỗ không lưu được.</p>
    </div>}

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu thông báo chưa tải được</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <Panel icon={<Bell className="h-4 w-4 text-brand-700" />} title="Tất cả thông báo" count={feed.notices.length}
      sub="Mỗi thông báo là một sự kiện đã có trong hồ sơ của bạn. Đọc thông báo không thay đổi trạng thái xét duyệt."
      action={feed.notices.length > 40 && !showAll ? <Link href="/supplier/portal/notifications?all=1" className="text-xs font-bold text-brand-700 hover:underline">Xem tất cả</Link> : undefined}
      flush>
      {feed.notices.length ? <ul className="divide-y divide-ink-100">{shown.map((n) => {
        const unread = !n.read && readsKnown;
        return <li key={n.key} className={`flex items-start gap-3 px-5 py-3.5 ${unread ? "bg-brand-50/40" : ""}`}>
          <NoticeIcon kind={n.kind} unread={unread} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-5 font-semibold text-ink-900">{n.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-600">{n.detail}</p>
            <p className="mt-1 text-[11px] text-ink-400">{date(n.at)}</p>
            {!n.read && readsKnown && <form action={markSupplierNoticeReadAction} className="mt-1"><input type="hidden" name="notice_key" value={n.key} />
              <button className="text-[11px] font-semibold text-brand-700 hover:underline" type="submit">Đánh dấu đã đọc</button></form>}
          </div>
        </li>;
      })}</ul> : <EmptyRow>Chưa có thông báo nào.</EmptyRow>}
    </Panel>

    <p className="mt-4 text-[11px] leading-5 text-ink-500">Chuông ở thanh trên cùng tóm tắt thông báo mới. Hộp thư Vexim là kênh làm việc chính; thông báo ở đây chỉ nhắc việc.</p>
  </>;
}

function NoticeIcon({ kind, unread }: { kind?: string; unread: boolean }) {
  const tone = kind === "rfq" ? "bg-brand-50 text-brand-700"
    : kind === "verification" ? "bg-emerald-50 text-emerald-700"
    : kind === "contact" ? "bg-sky-50 text-sky-700"
    : kind === "product" ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-700";
  return <span className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
    <Bell className="h-4 w-4" aria-hidden="true" />
    {unread && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" aria-hidden="true" />}
  </span>;
}
