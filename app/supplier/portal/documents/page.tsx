import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { FilePicker } from "@/components/file-picker";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { visibleLegacyCertificateFiles } from "@/lib/supplier-portal/legacy-certificate-files";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { canUploadOwnDocument, COMPANY_DOCUMENT_KEYS, INITIAL_DOCUMENT_KEYS, QUALITY_CERTIFICATE_DOC_KEYS } from "@/lib/supplier-portal/policy";
import { L1_DOC_ITEMS, type MediaAsset } from "@/lib/types";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { deriveL1Rows } from "@/lib/certificate-l1";
import { certificateSchemeLabel } from "@/lib/certificate-scheme";
import { certificateExpired, formatCertificateDate, supplierCertificateNote } from "@/lib/certificate-supplier-copy";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";
import { L1DocUpload } from "../l1-doc-upload";
import { SupplierCertificateUpload } from "../certificate-upload";
import { LevelTabs } from "../verification/level-tabs";
import { VerificationBenefits } from "../verification/benefits";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.documents.metaTitle, robots: { index: false, follow: false } };
}

function uploadedOn(iso: string | null | undefined, intl: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function mediaHref(file: Pick<MediaAsset, "storage_path">): string | null {
  if (!file.storage_path) return null;
  return `/api/media/file/${file.storage_path.split("/").map(encodeURIComponent).join("/")}`;
}

export default async function SupplierDocumentsPage({ searchParams }: { searchParams?: Promise<{ replace?: string }> }) {
  const replaceId = (await searchParams)?.replace ?? null;
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, review, user, store } = access;
  const { locale, intl, m } = await getPortalMessages();
  const copy = m.documents;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] could not read ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [media, certificates, supplierMedia] = await Promise.all([
    optional(copy.degraded.labelDocuments, [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
    optional(copy.degraded.labelCertificates, [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional(copy.degraded.labelCertificates, [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => store.listMedia("supplier", supplier.id)),
  ]);

  const mine = media.filter((asset) => asset.created_by === user.id && asset.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(asset.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));

  const docRows = COMPANY_DOCUMENT_KEYS.map((key) => {
    const item = L1_DOC_ITEMS.find((entry) => entry.key === key);
    const files = mine.filter((asset) => asset.checklist_key === key)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    const uploadable = canUploadOwnDocument(user, review, key, { hasFile: files.length > 0 });
    return {
      key,
      label: copy.itemLabels[key] ?? item?.label ?? key,
      core: Boolean(item?.core), files, latest: files.at(-1) ?? null, uploadable,
    };
  });
  const certificateMediaIds = new Set(certificates.map((certificate) => certificate.file_media_id).filter((id): id is string => Boolean(id)));
  const legacyCertFiles = visibleLegacyCertificateFiles(
    mine.filter((asset) => (QUALITY_CERTIFICATE_DOC_KEYS as readonly string[]).includes(asset.checklist_key ?? "") && !certificateMediaIds.has(asset.id))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    certificates.filter((certificate) => certificate.review_status !== "rejected").map((certificate) => certificate.name),
  );
  const uploadedDocs = docRows.filter((row) => row.files.length > 0);
  const requiredCount = docRows.length;
  const requiredSummary = fill(copy.status.requiredCount, { uploaded: uploadedDocs.length, total: requiredCount });
  const docProgress = Math.round((uploadedDocs.length / Math.max(requiredCount, 1)) * 100);
  const trading = supplier.supplier_type === "trading";

  const l1Approved = review?.status === "approved";
  const l1Returned = review?.status === "returned";
  const l1Submitted = review?.status === "submitted";
  const l1Status = l1Approved ? copy.status.approved : l1Returned ? copy.status.returned
    : l1Submitted ? copy.status.submitted : copy.status.reviewing;
  const statusTone = l1Approved ? "bg-emerald-100 text-emerald-900"
    : l1Returned ? "bg-rose-100 text-rose-900"
      : l1Submitted ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700";
  const statusNote = l1Approved ? copy.status.approvedNote
    : l1Returned ? copy.status.returnedNote
      : l1Submitted ? copy.status.submittedNote : copy.status.reviewingNote;

  const approvedCerts = certificates.filter((certificate) => certificate.review_status === "approved" && !certificate.staff_hidden);
  const pendingCerts = certificates.filter((certificate) => certificate.review_status !== "approved" && certificate.review_status !== "rejected" && !certificate.superseded_by_certificate_id);
  const awaitingCerts = pendingCerts.filter((certificate) => certificate.review_status !== "changes_requested");
  const changesRequestedCerts = pendingCerts.filter((certificate) => certificate.review_status === "changes_requested");
  // Giấy bị từ chối (chưa có bản thay): hiện lý do và lối tải lại; trước đây bị ẩn hẳn.
  const rejectedCerts = certificates.filter((certificate) => certificate.review_status === "rejected" && !certificate.superseded_by_certificate_id);
  const certificateMedia = new Map(supplierMedia.map((asset) => [asset.id, asset]));
  const approvedByKey = deriveL1Rows(certificates).map((row) => {
    const item = L1_DOC_ITEMS.find((entry) => entry.key === row.key);
    return { key: row.key, label: copy.itemLabels[row.key as keyof typeof copy.itemLabels] ?? item?.label ?? row.key, certificates: row.certificates };
  });

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub}
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{copy.back}
      </Link>} />

    <LevelTabs current={1} partner={trading} copy={m.verification.tabs} />

    {degraded.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{copy.degraded.title}</p>
      <p className="mt-1">{copy.degraded.body}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>
    </div>}

    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="business-status-title" className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-brand-50 via-white to-white p-4 sm:p-5">
            <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">{copy.status.title}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="business-status-title" className="text-[15px] font-black text-ink-900">{copy.status.businessDocuments}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>{l1Status}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-ink-700">
              {requiredSummary}
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={docProgress} aria-valuemin={0} aria-valuemax={100} aria-label={requiredSummary}>
              <div className={`h-full rounded-full transition-all ${docProgress === 100 ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${docProgress}%` }} />
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-600">{statusNote}</p>
          </div>
          {l1Approved && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-xs leading-5 text-emerald-900">
            <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />{copy.status.approvedBanner}
          </p>}
          {l1Returned && <p className="whitespace-pre-wrap border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-900">
            <strong>{copy.status.reason}</strong> {review?.return_reason || copy.status.reasonFallback}
          </p>}
        </section>

        {docRows.map((row) => {
          const file = row.latest;
          const href = file ? mediaHref(file) : null;
          const date = uploadedOn(file?.created_at, intl);
          return <section key={row.key} id="xac-thuc-doanh-nghiep" aria-labelledby="dkkd-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 id="dkkd-title" className="text-[14px] font-bold text-ink-900">{row.label}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${l1Approved && file ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                {l1Approved && file ? copy.status.approved : file ? copy.upload.hasFile : copy.upload.noFile}
              </span>
            </div>
            {file ? <>
              <p className="mt-2 text-xs text-ink-600">{file.caption || copy.upload.captionFallback}</p>
              {date && <p className="mt-1 text-[11px] text-ink-500">{fill(copy.upload.uploadedAt, { date })}</p>}
              {href && <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-900 hover:bg-brand-100">
                <FileText className="size-4" aria-hidden="true" />
                {file.mime === "application/pdf" ? copy.upload.viewPdf : copy.upload.viewFile}
              </a>}
              {l1Approved && <p className="mt-3 text-xs leading-5 text-emerald-800">{copy.upload.verifiedDetail}</p>}
              {l1Approved && <p className="mt-2 text-xs leading-5 text-ink-600">{copy.upload.lockedNote}</p>}
            </> : <p className="mt-2 text-xs text-ink-500">{copy.upload.emptyHint}</p>}
            <div className="mt-3">
              {row.uploadable
                ? <L1DocUpload checklistKey={row.key} hasFile={Boolean(file)} copy={copy.l1Upload} />
                : !l1Approved && <FilePicker compact disabled accept=".pdf,image/jpeg,image/png,image/webp"
                  title={copy.upload.pickerLocked} hint={l1Submitted ? copy.upload.hintReopens : copy.upload.hintNeedConfirm} />}
            </div>
          </section>;
        })}

        <section id="chung-nhan" aria-labelledby="certs-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 id="certs-title" className="text-[14px] font-bold text-ink-900">{copy.certs.title}</h2>
            {awaitingCerts.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">
              {fill(copy.certs.pendingBadge, { count: awaitingCerts.length })}
            </span>}
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-600">{copy.certs.sub}</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">{copy.certs.reviewNote}</p>

          {legacyCertFiles.length > 0 && <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50/70 px-3 py-2.5">
            <p className="text-xs font-bold text-ink-800">{copy.certs.legacyTitle}</p>
            <ul className="mt-2 space-y-2">
              {legacyCertFiles.map((file) => {
                const href = mediaHref(file);
                return <li key={file.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                  {href ? <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                    {file.caption || copy.upload.captionFallback}
                  </a> : <span>{file.caption || copy.upload.captionFallback}</span>}
                  {uploadedOn(file.created_at, intl) && <span className="text-ink-500">{fill(copy.certs.legacyUploadedAt, { date: uploadedOn(file.created_at, intl) })}</span>}
                </li>;
              })}
            </ul>
            <p className="mt-2 text-[11px] leading-4 text-ink-500">{copy.certs.legacyNote}</p>
          </div>}

          <SupplierCertificateUpload certificates={certificates
            .filter((certificate) => !certificate.superseded_by_certificate_id)
            .map((certificate) => ({ id: certificate.id, name: certificate.name, valid_until: certificate.valid_until }))}
            trading={trading} copy={copy.certUpload}
            initialCertificateId={replaceId && rejectedCerts.some((certificate) => certificate.id === replaceId) ? replaceId : null} />
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <section aria-labelledby="approved-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h2 id="approved-title" className="text-[15px] font-bold text-ink-900">{copy.approved.title}</h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">{copy.approved.sub}</p>
            <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs font-bold text-ink-800">
              {fill(copy.approved.counts, { approved: approvedCerts.length, pending: awaitingCerts.length })}
              {changesRequestedCerts.length > 0 && <span className="block mt-1 font-semibold text-amber-800">{fill(copy.approved.changesCount, { count: changesRequestedCerts.length })}</span>}
            </p>
          </div>

          {approvedByKey.length > 0
            ? <ul className="mt-3 space-y-2">
              {approvedByKey.map((row) => <li key={row.key} className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink-900">{row.label}</p>
                    <ul className="mt-1 space-y-1">
                      {row.certificates.map((certificate) => {
                        const original = certificates.find((item) => item.id === certificate.id);
                        const left = daysUntilExpiry(certificate.validUntil);
                        const scheme = certificateSchemeLabel(certificate.scheme, locale);
                        const note = original ? supplierCertificateNote(original, undefined, locale) : "";
                        return <li key={certificate.id} className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-600">
                          <span className="font-semibold text-ink-800">{certificate.name}</span>
                          {scheme && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">{scheme}</span>}
                          {certificate.validUntil && <span className={certificate.expired ? "text-amber-800" : ""}>
                            {fill(copy.approved.expiry, { date: formatCertificateDate(certificate.validUntil, locale) })}{certificate.expired ? copy.approved.expired : left !== null ? fill(copy.approved.daysLeft, { count: left }) : ""}
                          </span>}
                          {note && note !== copy.approved.noteShown && <span className="text-ink-500">{note}</span>}
                        </li>;
                      })}
                    </ul>
                  </div>
                  <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                </div>
              </li>)}
            </ul>
            : <p className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-4 text-center text-xs text-ink-600">
              {copy.approved.empty}
            </p>}

          {rejectedCerts.length > 0 && <>
            <p className="mt-3 text-xs font-semibold text-rose-800">{fill(copy.approved.rejectedTitle, { count: rejectedCerts.length })}</p>
            <ul className="mt-2 space-y-2">
              {rejectedCerts.map((certificate) => <li key={certificate.id} className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-xs font-bold text-ink-900">{certificate.name}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-rose-800">{copy.approved.rejectedPill}</span>
                </div>
                <p className="mt-1 text-[11.5px] leading-4 text-rose-900">{supplierCertificateNote(certificate, undefined, locale)}</p>
                <a href={`?replace=${encodeURIComponent(certificate.id)}#chung-nhan`} className="mt-2 inline-flex text-[11px] font-bold text-brand-800 underline underline-offset-2">
                  {copy.approved.replaceLink}
                </a>
              </li>)}
            </ul>
          </>}

          {pendingCerts.length > 0 && <>
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {fill(copy.approved.pendingFallback, { count: pendingCerts.length })}
            </p>
            <ul className="mt-2 space-y-2" aria-label={copy.approved.title}>
              {pendingCerts.map((certificate) => {
                const file = certificate.file_media_id ? certificateMedia.get(certificate.file_media_id) : null;
                const href = file ? mediaHref(file) : null;
                // Giấy hết hạn không bao giờ được duyệt đăng: nói rõ ngay, kèm việc cần làm.
                const expired = certificateExpired(certificate.valid_until);
                const status = expired ? fill(copy.approved.expiredPill, { date: formatCertificateDate(certificate.valid_until, locale) })
                  : certificate.review_status === "changes_requested" ? copy.approved.changesRequested : copy.approved.waiting;
                const date = uploadedOn(file?.created_at ?? certificate.created_at, intl);
                return <li key={certificate.id} className={`rounded-xl border px-3 py-2.5 ${expired ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-xs font-bold text-ink-900">{certificate.name}</p>
                    <span className={`rounded-full bg-white px-2 py-0.5 text-[10px] font-bold ${expired ? "text-rose-800" : "text-amber-900"}`}>{status}</span>
                  </div>
                  {expired && <p className="mt-1 text-[11.5px] font-semibold leading-4 text-rose-900">{supplierCertificateNote(certificate, undefined, locale)}</p>}
                  {date && <p className="mt-1 text-[11px] text-ink-600">{fill(copy.upload.uploadedAt, { date })}</p>}
                  {certificate.valid_until && !expired && <p className="mt-1 text-[11px] text-ink-600">{fill(copy.approved.expiry, { date: formatCertificateDate(certificate.valid_until, locale) })}</p>}
                  {href
                    ? <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-800 underline underline-offset-2">
                      <FileText className="size-3.5" aria-hidden="true" />{copy.approved.openFile}
                    </a>
                    : <p className="mt-2 text-[11px] text-ink-500">{copy.approved.fileUnavailable}</p>}
                </li>;
              })}
            </ul>
          </>}
          {(awaitingCerts.length > 0 || changesRequestedCerts.length > 0) && <p className="mt-3 text-xs leading-5 text-ink-600">{copy.approved.reviewAfterApproval}</p>}
          <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-5 text-ink-500">{copy.approved.taxNote}</p>
        </section>

        <VerificationBenefits items={copy.benefits.items} title={copy.benefits.title} />
        <section aria-labelledby="tips-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <h2 id="tips-title" className="text-xs font-bold text-brand-900">{copy.tips.title}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] leading-4 text-ink-600">
            {copy.tips.items.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </section>
      </aside>
    </div>
  </>;
}
