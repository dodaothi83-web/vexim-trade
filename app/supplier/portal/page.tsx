import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Bell, ChartNoAxesColumn, ClipboardCheck, Clock3, FileCheck2, FileText, FolderTree, Inbox, Mail, Package, PackageSearch, Plus, ShieldCheck, TrendingUp } from "lucide-react";

import { requireSession } from "@/lib/auth/session";
import { supplierAccountAccess, supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile, portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierDashboard } from "@/lib/supplier-portal/dashboard";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { productReview } from "@/lib/supplier-portal/product-view";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { L1_DOC_ITEMS } from "@/lib/types";
import { isL1CoreDoc } from "@/lib/verification";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { migrationHint } from "@/lib/db/migration-hints";
import { SupplierPortalUpload } from "./supplier-portal-upload";
import { SupplierCertificateUpload } from "./certificate-upload";
import { SupplierProfileForm } from "./supplier-profile-form";
import { markSupplierNoticeReadAction } from "./notice-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bảng điều khiển doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierPortal({ searchParams }: { searchParams?: Promise<{ range?: string; notices?: string; rfqs?: string }> }) {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  const account = await supplierAccountAccess();
  if (!account) redirect("/login");
  if (!account.user.supplier_id) {
    const categories = categoryProposalOptions(await account.store.listCategories({ publishedOnly: true }));
    return <>
      <header className="mb-5 border-b border-ink-200 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">Cổng nhà cung cấp · riêng tư</p>
        <h1 className="mt-1 text-[22px] leading-tight font-black tracking-tight text-ink-900">Bảng điều khiển</h1>
        <p className="mt-1 text-[13px] text-ink-500">{account.user.email}</p>
      </header>
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="text-base font-bold">Bước 2/2 · Xác minh doanh nghiệp</h2>
        <p className="mt-2 leading-6">Tài khoản đã đăng nhập, nhưng bạn chưa gửi hồ sơ doanh nghiệp. Hãy điền form bên dưới để tạo trang NCC ở trạng thái nháp và gửi Vexim xét duyệt. Trước khi Vexim mở quyền, bạn không thể quản lý sản phẩm, xem RFQ hay sử dụng các chức năng khác.</p>
      </div>
      <div className="mt-5"><SupplierProfileForm email={account.user.email} categories={categories} /></div>
    </>;
  }
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  const { supplier, review, reviews, user, store } = access;
  const categoryOptions = !portalApproved(supplier) && canSubmitProfile(supplier)
    ? categoryProposalOptions(await store.listCategories({ publishedOnly: true })) : [];
  // Giấy xác minh đã có trong đợt kiểm trước thì không bắt NCC tải lại khi bổ sung hồ sơ.
  const hasCoreDoc = !portalApproved(supplier) && canSubmitProfile(supplier) && !!review &&
    (await store.listMedia("verification", review.id)).some((m) => m.storage_path && isL1CoreDoc(m.checklist_key));
  // Until Vexim explicitly approves this account, never query/render RFQs, reports or notices.
  if (!portalApproved(supplier)) return <>
    <header className="mb-5 border-b border-ink-200 pb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">Cổng nhà cung cấp · riêng tư</p>
      <h1 className="mt-1 text-[22px] leading-tight font-black tracking-tight text-ink-900">Bảng điều khiển</h1>
      <p className="mt-1 text-[13px] text-ink-500">{user.email}</p>
    </header>
    {canSubmitProfile(supplier) ? <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {supplier.onboarding_status === "changes_requested" ? "Vexim yêu cầu bổ sung thông tin. Vui lòng cập nhật và gửi lại hồ sơ." :
          "Tài khoản đã tạo. Vui lòng hoàn thiện hồ sơ doanh nghiệp để Vexim xác nhận. Bạn chưa thể sử dụng các tính năng khác."}
        {supplier.onboarding_status === "changes_requested" && supplier.onboarding_note &&
          <p className="mt-2 whitespace-pre-wrap font-semibold">Nội dung cần bổ sung: {supplier.onboarding_note}</p>}
      </div>
      <div className="mt-5"><SupplierProfileForm supplier={supplier} email={user.email} categories={categoryOptions} hasCoreDoc={hasCoreDoc} /></div>
    </> : <><div className="rounded-xl border border-amber-200 bg-amber-50 p-6" role="status">
      <h2 className="text-base font-bold text-amber-950">Đang chờ Vexim xác nhận thông tin</h2>
      <p className="mt-2 text-sm text-amber-900">Hồ sơ {supplier.name} đã được gửi. Bạn có thể đăng nhập để xem trạng thái này, nhưng RFQ, thông báo, báo cáo và tải thêm tài liệu chưa khả dụng cho đến khi nhân viên Vexim xác nhận quyền sử dụng.</p>
      <p className="mt-3 text-xs text-amber-800">Xác nhận tài khoản không đồng nghĩa duyệt giấy tờ, thăm nhà máy, lịch sử giao hàng hoặc công khai hồ sơ.</p>
    </div>
    <PortalSteps stages={[
      { label: "Khai hồ sơ", state: "done", note: "Đã gửi" },
      { label: "Vexim kiểm tra giấy tờ", state: "current", note: "Đang chờ" },
      { label: "Mở cổng nhà cung cấp", state: "todo", note: "Sau khi đạt bước 2" },
      { label: "Thêm sản phẩm & nhận RFQ", state: "todo", note: "Sau khi mở cổng" },
    ]} /></>}
  </>;
  // Một bảng thiếu migration không được làm trắng cả cổng. Từng phần được tải riêng:
  // phần nào lỗi thì ghi log, dùng giá trị rỗng và hiện cảnh báo ngay trên trang.
  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] chưa đọc được ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [media, requests, invites, reads, products, certificates, submissions] = await Promise.all([
    optional("giấy tờ của đợt kiểm", [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
    optional("yêu cầu kiểm định", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("danh sách RFQ được chuyển", [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional("trạng thái đã đọc thông báo", [] as Awaited<ReturnType<typeof store.listSupplierNoticeReads>>,
      () => store.listSupplierNoticeReads(supplier.id)),
    optional("sản phẩm", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("hồ sơ tự gửi", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
  ]);
  // Chưa đọc được dấu đã đọc thì không hiện nút đánh dấu: bấm vào cũng không lưu được.
  const readsKnown = !degraded.includes("trạng thái đã đọc thông báo");
  const sp = await searchParams;
  const days: 7 | 30 | 90 = sp?.range === "7" ? 7 : sp?.range === "90" ? 90 : 30;
  const allNotices = sp?.notices === "all";
  const allRfqs = sp?.rfqs === "all";
  const dashboard = buildSupplierDashboard({ supplierId: supplier.id, supplier, invites, reads, products, certificates, reviews, requests, submissions, days });
  const mine = media.filter((m) => m.created_by === user.id && m.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(m.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));
  const allowedDocUpload = review && (review.status === "in_progress" || review.status === "returned");
  // Ảnh chụp nhanh cho phần đầu trang: cùng dữ liệu đã tải, không truy vấn thêm.
  const approvedCount = products.filter((p) => productReview(p) === "approved").length;
  const pendingCount = products.filter((p) => productReview(p) === "pending").length;
  const draftCount = products.filter((p) => productReview(p) === "draft").length;
  const changesCount = products.filter((p) => productReview(p) === "changes_requested").length;
  const l1Approved = reviews.some((v) => v.target_level === 1 && v.status === "approved");
  const l2Approved = reviews.some((v) => v.target_level === 2 && v.status === "approved");
  const l3Approved = reviews.some((v) => v.target_level === 3 && v.status === "approved");
  const publishedProfile = supplier.status === "published";
  const openDues = dashboard.tasks.map((t) => t.dueAt).filter((d): d is string => !!d).sort();
  const nextDueAt = openDues.find((d) => Date.parse(d) >= Date.now()) ?? null;
  const overdueDueAt = openDues.find((d) => Date.parse(d) < Date.now()) ?? null;
  const shownInvites = allRfqs ? dashboard.invites : dashboard.invites.slice(0, 5);
  const shownNotices = allNotices ? dashboard.notices : dashboard.notices.slice(0, 6);
  const expiringCerts = certificates.filter((c) => {
    const left = daysUntilExpiry(c.valid_until);
    return left !== null && left >= 0 && left <= 60;
  }).length;

  return <>
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.16em] text-brand-700 uppercase">Cổng nhà cung cấp · riêng tư</p>
        <h1 className="mt-1 text-[22px] leading-tight font-black tracking-tight text-ink-900">Bảng điều khiển</h1>
        <p className="mt-1 text-[13px] text-ink-500">{supplier.name} · {user.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/supplier/portal/products" className="btn btn-ghost">Quản lý sản phẩm</Link>
        <Link href="/supplier/portal/products/new" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" />Thêm sản phẩm</Link>
      </div>
    </header>

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu cổng chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, báo Vexim để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <section aria-label="Trạng thái gian hàng" className="mb-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-900 text-[15px] font-black text-white">{initials(supplier.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[15px] font-bold text-ink-900">{supplier.display_name || supplier.trade_name || supplier.name}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${publishedProfile ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
              {publishedProfile ? "Hồ sơ đang công khai" : "Hồ sơ chưa công khai"}
            </span>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-800">Cổng đã mở</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-600">
            <LevelChip label="L1 · Giấy tờ" on={l1Approved} pending={review?.status === "submitted" || review?.status === "in_progress"} />
            <LevelChip label="L2 · Nhà máy" on={l2Approved} pending={submissions.some((s) => s.target_level === 2 && s.status === "pending_review")} />
            <LevelChip label="L3 · Xuất khẩu" on={l3Approved} pending={submissions.some((s) => s.target_level === 3 && s.status === "pending_review")} />
            <span>{products.length} sản phẩm</span>
            <span>{certificates.length} chứng nhận</span>
            {expiringCerts > 0 && <span className="font-semibold text-amber-800">{expiringCerts} chứng nhận sắp hết hạn</span>}
          </div>
        </div>
        {publishedProfile
          ? <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} className="btn btn-ghost btn-sm">Xem trang công khai<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          : <span className="max-w-[220px] text-[11px] leading-4 text-ink-500">Trang công khai chỉ mở khi Vexim duyệt nội dung và bật trạng thái published.</span>}
      </div>
      <p className="border-t border-ink-100 bg-ink-50/70 px-4 py-2.5 text-[11.5px] leading-5 text-ink-600 sm:px-5">
        <strong className="font-semibold text-ink-800">Vexim đã xác nhận quyền sử dụng cổng.</strong> Duyệt giấy tờ, xác thực L2/L3 và công khai hồ sơ là các quyết định riêng, không tự động từ RFQ hay giấy tờ đã tải.
      </p>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Số liệu gian hàng">
      <Kpi href="/supplier/portal/products" icon={<Package className="h-4 w-4" />} label="Sản phẩm đã duyệt nội dung" value={approvedCount}
        note={`Trên ${products.length} sản phẩm trong gian hàng`} />
      <Kpi href="/supplier/portal/products" icon={<Clock3 className="h-4 w-4" />} label="Đang chờ Vexim duyệt" value={pendingCount}
        note={`${draftCount} bản nháp · ${changesCount} cần chỉnh sửa`} attention={pendingCount > 0 || changesCount > 0} />
      <Kpi href="#rfqs" icon={<Mail className="h-4 w-4" />} label="RFQ cần bạn phản hồi" value={dashboard.tasks.length}
        note={nextDueAt ? `Hạn gần nhất ${date(nextDueAt)}` : overdueDueAt ? `Có RFQ quá hạn từ ${date(overdueDueAt)}` : "Không có hạn nào đang mở"} attention={dashboard.tasks.length > 0} />
      <Kpi href="#notices" icon={<Bell className="h-4 w-4" />} label="Thông báo chưa đọc" value={dashboard.unreadCount}
        note={readsKnown ? "Đọc xong có thể đánh dấu ngay trong danh sách" : "Chưa đọc được dấu đã đọc, số này có thể cao hơn thực tế"} attention={readsKnown && dashboard.unreadCount > 0} />
    </div>

    <section aria-label="Lối tắt trong cổng" className="mt-3 rounded-xl border border-ink-200 bg-white p-3 shadow-sm">
      <h2 className="sr-only">Lối tắt</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {([
          ["/supplier/portal/products", <Package key="i" className="h-4 w-4" aria-hidden="true" />, "Sản phẩm của tôi"],
          ["/supplier/portal/categories", <FolderTree key="i" className="h-4 w-4" aria-hidden="true" />, "Danh mục kinh doanh"],
          ["/supplier/portal/traffic", <ChartNoAxesColumn key="i" className="h-4 w-4" aria-hidden="true" />, "Lượt xem gian hàng"],
          ["/supplier/portal/verification", <ShieldCheck key="i" className="h-4 w-4" aria-hidden="true" />, "Xác thực L2 · L3"],
          ["#documents", <FileCheck2 key="i" className="h-4 w-4" aria-hidden="true" />, "Giấy tờ & chứng nhận"],
          ["#rfqs", <Inbox key="i" className="h-4 w-4" aria-hidden="true" />, "RFQ đã chuyển"],
        ] as const).map(([href, icon, label]) => <Link key={href} href={href}
          className="flex items-center gap-2.5 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5 text-[12.5px] font-semibold text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-brand-700 shadow-sm">{icon}</span>
          <span className="min-w-0">{label}</span>
        </Link>)}
      </div>
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
      <div className="space-y-5">
        <Panel id="tasks" icon={<ClipboardCheck className="h-4 w-4 text-brand-700" />} title="Việc cần làm" count={dashboard.tasks.length}
          sub="Chỉ RFQ đã được Vexim chuyển cho doanh nghiệp; buyer gửi form không tự tạo lời mời.">
          {review?.status === "returned" && <a href="#documents" className="mx-5 mt-4 block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Giấy tờ cần bổ sung</strong><span className="ml-2">Xem đợt kiểm và tải thêm giấy tờ được phép</span></a>}
          {dashboard.tasks.length ? <ul className="divide-y divide-ink-100">
            {dashboard.tasks.slice(0, 6).map((task) => {
              const overdue = !!task.dueAt && Date.parse(task.dueAt) < Date.now();
              return <li key={task.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-900">{task.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{task.code} · {task.quantity} · {task.destination}</span>
                  <span className={`mt-0.5 block text-xs ${overdue ? "font-semibold text-rose-700" : "text-ink-500"}`}>
                    {overdue ? "Đã quá hạn phản hồi: " : "Hạn phản hồi: "}{task.dueAt ? date(task.dueAt) : "theo thư mời của Vexim"}
                  </span>
                </span>
                <a href={`mailto:${supplierReplyAddress(task.code, task.matchId)}?subject=${encodeURIComponent(`Phản hồi ${task.code}`)}`} className="btn btn-ghost btn-sm">Trả lời qua email</a>
              </li>;
            })}</ul> : review?.status !== "returned" && <EmptyRow>Chưa có lời mời báo giá cần phản hồi. Vexim sẽ liên hệ khi có RFQ phù hợp.</EmptyRow>}
          {dashboard.tasks.length > 6 && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">Hiển thị 6 việc gần nhất. Xem toàn bộ trong danh sách RFQ bên dưới.</p>}
        </Panel>

        <Panel id="rfqs" icon={<PackageSearch className="h-4 w-4 text-brand-700" />} title="RFQ Vexim đã chuyển" count={dashboard.invites.length}
          sub="Thông tin buyer được giữ kín. Trả lời email mời chào giá của Vexim, không liên hệ buyer trực tiếp."
          action={dashboard.invites.length > 5 ? <Link href={`/supplier/portal?rfqs=all#rfqs`} className="text-xs font-bold text-brand-700 hover:underline">Xem tất cả</Link> : undefined}>
          {dashboard.invites.length ? <ul className="divide-y divide-ink-100">
            {shownInvites.map((item) => <li key={item.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{item.title}</span>
                <span className="mt-0.5 block text-xs text-ink-500">{item.code} · {item.quantity} · {item.destination} · chuyển ngày {date(item.sentAt)}</span>
                <span className="mt-0.5 block text-xs text-ink-500">Hạn phản hồi: {item.dueAt ? date(item.dueAt) : "theo email Vexim"}{item.quotePrice ? ` · Giá đã ghi nhận: ${item.quotePrice}` : ""}</span>
                {item.repliedAt && <span className="mt-0.5 block text-xs font-semibold text-emerald-700">Đã ghi nhận phản hồi ngày {date(item.repliedAt)}; Vexim sẽ xử lý nội dung.</span>}
              </span>
              <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800">{item.status}</span>
            </li>)}</ul> : <EmptyRow>Chưa có RFQ nào được Vexim chuyển cho doanh nghiệp.</EmptyRow>}
        </Panel>

        <Panel id="report" icon={<TrendingUp className="h-4 w-4 text-brand-700" />} title="Báo cáo lời mời báo giá"
          sub="Chỉ tính RFQ Vexim thực sự chuyển cho doanh nghiệp, không tính lượt xem hay doanh thu."
          action={<nav aria-label="Khoảng thời gian báo cáo" className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1">
            {([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal?range=${d}#report`} aria-current={days === d ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${days === d ? "bg-white text-brand-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}>{d} ngày</Link>)}
          </nav>}>
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {([["Được chuyển", dashboard.report.sent], ["Đã phản hồi", dashboard.report.responded],
              ["Đã ghi báo giá", dashboard.report.quoted], ["Vexim đã chọn", dashboard.report.selected]] as const).map(([label, value]) =>
              <div key={label} className="rounded-lg bg-ink-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-ink-600">{label}</p>
                <p className="mt-1 text-2xl leading-none font-black tabular-nums text-ink-900">{value}</p>
              </div>)}
          </div>
          {dashboard.report.byProduct.length ? <div className="overflow-x-auto border-t border-ink-100">
            <table className="w-full min-w-[380px] text-left text-sm">
              <thead className="bg-ink-50 text-[11px] font-semibold text-ink-600"><tr><th scope="col" className="px-5 py-2">Sản phẩm nguồn</th><th scope="col" className="px-3 py-2 text-right">Lời mời</th><th scope="col" className="px-5 py-2 text-right">Có báo giá</th></tr></thead>
              <tbody className="divide-y divide-ink-100">{dashboard.report.byProduct.map((row) => <tr key={row.id}>
                <td className="px-5 py-2.5 text-ink-800">{row.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{row.sent}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-ink-700">{row.quoted}</td>
              </tr>)}</tbody>
            </table>
          </div> : <EmptyRow>Chưa có lời mời trong khoảng thời gian này.</EmptyRow>}
          <p className="border-t border-ink-100 px-5 py-2.5 text-[11px] leading-4 text-ink-500">RFQ chung hoặc RFQ không có liên kết sản phẩm xác thực được nhóm riêng; không suy đoán từ tên sản phẩm buyer tự nhập.</p>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel icon={<ShieldCheck className="h-4 w-4 text-brand-700" />} title="Tiến độ cổng">
          <PortalSteps stages={[
            { label: "Hồ sơ doanh nghiệp", state: "done", note: "Hoàn tất" },
            { label: "Kiểm tra giấy tờ L1", state: l1Approved ? "done" : "current", note: l1Approved ? "Đạt" : "Đang rà soát" },
            { label: "Cổng nhà cung cấp", state: "done", note: "Đã mở" },
            { label: "Sản phẩm & RFQ", state: "current", note: `${products.length} sản phẩm · ${dashboard.tasks.length} việc chờ` },
          ]} />
        </Panel>

        <Panel id="notices" icon={<Bell className="h-4 w-4 text-brand-700" />} title={readsKnown ? `Thông báo · ${dashboard.unreadCount} chưa đọc` : "Thông báo"}
          sub={readsKnown ? "RFQ, kết quả kiểm tra, sản phẩm và chứng nhận. Đọc thông báo không thay đổi trạng thái xét duyệt."
            : "Chưa đọc được dấu đã đọc nên mọi thông báo đang hiện như chưa đọc. Nội dung thông báo vẫn đúng."}
          action={dashboard.notices.length > 6 ? <Link href={`/supplier/portal?notices=all#notices`} className="text-xs font-bold text-brand-700 hover:underline">Xem tất cả</Link> : undefined}>
          {dashboard.notices.length ? <ul className="divide-y divide-ink-100">{shownNotices.map((n) => {
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
          })}</ul> : <EmptyRow>Chưa có thông báo mới.</EmptyRow>}
        </Panel>

        <Panel id="profile" icon={<FileText className="h-4 w-4 text-brand-700" />} title="Hồ sơ & xác minh"
          sub="Ba đánh giá độc lập. Chỉ nhân viên Vexim có quyền xác nhận kết quả.">
          <div className="space-y-3 p-5">
            <VerifyRow level="L1" title="Kiểm tra giấy tờ"
              status={l1Approved ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung" : review?.status === "submitted" ? "Chờ duyệt" : "Đang rà soát"}
              on={l1Approved} />
            {([2, 3] as const).map((step) => {
              const approved = step === 2 ? l2Approved : l3Approved;
              const own = submissions.find((s) => s.target_level === step);
              const contact = requests.find((r) => r.target_level === step);
              const status = approved ? "Đã duyệt" : own?.status === "pending_review" ? "Hồ sơ tự gửi đang chờ xét" : own?.status === "returned" ? "Cần bổ sung bằng chứng"
                : own?.status === "accepted" ? "Vexim đã nhận vào đợt kiểm" : contact?.status === "contacted" ? "Vexim đã ghi nhận liên hệ" : "Chưa có bằng chứng";
              return <VerifyRow key={step} level={`L${step}`} title={step === 2 ? "Xác thực nhà máy" : "Lịch sử xuất khẩu"} status={status} on={approved} />;
            })}
            <Link href="/supplier/portal/verification" className="btn btn-soft w-full">Mở cổng tự xác thực L2 · L3</Link>
            <p className="text-[11px] leading-4 text-ink-500">Tải bằng chứng không tự cấp huy hiệu. Nhãn buyer chỉ xuất hiện cho từng đánh giá được nhân viên Vexim kiểm và người có quyền duyệt phê.</p>
          </div>
        </Panel>
      </div>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <Panel icon={<FileText className="h-4 w-4 text-brand-700" />} title="Thông tin đã khai" sub="Cần sửa thông tin hoặc số tài khoản đã khai, liên hệ nhân viên Vexim.">
        <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
          <Info label="Tên doanh nghiệp" value={supplier.name} /><Info label="Mã số thuế (tự khai)" value={review?.tax_number} />
          <Info label="Người liên hệ" value={supplier.contact_name} /><Info label="Điện thoại" value={supplier.phone} />
          <Info label="Địa chỉ" value={supplier.address} /><Info label="Mặt hàng chính" value={supplier.products} />
        </dl>
      </Panel>

      <Panel id="documents" icon={<FileCheck2 className="h-4 w-4 text-brand-700" />} title="Giấy tờ & chứng nhận L1"
        sub="Giấy phép kinh doanh do Vexim đối chiếu thủ công. Chứng nhận được AI quét đơn vị đứng tên và ngày hết hạn; hệ thống nhắc trước 60 / 30 / 7 / 1 ngày."
        action={<span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${l1Approved ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
          {l1Approved ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung" : "Đang rà soát"}</span>}>
        <div className="space-y-4 p-5">
          {mine.length > 0 && <ul className="space-y-2 text-sm">{mine.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
            <span className="text-ink-800">{L1_DOC_ITEMS.find((i) => i.key === m.checklist_key)?.label ?? "Giấy tờ"}: {m.caption}</span>
            <a href={`/api/media/file/${m.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Xem tệp</a></li>)}</ul>}
          {allowedDocUpload ? <SupplierPortalUpload /> : <p className="text-[13px] text-ink-500">Đợt kiểm giấy tờ cơ bản đang khóa thêm tệp; bạn vẫn có thể tải mới hoặc gia hạn các chứng nhận bên dưới bất kỳ lúc nào.</p>}
          <div className="border-t border-ink-100 pt-4">
            <h3 className="text-[13px] font-bold text-ink-900">Chứng nhận trên hồ sơ ({certificates.length})</h3>
            {certificates.length > 0 ? <ul className="mt-3 space-y-2 text-sm">{certificates.map((c) => {
              const left = daysUntilExpiry(c.valid_until);
              const live = Boolean(c.review_status === "approved" && c.publicly_visible && !c.staff_hidden && left !== null && left >= 0 && (c.holder_match === "owner" || c.holder_match === "partner"));
              return <li key={c.id} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-900">{c.name}{c.number ? ` · #${c.number}` : ""}</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2.5 py-0.5 font-bold ${c.holder_match === "owner" ? "bg-emerald-100 text-emerald-800" : c.holder_match === "partner" ? "bg-amber-100 text-amber-900" : "bg-ink-200 text-ink-700"}`}>
                      {c.holder_match === "owner" ? `Chính chủ${c.holder_name ? ` (${c.holder_name})` : ""}` : c.holder_match === "partner" ? `Đối tác: ${c.holder_name || "—"}` : "Chưa rõ đơn vị đứng tên"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${left === null ? "bg-ink-200 text-ink-700" : left < 0 ? "bg-rose-100 text-rose-800" : left <= 60 ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>
                      {c.valid_until ? `Hết hạn ${c.valid_until}${left !== null ? (left < 0 ? " · đã quá hạn, tải bản mới" : left <= 60 ? ` · còn ${left} ngày` : ` · còn ${left} ngày`) : ""}` : "Chưa đọc được ngày hết hạn"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 font-bold ${c.staff_hidden ? "bg-rose-100 text-rose-800" : live ? "bg-emerald-100 text-emerald-800" : "bg-ink-200 text-ink-700"}`}>
                      {c.staff_hidden ? "Vexim đang ẩn" : live ? "Đang hiển thị công khai" : "Chưa hiển thị công khai"}
                    </span>
                  </div>
                </div>
                {(c.review_note || c.ai_summary) && <p className="mt-1 text-[11px] text-ink-600">{c.review_note || c.ai_summary}</p>}
              </li>;
            })}</ul> : <p className="mt-2 text-xs text-ink-500">Chưa có chứng nhận nào trên hồ sơ. Tải PDF hoặc ảnh bên dưới để AI tự quét đơn vị đứng tên và ngày hết hạn.</p>}
            <SupplierCertificateUpload certificates={certificates.map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))} />
          </div>
        </div>
      </Panel>
    </div>

    <footer className="mt-8 flex items-start gap-2 border-t border-ink-200 pt-4 text-[11px] leading-5 text-ink-500">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Vexim là đầu mối điều phối. Không chia sẻ thông tin buyer trước khi các bên được giới thiệu theo quy trình.</span>
    </footer>
  </>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "NCC";
  const words = parts.filter((w) => /\p{Lu}/u.test(w[0] ?? ""));
  const pick = words.length >= 2 ? [words[0], words[words.length - 1]] : [parts[0]];
  return pick.map((w) => w[0]).join("").toUpperCase();
}

function date(value: string) { return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }); }

function Panel({ id, icon, title, sub, count, action, children }: {
  id?: string; icon?: React.ReactNode; title: string; sub?: string; count?: number; action?: React.ReactNode; children: React.ReactNode;
}) {
  return <section id={id} className="scroll-mt-6 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
          {icon}{title}
          {typeof count === "number" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{count}</span>}
        </h2>
        {sub && <p className="mt-1 text-[11.5px] leading-5 text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

function Kpi({ href, icon, label, value, note, attention = false }: {
  href: string; icon: React.ReactNode; label: string; value: number; note: string; attention?: boolean;
}) {
  return <Link href={href} className="group flex min-h-[136px] flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
    <span className="flex items-center">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${attention ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700"}`}>{icon}</span>
      <ArrowUpRight className="ml-auto h-4 w-4 text-ink-300 transition group-hover:text-brand-600" aria-hidden="true" />
    </span>
    <span className="mt-3 block text-[26px] leading-none font-black tracking-tight tabular-nums text-ink-900">{value.toLocaleString("vi-VN")}</span>
    <span className="mt-1.5 block text-[13px] leading-4 font-bold text-ink-800">{label}</span>
    <span className="mt-auto block pt-1 text-[11px] leading-4 text-ink-500">{note}</span>
  </Link>;
}

function LevelChip({ label, on, pending }: { label: string; on: boolean; pending?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-emerald-50 text-emerald-800" : pending ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-600"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-600" : pending ? "bg-amber-500" : "bg-ink-400"}`} aria-hidden="true" />
    {label}
  </span>;
}

function VerifyRow({ level, title, status, on }: { level: string; title: string; status: string; on: boolean }) {
  return <div className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5">
    <span className={`mt-0.5 flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-black ${on ? "bg-emerald-600 text-white" : "bg-ink-200 text-ink-700"}`}>{level}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
      <span className={`mt-0.5 block text-[11.5px] ${on ? "font-semibold text-emerald-700" : "text-ink-600"}`}>{status}</span>
    </span>
  </div>;
}

function NoticeIcon({ kind, unread }: { kind?: string; unread: boolean }) {
  const map: Record<string, { icon: React.ReactNode; tone: string }> = {
    rfq: { icon: <Mail className="h-4 w-4" />, tone: "bg-brand-50 text-brand-700" },
    verification: { icon: <ShieldCheck className="h-4 w-4" />, tone: "bg-emerald-50 text-emerald-700" },
    contact: { icon: <ClipboardCheck className="h-4 w-4" />, tone: "bg-sky-50 text-sky-700" },
    product: { icon: <Package className="h-4 w-4" />, tone: "bg-amber-50 text-amber-800" },
    certificate: { icon: <FileText className="h-4 w-4" />, tone: "bg-ink-100 text-ink-700" },
  };
  const style = map[kind ?? ""] ?? { icon: <Bell className="h-4 w-4" />, tone: "bg-ink-100 text-ink-700" };
  return <span className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
    {style.icon}
    {unread && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" aria-hidden="true" />}
  </span>;
}

function PortalSteps({ stages }: { stages: { label: string; state: "done" | "current" | "todo"; note: string }[] }) {
  return <ol className="space-y-2 p-5">{stages.map((stage, i) => (
    <li key={stage.label} className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${stage.state === "done" ? "bg-brand-700 text-white" : stage.state === "current" ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-ink-100 text-ink-500"}`}>
        {stage.state === "done" ? "✓" : i + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${stage.state === "todo" ? "text-ink-600" : "text-ink-900"}`}>{stage.label}</span>
        <span className={`mt-0.5 block text-[11.5px] ${stage.state === "done" ? "font-semibold text-brand-800" : "text-ink-500"}`}>{stage.note}</span>
      </span>
    </li>))}
  </ol>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-[13px] text-ink-500">{children}</p>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-[11px] font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-[13px] text-ink-900">{value || "—"}</dd></div>;
}
