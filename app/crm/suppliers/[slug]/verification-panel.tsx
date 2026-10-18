import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";

import type { SupplierVerificationRequest, Verification, VerificationLevel } from "@/lib/types";
import { AUDIT_STEPS, auditHref, auditItems } from "@/lib/verification";
import { Card } from "@/components/ui";
import { StartVerificationButton } from "./start-verification-button";

export function VerificationPanel({ supplierId, verifications, requests = [], canInspect, canViewReviews }: {
  supplierId: string;
  verifications: Verification[];
  requests?: SupplierVerificationRequest[];
  canInspect: boolean;
  canViewReviews: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><ShieldCheck className="h-5 w-5 text-emerald-700" /> Kiểm toán nhà cung cấp</h2>
        <p className="mt-1 text-sm text-ink-500">Mỗi bước có trang riêng để xem bằng chứng, ghi kết quả và nộp duyệt.</p>
      </div>
      <ol className="divide-y divide-ink-100">
        {AUDIT_STEPS.map((step, index) => {
          const level = step.level as VerificationLevel;
          const byStep = [...verifications].filter((v) => v.target_level === level).sort((a, b) => b.created_at.localeCompare(a.created_at));
          const latest = byStep.find((v) => v.status === "approved") ?? byStep[0];
          const approved = latest?.status === "approved";
          const request = requests.find((r) => r.target_level === level);
          const done = auditItems(level).filter((it) => latest?.checklist[it.key] === true || latest?.checklist[it.key] === false).length;
          return <li key={step.path} className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
            <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " + (approved ? "bg-emerald-100 text-emerald-800" : latest ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500")}>
              {approved ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-ink-900">{step.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{step.description}</p>
              {request && !approved && <p className="mt-1 text-xs font-semibold text-amber-800">NCC đã yêu cầu · {request.status === "contacted" ? "Đã liên hệ" : "Cần liên hệ để lên kế hoạch"}</p>}
              <p className="mt-1 text-xs font-medium text-ink-600">{approved ? "Đã duyệt" : latest ? `${latest.status === "submitted" ? "Chờ duyệt" : latest.status === "returned" ? "Cần bổ sung" : "Đang kiểm"} · ${done}/${auditItems(level).length} mục` : "Chưa bắt đầu"}</p>
            </div>
            {latest && canViewReviews ? <Link href={auditHref(supplierId, level)} className="btn btn-soft shrink-0"><ClipboardCheck className="h-4 w-4" /> Mở trang <ArrowRight className="h-4 w-4" /></Link>
              : canInspect && !approved ? <StartVerificationButton supplierId={supplierId} level={level} />
              : null}
          </li>;
        })}
      </ol>
    </Card>
  );
}
