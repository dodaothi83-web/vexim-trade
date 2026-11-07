import Link from "next/link";
import { CalendarClock, ChevronRight, Inbox, MapPin, ShieldCheck } from "lucide-react";

import { Breadcrumbs, Badge, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { isPartnerL2, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { inVnBounds } from "@/lib/verification";
import type { AppUser, Verification } from "@/lib/types";
import { auditHref, auditItems, auditStep } from "@/lib/verification";

export const dynamic = "force-dynamic";

/** Các đợt kiểm do nhân viên tạo, lọc theo trạng thái. */
const AUDIT_TABS: { key: string; label: string; filter: (v: Verification) => boolean }[] = [
  { key: "submitted", label: "Chờ duyệt", filter: (v) => v.status === "submitted" },
  { key: "in_progress", label: "Đang kiểm", filter: (v) => v.status === "in_progress" || v.status === "scheduled" },
  { key: "returned", label: "Trả lại", filter: (v) => v.status === "returned" },
  { key: "approved", label: "Đã duyệt", filter: (v) => v.status === "approved" },
  { key: "all", label: "Tất cả", filter: () => true },
];

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  scheduled: { label: "Đã lên lịch", tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  in_progress: { label: "Đang kiểm", tone: "bg-sky-50 text-sky-800 ring-sky-200" },
  submitted: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  returned: { label: "Trả lại", tone: "bg-rose-50 text-rose-800 ring-rose-200" },
  approved: { label: "Đã duyệt", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
};

const LEVEL_BADGE: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 ring-slate-200",
  2: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  3: "bg-brand-50 text-brand-700 ring-brand-200",
};

function day(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("vi-VN");
}

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requirePagePermission("verifications.view", "/crm/dashboard");
  const sp = await searchParams;
  const tabKey = sp?.tab ?? "submitted";

  const store = getStore();
  const [vers, suppliers, users, requests, submissions] = await Promise.all([
    store.listVerifications(),
    store.listSuppliers(),
    store.listUsers().catch(() => [] as AppUser[]),
    store.listSupplierVerificationRequests().catch((error) => { console.error("[verification-requests] migration/query failed", error); return []; }),
    store.listSubmissions().catch((error) => { console.error("[self-submissions] chưa đọc được bảng supplier_submissions (chưa cấu hình?)", error); return []; }),
  ]);
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const supplierName = (id: string) => supMap.get(id)?.name ?? "(Nhà cung cấp đã xoá)";
  const pendingSubmissions = submissions.filter((sub) => sub.status === "pending_review" || sub.status === "returned");
  const openRequests = requests.filter((r) => !vers.some((v) =>
    v.supplier_id === r.supplier_id && v.target_level === r.target_level && v.status === "approved" && l2ScopeMatchesSupplier(v, supMap.get(r.supplier_id)?.supplier_type)));

  const auditCounts = Object.fromEntries(AUDIT_TABS.map((t) => [t.key, vers.filter(t.filter).length]));
  // Thứ tự tab theo việc cần làm: duyệt, hồ sơ tự gửi, yêu cầu liên hệ, rồi các trạng thái còn lại.
  const tabs = [
    { key: "submitted", label: "Chờ duyệt", count: auditCounts.submitted, urgent: true },
    { key: "self", label: "Hồ sơ tự gửi", count: pendingSubmissions.length, urgent: true },
    { key: "requests", label: "Yêu cầu liên hệ", count: openRequests.length, urgent: true },
    ...AUDIT_TABS.slice(1).map((t) => ({ key: t.key, label: t.label, count: auditCounts[t.key], urgent: false })),
  ];
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const auditTab = AUDIT_TABS.find((t) => t.key === active.key);
  const audits = auditTab ? vers.filter(auditTab.filter).sort((a, b) => b.updated_at.localeCompare(a.updated_at)) : [];

  const row = "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-ink-50/60";

  return (
    <div className="min-w-0">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "Xác minh nhà cung cấp" },
      ]} />
      <PageHeader
        title="Hàng đợi xác minh nhà cung cấp"
        sub="Kiểm giấy tờ, nhà máy và lịch sử giao hàng. L2/L3 do nhân viên đối chiếu thủ công."
      />

      <nav aria-label="Hàng đợi xác minh" className="mt-4 flex gap-1 overflow-x-auto border-b border-ink-200">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "submitted" ? "/crm/verifications" : `/crm/verifications?tab=${t.key}`}
            aria-current={active.key === t.key ? "page" : undefined}
            className={
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition " +
              (active.key === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")
            }
          >
            {t.label}
            <span className={"rounded-full px-1.5 text-[11px] " + (t.urgent && t.count > 0 ? "bg-amber-100 font-bold text-amber-800" : "bg-ink-100 text-ink-500")}>
              {t.count}
            </span>
          </Link>
        ))}
      </nav>

      {active.key === "self" && (
        pendingSubmissions.length === 0
          ? <EmptyState icon={<Inbox className="h-5 w-5" />} title="Chưa có hồ sơ tự gửi nào chờ xét" sub="Hồ sơ L2/L3 nhà cung cấp gửi qua cổng sẽ hiện ở đây." />
          : <div className="card mt-4 overflow-hidden">
              <p className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[12px] text-ink-600">
                Nhân viên tự đối chiếu ảnh, hợp đồng, chứng từ rồi đưa vào đợt kiểm.{" "}
                <Link href="/crm/verifications/submissions" className="font-semibold text-brand-700 hover:underline">Mở toàn bộ hàng đợi</Link>
              </p>
              <ul className="divide-y divide-ink-100">
                {pendingSubmissions.map((sub) => (
                  <li key={sub.id}>
                    <Link href={`/crm/verifications/submissions/${sub.id}`} className={row}>
                      <span className="min-w-0 flex-1 basis-full truncate text-[14px] font-semibold text-ink-900 sm:basis-0">{supplierName(sub.supplier_id)}</span>
                      <Badge className={LEVEL_BADGE[sub.target_level] ?? LEVEL_BADGE[1]}>
                        {isPartnerL2(sub) ? "L3 · nhà máy đối tác" : sub.target_level === 2 ? "L3 · nhà máy" : "L2 · xuất khẩu"}
                      </Badge>
                      <Badge className={sub.status === "returned" ? STATUS_BADGE.returned.tone : STATUS_BADGE.submitted.tone}>
                        {sub.status === "returned" ? "Cần bổ sung" : "Chờ xét"}
                      </Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
      )}

      {active.key === "requests" && (
        openRequests.length === 0
          ? <EmptyState icon={<Inbox className="h-5 w-5" />} title="Chưa có yêu cầu cần xử lý" sub="Khi nhà cung cấp nhờ Vexim liên hệ để xác minh thêm, yêu cầu sẽ hiện ở đây." />
          : <div className="card mt-4 overflow-hidden">
              <p className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[12px] text-ink-600">
                Nhà cung cấp chỉ chọn nhu cầu. Nhân viên liên hệ và tự thu thập bằng chứng, không tự duyệt hay cấp nhãn.
              </p>
              <ul className="divide-y divide-ink-100">
                {openRequests.map((r) => (
                  <li key={`${r.supplier_id}-${r.target_level}`}>
                    <Link href={auditHref(r.supplier_id, r.target_level)} className={row}>
                      <span className="min-w-0 flex-1 basis-full truncate text-[14px] font-semibold text-ink-900 sm:basis-0">{supplierName(r.supplier_id)}</span>
                      <Badge className={LEVEL_BADGE[r.target_level] ?? LEVEL_BADGE[1]}>
                        {r.target_level === 2 ? supMap.get(r.supplier_id)?.supplier_type === "trading" ? "Nhà máy đối tác" : "Xác thực nhà máy" : "Lịch sử giao hàng"}
                      </Badge>
                      <Badge className={r.status === "contacted" ? STATUS_BADGE.in_progress.tone : STATUS_BADGE.submitted.tone}>
                        {r.status === "contacted" ? "Đã liên hệ" : "Cần liên hệ"}
                      </Badge>
                      <span className="w-20 text-right text-[12px] text-ink-500">{day(r.requested_at)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
      )}

      {auditTab && (
        audits.length === 0
          ? <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="Không có hồ sơ nào" sub="Mở hồ sơ nhà cung cấp để bắt đầu từng trang kiểm toán." />
          : <div className="card mt-4 overflow-hidden">
              {active.key === "submitted" && (
                <p className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-[12px] text-ink-600">
                  Kiểm checklist cùng ảnh và giấy tờ đính kèm trước khi duyệt.
                </p>
              )}
              <ul className="divide-y divide-ink-100">
                {audits.map((v) => {
                  const inspector = v.inspector_id ? userMap.get(v.inspector_id) : null;
                  const items = auditItems(v.target_level, v.l2_scope).length;
                  const doneCount = Object.values(v.checklist).filter((x) => x === true || x === false).length;
                  const gpsOutside = v.target_level === 2 && v.visit_lat != null && v.visit_lng != null && inVnBounds(v.visit_lat, v.visit_lng) === false;
                  const status = STATUS_BADGE[v.status] ?? STATUS_BADGE.returned;
                  return (
                    <li key={v.id}>
                      <Link href={auditHref(v.supplier_id, v.target_level, v.id)} className={row}>
                        <span className="min-w-0 flex-1 basis-full sm:basis-0">
                          <span className="block truncate text-[14px] font-semibold text-ink-900">{supplierName(v.supplier_id)}</span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink-500">
                            {doneCount}/{items} mục đã kiểm
                            {inspector && ` · ${inspector.name?.trim() || inspector.email}`}
                            {v.visit_date && <> · <CalendarClock className="inline h-3 w-3" /> đi kiểm {day(v.visit_date)}</>}
                            {v.return_reason && <span className="text-rose-700"> · Lý do trả: {v.return_reason}</span>}
                          </span>
                        </span>
                        {gpsOutside && (
                          <Badge className="bg-rose-50 text-rose-700 ring-rose-200"><MapPin className="h-3 w-3" /> GPS ngoài VN</Badge>
                        )}
                        <Badge className={LEVEL_BADGE[v.target_level] ?? LEVEL_BADGE[1]}>
                          {isPartnerL2(v) ? "Nhà máy đối tác" : auditStep(v.target_level)?.title ?? "Kiểm toán"}
                        </Badge>
                        {active.key === "all" && <Badge className={status.tone}>{status.label}</Badge>}
                        <span className="w-20 text-right text-[12px] text-ink-500">{day(v.updated_at)}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
      )}
    </div>
  );
}
