import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, CheckCircle2, Clock, FileCheck2, FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { FilePicker } from "@/components/file-picker";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { approvedL2Scope } from "@/lib/verification-status";
import { visibleLegacyCertificateFiles } from "@/lib/supplier-portal/legacy-certificate-files";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { canUploadOwnDocument, COMPANY_DOCUMENT_KEYS, INITIAL_DOCUMENT_KEYS, QUALITY_CERTIFICATE_DOC_KEYS } from "@/lib/supplier-portal/policy";
import { L1_DOC_ITEMS, type MediaAsset } from "@/lib/types";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { deriveL1Rows } from "@/lib/certificate-l1";
import { certificateSchemeLabel } from "@/lib/certificate-scheme";
import { supplierCertificateNote } from "@/lib/certificate-supplier-copy";
import { migrationHint } from "@/lib/db/migration-hints";
import { L1DocUpload } from "../l1-doc-upload";
import { SupplierCertificateUpload } from "../certificate-upload";
import { LevelTabs } from "../verification/level-tabs";
import { VerificationBenefits } from "../verification/benefits";

/** Năm giá trị bước 1 đem lại, viết cho nhà cung cấp đọc nhanh. */
const L1_BENEFITS = [
  "Huy hiệu đã kiểm giấy tờ hiện trên hồ sơ và thẻ sản phẩm.",
  "Người mua đọc được đúng mức đã kiểm, không phải một nhãn chung.",
  "Đứng trên nhà cung cấp chưa xác thực khi người mua duyệt danh mục.",
  "Chứng nhận chất lượng được tính vào điểm tin cậy của hồ sơ.",
  "Người mua lọc riêng được nhóm đã kiểm giấy tờ.",
] as const;

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác thực doanh nghiệp & chứng nhận", robots: { index: false, follow: false } };

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
function uploadedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const isImage = (mime: string | null) => Boolean(mime?.startsWith("image/"));

