import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ClipboardCheck, FileText, Mail, PackageSearch, TrendingUp } from "lucide-react";

import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile, portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierDashboard } from "@/lib/supplier-portal/dashboard";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { productReview } from "@/lib/supplier-portal/product-view";
import { supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { L1_DOC_ITEMS } from "@/lib/types";
import { SupplierPortalUpload } from "./supplier-portal-upload";
import { SupplierProfileForm } from "./supplier-profile-form";
import { markSupplierNoticeReadAction } from "./notice-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảng điều khiển doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierPortal({ searchParams }: { searchParams?: Promise<{ range?: string; notices?: string; rfqs?: string }> }) {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  const { supplier, review, reviews, user, store } = access;
  // Until Vexim explicitly approves this account, never query/render RFQs, reports or notices.
  if (!portalApproved(supplier)) return <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
    <header className="flex items-center justify-between gap-4 border-b border-ink-200 pb-5">
      <div><Link href="/" className="text-sm font-semibold text-brand-700">← Vexim Trade</Link>
        <h1 className="mt-4 text-3xl font-black text-ink-900">Cổng nhà cung cấp</h1>
        <p className="mt-1 text-sm text-ink-600">{user.email}</p></div>
      <form action={logoutAction}><button className="btn btn-ghost" type="submit">Đăng xuất</button></form>
    </header>
    {canSubmitProfile(supplier) ? <>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {supplier.onboarding_status === "changes_requested" ? "Vexim yêu cầu bổ sung thông tin. Vui lòng cập nhật và gửi lại hồ sơ." :
          "Tài khoản đã tạo. Vui lòng hoàn thiện hồ sơ doanh nghiệp để Vexim xác nhận. Bạn chưa thể sử dụng các tính năng khác."}
        {supplier.onboarding_status === "changes_requested" && supplier.onboarding_note &&
          <p className="mt-2 whitespace-pre-wrap font-semibold">Nội dung cần bổ sung: {supplier.onboarding_note}</p>}
      </div>
      <SupplierProfileForm supplier={supplier} />
    </> : <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6" role="status">
      <h2 className="text-xl font-bold text-amber-950">Đang chờ Vexim xác nhận thông tin</h2>
      <p className="mt-2 text-sm text-amber-900">Hồ sơ {supplier.name} đã được gửi. Bạn có thể đăng nhập để xem trạng thái này, nhưng RFQ, thông báo, báo cáo và tải thêm tài liệu chưa khả dụng cho đến khi nhân viên Vexim xác nhận quyền sử dụng.</p>
      <p className="mt-3 text-xs text-amber-800">Xác nhận tài khoản không đồng nghĩa duyệt giấy tờ, thăm nhà máy, lịch sử giao hàng hoặc công khai hồ sơ.</p>
    </div>}
  </main>;
  const [media, requests, invites, reads, products] = await Promise.all([
    review ? store.listMedia("verification", review.id) : Promise.resolve([]),
    store.listSupplierVerificationRequests(supplier.id),
    store.listSupplierRfqInvitations(supplier.id),
    store.listSupplierNoticeReads(supplier.id),
    store.listProductsBySupplier(supplier.id),
  ]);
  const sp = await searchParams;
  const days: 7 | 30 | 90 = sp?.range === "7" ? 7 : sp?.range === "90" ? 90 : 30;
  const allNotices = sp?.notices === "all";
  const allRfqs = sp?.rfqs === "all";
  const dashboard = buildSupplierDashboard({ supplierId: supplier.id, invites, reads, products, reviews, requests, days });
  const mine = media.filter((m) => m.created_by === user.id && m.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(m.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));
  const allowedDocUpload = review && (review.status === "in_progress" || review.status === "returned");

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-6">
      <div><Link href="/" className="text-sm font-semibold text-brand-700">← Vexim Trade</Link>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Cổng nhà cung cấp · riêng tư</p>
        <h1 className="mt-1 text-3xl font-black text-ink-900 sm:text-4xl">Bảng điều khiển</h1>
        <p className="mt-2 text-sm text-ink-600">{supplier.name} · {user.email}</p>
      </div>
      <form action={logoutAction}><button className="btn btn-ghost" type="submit">Đăng xuất</button></form>
    </header>
    <nav aria-label="Các mục trong cổng nhà cung cấp" className="my-5 flex flex-wrap gap-2 text-xs font-semibold sm:text-sm">
      {[["#tasks", "Việc cần làm"], ["#rfqs", "RFQ của tôi"], ["#notices", `Thông báo (${dashboard.unreadCount} mới)`],
        ["#report", "Báo cáo"], ["#profile", "Hồ sơ & xác minh"]].map(([href, label]) =>
        <a key={href} href={href} className="rounded-full border border-ink-200 bg-white px-3 py-2 text-ink-700 hover:border-brand-500 hover:text-brand-700">{label}</a>)}
      <Link href="/supplier/portal/products" className="rounded-full border border-brand-300 bg-brand-50 px-3 py-2 text-brand-800 hover:bg-brand-100">Sản phẩm của tôi →</Link>
    </nav>
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <strong>Vexim đã xác nhận quyền sử dụng cổng.</strong> Hồ sơ công khai: {supplier.status === "draft" ? "chưa công khai" : supplier.status}. Việc duyệt từng đánh giá và công khai NCC/sản phẩm là quyết định riêng của Vexim; không tự động từ RFQ hay giấy tờ đã tải.
    </div>

    <section aria-label="Gian hàng sản phẩm" className="mt-7 grid gap-4 md:grid-cols-[1.5fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 to-teal-800 p-6 text-white shadow-sm sm:p-7">
        <div className="relative"><p className="text-xs font-bold uppercase tracking-widest text-teal-200">Gian hàng của bạn · riêng tư</p>
          <h2 className="mt-2 text-2xl font-black">Sản phẩm của tôi</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-teal-50/90">Quản lý ảnh, quy cách và trạng thái duyệt như một gian hàng. Mọi sản phẩm vẫn cần Vexim kiểm tra trước khi có thể chia sẻ buyer.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/supplier/portal/products" className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-900 hover:bg-teal-50">Quản lý sản phẩm →</Link>
            <Link href="/supplier/portal/products/new" className="inline-flex items-center rounded-xl border border-white/40 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">+ Thêm sản phẩm</Link></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div><p className="text-xs font-semibold text-slate-500">Tổng sản phẩm</p><p className="mt-2 text-3xl font-black text-slate-900">{products.length}</p></div>
        <div><p className="text-xs font-semibold text-slate-500">Đang chờ Vexim</p><p className="mt-2 text-3xl font-black text-amber-700">{products.filter((p) => productReview(p) === "pending").length}</p></div>
        <div><p className="text-xs font-semibold text-slate-500">Bản nháp</p><p className="mt-2 text-3xl font-black text-slate-900">{products.filter((p) => productReview(p) === "draft").length}</p></div>
        <div><p className="text-xs font-semibold text-slate-500">Cần bổ sung</p><p className="mt-2 text-3xl font-black text-rose-700">{products.filter((p) => productReview(p) === "changes_requested").length}</p></div>
        <p className="col-span-2 border-t border-slate-100 pt-3 text-xs text-slate-500">Số liệu chỉ của doanh nghiệp bạn; không phải lượt xem hay doanh thu.</p>
      </div>
    </section>

    <section id="tasks" className="mt-8 scroll-mt-6">
      <SectionTitle icon={<ClipboardCheck className="h-5 w-5" />} title="Việc cần làm" sub="Chỉ RFQ đã được Vexim chuyển cho doanh nghiệp; buyer gửi form không tự tạo lời mời." />
      {review?.status === "returned" && <a href="#documents" className="mt-4 block rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Giấy tờ cần bổ sung</strong><span className="ml-2">Xem đợt kiểm và tải thêm giấy tờ được phép →</span></a>}
      {dashboard.tasks.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{dashboard.tasks.slice(0, 8).map((task) => <div key={task.matchId} className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <p className="text-xs font-bold text-brand-700">{task.code} · {task.status}</p>
        <p className="mt-1 font-semibold text-ink-900">{task.title}</p>
        <p className={`mt-1 text-xs ${task.dueAt && Date.parse(task.dueAt) < Date.now() ? "font-semibold text-rose-700" : "text-ink-600"}`}>
          {task.dueAt && Date.parse(task.dueAt) < Date.now() ? "Đã quá hạn phản hồi: " : "Hạn phản hồi: "}{task.dueAt ? date(task.dueAt) : "Xem thư mời từ Vexim"}</p>
        <a href={`mailto:${supplierReplyAddress(task.code, task.matchId)}?subject=${encodeURIComponent(`Phản hồi ${task.code}`)}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Trả lời Vexim qua email →</a>
      </div>)}</div> : review?.status !== "returned" && <Empty text="Chưa có lời mời báo giá cần phản hồi. Vexim sẽ liên hệ khi có RFQ phù hợp." />}
      {dashboard.tasks.length > 8 && <a href="#rfqs" className="mt-2 inline-block text-xs font-semibold text-brand-700 underline">Xem các RFQ còn lại ↓</a>}
    </section>

    <section id="rfqs" className="mt-10 scroll-mt-6">
      <SectionTitle icon={<PackageSearch className="h-5 w-5" />} title={`RFQ đã chuyển cho bạn (${dashboard.invites.length})`} sub="Thông tin buyer được giữ kín; trả lời email mời chào giá của Vexim, không liên hệ buyer trực tiếp." />
      {dashboard.invites.length ? <ul className="mt-4 space-y-3">{(allRfqs ? dashboard.invites : dashboard.invites.slice(0, 30)).map((item) =>
        <li key={item.matchId} className="grid gap-2 rounded-xl border border-ink-200 bg-white p-4 text-sm sm:grid-cols-[1fr_auto]">
          <div><p className="font-bold text-ink-900">{item.code} · {item.title}</p>
            <p className="mt-1 text-ink-600">{item.quantity} · {item.destination} · Chuyển ngày {date(item.sentAt)}</p>
            {item.repliedAt && <p className="mt-1 text-xs font-semibold text-emerald-700">Đã ghi nhận email phản hồi ngày {date(item.repliedAt)}; Vexim sẽ xử lý nội dung.</p>}
            <p className="mt-1 text-xs text-ink-500">Hạn phản hồi: {item.dueAt ? date(item.dueAt) : "Theo email Vexim"}{item.quotePrice ? ` · Giá đã ghi nhận: ${item.quotePrice}` : ""}</p></div>
          <div className="sm:text-right"><span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">{item.status}</span></div>
        </li>)}</ul> : <Empty text="Chưa có RFQ nào được Vexim chuyển cho doanh nghiệp." />}
      {dashboard.invites.length > 30 && !allRfqs && <Link href={`/supplier/portal?range=${days}&rfqs=all#rfqs`} className="mt-2 inline-block text-xs font-semibold text-brand-700 underline">Hiển thị tất cả RFQ →</Link>}
    </section>

    <section id="notices" className="mt-10 scroll-mt-6">
      <SectionTitle icon={<Bell className="h-5 w-5" />} title={`Thông báo · ${dashboard.unreadCount} chưa đọc`} sub="Lời mời RFQ, kết quả kiểm tra và liên hệ Vexim. Đọc thông báo không thay đổi trạng thái xét duyệt." />
      {dashboard.notices.length ? <ul className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white">{(allNotices ? dashboard.notices : dashboard.notices.slice(0, 20)).map((n) =>
        <li key={n.key} className={`flex flex-wrap items-start gap-3 p-4 text-sm ${n.read ? "" : "bg-brand-50/50"}`}>
          <span className={`mt-2 h-2 w-2 rounded-full ${n.read ? "bg-ink-200" : "bg-brand-600"}`} aria-hidden="true" />
          <div className="min-w-[220px] flex-1"><p className="font-bold text-ink-900">{n.title}</p><p className="mt-1 text-ink-600">{n.detail}</p>
            <p className="mt-1 text-xs text-ink-500">{date(n.at)}</p></div>
          {!n.read && <form action={markSupplierNoticeReadAction}><input type="hidden" name="notice_key" value={n.key} />
            <button className="text-xs font-semibold text-brand-700 underline" type="submit">Đánh dấu đã đọc</button></form>}
        </li>)}</ul> : <Empty text="Chưa có thông báo mới." />}
      {dashboard.notices.length > 20 && !allNotices && <Link href={`/supplier/portal?range=${days}&notices=all#notices`} className="mt-2 inline-block text-xs font-semibold text-brand-700 underline">Hiển thị tất cả thông báo →</Link>}
    </section>

    <section id="report" className="mt-10 scroll-mt-6">
      <SectionTitle icon={<TrendingUp className="h-5 w-5" />} title="Báo cáo lời mời báo giá" sub="Chỉ tính RFQ Vexim thực sự chuyển cho doanh nghiệp; không tính lượt xem, RFQ buyer chưa được sàng lọc hoặc doanh thu chưa xác nhận." />
      <div className="mt-4 flex gap-2">{([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal?range=${d}#report`}
        className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${days === d ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700"}`}>{d} ngày</Link>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="RFQ được chuyển" value={dashboard.report.sent} /><Stat label="Đã phản hồi / từ chối" value={dashboard.report.responded} />
        <Stat label="Đã ghi báo giá" value={dashboard.report.quoted} /><Stat label="Được Vexim chọn" value={dashboard.report.selected} />
      </div>
      {dashboard.report.byProduct.length ? <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[400px] text-left text-sm"><thead className="bg-ink-50 text-xs font-semibold text-ink-600"><tr><th className="p-3">Sản phẩm nguồn</th><th className="p-3">Lời mời</th><th className="p-3">Có báo giá</th></tr></thead>
          <tbody className="divide-y divide-ink-100">{dashboard.report.byProduct.map((p) => <tr key={p.id}><td className="p-3">{p.name}</td><td className="p-3">{p.sent}</td><td className="p-3">{p.quoted}</td></tr>)}</tbody></table>
      </div> : <Empty text="Chưa có lời mời trong khoảng thời gian này." />}
      <p className="mt-2 text-xs text-ink-500">RFQ cũ hoặc RFQ chung không có liên kết sản phẩm xác thực được nhóm riêng; không suy đoán từ tên sản phẩm buyer tự nhập.</p>
    </section>

    <section id="profile" className="mt-10 scroll-mt-6">
      <SectionTitle icon={<FileText className="h-5 w-5" />} title="Hồ sơ & xác minh" sub="Ba đánh giá độc lập. Chỉ nhân viên Vexim có quyền xác nhận kết quả." />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-200 bg-white p-5"><h3 className="font-bold text-ink-900">Thông tin đã khai</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Tên doanh nghiệp" value={supplier.name} /><Info label="Mã số thuế (tự khai)" value={review?.tax_number} />
            <Info label="Người liên hệ" value={supplier.contact_name} /><Info label="Điện thoại" value={supplier.phone} />
            <Info label="Địa chỉ" value={supplier.address} /><Info label="Mặt hàng chính" value={supplier.products} />
          </dl><p className="mt-3 text-xs text-ink-500">Cần sửa thông tin hoặc số tài khoản đã khai? Liên hệ nhân viên Vexim.</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5"><h3 className="font-bold text-ink-900">Đánh giá bổ sung</h3>
          {([2, 3] as const).map((step) => {
            const r = requests.find((req) => req.target_level === step);
            const approved = reviews.some((v) => v.target_level === step && v.status === "approved");
            return <div key={step} className="border-b border-ink-100 py-3 text-sm last:border-0"><p className="font-semibold">{step === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng"}</p>
              <p className="text-ink-600">{approved ? "Đã được Vexim duyệt sau đánh giá" : r?.status === "contacted" ? "Đã ghi nhận liên hệ · chưa duyệt" : r ? "Vexim sẽ liên hệ lên kế hoạch · chưa duyệt" : "Chưa yêu cầu · chưa duyệt"}</p></div>;
          })}
          <p className="mt-2 text-xs text-ink-500">Doanh nghiệp không tự tải bằng chứng thăm nhà máy/giao hàng. Nhãn buyer chỉ xuất hiện cho từng đánh giá được duyệt thực tế.</p>
        </div>
      </div>
      <div id="documents" className="mt-4 scroll-mt-6 rounded-xl border border-ink-200 bg-white p-5"><h3 className="font-bold text-ink-900">Kiểm tra giấy tờ · {review?.status === "approved" ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung" : review?.status === "submitted" ? "Chờ duyệt" : "Đang rà soát"}</h3>
        <p className="mt-1 text-sm text-ink-600">AI chỉ gợi ý cho Vexim; tải giấy tờ không tự đánh dấu đạt.</p>
        {mine.length > 0 && <ul className="mt-4 space-y-2 text-sm">{mine.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
          <span>{L1_DOC_ITEMS.find((i) => i.key === m.checklist_key)?.label ?? "Giấy tờ"}: {m.caption}</span>
          <a href={`/api/media/file/${m.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Xem tệp</a></li>)}</ul>}
        {allowedDocUpload ? <SupplierPortalUpload /> : <p className="mt-4 text-sm text-ink-500">Đợt kiểm hiện không nhận thêm tệp. Liên hệ Vexim nếu cần bổ sung.</p>}
      </div>
    </section>
    <footer className="mt-12 border-t border-ink-200 pt-5 text-xs text-ink-500"><Mail className="mr-1 inline h-3 w-3" /> Vexim là đầu mối điều phối. Không chia sẻ thông tin buyer trước khi các bên được giới thiệu theo quy trình.</footer>
  </main>;
}

function date(value: string) { return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }); }
function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return <div><h2 className="flex items-center gap-2 text-xl font-black text-ink-900">{icon}{title}</h2><p className="mt-1 text-sm text-ink-600">{sub}</p></div>;
}
function Empty({ text }: { text: string }) { return <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-white px-5 py-6 text-sm text-ink-500">{text}</p>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-ink-200 bg-white px-4 py-5"><p className="text-xs font-semibold text-ink-600">{label}</p><p className="mt-2 text-3xl font-black text-ink-900">{value}</p></div>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-ink-900">{value || "—"}</dd></div>; }
