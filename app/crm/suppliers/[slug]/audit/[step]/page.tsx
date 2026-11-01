import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { AUDIT_STEPS, auditHref } from "@/lib/verification";
import { effectiveL2Scope, isPartnerL2, l2ScopeForSupplier, l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { submissionStatusLabel } from "@/lib/verification-submission";
import { canSelfApproveVerification } from "@/lib/verification-policy";
import type { MediaAsset, VerificationLevel } from "@/lib/types";
import { t } from "@/lib/public/i18n";
import { Breadcrumbs, Badge, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { StartVerificationButton } from "../../start-verification-button";
import { AuditForm } from "./audit-form";

export const dynamic = "force-dynamic";

export default async function AuditStepPage({ params, searchParams }: { params: Promise<{ slug: string; step: string }>; searchParams?: Promise<{ review?: string }> }) {
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
  // Phạm vi đã xác nhận của từng giấy + danh mục để chọn phạm vi + sản phẩm mà nhà
  // cung cấp xin mở rộng. Lỗi đọc chỉ làm trống phần phạm vi, không chặn trang.
  const [certificateScopes, scopeCategories] = step.level === 1
    ? await Promise.all([
      typeof store.listCertificateScopes === "function" && certificates.length > 0
        ? store.listCertificateScopes(certificates.map((certificate) => certificate.id))
          .catch((error) => { console.error("[certificates] scope query failed", error); return []; })
        : Promise.resolve([]),
      store.listCategories({ publishedOnly: false })
        .catch((error) => { console.error("[certificates] category query failed", error); return []; }),
    ])
    : [[], []];
  const requestedProductIds = step.level === 1
    ? [...new Set(certificates.flatMap((certificate) => certificate.requested_product_ids ?? []))]
    : [];
  const requestedProducts = requestedProductIds.length
    ? (await Promise.all(requestedProductIds.map((id) => store.getProduct(id).catch(() => null))))
      .filter((product): product is NonNullable<typeof product> => Boolean(product))
    : [];
  const forStep = [...all].filter((v) => v.target_level === step.level).sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Đợt đang chờ duyệt phải hiện trước: nếu ưu tiên đợt đã duyệt thì một hồ sơ
  // mới nộp (ví dụ chu kỳ xác minh lại) không bao giờ tới được mắt người duyệt.
  const requestedId = (await searchParams)?.review;
  const scope = step.level === 2 ? l2ScopeForSupplier(supplier.supplier_type) : null;
  const matching = step.level === 2 ? forStep.filter((v) => scope && effectiveL2Scope(v.l2_scope) === scope) : forStep;
  const current = requestedId ? forStep.find((v) => v.id === requestedId)
    : matching.find((v) => v.status === "submitted") ?? matching.find((v) => v.status === "approved") ?? matching[0];
  if (requestedId && !current) notFound();
  const partner = step.level === 2 && (current ? isPartnerL2(current) : scope === "partner_contract");
  const title = partner ? "Nhà máy đối tác" : step.title;
  const description = partner ? "Đối chiếu hợp đồng với nhà máy đối tác; không suy ra sở hữu hay kiểm thực địa." : step.description;
  const media = current ? await store.listMedia("verification", current.id) : [];
  const certificateMediaIds = new Set(certificates.map((certificate) => certificate.file_media_id).filter((id): id is string => Boolean(id)));
  const certificateMedia = step.level === 1 && certificateMediaIds.size > 0
    ? (await store.listMedia("supplier", supplierId).catch((error) => {
      console.error("[certificates] source media query failed", error);
      return [] as MediaAsset[];
    })).filter((asset) => certificateMediaIds.has(asset.id) && Boolean(asset.storage_path))
    : [];
  const canApprove = hasPermission(session.role, "verifications.approve");
  const canInspect = hasPermission(session.role, "verifications.inspect");
  const canPublish = hasPermission(session.role, "suppliers.publish");

  return <>
    <PageHeader
      breadcrumbs={<Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: supplier.name, href: `/crm/suppliers/${supplierId}?tab=review#supplier-review` }, { label: title }]} />}
      title={title}
      sub={`${supplier.name} · ${description}`}
      actions={<Link href={`/crm/suppliers/${supplierId}?tab=review#supplier-review`} className="btn btn-ghost"><ArrowLeft className="h-4 w-4" /> Xét duyệt nhà cung cấp</Link>}
    />
    <div className="max-w-6xl space-y-5">
      <nav aria-label="Các bước kiểm toán" className="grid gap-2 sm:grid-cols-3">
        {AUDIT_STEPS.map((item, i) => {
          const done = all.some((v) => v.target_level === item.level && v.status === "approved" && (item.level !== 2 || (scope !== null && effectiveL2Scope(v.l2_scope) === scope)));
          const className = "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold " + (item.path === path ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300");
          const content = <><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs ring-1 ring-ink-200">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : i + 1}</span>{item.level === 2 && scope === "partner_contract" ? "Nhà máy đối tác" : item.title}</>;
          return <Link key={item.path} href={auditHref(supplierId, item.level)} className={className} aria-current={item.path === path ? "step" : undefined}>{content}</Link>;
        })}
      </nav>
      {step.level > 1 && submissions.length > 0 && (
        <Card className="border-teal-200 bg-teal-50/60 p-4">
          <h2 className="text-sm font-bold text-ink-900">Hồ sơ bằng chứng nhà cung cấp tự gửi cho bước này ({submissions.length})</h2>
          <p className="mt-1 text-xs text-ink-600">{step.level === 2 ? "Xem phạm vi ghi trên từng hồ sơ; hồ sơ nhà máy và hồ sơ đối tác được giữ riêng." : "Nhân viên trực tiếp đối chiếu chứng từ xuất khẩu và vai trò của doanh nghiệp."} Nhận hồ sơ tạo đợt kiểm kèm bằng chứng, không tự cấp huy hiệu.</p>
          <ul className="mt-3 space-y-2 text-sm">{submissions.map((sub) => (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">
              <span className="text-xs text-ink-600">{step.level === 2 ? isPartnerL2(sub) ? "Đối tác · " : "Nhà máy · " : ""}{submissionStatusLabel(sub.status)}
                {sub.verification_code ? ` · mã ${sub.verification_code}` : ""}
                {" · nhân viên kiểm tra thủ công"}
                {sub.verification_id ? " · đã sao bằng chứng sang đợt kiểm" : ""}</span>
              <Link href={`/crm/verifications/submissions/${sub.id}`} className="btn btn-ghost btn-sm">Đối chiếu bằng chứng →</Link>
            </li>))}</ul>
        </Card>
      )}
      {step.level === 2 && forStep.length > 0 && <Card className="p-4">
        <h2 className="text-sm font-bold text-ink-900">Các đợt L2 đã lưu</h2>
        <p className="mt-1 text-xs text-ink-600">Mỗi đợt giữ phạm vi riêng; thay đổi loại hình không đổi kết quả cũ.</p>
        <ul className="mt-2 space-y-1 text-xs">{forStep.map((v) => <li key={v.id}>
          <Link className="text-brand-700 underline" href={auditHref(supplierId, 2, v.id)}>{isPartnerL2(v) ? "Hợp đồng nhà máy đối tác" : "Xác thực nhà máy"} · {v.status} · {v.created_at.slice(0, 10)}</Link>
        </li>)}</ul>
      </Card>}
      {current && step.level === 2 && !l2ScopeMatchesSupplier(current, supplier.supplier_type) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Loại hình chưa rõ hoặc khác phạm vi của đợt này. Xác minh loại hình trước khi tiếp tục; không chuyển kết quả cũ.</p>}
      {!current ? <Card className="flex flex-wrap items-center justify-between gap-4 p-6"><div><h2 className="font-bold text-ink-900">Chưa bắt đầu {title.toLowerCase()}</h2><p className="text-sm text-ink-500">Tạo đợt kiểm để ghi kết quả và thêm bằng chứng riêng cho bước này.</p></div>{canInspect && <StartVerificationButton supplierId={supplierId} level={step.level as VerificationLevel} />}</Card>
        : <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <Badge className={current.status === "approved" ? "bg-emerald-50 text-emerald-700" : current.status === "submitted" ? "bg-amber-50 text-amber-700" : current.status === "returned" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}>
              {current.status === "approved" ? "Đã duyệt" : current.status === "submitted" ? "Chờ duyệt" : current.status === "returned" ? "Cần bổ sung" : "Đang kiểm"}
            </Badge>
            <p className="text-sm text-ink-600">{current.status === "approved" ? "Bằng chứng được khoá để giữ nguyên hồ sơ đã duyệt." : "Ghi kết quả, đính kèm bằng chứng và nộp xét duyệt khi đã sẵn sàng."}</p>
          </Card>
          <div className="max-w-5xl">
            <AuditForm key={current.id + current.updated_at} verification={current} autoPublishL1={!!supplier.auto_publish_after_l1} evidence={media} certificates={certificates} certificateMedia={certificateMedia} aiEnabled={!!process.env.OPENAI_API_KEY} canApprove={canApprove} canInspect={canInspect} canPublish={canPublish} currentUserId={session.uid} canSelfApprove={canSelfApproveVerification(session.role)} scopes={certificateScopes} categories={scopeCategories.map((category) => ({ id: category.id, name: t(category.name_i18n) || category.slug }))} requestedProducts={requestedProducts} />
          </div>
        </>}
    </div>
  </>;
}
