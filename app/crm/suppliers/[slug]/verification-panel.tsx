import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";

import type { Supplier, SupplierStatus, SupplierVerificationRequest, Verification, VerificationLevel } from "@/lib/types";
import { effectiveL2Scope, isPartnerL2, l2ScopeForSupplier } from "@/lib/l2-scope";
import { AUDIT_STEPS, auditHref, auditItems } from "@/lib/verification";
import { statusMeta } from "@/lib/supplier";
import { Card } from "@/components/ui";
import { SupplierWorkflowControls } from "@/components/supplier-actions";
import { StartVerificationButton } from "./start-verification-button";
import { OnboardingControls } from "./onboarding-controls";

const ONBOARDING_META = {
  not_started: { label: "Chưa nộp hồ sơ", hint: "Nhà cung cấp chưa gửi thông tin để xin mở quyền cổng." },
  pending: { label: "Chờ Vexim xác nhận", hint: "Đối chiếu thông tin doanh nghiệp, rồi mở cổng hoặc yêu cầu bổ sung." },
  changes_requested: { label: "Chờ nhà cung cấp bổ sung", hint: "Nhà cung cấp cần sửa hồ sơ theo ghi chú rồi gửi lại." },
  approved: { label: "Đã mở cổng", hint: "Nhà cung cấp có thể dùng cổng. Xác minh và công khai vẫn được xét riêng." },
} as const;

export function VerificationPanel({
  supplierId,
  supplierType,
  verifications,
  requests = [],
  canInspect,
  canViewReviews,
  onboardingStatus = "not_started",
  onboardingNote,
  supplierStatus,
  autoPublishL1 = false,
  canManage,
  canDecideOnboarding,
  canPublish,
}: {
  supplierId: string;
  supplierType?: Supplier["supplier_type"];
  verifications: Verification[];
  requests?: SupplierVerificationRequest[];
  canInspect: boolean;
  canViewReviews: boolean;
  onboardingStatus?: Supplier["onboarding_status"];
  onboardingNote?: string | null;
  supplierStatus: SupplierStatus;
  autoPublishL1?: boolean;
  canManage: boolean;
  canDecideOnboarding: boolean;
  canPublish: boolean;
}) {
  const onboarding = ONBOARDING_META[onboardingStatus ?? "not_started"];
  const currentStatus = statusMeta(supplierStatus);
  const approvedCount = new Set(verifications.filter((v) => v.status === "approved").map((v) => v.target_level)).size;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><ShieldCheck className="h-5 w-5 text-emerald-700" /> Trung tâm xét duyệt nhà cung cấp</h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">{autoPublishL1 ? "Mở cổng rồi duyệt L1 để tự công khai hồ sơ mới; sản phẩm xét duyệt riêng." : "Mở cổng, xác minh và công khai ở cùng một nơi. Mỗi quyết định vẫn độc lập."}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{approvedCount}/3 bước xác minh đã duyệt</span>
        </div>
      </div>

      <section className="border-b border-ink-100 px-5 py-4" aria-label="Hồ sơ và quyền cổng nhà cung cấp">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Hồ sơ & quyền cổng</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">{onboarding.hint}</p>
          </div>
          <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">{onboarding.label}</span>
        </div>
        {onboardingStatus === "changes_requested" && onboardingNote && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm leading-6 text-amber-900"><b>Ghi chú cho nhà cung cấp:</b> {onboardingNote}</p>
        )}
        {onboardingStatus === "pending" && canDecideOnboarding && <OnboardingControls supplierId={supplierId} />}
        {onboardingStatus === "pending" && !canDecideOnboarding && (
          <p className="mt-3 text-xs leading-5 text-ink-500">Cần quản trị viên hoặc trưởng kiểm duyệt xác nhận hồ sơ.</p>
        )}
      </section>

      <section aria-label="Các bước xác minh nhà cung cấp">
        <div className="border-b border-ink-100 px-5 py-3">
          <h3 className="text-sm font-bold text-ink-900">Xác minh L1–L3</h3>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">Mở từng bước để xem bằng chứng, ghi kết quả và nộp duyệt.</p>
        </div>
        <ol className="divide-y divide-ink-100">
          {AUDIT_STEPS.map((step, index) => {
            const level = step.level as VerificationLevel;
            const scope = level === 2 ? l2ScopeForSupplier(supplierType) : null;
            const byStep = [...verifications].filter((v) => v.target_level === level && (level !== 2 || (scope !== null && effectiveL2Scope(v.l2_scope) === scope))).sort((a, b) => b.created_at.localeCompare(a.created_at));
            const latest = byStep.find((v) => v.status === "approved") ?? byStep[0];
            const approved = latest?.status === "approved";
            const request = requests.find((r) => r.target_level === level);
            const done = auditItems(level, latest?.l2_scope).filter((it) => latest?.checklist[it.key] === true || latest?.checklist[it.key] === false).length;
            return <li key={step.path} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " + (approved ? "bg-emerald-100 text-emerald-800" : latest ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
                {approved ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-ink-900">{level === 2 && scope === "partner_contract" ? "Nhà máy đối tác" : step.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{level === 2 && scope === "partner_contract" ? "Đối chiếu hợp đồng với nhà máy đối tác; không suy ra sở hữu hay kiểm thực địa." : step.description}</p>
                {request && !approved && <p className="mt-1 text-xs font-semibold text-amber-800">Nhà cung cấp đã yêu cầu · {request.status === "contacted" ? "Đã liên hệ" : "Cần liên hệ để lên kế hoạch"}</p>}
                <p className="mt-1 text-xs font-medium text-ink-600">{approved ? "Đã duyệt" : latest ? `${latest.status === "submitted" ? "Chờ duyệt" : latest.status === "returned" ? "Cần bổ sung" : "Đang kiểm"} · ${done}/${auditItems(level, latest?.l2_scope).length} mục` : "Chưa bắt đầu"}</p>
              </div>
              {latest && canViewReviews ? <Link href={auditHref(supplierId, level, latest.id)} className="btn btn-soft shrink-0"><ClipboardCheck className="h-4 w-4" /> Mở trang <ArrowRight className="h-4 w-4" /></Link>
                : canInspect && !approved ? <StartVerificationButton supplierId={supplierId} level={level} />
                : null}
            </li>;
          })}
        </ol>
      </section>

      <section className="border-t border-ink-100 bg-ink-50/50 px-5 py-4" aria-label="Trạng thái và công khai hồ sơ">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Trạng thái & công khai</h3>
            <p className="mt-1 text-sm leading-6 text-ink-600">Chuyển bước chuẩn bị hoặc quyết định hiển thị công khai. Không tự duyệt xác minh.</p>
          </div>
          <span className={"rounded-full px-3 py-1 text-xs font-semibold " + currentStatus.badge}>{currentStatus.label}</span>
        </div>
        <div className="mt-3">
          <SupplierWorkflowControls supplierId={supplierId} status={supplierStatus} autoPublishL1={autoPublishL1} canManage={canManage} canPublish={canPublish} />
          {!canManage && !canPublish && <p className="text-xs leading-5 text-ink-500">Bạn chỉ có quyền xem trạng thái hồ sơ.</p>}
        </div>
      </section>
    </Card>
  );
}
