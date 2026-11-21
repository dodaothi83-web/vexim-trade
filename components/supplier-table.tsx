"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Crown, MailWarning, Package, Plus, Search } from "lucide-react";

import type { Supplier } from "@/lib/types";
import { roleLabel, supplierTypeLabel, statusMeta } from "@/lib/supplier";
import { Badge, Button, EmptyState, cx } from "@/components/ui";
import { SUPPLIER_PLAN_LABELS, effectiveSupplierPlan, isSupplierPlan, type SupplierPlan } from "@/lib/supplier-plans";

const reviewDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
});
const reviewTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Ho_Chi_Minh",
});

function reviewDateParts(iso: string | null | undefined) {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return { date: reviewDateFormatter.format(value), time: reviewTimeFormatter.format(value) };
}

const DAY_MS = 86_400_000;
/** Gói trả phí còn ≤ 30 ngày thì coi là sắp hết hạn, để sale kịp gọi gia hạn. */
const EXPIRING_DAYS = 30;

type UpgradeRequest = { plan: "premium" | "pro" | null; status: string; createdAt: string };

/** Màu gói: Basic xám trung tính, Premium vàng, Pro navy đậm. Ba màu khác hẳn nhau để nhìn lướt là phân biệt. */
const PLAN_STYLE: Record<SupplierPlan, string> = {
  basic: "bg-ink-100 text-ink-600 ring-ink-200",
  premium: "bg-amber-50 text-amber-800 ring-amber-300",
  pro: "bg-brand-800 text-white ring-brand-800",
};

function planInfo(s: Supplier, now: number) {
  const plan = effectiveSupplierPlan(s, new Date(now));
  const stored = isSupplierPlan(s.plan) ? s.plan : "basic";
  const expires = s.plan_expires_at ? new Date(s.plan_expires_at) : null;
  const expiresMs = expires && Number.isFinite(expires.getTime()) ? expires.getTime() : null;
  const daysLeft = plan !== "basic" && expiresMs !== null ? Math.ceil((expiresMs - now) / DAY_MS) : null;
  return {
    plan,
    expiresAt: plan !== "basic" && expiresMs !== null ? reviewDateFormatter.format(expiresMs) : null,
    daysLeft,
    expiring: daysLeft !== null && daysLeft <= EXPIRING_DAYS,
    /** Gói trả phí đã hết hạn nên đang chạy như Basic. */
    lapsed: stored !== "basic" && plan === "basic" ? { plan: stored, at: expiresMs !== null ? reviewDateFormatter.format(expiresMs) : null } : null,
  };
}

const PLAN_FILTERS = ["all", "basic", "premium", "pro", "upgrade", "expiring"] as const;
type PlanFilter = (typeof PLAN_FILTERS)[number];
const PLAN_FILTER_LABEL: Record<PlanFilter, string> = {
  all: "Mọi gói", basic: "Basic", premium: "Premium", pro: "Pro", upgrade: "Xin nâng gói", expiring: "Sắp hết hạn",
};

/** Nhóm lọc theo việc cần làm thay cho danh sách trạng thái (kể cả trạng thái cũ). */
const FILTERS: { key: string; label: string; match: (s: Supplier) => boolean }[] = [
  { key: "all", label: "Tất cả", match: () => true },
  { key: "portal_pending", label: "Chờ xác nhận tài khoản", match: (s) => s.onboarding_status === "pending" },
  { key: "changes", label: "Cần bổ sung hồ sơ", match: (s) => s.onboarding_status === "changes_requested" },
  { key: "review", label: "Đang duyệt", match: (s) => ["submitted", "in_verification", "new", "verifying"].includes(s.status) },
  { key: "public", label: "Công khai", match: (s) => ["published", "verified"].includes(s.status) },
  { key: "draft", label: "Bản nháp", match: (s) => s.status === "draft" },
  { key: "off", label: "Tạm ngừng · lưu trữ", match: (s) => ["suspended", "paused", "archived"].includes(s.status) },
];

/** Một nhãn duy nhất cho mỗi dòng: việc cần làm với tài khoản trước, sau đó mới tới trạng thái hồ sơ. */
function primaryBadge(s: Supplier) {
  if (s.onboarding_status === "pending") return { label: "Chờ xác nhận tài khoản", className: "bg-amber-50 text-amber-800" };
  if (s.onboarding_status === "changes_requested") return { label: "Cần bổ sung hồ sơ", className: "bg-orange-50 text-orange-800" };
  // Đang công khai là trạng thái bình thường: không gắn nhãn để dòng gọn, chỉ nhãn khi cần chú ý.
  if (s.status === "published" || s.status === "verified") return null;
  const meta = statusMeta(s.status);
  return { label: meta.label, className: meta.badge };
}

