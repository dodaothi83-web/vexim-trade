import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck2, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { submissionEditable } from "@/lib/verification-submission";
import { effectiveL2Scope, l2ScopeForSupplier } from "@/lib/l2-scope";
import { formatVnDateTime, isCallReview } from "@/lib/l2-call-review";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { bookingMessages } from "@/lib/i18n/portal/booking";
import { L2_REVIEW_METHOD_LABELS } from "@/lib/types";
import { LevelTabs } from "../level-tabs";
import { BookingForm } from "../booking-form";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.verification.level.factoryTitle, robots: { index: false, follow: false } };
}

/**
 * L2 từ 11/2026: nhà cung cấp ĐẶT LỊCH xác minh qua cuộc gọi video (hoặc thực địa).
 * Không còn bộ 9 ảnh tự chụp hay tờ mã. Đường dẫn giữ nguyên để link cũ vẫn mở được.
 */
export default async function SupplierFactoryVerificationPage() {
  const access = await supplierLevelAccess(2);
  if (!access) redirect("/login");
  const { store, supplier, user } = access;
  const { locale, m } = await getPortalMessages();
  const copy = bookingMessages[locale];
  const scope = l2ScopeForSupplier(supplier.supplier_type);
  const partner = scope === "partner_contract";
  const level = m.verification.level;
  const header = <PageHeader eyebrow={level.eyebrowL2} title={partner ? level.partnerTitle : level.factoryTitle}
    sub={partner ? level.partnerDescription : level.factoryDescription}
    actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{level.overview}</Link>} />;
  if (!scope) return <>
    <PageHeader eyebrow={level.eyebrowL2} title={level.unknownTypeTitle} />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{level.unknownTypeBody}</div>
  </>;

  const guideTitles = partner ? level.partnerGuideTitles : level.factoryGuideTitles;
  const guideBodies = partner ? level.partnerGuideBodies : level.factoryGuideBodies;
  const steps = <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label={level.stepsAria}>
    {guideTitles.map((title, index) => <li key={title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-200">{index + 1}</span>
      <span className="min-w-0"><span className="block text-[12.5px] font-bold text-ink-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{guideBodies[index]}</span></span>
    </li>)}
  </ol>;

  try {
    const [verifications, submissions] = await Promise.all([
      store.listVerifications(supplier.id),
      store.listSubmissions(supplier.id, 2),
    ]);
    const sameScope = verifications.filter((v) => v.target_level === 2 && effectiveL2Scope(v.l2_scope) === scope);
    const approved = sameScope.find((v) => v.status === "approved");
    const ongoing = sameScope.find((v) => v.status !== "approved" && isCallReview(v));
    const accepted = ongoing ? submissions.find((s) => s.verification_id === ongoing.id) : null;

    let body: React.ReactNode;
    if (approved) {
      const method = approved.review_method ? L2_REVIEW_METHOD_LABELS[approved.review_method][locale] : null;
      body = <div className="card mt-5 flex gap-3 border-emerald-200 bg-emerald-50/60 p-5 text-sm text-emerald-900">
        <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
        <div><h2 className="font-bold">{copy.approvedTitle}</h2>
          {method && approved.inspector_name && <p className="mt-1">{fill(copy.approvedBody, {
            name: approved.inspector_name, method: method.toLowerCase(), date: formatVnDateTime(approved.call_started_at ?? approved.approved_at, locale), code: approved.report_code ?? "",
          })}</p>}
        </div>
      </div>;
    } else if (ongoing) {
      body = <div className="card mt-5 flex gap-3 border-brand-200 bg-brand-50/60 p-5 text-sm text-brand-900">
        <CalendarCheck2 className="h-6 w-6 shrink-0" aria-hidden="true" />
        <div><h2 className="font-bold">{copy.status.accepted}</h2>
          {accepted?.booking_scheduled_at && <p className="mt-1">{fill(copy.scheduledAt, { time: formatVnDateTime(accepted.booking_scheduled_at, locale) })}</p>}
          <p className="mt-1">{copy.inReviewBody}</p>
        </div>
      </div>;
    } else {
      const submission = await getOrCreateSubmission(store, { supplierId: supplier.id, level: 2, userId: user.id, supplierType: supplier.supplier_type, language: locale });
      const bundle = await loadSubmissionBundle(store, submission.id);
      const items = bundle?.items ?? [];
      const contracts = items.filter((item) => item.checklist_key === "partner_factory_contract" && item.media_id && item.storage_path)
        .map((item, index) => ({ id: item.id, label: `${copy.contract} ${index + 1}`, href: `/api/supplier-portal/submission-file/${item.storage_path!.replace(/^\/+/, "")}` }));
      const oldPhotos = !partner && items.some((item) => item.media_id);
      body = <div className="mt-5 space-y-3">
        <p role="status" className={"rounded-lg px-3 py-2 text-sm font-semibold " + (submission.status === "returned" ? "bg-amber-50 text-amber-900" : submission.status === "pending_review" ? "bg-sky-50 text-sky-900" : "bg-ink-50 text-ink-700")}>
          {copy.status[submission.status]}
        </p>
        {submission.status === "returned" && submission.review_note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{fill(copy.reviewNote, { note: submission.review_note })}</p>}
        <BookingForm copy={copy} value={{
          submissionId: submission.id, partner, editable: submissionEditable(submission.status),
          method: submission.booking_method ?? null,
          contactName: submission.booking_contact_name ?? user.name ?? "",
          contactRole: submission.booking_contact_role ?? "",
          contactPhone: submission.booking_contact_phone ?? supplier.phone ?? "",
          address: submission.booking_factory_address ?? supplier.address ?? "",
          partnerName: submission.partner_factory_name ?? "",
          slots: submission.booking_slots ?? [],
          consent: Boolean(submission.booking_consent_at),
          note: submission.supplier_note ?? "",
          contracts,
        }} />
        {oldPhotos && <p className="text-xs text-ink-500">{copy.oldFlowNote}</p>}
      </div>;
    }
    return <>
      {header}
      <LevelTabs current={2} partner={supplier.supplier_type === "trading"} copy={m.verification.tabs} />
      {steps}
      {body}
    </>;
  } catch (error) {
    console.error(`[supplier-portal] could not open the factory booking. ${migrationHint(error) ?? ""}`.trim(), error);
    return <>
      {header}
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="text-base font-bold">{level.loadErrorTitle}</h2>
        <p className="mt-2">{level.loadErrorBody}</p>
        <Link href="/supplier/portal" className="mt-3 inline-block font-semibold text-amber-900 underline">{level.backToDashboard}</Link>
      </div>
    </>;
  }
}
