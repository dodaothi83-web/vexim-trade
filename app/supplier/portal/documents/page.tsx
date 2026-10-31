import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, FileCheck2, FileText } from "lucide-react";

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
import { certificateSchemeLabel, isCertificateChipScheme } from "@/lib/certificate-scheme";
import { supplierCertificateNote } from "@/lib/certificate-supplier-copy";
import { t } from "@/lib/public/i18n";
import { migrationHint } from "@/lib/db/migration-hints";
import { L1DocUpload } from "../l1-doc-upload";
import { SupplierCertificateUpload } from "../certificate-upload";
import { LevelTabs } from "../verification/level-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác thực doanh nghiệp & chứng nhận", robots: { index: false, follow: false } };

/**
 * Bước 1 của quy trình xác minh: giấy tờ doanh nghiệp và chứng nhận ngành hàng.
 *
 * Trang tập trung vào tiến độ, tệp cần bổ sung và chứng nhận đã nộp. Bước này không có
 * nút nộp: nhân viên mở đợt kiểm và đối chiếu thủ công.
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
    className="group/thumb relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-50 shadow-sm transition hover:border-brand-300 hover:shadow">
    {isImage(file.mime)
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={`/api/media/file/${file.thumb_path || file.storage_path}`} alt={file.caption || label}
        className="h-full w-full object-cover transition group-hover/thumb:scale-105" />
      : <span className="flex h-full flex-col items-center justify-center gap-1 text-ink-500">
        <FileText className="size-5" aria-hidden="true" />
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
  const [media, certificates, supplierMedia] = await Promise.all([
    optional("giấy tờ của đợt kiểm", [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => review ? store.listMedia("verification", review.id) : Promise.resolve([])),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("tệp chứng nhận", [] as Awaited<ReturnType<typeof store.listMedia>>,
      () => store.listMedia("supplier", supplier.id)),
  ]);

  const mine = media.filter((m) => m.created_by === user.id && m.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(m.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));

  /* Mỗi mục giấy tờ doanh nghiệp là một thẻ: ảnh thu nhỏ, trạng thái và ô tải riêng.
   * Chứng nhận chất lượng không còn ô riêng ở đây — chúng đi qua kho chứng nhận bên dưới,
   * nên một tệp chỉ có một đường vào và một bản ghi duy nhất. */
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
   * Tệp chứng nhận đã tải theo luồng cũ (chọn ô HACCP/chứng chỉ sản phẩm) nhưng chưa có
   * bản ghi chứng nhận: vẫn cho xem lại và mời tải lại ở khối Chứng nhận, để không mất tệp
   * mà cũng không hiện trùng với danh sách chứng nhận.
   */
  const certificateMediaIds = new Set(certificates.map((certificate) => certificate.file_media_id).filter((id): id is string => Boolean(id)));
  /* Tệp cũ đã được thay bằng một bản ghi chứng nhận cùng loại giấy thì ẩn dòng nhắc tải lại:
   * giữ lại chỉ khiến nhà cung cấp tưởng còn thiếu giấy. Tệp vẫn nằm trong kho. */
  const legacyCertFiles = visibleLegacyCertificateFiles(
    mine.filter((m) => (QUALITY_CERTIFICATE_DOC_KEYS as readonly string[]).includes(m.checklist_key ?? "") && !certificateMediaIds.has(m.id))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    certificates.filter((certificate) => certificate.review_status !== "rejected").map((certificate) => certificate.name),
  );
  const uploadedDocs = docRows.filter((row) => row.files.length > 0);
  const missingDocs = docRows.filter((row) => row.files.length === 0);
  const docProgress = Math.round((uploadedDocs.length / docRows.length) * 100);

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
  // Phạm vi + tên danh mục: cho nhà cung cấp biết giấy đang áp cho danh mục nào.
  const [certificateScopes, allCategoriesForScope] = await Promise.all([
    typeof store.listCertificateScopes === "function" && certificates.length > 0
      ? store.listCertificateScopes(certificates.map((certificate) => certificate.id))
        .catch((error) => { console.error("[supplier-portal] chứng nhận: phạm vi", error); return []; })
      : Promise.resolve([]),
    store.listCategories({ publishedOnly: false }).catch(() => []),
  ]);
  const scopeLabelFor = (scope: { category_id: string | null; product_id: string | null }) => {
    if (scope.category_id) {
      const found = allCategoriesForScope.find((item) => item.id === scope.category_id);
      return found ? (t(found.name_i18n) || found.slug) : "một danh mục";
    }
    return "một sản phẩm";
  };
  // Bảng giấy tờ L1 tính từ giấy đã duyệt: nhà cung cấp không tự chọn ngăn.
  const derivedL1Rows = deriveL1Rows(certificates);
  const liveCerts = certificates.filter((c) => Boolean(c.review_status === "approved" && c.publicly_visible && !c.staff_hidden &&
    (c.holder_match === "owner" || c.holder_match === "partner") && (daysUntilExpiry(c.valid_until) ?? -1) >= 0));
  const certificateFiles = certificates.map((certificate) => ({
    certificate,
    file: supplierMedia.find((mediaFile) => mediaFile.id === certificate.file_media_id) ?? null,
  })).filter((entry): entry is { certificate: typeof certificates[number]; file: MediaAsset } => Boolean(entry.file))
    .sort((a, b) => (a.file.created_at ?? "").localeCompare(b.file.created_at ?? ""));

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · Bước 1" title="Xác thực doanh nghiệp & chứng nhận"
      sub={"Giấy chứng nhận đăng ký kinh doanh do nhân viên đối chiếu. "
        + "Chứng nhận chất lượng đối chiếu xong mới hiện cho người mua."}
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Tổng quan
      </Link>} />

    <LevelTabs current={1} partner={supplier.supplier_type === "trading"} />



    {degraded.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu giấy tờ chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    {/* Dải tổng quan: trạng thái đợt kiểm + tiến độ giấy tờ, cùng nhịp với L2/L3. */}
    <section aria-label="Tổng quan xác thực doanh nghiệp" className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-brand-50 via-white to-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-brand-700 uppercase">Hồ sơ · Bước 1/3</p>
              <h2 className="mt-0.5 text-[17px] leading-tight font-black tracking-tight text-ink-900">Xác thực doanh nghiệp</h2>
              <div className="mt-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>{l1Status}</span>
              </div>
            </div>
          </div>
          <div className="w-full shrink-0 sm:w-60">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-ink-600">Giấy tờ đã có tệp</span>
              <span className="text-[13px] font-black tabular-nums text-ink-900">{uploadedDocs.length}/{docRows.length}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={docProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ giấy tờ xác thực">
              <div className={`h-full rounded-full transition-all ${docProgress === 100 ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${docProgress}%` }} />
            </div>
            <p className={`mt-1.5 text-[11px] font-semibold ${l1Approved ? "text-emerald-800" : l1Returned ? "text-rose-700" : "text-amber-800"}`}>{progressNote}</p>
          </div>
        </div>
      </div>

      {l1Approved && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[12px] leading-5 text-emerald-900 sm:px-5">
        <CheckCircle2 className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
        Giấy tờ đã được đối chiếu xong. Bạn vẫn tải thêm hoặc gia hạn chứng nhận ở bên dưới bất cứ lúc nào.
      </p>}
      {l1Returned && <p className="whitespace-pre-wrap border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[12px] leading-5 text-rose-900 sm:px-5">
        <strong>Lý do cần bổ sung:</strong> {review?.return_reason || "Xem từng mục bên dưới và tải lại bản đúng."}
      </p>}
      {l1Submitted && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[12px] leading-5 text-amber-900 sm:px-5">
        <Clock className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
        Hồ sơ đang chờ đối chiếu thủ công, bằng chứng tạm khóa. Tải lên không tự cấp huy hiệu; kết quả do người có quyền duyệt phê.
      </p>}
    </section>

    <div className="mt-4 max-w-5xl space-y-4">
      <div className="min-w-0 space-y-4">

        {/* Lưới thẻ giấy tờ: ảnh thu nhỏ + trạng thái + ô tải riêng, cùng nhịp với bộ ảnh L2. */}
        <section aria-labelledby="docs-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="docs-title" className="text-[15px] font-bold text-ink-900">Xác thực doanh nghiệp</h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
                {"Chỉ cần Giấy chứng nhận đăng ký kinh doanh; đợt đã duyệt vẫn nhận bản bổ sung khi mục còn trống. "
                  + "Chứng nhận chất lượng tải một lần ở khối Chứng nhận bên dưới, không phải tải lại ở đây."}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${missingDocs.length && !l1Approved ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
              {l1Approved ? (missingDocs.length ? "Đã duyệt · chưa có tệp" : "Đã đối chiếu") : missingDocs.length ? "Chưa có tệp" : "Đã có tệp"}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {docRows.map((row) => {
              const latest = row.latest;
              return <article key={row.key} className="rounded-xl border border-ink-200 bg-white p-3 shadow-sm transition hover:border-brand-200 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-[13px] leading-4 font-bold text-ink-900">{row.label}</h4>
                    <p className="mt-0.5 text-[10.5px] leading-4 text-ink-500">
                      {latest ? `${latest.caption || "Tệp đã tải"}${uploadedOn(latest.created_at) ? ` · tải ${uploadedOn(latest.created_at)}` : ""}` : "PDF hoặc ảnh, tối đa 15 MB"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${latest ? "bg-emerald-50 text-emerald-800" : row.core ? "bg-amber-50 text-amber-900" : "bg-ink-100 text-ink-600"}`}>
                    {latest ? "Đã có" : row.core ? "Giấy chính" : "Tùy chọn"}
                  </span>
                </div>
                {row.files.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={`Tệp đã tải: ${row.label}`}>
                  {row.files.map((file) => <EvidenceThumbnail key={file.id} file={file} label={row.label} />)}
                </div>}
                {row.files.length > 1 && <p className="mt-1 text-[10px] text-ink-500">{row.files.length} tệp · sắp xếp theo thời gian tải</p>}
                {latest && certificateMediaIds.has(latest.id) && <p className="mt-1 text-[10px] leading-4 text-teal-800">
                  Đã vào kho chứng nhận{certificates.find((certificate) => certificate.file_media_id === latest.id)?.valid_until
                    ? ` · hạn ${certificates.find((certificate) => certificate.file_media_id === latest.id)?.valid_until}`
                    : ""}
                </p>}
                <div className="mt-2">
                  {row.uploadable
                    ? <L1DocUpload checklistKey={row.key} hasFile={Boolean(latest)} />
                    : <FilePicker compact disabled accept=".pdf,image/jpeg,image/png,image/webp"
                      title={!latest ? "Chưa có tệp"
                        : l1Approved ? "Đã đối chiếu xong" : l1Submitted ? "Đang chờ nhân viên đối chiếu" : "Chưa mở được ô tải"}
                      hint={!latest
                        ? (l1Approved ? "Đợt đã duyệt nên ô tải tạm khoá." : "Cần nhân viên xác nhận tài khoản trước khi tải.")
                        : l1Approved ? "Đã đối chiếu xong. Tải chứng nhận mới ở khối bên dưới nếu cần."
                          : l1Submitted ? "Ô tải mở lại khi hồ sơ được yêu cầu bổ sung."
                            : "Cần nhân viên xác nhận tài khoản trước khi tải giấy tờ."} />}
                </div>
              </article>;
            })}
          </div>
        </section>

        {/* Chứng nhận ngành hàng: nhân viên đối chiếu đơn vị đứng tên và ngày hết hạn trước khi công khai. */}
        <section id="chung-nhan" style={{ scrollMarginTop: "5rem" }} aria-labelledby="certs-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="certs-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                Chứng nhận trên hồ sơ
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{certificates.length}</span>
              </h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
                Chỉ tải chứng nhận chất lượng ở đây; Giấy chứng nhận đăng ký kinh doanh tải ở khối Xác thực doanh nghiệp phía trên. Hệ thống nhắc hạn trước 60 / 30 / 7 / 1 ngày.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-bold text-ink-700">{liveCerts.length} đang hiển thị</span>
          </div>

          {certificateFiles.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto rounded-xl border border-ink-100 bg-ink-50/60 p-2" aria-label="Ảnh và tệp chứng nhận đã tải, theo thứ tự thời gian">
            {certificateFiles.map(({ certificate, file }) => <EvidenceThumbnail key={certificate.id} file={file} label={certificate.name} />)}
          </div>}

          {certificates.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {certificates.map((c) => {
              const left = daysUntilExpiry(c.valid_until);
              return <article key={c.id} className="flex flex-col gap-1.5 rounded-xl border border-ink-200 bg-white p-3 shadow-sm">
                <h4 className="min-w-0 text-[13px] leading-4 font-bold text-ink-900">
                  {c.name}{c.number ? <span className="font-semibold text-ink-500"> · #{c.number}</span> : null}
                </h4>
                <p className="text-[10.5px] leading-4 text-ink-600">
                  {c.holder_match === "owner" ? `Chính chủ${c.holder_name ? ` (${c.holder_name})` : ""}`
                    : c.holder_match === "partner" ? `Đơn vị đối tác: ${c.holder_name || "-"}`
                      : "Chưa rõ đơn vị đứng tên"}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-[10.5px] leading-4 text-ink-600">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.certificate_scheme ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>
                    {certificateSchemeLabel(c.certificate_scheme ?? null, "vi") ?? "Chờ phân loại"}
                  </span>
                  {certificateScopes.filter((scope) => scope.certificate_id === c.id).map((scope) => (
                    <span key={scope.id} className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                      {scopeLabelFor(scope)}
                    </span>
                  ))}
                  {c.supersedes_certificate_id && <span className="text-ink-500">Bản gia hạn</span>}
                </p>
                <span className={`self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ${left === null ? "bg-ink-100 text-ink-700" : left < 0 ? "bg-rose-100 text-rose-800" : left <= 60 ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>
                  {c.valid_until ? `Hết hạn ${c.valid_until}${left !== null ? ` · còn ${left} ngày` : ""}` : "Chưa ghi ngày hết hạn"}
                </span>
                <p className="text-[10.5px] leading-4 text-ink-600">{supplierCertificateNote(c)}</p>
              </article>;
            })}
          </div> : <p className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-6 text-center text-[11.5px] text-ink-500">
            Chưa có chứng nhận nào trên hồ sơ. Tải PDF hoặc ảnh bên dưới để bắt đầu.
          </p>}

          {legacyCertFiles.length > 0 && <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50/70 px-3 py-2">
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
            <p className="mt-1 text-[10.5px] leading-4 text-ink-500">
              Các tệp này chưa thành bản ghi chứng nhận nên chưa có hạn nhắc hay badge.
              Tải lại ở ô bên dưới để giấy vào kho chứng nhận và được tính hạn.
            </p>
          </div>}

          <SupplierCertificateUpload certificates={certificates
            .filter((c) => !c.superseded_by_certificate_id)
            .map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))}
            blockedReason={certificateUploadBlockedReason} />
        </section>

        {/* Bảng giấy tờ L1 suy ra từ giấy đã duyệt — không phải ô nhà cung cấp tự chọn. */}
        <section aria-labelledby="l1-table-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 id="l1-table-title" className="text-[15px] font-bold text-ink-900">Giấy tờ xác thực tính từ giấy đã duyệt</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
            {"Chứng nhận tải ở ô phía trên được phân loại và tự vào đúng mục dưới đây, "
              + "không cần chọn mục khi tải. Giấy chứng nhận đăng ký kinh doanh tải trong thẻ phía trên."}
          </p>
          <table className="mt-3 w-full text-left text-[11.5px]">
            <thead>
              <tr className="text-[10.5px] tracking-wide text-ink-500 uppercase">
                <th scope="col" className="pb-1.5 font-bold">Mục xác thực</th>
                <th scope="col" className="pb-1.5 font-bold">Giấy đã duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {L1_DOC_ITEMS.filter((item) => [...COMPANY_DOCUMENT_KEYS, ...QUALITY_CERTIFICATE_DOC_KEYS].includes(item.key as never)).map((item) => {
                const row = derivedL1Rows.find((entry) => entry.key === item.key);
                return <tr key={item.key}>
                  <th scope="row" className="py-1.5 pr-3 align-top font-semibold text-ink-800">{item.label}</th>
                  <td className="py-1.5 align-top text-ink-600">
                    {row && row.certificates.length > 0
                      ? row.certificates.map((certificate) => (
                        <span key={certificate.id} className="mr-2 inline-flex flex-wrap items-center gap-1">
                          {certificate.name}
                          {certificate.scheme && <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                            {certificateSchemeLabel(certificate.scheme, "vi")}
                          </span>}
                          {certificate.validUntil && <span className="text-ink-500">
                            hạn {certificate.validUntil}{certificate.expired ? " · đã hết hạn" : ""}
                          </span>}
                          {certificate.scheme && !isCertificateChipScheme(certificate.scheme) && <span className="text-ink-500">
                            không lên bộ lọc người mua
                          </span>}
                        </span>
                      ))
                      : mine.some((file) => file.checklist_key === item.key)
                        ? <span className="text-ink-400">Đã có tệp tải lên, chưa có chứng nhận được duyệt cho mục này.</span>
                        : <span className="text-ink-400">Chưa có giấy nào được duyệt cho mục này.</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10.5px] leading-4 text-ink-500">
            Mã số thuế và số tài khoản ngân hàng khai trong Hồ sơ doanh nghiệp, không phải chứng nhận nên không có trong bảng này.
          </p>
        </section>
      </div>


    </div>
  </>;
}
