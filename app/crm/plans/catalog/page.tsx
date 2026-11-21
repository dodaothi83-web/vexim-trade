import Link from "next/link";
import { Crown } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { formatVnd, isSupplierPlan, SUPPLIER_PLANS } from "@/lib/supplier-plans";
import { PlanCatalogEditor } from "../catalog-editor";
import { PlansTabs } from "../plans-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nội dung và giá gói", robots: { index: false, follow: false } };

const vnDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

/**
 * Cấu hình gói thành viên, tách khỏi trang Tổng quan: chọn một gói, sửa theo nhóm, xem trước thẻ gói
 * đúng như nhà cung cấp thấy. Sửa một gói mỗi lần để tránh lưu nhầm gói khác.
 */
export default async function PlanCatalogPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const session = await requirePagePermission("suppliers.view", "/crm");
  const canEdit = session.role === "admin";
  const catalog = await readPlanCatalog();
  const raw = (await searchParams).plan;
  const selected = isSupplierPlan(raw) ? raw : "premium";

  return <>
    <PageHeader title="Gói thành viên" sub="Tên, quyền lợi, giá và giới hạn của từng gói. Nhà cung cấp thấy nội dung này khi chọn gói." />
    <PlansTabs active="catalog" />

    <nav aria-label="Chọn gói" className="grid gap-3 sm:grid-cols-3">
      {SUPPLIER_PLANS.map((plan) => {
        const entry = catalog[plan];
        const active = plan === selected;
        const from = entry.prices[0];
        return <Link key={plan} href={`/crm/plans/catalog?plan=${plan}`} aria-current={active ? "page" : undefined}
          className={`rounded-xl border bg-white p-4 shadow-sm transition ${active ? "border-brand-600 ring-1 ring-brand-600" : "border-ink-200 hover:border-brand-300"}`}>
          <p className="inline-flex items-center gap-1.5 text-base font-bold text-ink-900">
            {plan !== "basic" && <Crown className="size-4 text-amber-600" aria-hidden="true" />}{entry.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-800">{from ? `Từ ${formatVnd(from.price_vnd)} / ${from.months} tháng` : entry.summary || "Miễn phí"}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {entry.maxProducts === null ? "Không giới hạn sản phẩm" : `Tối đa ${entry.maxProducts} sản phẩm`}, {entry.richContent ? `có video và A+ (${entry.videoMinutes === null ? "không giới hạn phút" : `${entry.videoMinutes} phút video`})` : "không có video và A+"}
          </p>
          {entry.updatedAt && <p className="mt-2 text-[11px] text-ink-400">Sửa lần cuối {vnDate(entry.updatedAt)}</p>}
        </Link>;
      })}
    </nav>

    <div className="mt-6">
      <PlanCatalogEditor key={selected} entry={catalog[selected]} canEdit={canEdit} />
    </div>
  </>;
}
