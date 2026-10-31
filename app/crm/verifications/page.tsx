import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  User,
} from "lucide-react";

import { Breadcrumbs, Badge, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { isPartnerL2, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { inVnBounds } from "@/lib/verification";
import type { AppUser, Verification } from "@/lib/types";
import { auditHref, auditItems, auditStep } from "@/lib/verification";
import { ContactRequestButton } from "./contact-request-button";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; tone: string; filter: (v: Verification) => boolean }[] = [
  { key: "submitted", label: "Chờ duyệt", tone: "bg-amber-50 text-amber-800 ring-amber-200", filter: (v) => v.status === "submitted" },
  { key: "in_progress", label: "Đang kiểm", tone: "bg-sky-50 text-sky-800 ring-sky-200", filter: (v) => v.status === "in_progress" || v.status === "scheduled" },
  { key: "returned", label: "Trả lại", tone: "bg-rose-50 text-rose-800 ring-rose-200", filter: (v) => v.status === "returned" },
  { key: "approved", label: "Đã duyệt", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", filter: (v) => v.status === "approved" },
  { key: "all", label: "Tất cả", tone: "bg-ink-100 text-ink-700 ring-ink-200", filter: () => true },
];

const LEVEL_BADGE: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 ring-slate-200",
  2: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  3: "bg-brand-50 text-brand-700 ring-brand-200",
};

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await requirePagePermission("verifications.view", "/crm/dashboard");
  const sp = await searchParams;
  const tabKey = sp?.tab ?? "submitted";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const canApprove = hasPermission(session.role, "verifications.approve");
  const canInspect = hasPermission(session.role, "verifications.inspect");

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
  const pendingSubmissions = submissions.filter((sub) => sub.status === "pending_review" || sub.status === "returned");
  const openRequests = requests.filter((r) => !vers.some((v) =>
    v.supplier_id === r.supplier_id && v.target_level === r.target_level && v.status === "approved" && l2ScopeMatchesSupplier(v, supMap.get(r.supplier_id)?.supplier_type)));

  // Hàm kiểm tra toạ độ có ở Việt Nam hay không (dùng helper chung)
  const inVn = (v: Verification) => {
    if (v.target_level !== 2) return null;
    return inVnBounds(v.visit_lat, v.visit_lng);
  };

  const filtered = vers
    .filter(tab.filter)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const counts = Object.fromEntries(TABS.map((t) => [t.key, vers.filter(t.filter).length]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "Xác minh nhà cung cấp" },
      ]} />
      <PageHeader
        title="Hàng đợi xác minh nhà cung cấp"
        sub="Kiểm giấy tờ, xác thực nhà máy và lịch sử giao hàng. Một nhân sự đủ quyền vừa kiểm vừa duyệt; AI chỉ hỗ trợ đối chiếu."
      />

      <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5">
        <h2 className="font-bold text-ink-900">Hồ sơ nhà cung cấp tự gửi qua cổng L2 · L3 ({pendingSubmissions.length} chờ xét)</h2>
        <p className="mt-1 text-sm text-ink-700">L2 nhà máy có thể dùng AI xem ảnh. L2 đối tác và L3 do nhân viên kiểm. Nhận hồ sơ chỉ mở đợt kiểm.</p>
        {pendingSubmissions.length ? <ul className="mt-4 space-y-2">{pendingSubmissions.slice(0, 8).map((sub) => <li key={sub.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <div className="min-w-[180px] flex-1"><Link href={`/crm/verifications/submissions/${sub.id}`} className="font-bold text-brand-700 hover:underline">{supMap.get(sub.supplier_id)?.name ?? "Nhà cung cấp"}</Link>
            <p className="mt-0.5 text-xs text-ink-500">{isPartnerL2(sub) ? "L2 · nhà máy đối tác" : sub.target_level === 2 ? "L2 · xác thực nhà máy" : "L3 · lịch sử xuất khẩu"} · {sub.status === "pending_review" ? "chờ xét duyệt" : sub.status === "returned" ? "cần bổ sung" : "đang soạn"}{sub.ai_scanned_at ? ` · ${sub.target_level === 3 ? "AI cũ" : "AI đã quét"} ${new Date(sub.ai_scanned_at).toLocaleDateString("vi-VN")}` : sub.target_level === 2 && !isPartnerL2(sub) ? " · chưa quét AI" : " · nhân viên kiểm tra"}</p></div>
          <Link href={`/crm/verifications/submissions/${sub.id}`} className="btn btn-ghost btn-sm">Đối chiếu bằng chứng →</Link>
        </li>)}</ul> : <p className="mt-3 text-sm text-ink-500">Chưa có hồ sơ tự gửi nào chờ xét.</p>}
        <Link href="/crm/verifications/submissions" className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">Mở toàn bộ hàng đợi hồ sơ tự gửi →</Link>
      </section>

      <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <h2 className="font-bold text-ink-900">Yêu cầu Vexim liên hệ để xác minh thêm ({openRequests.length})</h2>
        <p className="mt-1 text-sm text-ink-700">Nhà cung cấp chỉ chọn nhu cầu; nhân viên liên hệ sớm và tự thu thập bằng chứng. Không tự duyệt hay cấp nhãn.</p>
        {openRequests.length ? <ul className="mt-4 space-y-2">{openRequests.map((r) => <li key={`${r.supplier_id}-${r.target_level}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm">
          <div className="min-w-[180px] flex-1"><Link href={`/crm/suppliers/${r.supplier_id}`} className="font-bold text-brand-700 hover:underline">{supMap.get(r.supplier_id)?.name ?? "Nhà cung cấp"}</Link>
            <p className="mt-0.5 text-xs text-ink-500">{r.target_level === 2 ? supMap.get(r.supplier_id)?.supplier_type === "trading" ? "Nhà máy đối tác" : "Xác thực nhà máy" : "Lịch sử giao hàng"} · {r.status === "contacted" ? "Đã liên hệ" : "Cần liên hệ"} · {new Date(r.requested_at).toLocaleDateString("vi-VN")}</p></div>
          {canInspect && r.status === "requested" && <ContactRequestButton supplierId={r.supplier_id} level={r.target_level} />}
          <Link href={auditHref(r.supplier_id, r.target_level)} className="btn btn-ghost btn-sm">Mở trang đánh giá →</Link>
        </li>)}</ul> : <p className="mt-3 text-sm text-ink-500">Chưa có yêu cầu cần xử lý.</p>}
      </section>

      {canApprove && counts.submitted > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <strong>{counts.submitted}</strong> hồ sơ đang chờ duyệt. Vui lòng kiểm tra checklist + ảnh/giấy tờ đính kèm trước khi approve.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1 border-b border-ink-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "submitted" ? "/crm/verifications" : `/crm/verifications?tab=${t.key}`}
            className={
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition " +
              (tab.key === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")
            }
          >
            {t.label}
            <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-500">{counts[t.key] ?? 0}</span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Không có hồ sơ nào"
          sub="Mở hồ sơ nhà cung cấp để bắt đầu từng trang kiểm toán."
        />
      ) : (
        <div className="mt-5 grid gap-3">
          {filtered.map((v) => {
            const sup = supMap.get(v.supplier_id);
            const inspector = v.inspector_id ? userMap.get(v.inspector_id) : null;
            const items = auditItems(v.target_level, v.l2_scope).length;
            const doneCount = Object.values(v.checklist).filter((x) => x === true || x === false).length;
            const vn = inVn(v);
            return (
              <Card key={v.id} className="p-0">
                <Link
                  href={auditHref(v.supplier_id, v.target_level, v.id)}
                  className="flex flex-wrap items-start gap-4 px-4 py-4 transition hover:bg-ink-50/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={LEVEL_BADGE[v.target_level] ?? LEVEL_BADGE[1]}>
                        {isPartnerL2(v) ? "Nhà máy đối tác" : auditStep(v.target_level)?.title ?? "Kiểm toán"}
                      </Badge>
                      <Badge className={TABS.find((t) => t.filter(v))?.tone ?? tab.tone}>
                        {v.status === "scheduled" ? "Đã lên lịch" :
                         v.status === "in_progress" ? "Đang kiểm" :
                         v.status === "submitted" ? "Chờ duyệt" :
                         v.status === "approved" ? "Đã duyệt" : "Trả lại"}
                      </Badge>
                      {v.target_level === 2 && v.visit_lat != null && v.visit_lng != null && (
                        <Badge className={vn === false ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}>
                          <MapPin className="h-3 w-3" /> {vn === false ? "GPS ngoài VN (cần kiểm)" : `GPS VN ${v.visit_lat.toFixed(3)},${v.visit_lng.toFixed(3)}`}
                        </Badge>
                      )}
                      {v.visit_date && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-500">
                          <CalendarClock className="h-3 w-3" /> {v.visit_date}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[14.5px] font-semibold text-ink-900">
                      {sup?.name ?? "(Nhà cung cấp đã xoá)"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {doneCount}/{items} mục đã kiểm
                      </span>
                      {inspector && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" /> {inspector.name ?? inspector.email}
                        </span>
                      )}
                      {v.return_reason && (
                        <span className="text-rose-700">Lý do trả: {v.return_reason}</span>
                      )}
                    </div>
                  </div>
                  {v.status === "approved" && (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  )}
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
