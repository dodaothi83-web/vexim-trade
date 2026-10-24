import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileCheck2, FileText, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { L1_DOC_ITEMS } from "@/lib/types";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { migrationHint } from "@/lib/db/migration-hints";
import { SupplierPortalUpload } from "../supplier-portal-upload";
import { SupplierCertificateUpload } from "../certificate-upload";
import { LevelTabs } from "../verification/level-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giấy tờ & chứng nhận L1", robots: { index: false, follow: false } };

/**
 * Bước 1 của quy trình xác minh: giấy tờ doanh nghiệp và chứng nhận ngành hàng.
 *
 * Bố cục dùng đúng nhịp của hai trang tự gửi L2/L3 (`verification/level-page.tsx`):
 * dải tab ba bước, dải tổng quan (trạng thái + tiến độ), cột trái là danh sách giấy tờ
 * dạng thẻ, cột phải dính là tóm tắt và mẹo. Khác L2/L3 ở chỗ bước này KHÔNG có nút
 * nộp: nhân viên mở đợt kiểm và đối chiếu thủ công, nên chỉ có tải tệp lên mà thôi.
 */
export default async function SupplierDocumentsPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, review, user, store } = access;

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
  const allowedDocUpload = !!review && (review.status === "in_progress" || review.status === "returned");

  /* Mỗi mục giấy tờ là một thẻ: nhãn, trạng thái và tệp mới nhất của mục đó. */
  const docRows = INITIAL_DOCUMENT_KEYS.map((key) => {
    const files = mine.filter((m) => m.checklist_key === key)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return { key, label: L1_DOC_ITEMS.find((item) => item.key === key)?.label ?? key, files, latest: files[0] ?? null };
  });
  const uploadedDocs = docRows.filter((row) => row.files.length > 0);
  const missingDocs = docRows.filter((row) => row.files.length === 0);
  const docProgress = Math.round((uploadedDocs.length / docRows.length) * 100);

  const l1Approved = review?.status === "approved";
  const l1Returned = review?.status === "returned";
  const l1Submitted = review?.status === "submitted";
  const l1Status = l1Approved ? "Đã duyệt" : l1Returned ? "Cần bổ sung" : l1Submitted ? "Chờ duyệt" : "Đang rà soát";
  const statusTone = l1Approved ? "bg-emerald-100 text-emerald-900"
    : l1Returned ? "bg-rose-100 text-rose-900"
      : l1Submitted ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700";
  const progressNote = l1Approved ? "Không cần làm gì thêm ở bước này."
    : l1Returned ? "Hồ sơ cần bổ sung trước khi đối chiếu lại."
      : l1Submitted ? "Hồ sơ đang chờ đối chiếu thủ công."
        : missingDocs.length ? `Còn ${missingDocs.length} mục chưa có tệp.` : "Đã có tệp cho mọi mục.";
  const liveCerts = certificates.filter((c) => Boolean(c.review_status === "approved" && c.publicly_visible && !c.staff_hidden &&
    (c.holder_match === "owner" || c.holder_match === "partner") && (daysUntilExpiry(c.valid_until) ?? -1) >= 0));

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · Xác minh L1" title="Giấy tờ doanh nghiệp"
      sub="Đăng ký doanh nghiệp và giấy an toàn thực phẩm được đối chiếu thủ công. Chứng nhận được AI đọc đơn vị đứng tên và ngày hết hạn."
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Tổng quan
      </Link>} />

    <LevelTabs current={1} />

    <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label="Ba bước thực hiện">
      {[
        { title: "Chuẩn bị giấy tờ", body: "Bản chụp hoặc PDF còn hiệu lực. Tên trên giấy phải khớp tên doanh nghiệp đã khai." },
        { title: "Tải từng mục", body: "Chọn đúng mục rồi tải tệp, tối đa 15 MB mỗi tệp. Tải lại bất cứ lúc nào, kể cả khi đợt kiểm đã khóa." },
        { title: "Đối chiếu thủ công", body: "AI chỉ đọc đơn vị đứng tên và ngày hết hạn. Kết quả L1 do người có quyền duyệt quyết định." },
      ].map((step, index) => <li key={step.title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-200">{index + 1}</span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-ink-900">{step.title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{step.body}</span>
        </span>
      </li>)}
    </ol>

    {degraded.length > 0 && <div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu giấy tờ chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    {/* Dải tổng quan: trạng thái đợt kiểm + tiến độ giấy tờ, đọc được trong một lần nhìn. */}
    <section aria-label="Tổng quan hồ sơ L1" className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-brand-50 via-white to-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-brand-700 uppercase">Hồ sơ · Bước 1/3</p>
              <h2 className="mt-0.5 text-[17px] leading-tight font-black tracking-tight text-ink-900">Giấy tờ doanh nghiệp</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>{l1Status}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
                  {uploadedDocs.length}/{docRows.length} giấy tờ đã tải
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
                  {certificates.length} chứng nhận
                </span>
              </div>
            </div>
          </div>
          <div className="w-full shrink-0 sm:w-60">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-ink-600">Giấy tờ đã có tệp</span>
              <span className="text-[13px] font-black tabular-nums text-ink-900">{uploadedDocs.length}/{docRows.length}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={docProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ giấy tờ L1">
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
        Hồ sơ đang chờ đối chiếu thủ công. Tải lên không tự cấp huy hiệu; kết quả do người có quyền duyệt phê.
      </p>}
    </section>

    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">

        {/* Danh sách giấy tờ dạng thẻ, cùng nhịp với lưới ảnh bằng chứng của L2. */}
        <section aria-labelledby="docs-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="docs-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                Giấy tờ doanh nghiệp
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{uploadedDocs.length}/{docRows.length}</span>
              </h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
                Chạm vào từng mục để tải bản chụp hoặc PDF. Mỗi mục chỉ cần một tệp rõ ràng; tải lại sẽ thay bản cũ của chính bạn.
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${missingDocs.length && !l1Approved ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
              {l1Approved ? "Đã đối chiếu" : missingDocs.length ? `Còn ${missingDocs.length} mục` : "Đủ mục"}
            </span>
          </div>

          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {docRows.map((row) => <li key={row.key} className={`flex flex-col rounded-xl border p-3 ${row.files.length ? "border-ink-200 bg-white" : "border-dashed border-ink-300 bg-ink-50/50"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12.5px] leading-4 font-bold text-ink-900">{row.label}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${row.files.length ? "bg-emerald-100 text-emerald-800" : "bg-ink-200 text-ink-700"}`}>
                  {row.files.length ? (row.files.length > 1 ? `${row.files.length} tệp` : "Đã tải") : "Chưa tải"}
                </span>
              </div>
              <p className="mt-1 min-w-0 flex-1 text-[10.5px] leading-4 text-ink-500">
                {row.latest ? (row.latest.caption || "Tệp đã tải") : "PDF hoặc ảnh, tối đa 15 MB."}
              </p>
              {row.latest && <a href={`/api/media/file/${row.latest.storage_path}`} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-brand-800 underline">
                <FileText className="size-3" aria-hidden="true" /> Xem tệp
              </a>}
            </li>)}
          </ul>

          {allowedDocUpload
            ? <SupplierPortalUpload />
            : <p className="mt-4 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-[11.5px] leading-5 text-ink-600">
              Đợt kiểm giấy tờ cơ bản đang khóa thêm tệp. Bạn vẫn tải mới hoặc gia hạn chứng nhận ở khung bên dưới bất kỳ lúc nào.
            </p>}
        </section>

        {/* Chứng nhận ngành hàng: AI đọc đơn vị đứng tên và ngày hết hạn, người duyệt vẫn là người quyết định. */}
        <section aria-labelledby="certs-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="certs-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                Chứng nhận trên hồ sơ
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{certificates.length}</span>
              </h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
                AI đọc đơn vị đứng tên (chính chủ hay đối tác) và ngày hết hạn; hệ thống nhắc trước 60 / 30 / 7 / 1 ngày.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[10.5px] font-bold text-ink-700">{liveCerts.length} đang hiển thị</span>
          </div>

          {certificates.length ? <ul className="mt-3 space-y-2">
            {certificates.map((c) => {
              const left = daysUntilExpiry(c.valid_until);
              const live = Boolean(c.review_status === "approved" && c.publicly_visible && !c.staff_hidden && left !== null && left >= 0 && (c.holder_match === "owner" || c.holder_match === "partner"));
              return <li key={c.id} className="rounded-xl border border-ink-200 bg-ink-50/60 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] font-bold text-ink-900">{c.name}{c.number ? ` · #${c.number}` : ""}</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${c.holder_match === "owner" ? "bg-emerald-100 text-emerald-800" : c.holder_match === "partner" ? "bg-amber-100 text-amber-900" : "bg-ink-200 text-ink-700"}`}>
                      {c.holder_match === "owner" ? `Chính chủ${c.holder_name ? ` (${c.holder_name})` : ""}` : c.holder_match === "partner" ? `Đối tác: ${c.holder_name || "-"}` : "Chưa rõ đơn vị đứng tên"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${left === null ? "bg-ink-200 text-ink-700" : left < 0 ? "bg-rose-100 text-rose-800" : left <= 60 ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>
                      {c.valid_until ? `Hết hạn ${c.valid_until}${left !== null ? ` · còn ${left} ngày` : ""}` : "Chưa đọc được ngày hết hạn"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${c.staff_hidden ? "bg-rose-100 text-rose-800" : live ? "bg-emerald-100 text-emerald-800" : "bg-ink-200 text-ink-700"}`}>
                      {c.staff_hidden ? "Đang tạm ẩn" : live ? "Đang hiển thị công khai" : "Chưa hiển thị công khai"}
                    </span>
                  </div>
                </div>
                {(c.review_note || c.ai_summary) && <p className="mt-1 text-[10.5px] leading-4 text-ink-600">{c.review_note || c.ai_summary}</p>}
              </li>;
            })}
          </ul> : <p className="mt-3 rounded-lg border border-dashed border-ink-300 bg-ink-50/50 px-3 py-6 text-center text-[11.5px] text-ink-500">
            Chưa có chứng nhận nào trên hồ sơ. Tải PDF hoặc ảnh bên dưới để AI tự quét.
          </p>}

          <SupplierCertificateUpload certificates={certificates.map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))} />
        </section>
      </div>

      {/* Cột tóm tắt dính: giữ tiến độ và việc còn thiếu trong tầm mắt khi lướt danh sách. */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <section aria-labelledby="summary-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <h3 id="summary-title" className="text-[14px] font-bold text-ink-900">Tóm tắt bước 1</h3>
          <p className="mt-1 text-[11.5px] leading-5 text-ink-600">{l1Approved
            ? "Đã đối chiếu xong. Chứng nhận hết hạn sẽ tự rơi khỏi trang buyer cho tới khi bạn tải bản mới."
            : "Đợt kiểm giấy tờ do nhân viên mở và đối chiếu; tải lên không tự cấp huy hiệu L1."}</p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-ink-50 px-2 py-2">
              <dt className="text-[10px] font-semibold text-ink-500">Giấy tờ đã có</dt>
              <dd className="text-[15px] font-black tabular-nums text-ink-900">{uploadedDocs.length}/{docRows.length}</dd>
            </div>
            <div className="rounded-lg bg-ink-50 px-2 py-2">
              <dt className="text-[10px] font-semibold text-ink-500">Chứng nhận</dt>
              <dd className="text-[15px] font-black tabular-nums text-ink-900">{certificates.length}</dd>
            </div>
          </dl>

          {missingDocs.length > 0 && <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2">
            <p className="text-[11px] font-bold text-ink-700">Mục còn trống</p>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-ink-600">
              {missingDocs.map((row) => <li key={row.key} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" aria-hidden="true" />{row.label}
              </li>)}
            </ul>
          </div>}

          <p className="mt-3 text-[10px] leading-4 text-ink-500">Không bắt buộc đủ cả năm mục ngay từ đầu: một giấy phép kinh doanh rõ ràng đã đủ để bắt đầu đối chiếu.</p>
        </section>

        <section aria-labelledby="tips-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <h3 id="tips-title" className="flex items-center gap-1.5 text-[12.5px] font-bold text-brand-900">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mẹo giấy tờ
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-4 text-ink-600">
            <li>Tên trên giấy phải khớp tên doanh nghiệp đã khai ở Hồ sơ doanh nghiệp.</li>
            <li>Ảnh chụp hoặc PDF đều nhận; không cần bản gốc, nhưng phải đọc được số và ngày cấp.</li>
            <li>Che số tài khoản ngân hàng và thông tin không liên quan trước khi tải.</li>
          </ul>
          <p className="mt-2 flex items-start gap-1 text-[10px] leading-4 text-brand-900"><ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> Hồ sơ được đối chiếu thủ công; người có quyền duyệt khác người kiểm mới phê kết quả.</p>
        </section>
      </aside>
    </div>
  </>;
}