function EvidenceThumbnail({ file, label }: { file: MediaAsset; label: string }) {
  if (!file.storage_path) return null;
  const href = `/api/media/file/${file.storage_path}`;
  return <a href={href} target="_blank" rel="noreferrer" title={file.caption || label}
    aria-label={`Mở tệp ${file.caption || label}`}
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

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] chưa đọc được ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [media, certificates] = await Promise.all([
    optional("giấy tờ của đợt kiểm", [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
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
    return { key, label: item?.label ?? key, core: Boolean(item?.core), files, latest: files.at(-1) ?? null, uploadable };
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

  /* Đơn vị thương mại chưa có L2 nhà máy đối tác thì chưa có căn cứ đối chiếu giấy, nên ô
   * tải chứng nhận đóng sẵn kèm lý do — không để nhà cung cấp chọn tệp rồi mới nhận lỗi. */
  const l2Scope = approvedL2Scope(reviews);
  const partnerContractApproved = l2Scope === "partner_contract" || l2Scope === "both";
  const certificateUploadBlockedReason = supplier.supplier_type === "trading" && !partnerContractApproved
    ? "Xác thực hợp đồng nhà máy đối tác ở bước 2 trước khi tải chứng nhận. Sản phẩm vẫn đăng bán bình thường."
    : null;

  const l1Approved = review?.status === "approved";
  const l1Returned = review?.status === "returned";
  const l1Submitted = review?.status === "submitted";
  const l1Status = l1Approved ? "Đã duyệt" : l1Returned ? "Cần bổ sung" : l1Submitted ? "Chờ duyệt" : "Đang rà soát";
  const statusTone = l1Approved ? "bg-emerald-100 text-emerald-900"
    : l1Returned ? "bg-rose-100 text-rose-900"
      : l1Submitted ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700";
  const progressNote = l1Approved
    ? (missingDocs.length ? `Đã đối chiếu xong. Còn ${missingDocs.length} mục chưa có tệp.` : "Không cần làm gì thêm ở bước này.")
    : l1Returned ? "Hồ sơ cần bổ sung trước khi đối chiếu lại."
      : l1Submitted ? "Hồ sơ đang chờ đối chiếu thủ công."
        : missingDocs.length ? `Còn ${missingDocs.length} mục chưa có tệp.` : "Đã có tệp cho mọi mục.";

  /* Chỉ giấy đã duyệt mới vào danh sách "đã duyệt theo loại". Mục không có giấy thì
   * không hiện, để nhà cung cấp nhìn thấy đúng thứ mình đang có. */
  const approvedCerts = certificates.filter((certificate) => certificate.review_status === "approved" && !certificate.staff_hidden);
  const pendingCerts = certificates.filter((certificate) => certificate.review_status !== "approved" && certificate.review_status !== "rejected" && !certificate.superseded_by_certificate_id);
  const approvedByKey = deriveL1Rows(certificates).map((row) => {
    const item = L1_DOC_ITEMS.find((entry) => entry.key === row.key);
    return { key: row.key, label: item?.label ?? row.key, certificates: row.certificates };
  });

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · Bước 1/3" title="Xác thực doanh nghiệp & chứng nhận"
      sub="Tải giấy đăng ký kinh doanh và chứng nhận chất lượng. Nhân viên đối chiếu thủ công từng tệp."
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Tổng quan
      </Link>} />

    <LevelTabs current={1} partner={supplier.supplier_type === "trading"} />

    {degraded.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu giấy tờ chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label="Ba bước thực hiện">
      {[
        { title: "Tải giấy đăng ký kinh doanh", body: "Một tệp PDF hoặc ảnh, thấy rõ tên doanh nghiệp và mã số thuế." },
        { title: "Thêm chứng nhận chất lượng", body: "ISO 22000, HACCP, BRC, Halal và các chứng chỉ sản phẩm đang có." },
        { title: "Nhân viên đối chiếu", body: "Không có bước nộp. Nhân viên kiểm tra từng tệp rồi cập nhật kết quả." },
      ].map((step, index) => <li key={step.title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
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
                <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">Hồ sơ · Bước 1/3</p>
                <h2 id="status-title" className="mt-0.5 text-[15px] leading-tight font-black tracking-tight text-ink-900">Tình trạng hồ sơ</h2>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${statusTone}`}>{l1Status}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink-600">Giấy tờ đã có tệp</span>
                <span className="text-[12.5px] font-black tabular-nums text-ink-900">{uploadedDocs.length}/{docRows.length}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={docProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ giấy tờ xác thực">
                <div className={`h-full rounded-full transition-all ${docProgress === 100 ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${docProgress}%` }} />
              </div>
              <p className={`mt-1.5 text-[11px] font-semibold ${l1Approved ? "text-emerald-800" : l1Returned ? "text-rose-700" : "text-amber-800"}`}>{progressNote}</p>
            </div>
          </div>
          {l1Approved && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[11.5px] leading-5 text-emerald-900">
            <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            Giấy tờ đã được đối chiếu. Vẫn tải thêm hoặc gia hạn chứng nhận bất cứ lúc nào.
          </p>}
          {l1Returned && <p className="whitespace-pre-wrap border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[11.5px] leading-5 text-rose-900">
            <strong>Lý do cần bổ sung:</strong> {review?.return_reason || "Xem từng mục bên trên và tải lại bản đúng."}
          </p>}
          {l1Submitted && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[11.5px] leading-5 text-amber-900">
            <Clock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            Hồ sơ đang chờ đối chiếu thủ công. Tải lên không tự cấp huy hiệu.
          </p>}
        </section>

        {/* Khu vực tải: GCN đăng ký kinh doanh. */}
        {docRows.map((row) => <section key={row.key} id="xac-thuc-doanh-nghiep" aria-labelledby="dkkd-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 id="dkkd-title" className="min-w-0 text-[14px] font-bold text-ink-900">{row.label}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${row.latest ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {row.latest ? "Đã có tệp" : "Chưa có tệp"}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            {row.latest
              ? `${row.latest.caption || "Tệp đã tải"}${uploadedOn(row.latest.created_at) ? ` · tải ${uploadedOn(row.latest.created_at)}` : ""}`
              : "PDF hoặc ảnh, tối đa 15 MB."}
          </p>
          {row.files.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`Tệp đã tải: ${row.label}`}>
            {row.files.map((file) => <EvidenceThumbnail key={file.id} file={file} label={row.label} />)}
          </div>}
          {row.latest && certificateMediaIds.has(row.latest.id) && <p className="mt-1 text-[10px] leading-4 text-teal-800">
            Đã vào kho chứng nhận{certificates.find((certificate) => certificate.file_media_id === row.latest?.id)?.valid_until
              ? ` · hạn ${certificates.find((certificate) => certificate.file_media_id === row.latest?.id)?.valid_until}`
              : ""}
          </p>}
          <div className="mt-2">
            {row.uploadable
              ? <L1DocUpload checklistKey={row.key} hasFile={Boolean(row.latest)} />
              : <FilePicker compact disabled accept=".pdf,image/jpeg,image/png,image/webp"
                title={!row.latest ? "Chưa có tệp"
                  : l1Approved ? "Đã đối chiếu xong" : l1Submitted ? "Đang chờ nhân viên đối chiếu" : "Chưa mở được ô tải"}
                hint={!row.latest
                  ? (l1Approved ? "Đợt đã duyệt nên ô tải tạm khoá." : "Cần nhân viên xác nhận tài khoản trước khi tải.")
                  : l1Approved ? "Đã đối chiếu xong."
                    : l1Submitted ? "Ô tải mở lại khi hồ sơ được yêu cầu bổ sung."
                      : "Cần nhân viên xác nhận tài khoản trước khi tải giấy tờ."} />}
          </div>
        </section>)}

        {/* Khu vực tải: chứng nhận chất lượng. */}
        <section id="chung-nhan" aria-labelledby="certs-title" className="scroll-mt-24 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 id="certs-title" className="text-[14px] font-bold text-ink-900">Chứng nhận chất lượng</h2>
            <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-700">{certificates.length}</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            Nhân viên phân loại và chọn danh mục áp dụng trước khi hiện cho người mua.
          </p>

          {legacyCertFiles.length > 0 && <div className="mt-2 rounded-xl border border-ink-200 bg-ink-50/70 px-3 py-2">
            <p className="text-[11px] font-bold text-ink-700">Tệp chứng nhận đã tải trước đây</p>
            <ul className="mt-1 space-y-0.5">
              {legacyCertFiles.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-600">
                <FileText className="size-3 shrink-0" aria-hidden="true" />
                <a href={`/api/media/file/${file.storage_path}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {file.caption || "Tệp đã tải"}
                </a>
                {uploadedOn(file.created_at) && <span className="text-ink-500">· tải {uploadedOn(file.created_at)}</span>}
              </li>)}
            </ul>
            <p className="mt-1 text-[10.5px] leading-4 text-ink-500">Tải lại ở ô bên dưới để giấy vào kho chứng nhận và được tính hạn.</p>
          </div>}

          <SupplierCertificateUpload certificates={certificates
            .filter((c) => !c.superseded_by_certificate_id)
            .map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))}
            blockedReason={certificateUploadBlockedReason} />
        </section>

      </div>

      {/* Cột phải: nhà cung cấp nhận được gì và giấy nào đã duyệt. */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <VerificationBenefits items={L1_BENEFITS} />

        {/* Chứng nhận đã duyệt theo loại: chỉ loại có giấy mới hiện, màu xanh, có dấu xác nhận. */}
        <section aria-labelledby="approved-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="approved-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                Chứng nhận đã duyệt theo loại
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{approvedCerts.length}</span>
              </h2>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">Chỉ hiện loại giấy đã được nhân viên đối chiếu.</p>
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
                        const scheme = certificateSchemeLabel(certificate.scheme, "vi");
                        const note = original ? supplierCertificateNote(original) : "";
                        return <li key={certificate.id} className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-600">
                          <span className="font-semibold text-ink-800">{certificate.name}</span>
                          {scheme && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">{scheme}</span>}
                          {certificate.validUntil && <span className={certificate.expired ? "text-amber-800" : ""}>
                            hạn {certificate.validUntil}{certificate.expired ? " · đã hết hạn" : left !== null ? ` · còn ${left} ngày` : ""}
                          </span>}
                          {note && note !== "Đã duyệt và đang hiện với người mua." && <span className="text-ink-500">{note}</span>}
                        </li>;
                      })}
                    </ul>
                  </div>
                  <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                </div>
              </li>)}
            </ul>
            : <p className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-5 text-center text-[11.5px] text-ink-500">
              Chưa có loại giấy nào được duyệt. Tải giấy ở cột bên trái để bắt đầu.
            </p>}

          {pendingCerts.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {pendingCerts.length} chứng nhận đang chờ nhân viên đối chiếu.
          </p>}

          <p className="mt-3 border-t border-ink-100 pt-2 text-[10.5px] leading-4 text-ink-500">
            Mã số thuế và số tài khoản ngân hàng khai trong Hồ sơ doanh nghiệp, không phải chứng nhận nên không có trong danh sách này.
          </p>
        </section>
        <section aria-labelledby="tips-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <h2 id="tips-title" className="text-[12.5px] font-bold text-brand-900">Mẹo chuẩn bị tệp</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-4 text-ink-600">
            <li>Ảnh chụp hoặc PDF đều nhận, tối đa 15 MB mỗi tệp.</li>
            <li>Có thể che số tài khoản và thông tin nhạy cảm, miễn đọc được tên doanh nghiệp.</li>
            <li>Tải lên không tự cấp huy hiệu; kết quả do nhân viên quyết định.</li>
          </ul>
        </section>
      </aside>
    </div>
  </>;
}
