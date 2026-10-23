import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Factory, Ship } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildVerificationProgress } from "@/lib/supplier-portal/verification-progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác minh nhà cung cấp | Vexim Trade", robots: { index: false, follow: false } };

/**
 * Điểm vào cũ của cổng tự xác thực. Từ 24/10/2026 hai cấp đã tách thành hai trang
 * riêng (`/factory` cho L2, `/export` cho L3); trang này chỉ là bảng chọn cấp, không
 * chứa biểu mẫu, để đường dẫn cũ hoặc link trong email không bị 404.
 */
export default async function SupplierVerificationIndexPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { reviews, supplier } = access;
  const progress = buildVerificationProgress({ supplierId: supplier.id, reviews });

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · Xác minh" title="Chọn cấp xác minh"
      sub="Mỗi cấp là một trang riêng, một kết luận độc lập của Vexim." />
    <div className="grid gap-3 sm:grid-cols-2">
      {progress.steps.filter((step) => step.level !== 1).map((step) => {
        const href = step.level === 2 ? "/supplier/portal/verification/factory" : "/supplier/portal/verification/export";
        const Icon = step.level === 2 ? Factory : Ship;
        return <Link key={step.level} href={href}
          className="group flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-wider text-ink-400 uppercase">Bước {step.level}/3</span>
            <span className="block text-[14px] font-bold text-ink-900">{step.title}</span>
            <span className={`mt-0.5 block text-[11.5px] font-semibold ${step.tone === "emerald" ? "text-emerald-700" : step.tone === "rose" ? "text-rose-700" : step.tone === "amber" ? "text-amber-800" : "text-ink-500"}`}>{step.status} · {step.metric}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-600" aria-hidden="true" />
        </Link>;
      })}
    </div>
    <p className="mt-4 text-[11.5px] leading-5 text-ink-500">Tải bằng chứng không tự cấp huy hiệu. Mỗi cấp chỉ chuyển sang “Đã duyệt” khi nhân viên Vexim đối chiếu và người có quyền duyệt phê kết quả.</p>
  </>;
}
