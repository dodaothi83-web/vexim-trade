import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { AUDIT_STEPS, auditHref } from "@/lib/verification";
import { submissionStatusLabel } from "@/lib/verification-submission";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";
import type { VerificationLevel } from "@/lib/types";
import { Breadcrumbs, Badge, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { StartVerificationButton } from "../../start-verification-button";
import { AuditForm } from "./audit-form";

export const dynamic = "force-dynamic";

export default async function AuditStepPage({ params }: { params: Promise<{ slug: string; step: string }> }) {
  const { slug: supplierId, step: path } = await params;
  const step = AUDIT_STEPS.find((s) => s.path === path);
  if (!step) notFound();
  const session = await requirePagePermission("verifications.view", `/crm/suppliers/${supplierId}`);
  const store = getStore();
  const [supplier, all, submissions, certificates] = await Promise.all([
    store.getSupplier(supplierId),
    store.listVerifications(supplierId),
    // Hồ sơ NCC TỰ GỬI cho bước này; bảng chưa có (chưa chạy migration) thì bỏ qua.
    step.level === 1 ? Promise.resolve([]) : store.listSubmissions(supplierId, step.level as 2 | 3)
      .catch((error) => { console.error("[self-submissions] migration/query failed", error); return []; }),
    // Chứng nhận NCC nộp theo luồng xét duyệt RIÊNG — hiện tóm tắt để người kiểm L1 không đi tìm.
    step.level === 1 ? store.listCertificates(supplierId)
      .catch((error) => { console.error("[certificates] query failed", error); return []; }) : Promise.resolve([]),
  ]);
  if (!supplier) notFound();
  const forStep = [...all].filter((v) => v.target_level === step.level).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = forStep.find((v) => v.status === "approved") ?? forStep[0];
  const media = current ? await store.listMedia("verification", current.id) : [];
  const canApprove = hasPermission(session.role, "verifications.approve");
  const canInspect = hasPermission(session.role, "verifications.inspect");
  const canPublish = hasPermission(session.role, "suppliers.publish");
  const requireSecondReviewer = requireSecondVerificationReviewer();

  return <>
    <PageHeader
      breadcrumbs={<Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: supplier.name, href: `/crm/suppliers/${supplierId}` }, { label: step.title }]} />}
      title={step.title}
      sub={`${supplier.name} · ${step.description}`}
      actions={<Link href={`/crm/suppliers/${supplierId}`} className="btn btn-ghost"><ArrowLeft className="h-4 w-4" /> Hồ sơ NCC</Link>}
    />
    <div className="max-w-6xl space-y-5">
      <nav aria-label="Các bước kiểm toán" className="grid gap-2 sm:grid-cols-3">
        {AUDIT_STEPS.map((item, i) => {
          const done = all.some((v) => v.target_level === item.level && v.status === "approved");
          const className = "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold " + (item.path === path ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300");
          const content = <><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs ring-1 ring-ink-200">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : i + 1}</span>{item.title}</>;
          return <Link key={item.path} href={auditHref(supplierId, item.level)} className={className} aria-current={item.path === path ? "step" : undefined}>{content}</Link>;
        })}
      </nav>
      {step.level > 1 && submissions.length > 0 && (
        <Card className="border-teal-200 bg-teal-50/60 p-4">
          <h2 className="text-sm font-bold text-ink-900">Hồ sơ bằng chứng NCC tự gửi cho bước này ({submissions.length})</h2>
          <p className="mt-1 text-xs text-ink-600">Doanh nghiệp tự tải ảnh/chứng từ qua cổng L2·L3; AI quét và nêu tín hiệu (EXIF/GPS, giờ chụp, mã xác minh viết tay, nội dung ảnh). Nhận hồ sơ sẽ tạo đợt kiểm của nhân viên kèm bằng chứng — không tự cấp huy hiệu.</p>
          <ul className="mt-3 space-y-2 text-sm">{submissions.map((sub) => (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">
              <span className="text-xs text-ink-600">{submissionStatusLabel(sub.status)}
                {sub.verification_code ? ` · mã ${sub.verification_code}` : ""}
                {sub.ai_scanned_at ? ` · AI quét ${new Date(sub.ai_scanned_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : " · chưa quét AI"}
                {sub.verification_id ? " · đã sao bằng chứng sang đợt kiểm" : ""}</span>
              <Link href={`/crm/verifications/submissions/${sub.id}`} className="btn btn-ghost btn-sm">Đối chiếu bằng chứng →</Link>
            </li>))}</ul>
        </Card>
      )}
      {!current ? <Card className="flex flex-wrap items-center justify-between gap-4 p-6"><div><h2 className="font-bold text-ink-900">Chưa bắt đầu {step.title.toLowerCase()}</h2><p className="text-sm text-ink-500">Tạo đợt kiểm để ghi kết quả và thêm bằng chứng riêng cho bước này.</p></div>{canInspect && <StartVerificationButton supplierId={supplierId} level={step.level as VerificationLevel} />}</Card>
        : <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Badge className={current.status === "approved" ? "bg-emerald-50 text-emerald-700" : current.status === "submitted" ? "bg-amber-50 text-amber-700" : current.status === "returned" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}>
              {current.status === "approved" ? "Đã duyệt" : current.status === "submitted" ? "Chờ duyệt" : current.status === "returned" ? "Cần bổ sung" : "Đang kiểm"}
            </Badge>
            <p className="text-sm text-ink-600">{current.status === "approved" ? "Bằng chứng được khoá để giữ nguyên hồ sơ đã duyệt." : "Ghi kết quả, đính kèm bằng chứng và nộp xét duyệt khi đã sẵn sàng."}</p>
          </Card>
          <div className="max-w-5xl">
            <AuditForm key={current.id + current.updated_at} verification={current} evidence={media} certificates={certificates} aiEnabled={!!process.env.OPENAI_API_KEY} canApprove={canApprove} canInspect={canInspect} canPublish={canPublish} currentUserId={session.uid} requireSecondReviewer={requireSecondReviewer} />
          </div>
        </>}
    </div>
  </>;
}
