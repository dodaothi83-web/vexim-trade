import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, FileText } from "lucide-react";
import { VeximDocumentIcon as FileCheck2 } from "@/components/brand/vexim-icons";

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
import { supplierCertificateNote } from "@/lib/certificate-supplier-copy";
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

/**
 * Bước 1 của quy trình xác minh: giấy tờ doanh nghiệp và chứng nhận chất lượng.
 *
 * Bố cục lấy đúng nhịp của L2/L3: dải tab ba bước, ba bước thực hiện, rồi hai cột
 * (nội dung bên trái, cột tóm tắt dính bên phải). Khác một điểm: bước này không có
 * nút nộp, nên cột phải là nơi tải tệp chứ không phải nơi nộp hồ sơ.
 *
 * Cột trái là nơi làm việc: tình trạng hồ sơ và hai ô tải (GCN đăng ký kinh doanh,
 * chứng nhận chất lượng). Cột phải trả lời hai câu ngắn: nhà cung cấp nhận được gì, và
 * giấy nào đã được duyệt.
 */

/** Ngày tải tệp, đọc nhanh trong thẻ. */
function uploadedOn(iso: string | null | undefined, intl: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric" });
}

const isImage = (mime: string | null) => Boolean(mime?.startsWith("image/"));

function EvidenceThumbnail({ file, label, openAria }: { file: MediaAsset; label: string; openAria: string }) {
  if (!file.storage_path) return null;
  const href = `/api/media/file/${file.storage_path}`;
  return <a href={href} target="_blank" rel="noreferrer" title={file.caption || label}
    aria-label={fill(openAria, { label: file.caption || label })}
    className="group/thumb relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-50 shadow-sm transition hover:border-brand-300 hover:shadow">
    {isImage(file.mime)
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={`/api/media/file/${file.thumb_path || file.storage_path}`} alt={file.caption || label}
        className="h-full w-full object-cover transition group-hover/thumb:scale-105" />
      : <span className="flex h-full flex-col items-center justify-center gap-1 text-ink-500">
        <FileText className="size-4" aria-hidden="true" />
        <span className="max-w-full truncate px-1 text-[8px] font-semibold">PDF</span>
      </span>}
  </a>;
}

