import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { AUDIT_STEPS, auditHref } from "@/lib/verification";
import type { VerificationLevel } from "@/lib/types";
import { Breadcrumbs, Badge, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MediaManager } from "@/components/media-manager";
import { StartVerificationButton } from "../../start-verification-button";
import { AuditForm } from "./audit-form";

export const dynamic = "force-dynamic";

export default async function AuditStepPage({ params }: { params: Promise<{ slug: string; step: string }> }) {
  const { slug: supplierId, step: path } = await params;
  const step = AUDIT_STEPS.find((s) => s.path === path);
  if (!step) notFound();
  const session = await requirePagePermission("verifications.inspect", `/crm/suppliers/${supplierId}`);
  const store = getStore();
  const [supplier, all] = await Promise.all([store.getSupplier(supplierId), store.listVerifications(supplierId)]);
  if (!supplier) notFound();
  const approvedLevel = Math.max(0, ...all.filter((v) => v.status === "approved").map((v) => v.target_level));
  const unlocked = step.level === 1 || approvedLevel >= step.level - 1;
  const forStep = [...all].filter((v) => v.target_level === step.level).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const current = forStep.find((v) => v.status === "approved") ?? forStep[0];
  const media = current && unlocked ? await store.listMedia("verification", current.id) : [];
  const canApprove = hasPermission(session.role, "verifications.approve");
  const editable = !!current && ["in_progress", "scheduled", "returned"].includes(current.status);
  const mediaReadOnly = !editable && !(current?.status === "submitted" && canApprove && current.inspector_id !== session.uid);

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
          const available = item.level === 1 || approvedLevel >= item.level - 1;
          const className = "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold " + (item.path === path ? "border-brand-500 bg-brand-50 text-brand-800" : available ? "border-ink-200 bg-white text-ink-700 hover:border-brand-300" : "border-ink-100 bg-ink-50 text-ink-400");
          const content = <><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs ring-1 ring-ink-200">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : i + 1}</span>{item.title}{!available && <LockKeyhole className="ml-auto h-4 w-4" />}</>;
          return available ? <Link key={item.path} href={auditHref(supplierId, item.level)} className={className} aria-current={item.path === path ? "step" : undefined}>{content}</Link> : <span key={item.path} className={className}>{content}</span>;
        })}
      </nav>
      {!unlocked ? <Card className="p-6"><h2 className="font-bold text-ink-900">Bước này chưa mở</h2><p className="mt-2 text-sm text-ink-600">Cần duyệt {AUDIT_STEPS[step.level - 2].title.toLowerCase()} trước.</p></Card>
        : !current ? <Card className="flex flex-wrap items-center justify-between gap-4 p-6"><div><h2 className="font-bold text-ink-900">Chưa bắt đầu {step.title.toLowerCase()}</h2><p className="text-sm text-ink-500">Tạo đợt kiểm để ghi kết quả và thêm bằng chứng riêng cho bước này.</p></div>{approvedLevel < step.level && <StartVerificationButton supplierId={supplierId} level={step.level as VerificationLevel} />}</Card>
        : <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Badge className={current.status === "approved" ? "bg-emerald-50 text-emerald-700" : current.status === "submitted" ? "bg-amber-50 text-amber-700" : current.status === "returned" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}>
              {current.status === "approved" ? "Đã duyệt" : current.status === "submitted" ? "Chờ duyệt" : current.status === "returned" ? "Cần bổ sung" : "Đang kiểm"}
            </Badge>
            <p className="text-sm text-ink-600">{current.status === "approved" ? "Bằng chứng được khoá để giữ nguyên hồ sơ đã duyệt." : "Ghi kết quả, đính kèm bằng chứng và nộp xét duyệt khi đã sẵn sàng."}</p>
          </Card>
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <AuditForm key={current.id + current.updated_at} verification={current} evidence={media} aiEnabled={!!process.env.OPENAI_API_KEY} canApprove={canApprove} currentUserId={session.uid} />
            <div className="space-y-3">
              <MediaManager ownerType="verification" ownerId={current.id} items={media} readOnly={mediaReadOnly} allowInternal={false} note="Tệp nội bộ · video ngoài cần đặt quyền chia sẻ phù hợp" />
              {step.level === 3 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Để duyệt lịch sử giao hàng, cần ít nhất một chứng từ giao hàng được đánh dấu “Đã kiểm tra”. Ảnh hoặc video bổ sung không thay cho vận đơn/xác nhận giao nhận.</p>}
            </div>
          </div>
          {current.status === "approved" && step.level < 3 && <Link href={auditHref(supplierId, step.level + 1)} className="btn btn-primary w-fit">Tiếp tục: {AUDIT_STEPS.find((s) => s.level === step.level + 1)?.title} <ArrowRight className="h-4 w-4" /></Link>}
        </>}
    </div>
  </>;
}
