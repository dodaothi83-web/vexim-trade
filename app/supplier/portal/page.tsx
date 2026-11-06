import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartNoAxesColumn, Clock3, Mail, Package, Phone, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { COMPANY } from "@/lib/config";
import { requireSession } from "@/lib/auth/session";
import { supplierAccountAccess, supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile, portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { productReview } from "@/lib/supplier-portal/product-view";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { categoryRequestViews } from "@/lib/supplier-portal/requested-category";
import { isL1BusinessLicense } from "@/lib/verification";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { migrationHint } from "@/lib/db/migration-hints";
import { buildVerificationProgress } from "@/lib/supplier-portal/verification-progress";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { l2ScopeForSupplier } from "@/lib/l2-scope";
import type { SupplierSubmissionItem } from "@/lib/types";
import { SupplierProfileForm } from "./supplier-profile-form";
import { Kpi, LevelChip, Panel, PortalSteps, date } from "./portal-ui";
import { VerificationProgressPanel } from "./verification-progress";
import { PendingProfileRefresh } from "./pending-profile-refresh";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.overview.title, robots: { index: false, follow: false } };
}

/**
 * Trang tổng quan chỉ làm một việc: cho doanh nghiệp thấy gian hàng đang ở đâu và
 * việc gì đang chờ. Danh sách RFQ, thông báo, giấy tờ và hồ sơ nằm ở trang riêng.
 */