export default async function SupplierDocumentsPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, review, reviews, user, store } = access;
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
  const [media, certificates] = await Promise.all([
    optional(copy.degraded.labelDocuments, [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
    optional(copy.degraded.labelCertificates, [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
  ]);

  const mine = media.filter((m) => m.created_by === user.id && m.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(m.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));

  /* Mỗi mục giấy tờ doanh nghiệp là một thẻ: ảnh thu nhỏ, trạng thái và ô tải riêng.
   * Chứng nhận chất lượng đi qua kho chứng nhận, nên một tệp chỉ có một đường vào. */
  const docRows = COMPANY_DOCUMENT_KEYS.map((key) => {
    const item = L1_DOC_ITEMS.find((entry) => entry.key === key);
    const files = mine.filter((m) => m.checklist_key === key)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    /* Ô tải mở theo từng mục: đợt đang mở nhận mọi giấy; đợt đã duyệt chỉ nhận bổ sung
     * giấy đăng ký kinh doanh khi mục đó còn trống. */
    const uploadable = canUploadOwnDocument(user, review, key, { hasFile: files.length > 0 });
    return {
      key,
      label: copy.itemLabels[key] ?? item?.label ?? key,
      core: Boolean(item?.core), files, latest: files.at(-1) ?? null, uploadable,
    };
  });
  /*
   * Tệp chứng nhận đã tải theo luồng cũ nhưng chưa có bản ghi chứng nhận: vẫn cho xem lại
   * và mời tải lại, để không mất tệp mà cũng không hiện trùng với danh sách chứng nhận.
   */
  const certificateMediaIds = new Set(certificates.map((certificate) => certificate.file_media_id).filter((id): id is string => Boolean(id)));
  const legacyCertFiles = visibleLegacyCertificateFiles(
    mine.filter((m) => (QUALITY_CERTIFICATE_DOC_KEYS as readonly string[]).includes(m.checklist_key ?? "") && !certificateMediaIds.has(m.id))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    certificates.filter((certificate) => certificate.review_status !== "rejected").map((certificate) => certificate.name),
  );
  const uploadedDocs = docRows.filter((row) => row.files.length > 0);
  const missingDocs = docRows.filter((row) => row.files.length === 0);
  const docProgress = Math.round((uploadedDocs.length / Math.max(docRows.length, 1)) * 100);

  /* Từ 11/2026 ô tải chứng nhận luôn mở. Đơn vị thương mại có thêm ô hợp đồng với nhà máy:
   * giấy đứng tên nhà máy khác chỉ hiện cho người mua sau khi nhân viên xem hợp đồng đó. */
  const trading = supplier.supplier_type === "trading";

  const l1Approved = review?.status === "approved";
  const l1Returned = review?.status === "returned";
  const l1Submitted = review?.status === "submitted";
  const l1Status = l1Approved ? copy.status.approved : l1Returned ? copy.status.returned
    : l1Submitted ? copy.status.submitted : copy.status.reviewing;
  const statusTone = l1Approved ? "bg-emerald-100 text-emerald-900"
    : l1Returned ? "bg-rose-100 text-rose-900"
      : l1Submitted ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700";
  const progressNote = l1Approved
    ? (missingDocs.length ? fill(copy.status.noteApprovedMissing, { count: missingDocs.length }) : copy.status.noteApprovedDone)
    : l1Returned ? copy.status.noteReturned
      : l1Submitted ? copy.status.noteSubmitted
        : missingDocs.length ? fill(copy.status.noteMissing, { count: missingDocs.length }) : copy.status.noteComplete;

  /* Chỉ giấy đã duyệt mới vào danh sách "đã duyệt theo loại". Mục không có giấy thì
   * không hiện, để nhà cung cấp nhìn thấy đúng thứ mình đang có. */
  const approvedCerts = certificates.filter((certificate) => certificate.review_status === "approved" && !certificate.staff_hidden);
  const pendingCerts = certificates.filter((certificate) => certificate.review_status !== "approved" && certificate.review_status !== "rejected" && !certificate.superseded_by_certificate_id);
  const approvedByKey = deriveL1Rows(certificates).map((row) => {
    const item = L1_DOC_ITEMS.find((entry) => entry.key === row.key);
    return { key: row.key, label: copy.itemLabels[row.key as keyof typeof copy.itemLabels] ?? item?.label ?? row.key, certificates: row.certificates };
  });

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub}
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{copy.back}
      </Link>} />

    <LevelTabs current={1} partner={supplier.supplier_type === "trading"} copy={m.verification.tabs} />

    {degraded.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">{copy.degraded.title}</p>
      <p className="mt-1">{copy.degraded.body}</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label={copy.steps.aria}>
      {copy.steps.titles.map((title, index) => ({ title, body: copy.steps.bodies[index] })).map((step, index) => <li key={step.title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-200">{index + 1}</span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-ink-900">{step.title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{step.body}</span>
        </span>
      </li>)}
    </ol>

    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="status-title" className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-brand-50 via-white to-white px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
                <FileCheck2 className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">{copy.status.eyebrow}</p>
                <h2 id="status-title" className="mt-0.5 text-[15px] leading-tight font-black tracking-tight text-ink-900">{copy.status.title}</h2>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${statusTone}`}>{l1Status}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink-600">{copy.status.docsLabel}</span>
                <span className="text-[12.5px] font-black tabular-nums text-ink-900">{uploadedDocs.length}/{docRows.length}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={docProgress} aria-valuemin={0} aria-valuemax={100} aria-label={copy.status.progressAria}>
                <div className={`h-full rounded-full transition-all ${docProgress === 100 ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${docProgress}%` }} />
              </div>
              <p className={`mt-1.5 text-[11px] font-semibold ${l1Approved ? "text-emerald-800" : l1Returned ? "text-rose-700" : "text-amber-800"}`}>{progressNote}</p>
            </div>
          </div>
          {l1Approved && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[11.5px] leading-5 text-emerald-900">
            <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            {copy.banner.approved}
          </p>}
          {l1Returned && <p className="whitespace-pre-wrap border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[11.5px] leading-5 text-rose-900">
            <strong>{copy.banner.reason}</strong> {review?.return_reason || copy.banner.reasonFallback}
          </p>}
          {l1Submitted && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[11.5px] leading-5 text-amber-900">
            <Clock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            {copy.banner.submitted}
          </p>}
        </section>

        {/* Khu vực tải: GCN đăng ký kinh doanh. */}
        {docRows.map((row) => <section key={row.key} id="xac-thuc-doanh-nghiep" aria-labelledby="dkkd-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 id="dkkd-title" className="min-w-0 text-[14px] font-bold text-ink-900">{row.label}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${row.latest ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {row.latest ? copy.upload.hasFile : copy.upload.noFile}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            {row.latest
              ? `${row.latest.caption || copy.upload.captionFallback}${uploadedOn(row.latest.created_at, intl) ? fill(copy.upload.uploadedAt, { date: uploadedOn(row.latest.created_at, intl) }) : ""}`
              : copy.upload.emptyHint}
          </p>
          {row.files.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={fill(copy.upload.filesAria, { label: row.label })}>
            {row.files.map((file) => <EvidenceThumbnail key={file.id} file={file} label={row.label} openAria={copy.upload.openFileAria} />)}
          </div>}
          {row.latest && certificateMediaIds.has(row.latest.id) && <p className="mt-1 text-[10px] leading-4 text-teal-800">
            {copy.upload.vault}{certificates.find((certificate) => certificate.file_media_id === row.latest?.id)?.valid_until
              ? fill(copy.upload.vaultExpiry, { date: certificates.find((certificate) => certificate.file_media_id === row.latest?.id)?.valid_until ?? "" })
              : ""}
          </p>}
          <div className="mt-2">
            {row.uploadable
              ? <L1DocUpload checklistKey={row.key} hasFile={Boolean(row.latest)} copy={copy.l1Upload} />
              : <FilePicker compact disabled accept=".pdf,image/jpeg,image/png,image/webp"
                title={!row.latest ? copy.upload.noFile
                  : l1Approved ? copy.upload.pickerDone : l1Submitted ? copy.upload.pickerWaiting : copy.upload.pickerLocked}
                hint={!row.latest
                  ? (l1Approved ? copy.upload.hintApprovedLocked : copy.upload.hintNeedConfirm)
                  : l1Approved ? copy.upload.hintDone
                    : l1Submitted ? copy.upload.hintReopens
                      : copy.upload.hintNeedConfirm} />}
          </div>
        </section>)}

        {/* Khu vực tải: chứng nhận chất lượng. */}
        <section id="chung-nhan" aria-labelledby="certs-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 id="certs-title" className="text-[14px] font-bold text-ink-900">{copy.certs.title}</h2>
            <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-700">{certificates.length}</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            {copy.certs.sub}
          </p>

          {legacyCertFiles.length > 0 && <div className="mt-2 rounded-xl border border-ink-200 bg-ink-50/70 px-3 py-2">
            <p className="text-[11px] font-bold text-ink-700">{copy.certs.legacyTitle}</p>
            <ul className="mt-1 space-y-0.5">
              {legacyCertFiles.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-600">
                <FileText className="size-3 shrink-0" aria-hidden="true" />
                <a href={`/api/media/file/${file.storage_path}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {file.caption || copy.upload.captionFallback}
                </a>
                {uploadedOn(file.created_at, intl) && <span className="text-ink-500">{fill(copy.upload.uploadedAt, { date: uploadedOn(file.created_at, intl) })}</span>}
              </li>)}
            </ul>
            <p className="mt-1 text-[10.5px] leading-4 text-ink-500">{copy.certs.legacyNote}</p>
          </div>}

          <SupplierCertificateUpload certificates={certificates
            .filter((c) => !c.superseded_by_certificate_id)
            .map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))}
            trading={trading} copy={copy.certUpload} />
        </section>

      </div>

      {/* Cột phải: nhà cung cấp nhận được gì và giấy nào đã duyệt. */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <VerificationBenefits items={copy.benefits.items} title={copy.benefits.title} />

        {/* Chứng nhận đã duyệt theo loại: chỉ loại có giấy mới hiện, màu xanh, có dấu xác nhận. */}
        <section aria-labelledby="approved-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="approved-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                {copy.approved.title}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{approvedCerts.length}</span>
              </h2>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">{copy.approved.sub}</p>
            </div>
          </div>

          {approvedByKey.length > 0
            ? <ul className="mt-3 space-y-2">
              {approvedByKey.map((row) => <li key={row.key} className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-ink-900">{row.label}</p>
                    <ul className="mt-1 space-y-0.5">
                      {row.certificates.map((certificate) => {
                        const original = certificates.find((item) => item.id === certificate.id);
                        const left = daysUntilExpiry(certificate.validUntil);
                        const scheme = certificateSchemeLabel(certificate.scheme, locale);
                        const note = original ? supplierCertificateNote(original, undefined, locale) : "";
                        return <li key={certificate.id} className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-600">
                          <span className="font-semibold text-ink-800">{certificate.name}</span>
                          {scheme && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">{scheme}</span>}
                          {certificate.validUntil && <span className={certificate.expired ? "text-amber-800" : ""}>
                            {fill(copy.approved.expiry, { date: certificate.validUntil })}{certificate.expired ? copy.approved.expired : left !== null ? fill(copy.approved.daysLeft, { count: left }) : ""}
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
            : <p className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-5 text-center text-[11.5px] text-ink-500">
              {copy.approved.empty}
            </p>}

          {pendingCerts.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {fill(copy.approved.pending, { count: pendingCerts.length })}
          </p>}

          <p className="mt-3 border-t border-ink-100 pt-2 text-[10.5px] leading-4 text-ink-500">
            {copy.approved.taxNote}
          </p>
        </section>
        <section aria-labelledby="tips-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <h2 id="tips-title" className="text-[12.5px] font-bold text-brand-900">{copy.tips.title}</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-4 text-ink-600">
            {copy.tips.items.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </section>
      </aside>
    </div>
  </>;
}
