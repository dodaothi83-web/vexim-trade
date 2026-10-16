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
import type { AppUser, Supplier, Verification } from "@/lib/types";

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
  const session = await requirePagePermission("verifications.inspect", "/crm/dashboard");
  const sp = await searchParams;
  const tabKey = sp?.tab ?? "submitted";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const canApprove = hasPermission(session.role, "verifications.approve");

  const store = getStore();
  const [vers, suppliers, users] = await Promise.all([
    store.listVerifications(),
    store.listSuppliers(),
    store.listUsers().catch(() => [] as AppUser[]),
  ]);
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Hàm kiểm tra toạ độ có ở Việt Nam hay không (lat ~8–24, lng ~102–110)
  const inVn = (v: Verification) => {
    if (v.target_level !== 2) return null;
    const lat = v.visit_lat, lng = v.visit_lng;
    if (lat == null || lng == null) return null;
    return lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
  };

  const filtered = vers
    .filter(tab.filter)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const counts = Object.fromEntries(TABS.map((t) => [t.key, vers.filter(t.filter).length]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "Xác minh NCC" },
      ]} />
      <PageHeader
        title="Hàng đợi xác minh NCC"
        sub="L1 (kiểm giấy tờ) và L2 (thăm nhà máy). Inspector nộp hồ sơ → admin duyệt."
      />

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
          sub="Từ trang chi tiết NCC, nhấn Bắt đầu L1 / Lên lịch L2 để tạo đợt xác minh mới."
        />
      ) : (
        <div className="mt-5 grid gap-3">
          {filtered.map((v) => {
            const sup = supMap.get(v.supplier_id);
            const inspector = v.inspector_id ? userMap.get(v.inspector_id) : null;
            const items = v.target_level === 1 ? 7 : 9;
            const doneCount = Object.values(v.checklist).filter((x) => x === true || x === false).length;
            const vn = inVn(v);
            return (
              <Card key={v.id} className="p-0">
                <Link
                  href={`/crm/suppliers/${v.supplier_id}#verification-${v.id}`}
                  className="flex flex-wrap items-start gap-4 px-4 py-4 transition hover:bg-ink-50/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={LEVEL_BADGE[v.target_level] ?? LEVEL_BADGE[1]}>
                        L{v.target_level} {v.target_level === 1 ? "Documents" : "Factory visit"}
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
                      {sup?.name ?? "(NCC đã xoá)"}
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