export default async function SupplierPortal() {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  const { locale, intl, m } = await getPortalMessages();
  const copy = m.overview;
  const account = await supplierAccountAccess();
  if (!account) redirect("/login");
  if (!account.user.supplier_id) {
    const categories = categoryProposalOptions(await account.store.listCategories({ publishedOnly: true }));
    // Chưa có hồ sơ thì cũng chưa có yêu cầu ngành; tham số rỗng để form hiện đúng khung.
    return <>
      {/* Không đặt bước ở đây: biểu mẫu đã có một chỉ báo tiến trình duy nhất ở cột phải. */}
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={account.user.email} />
      <div className="mt-5"><SupplierProfileForm email={account.user.email} accountName={account.user.name} categories={categories} messages={m.onboarding} types={m.shared.supplierTypes} lang={locale} /></div>
    </>;
  }
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  const { supplier, review, reviews, user, store } = access;
  const categoryOptions = !portalApproved(supplier) && canSubmitProfile(supplier)
    ? categoryProposalOptions(await store.listCategories({ publishedOnly: true })) : [];
  // Yêu cầu mở ngành đã gửi: NCC đọc được câu trả lời (đang xem xét / đã mở / lý do từ chối)
  // ngay trong form. Bảng lỗi/thiếu migration không được làm hỏng trang.
  const categoryRows = !portalApproved(supplier) && canSubmitProfile(supplier)
    ? await store.listSupplierCategoryRequests(supplier.id).catch((error) => {
        console.error("[supplier-portal] could not read category requests", error);
        return [];
      })
    : [];
  // Giấy xác minh đã có trong đợt kiểm trước thì không bắt NCC tải lại khi bổ sung hồ sơ.
  const hasCoreDoc = !portalApproved(supplier) && canSubmitProfile(supplier) && !!review &&
    (await store.listMedia("verification", review.id)).some((m) => m.storage_path && isL1BusinessLicense(m.checklist_key));
  // Until Vexim explicitly approves this account, never query/render RFQs, reports or notices.
  if (!portalApproved(supplier)) return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={user.email} />
    {canSubmitProfile(supplier) ? <>
      {/* Chỉ giữ cảnh báo khi thật sự phải sửa; hồ sơ mới đọc tiến trình ở cột phải của biểu mẫu. */}
      {supplier.onboarding_status === "changes_requested" && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">{copy.changesRequested.title}</p>
        {supplier.onboarding_note &&
          <p className="mt-2 whitespace-pre-wrap">{fill(copy.changesRequested.note, { note: supplier.onboarding_note })}</p>}
      </div>}
      <div className="mt-5"><SupplierProfileForm supplier={supplier} email={user.email} accountName={user.name} categories={categoryOptions}
        categoryRequests={categoryRequestViews(categoryRows)} hasCoreDoc={hasCoreDoc} messages={m.onboarding} types={m.shared.supplierTypes} lang={locale} /></div>
    </> : <>
      {/* Màn chờ duyệt: một thẻ trạng thái (đã gửi gì, bao lâu, kết quả về đâu) và tiến trình ngang,
          rồi hai thẻ phụ: việc làm được sau khi duyệt và cách liên hệ. Màu trung tính vì đây là
          trạng thái bình thường, không phải cảnh báo. */}
      <section role="status" className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink-900">{copy.pending.title}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-700">{fill(copy.pending.body, { company: supplier.display_name || supplier.trade_name || supplier.name, email: user.email })}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[12px] font-semibold text-ink-700">
              <Clock3 className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" /> {copy.pending.timing}
            </p>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-4 sm:gap-2">
          {([
            [copy.pending.steps.submit, "done"],
            [copy.pending.steps.review, "current"],
            [copy.pending.steps.open, "todo"],
            [copy.pending.steps.products, "todo"],
          ] as const).map(([step, state], i) => <li key={step.label} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
            <span className="flex shrink-0 items-center gap-2 sm:w-full">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${state === "done" ? "bg-brand-700 text-white" : state === "current" ? "bg-amber-100 text-amber-900 ring-2 ring-amber-300" : "bg-ink-100 text-ink-500"}`}>
                {state === "done" ? "✓" : i + 1}
              </span>
              {i < 3 && <span aria-hidden="true" className={`hidden h-0.5 flex-1 rounded sm:block ${state === "done" ? "bg-brand-700" : "bg-ink-200"}`} />}
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-semibold ${state === "todo" ? "text-ink-500" : "text-ink-900"}`}>{step.label}</span>
              <span className={`block text-[12px] ${state === "current" ? "font-semibold text-amber-700" : state === "done" ? "text-brand-800" : "text-ink-500"}`}>{step.note}</span>
            </span>
          </li>)}
        </ol>
      </section>

    {/* Hồ sơ đang chờ duyệt vẫn phải thấy câu trả lời về ngành họ đề nghị, nếu không họ sẽ
        tưởng yêu cầu bị bỏ quên và đăng ký tài khoản thứ hai. */}
    {categoryRows.length > 0 && <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
      <p className="text-sm font-bold text-ink-900">{m.onboarding.picker.requestsTitle}</p>
      <ul className="mt-2 space-y-1 text-[12.5px] leading-snug">
        {categoryRequestViews(categoryRows).map((request) => <li key={`${request.label}-${request.status}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-ink-800">{request.label}</span>
          <span className={request.status === "opened" ? "font-semibold text-emerald-700"
            : request.status === "rejected" ? "font-semibold text-rose-700" : "font-semibold text-amber-700"}>
            {m.onboarding.picker.requestStatus[request.status]}
          </span>
          {request.status === "rejected" && request.note &&
            <span className="text-ink-600">{fill(m.onboarding.picker.requestNote, { note: request.note })}</span>}
        </li>)}
      </ul>
    </div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-white p-5">
          <h3 className="text-sm font-bold text-ink-900">{copy.pending.afterTitle}</h3>
          <ul className="mt-3 space-y-2">{m.onboarding.unlock.map((line) => <li key={line} className="flex items-start gap-2 text-[13px] leading-5 text-ink-700">
            <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-700">✓</span>{line}
          </li>)}</ul>
        </section>
        <section className="rounded-xl border border-ink-200 bg-white p-5">
          <h3 className="text-sm font-bold text-ink-900">{copy.pending.helpTitle}</h3>
          <p className="mt-1 text-[13px] text-ink-600">{copy.pending.helpBody}</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li><a href={`tel:${COMPANY.phone}`} className="inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{COMPANY.phoneDisplay}</a></li>
            <li><a href={`mailto:${COMPANY.contactEmail}`} className="inline-flex items-center gap-2 font-semibold text-brand-700 hover:underline"><Mail className="h-4 w-4" aria-hidden="true" />{COMPANY.contactEmail}</a></li>
          </ul>
        </section>
      </div>
      <PendingProfileRefresh lang={locale}>{copy.pending.disclaimer}</PendingProfileRefresh>
    </>}
  </>;
  // Một bảng thiếu migration không được làm trắng cả cổng. Từng phần được tải riêng:
  // phần nào lỗi thì ghi log, dùng giá trị rỗng và hiện cảnh báo ngay trên trang.
  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      // Log dành cho người vận hành, không phải người dùng: giữ tiếng Anh cho đồng nhất với log máy chủ.
      console.error(`[supplier-portal] could not read ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [products, invites, certificates, submissions, requests, l1Media] = await Promise.all([
    optional(copy.degraded.labels.products, [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
    optional(copy.degraded.labels.invites, [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional(copy.degraded.labels.certificates, [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional(copy.degraded.labels.submissions, [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
    optional(copy.degraded.labels.requests, [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional(copy.degraded.labels.documents, [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
  ]);
  // Số ảnh/chứng từ đã tải quyết định câu “còn mấy mục”: đọc riêng để một bảng
  // thiếu migration chỉ làm mất phần đếm, không làm hỏng cả dải tiến độ.
  const submissionItems = await optional(copy.degraded.labels.items, {} as Record<string, SupplierSubmissionItem[]>,
    async () => Object.fromEntries(await Promise.all(submissions.map(async (submission) =>
      [submission.id, await store.listSubmissionItems(submission.id)] as const))));
  const verification = buildVerificationProgress({
    supplierId: supplier.id, supplierType: supplier.supplier_type, reviews, submissions, submissionItems, requests, documents: l1Media, userId: user.id,
    // Câu của từng bước do mô hình sinh ra, nên ngôn ngữ phải truyền vào đây chứ không
    // chỉ đổi phần khung của khối.
    locale,
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
  const l2Label = l2Scope === "partner_contract"
    ? copy.status.checks.l2Partner
    : l2Scope === "factory"
      ? copy.status.checks.l2Factory
      : copy.status.checks.l2Unknown;
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
    { show: changesCount, href: "/supplier/portal/products", label: copy.work.rows.changes, value: changesCount, tone: "rose" },
    { show: pendingCount, href: "/supplier/portal/products", label: copy.work.rows.pending, value: pendingCount, tone: "amber" },
    { show: board.tasks.length, href: "/supplier/portal/rfqs", label: copy.work.rows.rfqs, value: board.tasks.length, tone: "amber" },
    { show: expiringCerts, href: "/supplier/portal/documents", label: copy.work.rows.expiring, value: expiringCerts, tone: "amber" },
    { show: queuedSubmissions, href: "/supplier/portal/verification", label: copy.work.rows.submissions, value: queuedSubmissions, tone: "brand" },
  ].filter((row) => row.show > 0);

  return <div lang={locale}>
    <PageHeader title={copy.title} sub={`${supplier.name} · ${user.email}`}
      actions={<Link href="/supplier/portal/products/new" className="btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" />{copy.actions.addProduct}</Link>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{copy.degraded.title}</p>
      <p className="mt-1">{copy.degraded.body}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <section aria-label={copy.status.aria} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-900 text-[15px] font-black text-white sm:row-span-2">{initials(supplier.name)}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-1">
          <h2 className="truncate text-[15px] font-bold text-ink-900">{supplier.display_name || supplier.trade_name || supplier.name}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${publishedProfile ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
            {publishedProfile ? copy.status.published : copy.status.unpublished}
          </span>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold text-brand-800">{copy.status.portalOpen}</span>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-600 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:gap-x-4">
          <LevelChip label={copy.status.checks.business} messages={copy.levelChip} on={l1Approved} pending={review?.status === "submitted" || review?.status === "in_progress"} />
          <LevelChip label={l2Label} messages={copy.levelChip} on={l2Step?.state === "approved"} pending={l2Step?.state === "reviewing"} />
          <LevelChip label={copy.status.checks.l3} messages={copy.levelChip} on={l3Approved} pending={submissions.some((s) => s.target_level === 3 && s.status === "pending_review")} />
          <span>{fill(copy.status.products, { count: products.length.toLocaleString(intl) })}</span>
          <span>{fill(copy.status.certificates, { count: certificates.length.toLocaleString(intl) })}</span>
        </div>
        <div className="col-span-2 mt-1 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0">
          {publishedProfile
            ? <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} className="btn btn-ghost btn-sm w-full sm:w-auto">{copy.status.viewPublic}</Link>
            : <p className="max-w-[220px] text-[11px] leading-4 text-ink-500">{copy.status.publicNote}</p>}
        </div>
      </div>
    </section>

    <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label={copy.kpi.aria}>
      <Kpi href="/supplier/portal/products" icon={<Package className="h-4 w-4" />} label={copy.kpi.approved.label} value={approvedCount} intl={intl}
        note={fill(copy.kpi.approved.note, { total: products.length.toLocaleString(intl) })} />
      <Kpi href="/supplier/portal/products" icon={<Clock3 className="h-4 w-4" />} label={copy.kpi.pending.label} value={pendingCount} intl={intl}
        note={fill(copy.kpi.pending.note, { draft: draftCount, changes: changesCount, paused: pausedCount })} attention={pendingCount > 0 || changesCount > 0} />
      <Kpi href="/supplier/portal/rfqs" icon={<Mail className="h-4 w-4" />} label={copy.kpi.rfqs.label} value={board.tasks.length} intl={intl}
        note={nextDueAt
          ? fill(copy.kpi.rfqs.nextDue, { date: date(nextDueAt, intl) })
          : overdueDueAt
            ? fill(copy.kpi.rfqs.overdue, { date: date(overdueDueAt, intl) })
            : copy.kpi.rfqs.none} attention={board.tasks.length > 0} />
      <Kpi href="/supplier/portal/rfqs?range=30" icon={<ChartNoAxesColumn className="h-4 w-4" />} label={copy.kpi.received.label} value={board.report.sent} intl={intl}
        note={fill(copy.kpi.received.note, { count: board.report.responded })} />
    </div>

    {/* Việc cần xử lý chỉ hiện khi có việc; khi trống chỉ một dòng ngắn. */}
    <div className="mt-5">
      {work.length ? <Panel title={copy.work.title} count={work.length} flush>
        <ul className="divide-y divide-ink-100">{work.map((row) => <li key={row.label}>
          <Link href={row.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.tone === "rose" ? "bg-rose-500" : row.tone === "amber" ? "bg-amber-500" : "bg-brand-500"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-800">{row.label}</span>
            <span className="text-[13px] font-black tabular-nums text-ink-900">{row.value}</span>
          </Link>
        </li>)}</ul>
      </Panel> : <p className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-[13px] text-ink-500">{copy.work.empty}</p>}
    </div>

    <div className="mt-5"><VerificationProgressPanel progress={verification} messages={copy.verificationPanel} lang={locale} /></div>

    <footer className="mt-8 flex items-start gap-2 border-t border-ink-200 pt-4 text-[11px] leading-5 text-ink-500">
      <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{copy.footer}</span>
    </footer>
  </div>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "DN";
  const words = parts.filter((w) => /\p{Lu}/u.test(w[0] ?? ""));
  const pick = words.length >= 2 ? [words[0], words[words.length - 1]] : [parts[0]];
  return pick.map((w) => w[0]).join("").toUpperCase();
}
