import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { listPlanActivations, readPlanCatalog, type PlanActivation } from "@/lib/supplier-plan-catalog";
import { effectiveSupplierPlan, isSupplierPlan, SUPPLIER_PLANS, type SupplierPlan } from "@/lib/supplier-plans";
import { SUPPLIER_SERVICE_STATUS_LABELS_VI } from "@/lib/supplier-services";
import type { SupplierServiceRequest } from "@/lib/types";
import { PlanCatalogEditor } from "./catalog-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gói thành viên", robots: { index: false, follow: false } };

const DAY = 86_400_000;
const vnDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
const vnMonthKey = (value: string) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

/**
 * Quản lý gói nhà cung cấp: báo cáo tổng quan (số nhà cung cấp theo gói, gói sắp hết hạn,
 * yêu cầu nâng gói, doanh thu ước tính) và chỉnh nội dung, giá, giới hạn của từng gói.
 * Doanh thu cộng từ số tiền CRM ghi nhận khi bật/gia hạn gói, không phải số tiền thực thu.
 */
export default async function SupplierPlansPage() {
  const session = await requirePagePermission("suppliers.view", "/crm");
  const canEdit = session.role === "admin";
  const store = getStore();
  const [catalog, suppliers, products, requestsResult, activationsResult] = await Promise.all([
    readPlanCatalog(),
    store.listSuppliers(),
    store.listProducts(),
    store.listSupplierServiceRequests({ limit: 500 }).then((rows) => ({ rows, failed: false })).catch(() => ({ rows: [] as SupplierServiceRequest[], failed: true })),
    listPlanActivations().then((rows) => ({ rows, failed: false })).catch((error) => {
      console.error("[crm plans] activations", error);
      return { rows: [] as PlanActivation[], failed: true };
    }),
  ]);
  const now = Date.now();
  const real = suppliers.filter((s) => !s.is_demo);
  const supplierById = new Map(real.map((s) => [s.id, s]));
  const productCount = new Map<string, number>();
  for (const p of products) productCount.set(p.supplier_id, (productCount.get(p.supplier_id) ?? 0) + 1);

  const byPlan: Record<SupplierPlan, number> = { basic: 0, premium: 0, pro: 0 };
  for (const s of real) byPlan[effectiveSupplierPlan(s)]++;
  const paid = real.filter((s) => effectiveSupplierPlan(s) !== "basic")
    .sort((a, b) => (a.plan_expires_at ?? "9999").localeCompare(b.plan_expires_at ?? "9999"));
  const expiringSoon = paid.filter((s) => s.plan_expires_at && Date.parse(s.plan_expires_at) - now <= 30 * DAY);
  const lapsed = real.filter((s) => isSupplierPlan(s.plan) && s.plan !== "basic" && effectiveSupplierPlan(s) === "basic");

  const upgrades = requestsResult.rows.filter((r) => r.service_key === "plan_upgrade");
  const openUpgrades = upgrades.filter((r) => r.status === "submitted");
  const upgradeCounts = { submitted: 0, active: 0, cancelled: 0, expired: 0 } as Record<SupplierServiceRequest["status"], number>;
  for (const r of upgrades) upgradeCounts[r.status]++;

  const activations = activationsResult.rows.filter((a) => supplierById.has(a.supplier_id));
  const thisMonth = vnMonthKey(new Date().toISOString());
  // Doanh thu do kế toán tính ngoài hệ thống; ở đây chỉ đếm số lần bật hoặc gia hạn gói.
  const monthly = new Map<string, number>();
  for (const a of activations) monthly.set(vnMonthKey(a.created_at), (monthly.get(vnMonthKey(a.created_at)) ?? 0) + 1);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    months.push(vnMonthKey(d.toISOString()));
  }
  const monthMax = Math.max(1, ...months.map((m) => monthly.get(m) ?? 0));
  const yearActivations = activations.filter((a) => now - Date.parse(a.created_at) <= 365 * DAY).length;
  const lastActivation = new Map<string, PlanActivation>();
  for (const a of activations) if (!lastActivation.has(a.supplier_id)) lastActivation.set(a.supplier_id, a);

  const kpi = "rounded-xl border border-ink-200 bg-white p-4 shadow-sm";
  return <>
    <PageHeader title="Gói thành viên" sub="Tổng quan, nội dung, giá và giới hạn của gói thành viên Basic, Premium, Pro." />

    <section aria-label="Tổng quan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className={kpi}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Nhà cung cấp theo gói</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          {SUPPLIER_PLANS.map((plan) => <div key={plan}><dd className="text-2xl font-bold tabular-nums text-ink-900">{byPlan[plan]}</dd><dt className="text-xs text-ink-600">{catalog[plan].name}</dt></div>)}
        </dl>
      </div>
      <div className={kpi}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Gói trả phí hết hạn trong 30 ngày</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{expiringSoon.length}</p>
        <p className="text-xs text-ink-600">{lapsed.length} gói đã hết hạn, đang tính là Basic</p>
      </div>
      <div className={kpi}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Yêu cầu nâng gói</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{upgradeCounts.submitted} <span className="text-sm font-semibold text-ink-600">mới</span></p>
        <p className="text-xs text-ink-600">{upgradeCounts.active} đã mở · {upgradeCounts.cancelled} đã huỷ · {upgradeCounts.expired} hết hạn</p>
      </div>
      <div className={kpi}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Lượt bật / gia hạn gói</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{monthly.get(thisMonth) ?? 0} <span className="text-sm font-semibold text-ink-600">tháng này</span></p>
        <p className="text-xs text-ink-600">12 tháng: {yearActivations}</p>
      </div>
    </section>
    {activationsResult.failed && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Chưa đọc được lịch sử bật gói. Hãy chạy migration 20261129_supplier_plan_catalog.sql.</p>}

    <div className="mt-6 grid gap-6 xl:grid-cols-3">
      <section aria-labelledby="revenue-title" className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <h2 id="revenue-title" className="text-sm font-bold text-ink-900">Bật / gia hạn gói 6 tháng</h2>
        <p className="mt-0.5 text-xs text-ink-500">Số lần bật hoặc gia hạn gói trả phí mỗi tháng.</p>
        <ul className="mt-3 space-y-2">
          {months.map((m) => {
            const value = monthly.get(m) ?? 0;
            return <li key={m} className="text-xs">
              <div className="flex justify-between gap-2"><span className="text-ink-600">{m.split("-").reverse().join("/")}</span><span className="font-semibold tabular-nums text-ink-900">{value}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${(value / monthMax) * 100}%` }} /></div>
            </li>;
          })}
        </ul>
      </section>

      <section id="upgrades" aria-labelledby="upgrades-title" className="scroll-mt-24 rounded-xl border border-ink-200 bg-white p-4 shadow-sm xl:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="upgrades-title" className="text-sm font-bold text-ink-900">Yêu cầu nâng gói mới</h2>
          <Link href="/crm/service-requests" className="text-xs font-semibold text-brand-700 hover:underline">Mở hàng yêu cầu dịch vụ →</Link>
        </div>
        {requestsResult.failed ? <p className="mt-3 text-sm text-amber-900">Chưa đọc được yêu cầu dịch vụ.</p>
          : openUpgrades.length === 0 ? <p className="mt-3 text-sm text-ink-600">Không có yêu cầu nâng gói mới.</p>
          : <ul className="mt-3 divide-y divide-ink-100">
            {openUpgrades.slice(0, 20).map((r) => <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/crm/suppliers/${r.supplier_id}`} className="font-semibold text-ink-900 hover:text-brand-700">{supplierById.get(r.supplier_id)?.name ?? "Nhà cung cấp"}</Link>
                <p className="text-xs text-ink-600">{r.note || "Nâng gói"} · <span className="font-mono">{r.reference}</span> · {vnDate(r.created_at)}</p>
              </div>
              <Link href={`/crm/suppliers/${r.supplier_id}#plan`} className="rounded-lg bg-brand-800 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-900">Mở gói</Link>
            </li>)}
          </ul>}
      </section>
    </div>

    <section aria-labelledby="paid-title" className="mt-6 rounded-xl border border-ink-200 bg-white shadow-sm">
      <h2 id="paid-title" className="border-b border-ink-100 px-4 py-3 text-sm font-bold text-ink-900">Nhà cung cấp đang dùng gói trả phí ({paid.length})</h2>
      {paid.length === 0 ? <p className="px-4 py-4 text-sm text-ink-600">Chưa có nhà cung cấp nào dùng gói trả phí.</p> : (
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <tr><th className="px-4 py-2">Nhà cung cấp</th><th className="px-4 py-2">Gói</th><th className="px-4 py-2">Hết hạn</th><th className="px-4 py-2">Sản phẩm</th><th className="px-4 py-2">Lần ghi nhận gần nhất</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {paid.map((s) => {
              const plan = effectiveSupplierPlan(s);
              const max = catalog[plan].maxProducts;
              const last = lastActivation.get(s.id);
              const soon = s.plan_expires_at && Date.parse(s.plan_expires_at) - now <= 30 * DAY;
              return <tr key={s.id}>
                <td className="px-4 py-2.5"><Link href={`/crm/suppliers/${s.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{s.name}</Link></td>
                <td className="px-4 py-2.5">{catalog[plan].name}</td>
                <td className={`px-4 py-2.5 tabular-nums ${soon ? "font-semibold text-amber-800" : "text-ink-700"}`}>{s.plan_expires_at ? vnDate(s.plan_expires_at) : "Không hết hạn"}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-700">{productCount.get(s.id) ?? 0}{max === null ? " · không giới hạn" : `/${max}`}</td>
                <td className="px-4 py-2.5 text-ink-700">{last ? `${last.months ? `${last.months} tháng · ` : ""}${vnDate(last.created_at)}` : "—"}</td>
              </tr>;
            })}
          </tbody>
        </table></div>
      )}
    </section>

    <section aria-labelledby="catalog-title" className="mt-6">
      <h2 id="catalog-title" className="text-sm font-bold text-ink-900">Nội dung và giá gói</h2>
      <p className="mt-0.5 text-xs text-ink-500">Hiện trong bảng “Nâng cấp gói” ở cổng nhà cung cấp.{canEdit ? "" : " Chỉ quản trị viên được sửa."}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {SUPPLIER_PLANS.map((plan) => <PlanCatalogEditor key={plan} entry={catalog[plan]} canEdit={canEdit} />)}
      </div>
    </section>
  </>;
}