export function SupplierTable({
  suppliers,
  usage,
  reviewedAt = {},
  canManage = false,
  upgradeRequests = {},
  initialPlanFilter,
}: {
  suppliers: Supplier[];
  usage: Record<string, { total: number; active: number }>;
  /** Current onboarding decision time from the audit log, keyed by supplier. */
  reviewedAt?: Record<string, string>;
  /** Có quyền thêm / sửa nhà cung cấp (suppliers.manage) hay chỉ được xem */
  canManage?: boolean;
  /** Yêu cầu nâng gói còn mở, theo nhà cung cấp. */
  upgradeRequests?: Record<string, UpgradeRequest>;
  /** Bộ lọc gói từ URL (?plan=upgrade), ví dụ khi bấm từ chuông thông báo. */
  initialPlanFilter?: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>(
    PLAN_FILTERS.includes(initialPlanFilter as PlanFilter) ? (initialPlanFilter as PlanFilter) : "all",
  );
  // Mốc thời gian cố định trong một lần mở trang để số ngày còn lại không nhảy giữa server và trình duyệt.
  const [now] = useState(() => Date.now());

  const plans = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, planInfo(s, now)])), [suppliers, now]);
  const planMatch = (s: Supplier, key: PlanFilter) => {
    const info = plans[s.id];
    if (key === "all") return true;
    if (key === "upgrade") return Boolean(upgradeRequests[s.id]);
    if (key === "expiring") return info.expiring;
    return info.plan === key;
  };
  const planCounts = Object.fromEntries(PLAN_FILTERS.map((key) => [key, suppliers.filter((s) => planMatch(s, key)).length])) as Record<PlanFilter, number>;

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, suppliers.filter(f.match).length])), [suppliers]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    return suppliers.filter((s) => {
      if (!match(s)) return false;
      if (!planMatch(s, planFilter)) return false;
      if (!needle) return true;
      return [s.name, s.products, s.province, s.contact_name, s.email]
        .filter(Boolean)
        .some((x) => (x as string).toLowerCase().includes(needle));
    });
  }, [suppliers, q, filter, planFilter, plans, upgradeRequests]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Tìm xưởng, mặt hàng, tỉnh, người liên hệ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {canManage && (
          <Link href="/crm/suppliers/new" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Thêm nhà cung cấp
          </Link>
        )}
      </div>
      <div role="tablist" aria-label="Lọc nhà cung cấp" className="flex gap-1 overflow-x-auto border-b border-ink-200 px-2">
        {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition",
              filter === f.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {f.label}
            <span className={cx("rounded-full px-1.5 text-[11px]",
              (f.key === "portal_pending" || f.key === "changes") ? "bg-amber-100 font-bold text-amber-800" : "bg-ink-100 text-ink-500")}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>
      <div role="group" aria-label="Lọc theo gói" className="flex flex-wrap items-center gap-1.5 border-b border-ink-200 bg-ink-50/60 px-3 py-2">
        <span className="mr-1 text-[11.5px] font-semibold text-ink-500">Gói</span>
        {PLAN_FILTERS.filter((key) => key === "all" || planCounts[key] > 0).map((key) => {
          const active = planFilter === key;
          const attention = key === "upgrade" || key === "expiring";
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setPlanFilter(key)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition",
                active ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-ink-700 ring-ink-200 hover:ring-brand-300",
              )}
            >
              {(key === "premium" || key === "pro") && <Crown className="h-3 w-3" aria-hidden="true" />}
              {PLAN_FILTER_LABEL[key]}
              <span className={cx("rounded-full px-1.5 text-[11px]",
                active ? "bg-white/20 text-white" : attention ? "bg-amber-100 font-bold text-amber-800" : "bg-ink-100 text-ink-500")}>
                {planCounts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={suppliers.length === 0 ? "Chưa có nhà cung cấp nào" : "Không tìm thấy kết quả"}
          sub={
            suppliers.length === 0
              ? "Thêm xưởng / nhà cung cấp để gắn vào đơn và nhận email cập nhật tiến độ."
              : "Thử từ khoá khác."
          }
          action={
            suppliers.length === 0 ? (
              canManage ? (
                <Link href="/crm/suppliers/new" className="btn btn-primary">
                  Thêm nhà cung cấp
                </Link>
              ) : null
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                  setPlanFilter("all");
                }}
              >
                Xoá bộ lọc
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="table-th">Nhà cung cấp</th>
                <th className="table-th">Gói</th>
                <th className="table-th">Mặt hàng</th>
                <th className="table-th">Liên hệ</th>
                <th className="table-th">Tổng đơn hàng</th>
                <th className="table-th whitespace-normal">Ngày giờ xét duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const u = usage[s.id] ?? { total: 0, active: 0 };
                const hasReviewDecision = s.onboarding_status === "approved" || s.onboarding_status === "changes_requested";
                const reviewedAtIso = hasReviewDecision ? reviewedAt[s.id] : null;
                const review = reviewDateParts(reviewedAtIso);
                const badge = primaryBadge(s);
                const plan = plans[s.id];
                const upgrade = upgradeRequests[s.id];
                const kind = s.onboarding_status === "not_started" ? "Chưa khai loại hình" : s.supplier_type ? supplierTypeLabel(s.supplier_type) : roleLabel(s.role);
                return (
                  <tr key={s.id} className="group align-top transition hover:bg-brand-50/40">
                    <td className="table-td max-w-[300px]">
                      <Link
                        href={`/crm/suppliers/${s.id}`}
                        className="block truncate text-[13.5px] font-semibold text-ink-900 hover:text-brand-700"
                      >
                        {s.name}
                      </Link>
                      <p className="mt-0.5 truncate text-[11.5px] text-ink-500">{kind}{s.province ? ` · ${s.province}` : ""}</p>
                      {badge && <Badge className={`mt-1 ${badge.className}`}>{badge.label}</Badge>}
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-bold ring-1", PLAN_STYLE[plan.plan])}>
                        {plan.plan !== "basic" && <Crown className="h-3 w-3" aria-hidden="true" />}
                        {SUPPLIER_PLAN_LABELS[plan.plan]}
                      </span>
                      {plan.expiresAt && (
                        <p className={cx("mt-1 text-[11.5px]", plan.expiring ? "font-semibold text-amber-700" : "text-ink-500")}>
                          {plan.expiring ? `Còn ${Math.max(plan.daysLeft ?? 0, 0)} ngày · ${plan.expiresAt}` : `Đến ${plan.expiresAt}`}
                        </p>
                      )}
                      {plan.lapsed && (
                        <p className="mt-1 text-[11.5px] text-ink-500">
                          {SUPPLIER_PLAN_LABELS[plan.lapsed.plan]} hết hạn{plan.lapsed.at ? ` ${plan.lapsed.at}` : ""}
                        </p>
                      )}
                      {upgrade && (
                        <Link
                          href="/crm/plans#upgrades"
                          title={upgrade.status === "submitted" ? "Yêu cầu mới, chưa ai nhận xử lý" : "Đang tư vấn hoặc đã báo giá"}
                          className={cx("mt-1 flex w-fit items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
                            upgrade.status === "submitted" ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-brand-50 text-brand-700 hover:bg-brand-100")}
                        >
                          {upgrade.plan ? `Xin nâng ${SUPPLIER_PLAN_LABELS[upgrade.plan]}` : "Xin nâng gói"}
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </td>
                    <td className="table-td max-w-[180px]">
                      <p className="truncate text-[12.5px] text-ink-700" title={s.products || undefined}>{s.products || "—"}</p>
                    </td>
                    <td className="table-td max-w-[200px]">
                      {s.contact_name && <p className="truncate text-[12.5px] text-ink-800">{s.contact_name}</p>}
                      {s.email ? (
                        <a href={`mailto:${s.email}`} className="block truncate text-[12px] text-brand-700 hover:underline">
                          {s.email}
                        </a>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700">
                          <MailWarning className="h-3 w-3" />
                          thiếu email
                        </Badge>
                      )}
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <span className="text-[13px] font-bold text-ink-900">{u.total.toLocaleString("vi-VN")}</span>
                      <span className="text-[11.5px] text-ink-500"> đơn</span>
                      {u.active > 0 && (
                        <p className="mt-0.5 text-[11.5px] text-emerald-700">{u.active.toLocaleString("vi-VN")} đang chạy</p>
                      )}
                    </td>
                    <td className="table-td whitespace-nowrap text-[12px] text-ink-600">
                      {review && reviewedAtIso ? (
                        <time dateTime={reviewedAtIso}>
                          {review.date} <span className="text-[11px] text-ink-500">{review.time}</span>
                        </time>
                      ) : (
                        <span className="text-ink-500">{hasReviewDecision ? "Chưa ghi nhận" : "Chưa xét duyệt"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
