import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartNoAxesColumn, Clock3, Mail, Package, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import { supplierAccountAccess, supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile, portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { productReview } from "@/lib/supplier-portal/product-view";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { isL1CoreDoc } from "@/lib/verification";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { migrationHint } from "@/lib/db/migration-hints";
import { buildVerificationProgress } from "@/lib/supplier-portal/verification-progress";
import { l2ScopeForSupplier } from "@/lib/l2-scope";
import type { SupplierSubmissionItem } from "@/lib/types";
import { SupplierProfileForm } from "./supplier-profile-form";
import { EmptyRow, Kpi, LevelChip, Panel, PortalSteps, date } from "./portal-ui";
import { VerificationProgressPanel } from "./verification-progress";
import { PendingProfileRefresh } from "./pending-profile-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tổng quan cổng nhà cung cấp", robots: { index: false, follow: false } };

/**
 * Trang tổng quan chỉ làm một việc: cho doanh nghiệp thấy gian hàng đang ở đâu và
 * việc gì đang chờ. Danh sách RFQ, thông báo, giấy tờ và hồ sơ nằm ở trang riêng.
 */
export default async function SupplierPortal() {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  const account = await supplierAccountAccess();
  if (!account) redirect("/login");
  if (!account.user.supplier_id) {
    const categories = categoryProposalOptions(await account.store.listCategories({ publishedOnly: true }));
    return <>
      <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Tổng quan" sub={account.user.email} />
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="text-base font-bold">Bước 2/2 · Xác minh doanh nghiệp</h2>
        <p className="mt-2 leading-6">Tài khoản đã đăng nhập, nhưng bạn chưa gửi hồ sơ doanh nghiệp. Hãy điền form bên dưới để tạo trang doanh nghiệp ở trạng thái nháp và gửi duyệt. Trong lúc chờ duyệt, bạn chưa thể quản lý sản phẩm, xem RFQ hay dùng các chức năng khác.</p>
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
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Tổng quan" sub={user.email} />
    {canSubmitProfile(supplier) ? <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {supplier.onboarding_status === "changes_requested" ? "Hồ sơ cần bổ sung thông tin. Vui lòng cập nhật và gửi lại." :
          "Tài khoản đã tạo. Hoàn thiện hồ sơ doanh nghiệp để được xác nhận; các tính năng khác sẽ mở sau bước này."}
        {supplier.onboarding_status === "changes_requested" && supplier.onboarding_note &&
          <p className="mt-2 whitespace-pre-wrap font-semibold">Nội dung cần bổ sung: {supplier.onboarding_note}</p>}
      </div>
      <div className="mt-5"><SupplierProfileForm supplier={supplier} email={user.email} categories={categoryOptions} hasCoreDoc={hasCoreDoc} /></div>
    </> : <><PendingProfileRefresh /><div className="rounded-xl border border-amber-200 bg-amber-50 p-6" role="status">
      <h2 className="text-base font-bold text-amber-950">Hồ sơ đang chờ xác nhận</h2>
      <p className="mt-2 text-sm text-amber-900">Hồ sơ {supplier.name} đã được gửi. Bạn vẫn đăng nhập được để xem trạng thái, nhưng RFQ, thông báo, báo cáo và tải thêm tài liệu sẽ mở sau khi hồ sơ được xác nhận.</p>
      <p className="mt-3 text-xs text-amber-800">Xác nhận tài khoản không đồng nghĩa duyệt giấy tờ, xác thực nhà máy, lịch sử giao hàng hoặc công khai hồ sơ.</p>
    </div>
    <div className="mt-5"><PortalSteps stages={[
      { label: "Khai hồ sơ", state: "done", note: "Đã gửi" },
      { label: "Xác nhận hồ sơ", state: "current", note: "Đang chờ Vexim" },
      { label: "Mở cổng nhà cung cấp", state: "todo", note: "Khi Vexim xác nhận" },
      { label: "Thêm sản phẩm & nhận RFQ", state: "todo", note: "Sau khi mở cổng" },
    ]} /></div></>}
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
  const [products, invites, certificates, submissions, requests, l1Media] = await Promise.all([
    optional("sản phẩm", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
    optional("danh sách RFQ được chuyển", [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("hồ sơ tự gửi", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
    optional("yêu cầu kiểm định", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("giấy tờ đợt kiểm", [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
  ]);
  // Số ảnh/chứng từ đã tải quyết định câu “còn mấy mục”: đọc riêng để một bảng
  // thiếu migration chỉ làm mất phần đếm, không làm hỏng cả dải tiến độ.
  const submissionItems = await optional("bằng chứng đã nộp", {} as Record<string, SupplierSubmissionItem[]>,
    async () => Object.fromEntries(await Promise.all(submissions.map(async (submission) =>
      [submission.id, await store.listSubmissionItems(submission.id)] as const))));
  const verification = buildVerificationProgress({
    supplierId: supplier.id, supplierType: supplier.supplier_type, reviews, submissions, submissionItems, requests, documents: l1Media, userId: user.id,
  });
  const board = buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days: 30 });

  const approvedCount = products.filter((p) => productReview(p) === "approved").length;
  const pendingCount = products.filter((p) => productReview(p) === "pending").length;
  const draftCount = products.filter((p) => productReview(p) === "draft").length;
  const changesCount = products.filter((p) => productReview(p) === "changes_requested").length;
  const pausedCount = products.filter((p) => productReview(p) === "paused").length;
  const l1Approved = reviews.some((v) => v.target_level === 1 && v.status === "approved");
  // Use the same scope-aware state as the progress panel: an older factory
  // result must never light up a trader's partner-contract check (or vice versa).
  const l2Step = verification.steps.find((step) => step.level === 2);
  const l2Scope = l2ScopeForSupplier(supplier.supplier_type);
  const l2Label = l2Scope === "partner_contract" ? "L2 · Nhà máy đối tác" : l2Scope === "factory" ? "L2 · Nhà máy" : "L2 · Chưa rõ loại hình";
  const l3Approved = reviews.some((v) => v.target_level === 3 && v.status === "approved");
  const publishedProfile = supplier.status === "published";
  const expiringCerts = certificates.filter((c) => {
    const left = daysUntilExpiry(c.valid_until);
    return left !== null && left >= 0 && left <= 60;
  }).length;
  const queuedSubmissions = submissions.filter((s) => s.status === "pending_review").length;
  const openDues = board.tasks.map((t) => t.dueAt).filter((d): d is string => !!d).sort();
  const nextDueAt = openDues.find((d) => Date.parse(d) >= Date.now()) ?? null;
  const overdueDueAt = openDues.find((d) => Date.parse(d) < Date.now()) ?? null;

  const work = [
    { show: changesCount, href: "/supplier/portal/products", label: "Sản phẩm cần chỉnh sửa theo góp ý", value: changesCount, tone: "rose" },
    { show: pendingCount, href: "/supplier/portal/products", label: "Sản phẩm đang chờ duyệt nội dung", value: pendingCount, tone: "amber" },
    { show: board.tasks.length, href: "/supplier/portal/rfqs", label: "RFQ đang chờ bạn phản hồi", value: board.tasks.length, tone: "amber" },
    { show: expiringCerts, href: "/supplier/portal/documents", label: "Chứng nhận sắp hết hạn trong 60 ngày", value: expiringCerts, tone: "amber" },
    { show: queuedSubmissions, href: "/supplier/portal/verification", label: "Hồ sơ xác thực đang chờ xét", value: queuedSubmissions, tone: "brand" },
  ].filter((row) => row.show > 0);

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Tổng quan" sub={`${supplier.name} · ${user.email}`}
      actions={<Link href="/supplier/portal/products/new" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" />Thêm sản phẩm</Link>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu cổng chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <section aria-label="Trạng thái gian hàng" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-900 text-[15px] font-black text-white sm:row-span-2">{initials(supplier.name)}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1">
          <h2 className="truncate text-[15px] font-bold text-ink-900">{supplier.display_name || supplier.trade_name || supplier.name}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${publishedProfile ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
            {publishedProfile ? "Hồ sơ đang công khai" : "Hồ sơ chưa công khai"}
          </span>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-800">Cổng đã mở</span>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-600 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:gap-x-4">
          <LevelChip label="L1 · Giấy tờ" on={l1Approved} pending={review?.status === "submitted" || review?.status === "in_progress"} />
          <LevelChip label={l2Label} on={l2Step?.state === "approved"} pending={l2Step?.state === "reviewing"} />
          <LevelChip label="L3 · Xuất khẩu" on={l3Approved} pending={submissions.some((s) => s.target_level === 3 && s.status === "pending_review")} />
          <span>{products.length} sản phẩm</span>
          <span>{certificates.length} chứng nhận</span>
        </div>
        <div className="col-span-2 mt-1 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0">
          {publishedProfile
            ? <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} className="btn btn-ghost btn-sm w-full sm:w-auto">Xem trang công khai</Link>
            : <p className="max-w-[220px] text-[11px] leading-4 text-ink-500">Trang công khai chỉ mở sau khi nội dung được duyệt và hồ sơ được xuất bản.</p>}
        </div>
      </div>
    </section>

    <div className="mt-5"><VerificationProgressPanel progress={verification} /></div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Số liệu gian hàng">
      <Kpi href="/supplier/portal/products" icon={<Package className="h-4 w-4" />} label="Sản phẩm đã duyệt nội dung" value={approvedCount}
        note={`Trên ${products.length} sản phẩm trong gian hàng`} />
      <Kpi href="/supplier/portal/products" icon={<Clock3 className="h-4 w-4" />} label="Đang chờ duyệt" value={pendingCount}
        note={`${draftCount} bản nháp · ${changesCount} cần chỉnh sửa · ${pausedCount} tạm ẩn`} attention={pendingCount > 0 || changesCount > 0} />
      <Kpi href="/supplier/portal/rfqs" icon={<Mail className="h-4 w-4" />} label="RFQ cần bạn phản hồi" value={board.tasks.length}
        note={nextDueAt ? `Hạn gần nhất ${date(nextDueAt)}` : overdueDueAt ? `Có RFQ quá hạn từ ${date(overdueDueAt)}` : "Không có hạn nào đang mở"} attention={board.tasks.length > 0} />
      <Kpi href="/supplier/portal/rfqs?range=30" icon={<ChartNoAxesColumn className="h-4 w-4" />} label="RFQ nhận trong 30 ngày" value={board.report.sent}
        note={`${board.report.responded} lời mời đã có phản hồi`} />
    </div>

    <div className="mt-5">
      <Panel title="Việc đang chờ bạn" sub="Chỉ hiện mục đang có việc. Mở từng trang để xử lý chi tiết." count={work.length} flush>
        {work.length ? <ul className="divide-y divide-ink-100">{work.map((row) => <li key={row.label}>
          <Link href={row.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.tone === "rose" ? "bg-rose-500" : row.tone === "amber" ? "bg-amber-500" : "bg-brand-500"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-800">{row.label}</span>
            <span className="text-[13px] font-black tabular-nums text-ink-900">{row.value}</span>
          </Link>
        </li>)}</ul> : <EmptyRow>Không có việc nào đang chờ. Sản phẩm, giấy tờ và RFQ đều đang ở trạng thái ổn.</EmptyRow>}
      </Panel>
    </div>

    <footer className="mt-8 flex items-start gap-2 border-t border-ink-200 pt-4 text-[11px] leading-5 text-ink-500">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Thông tin buyer chỉ được chia sẻ sau khi hai bên đồng ý giới thiệu. Mọi trao đổi đi qua cổng này.</span>
    </footer>
  </>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "DN";
  const words = parts.filter((w) => /\p{Lu}/u.test(w[0] ?? ""));
  const pick = words.length >= 2 ? [words[0], words[words.length - 1]] : [parts[0]];
  return pick.map((w) => w[0]).join("").toUpperCase();
}
