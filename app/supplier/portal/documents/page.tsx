import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { L1_DOC_ITEMS } from "@/lib/types";
import { daysUntilExpiry } from "@/lib/certificate-service";
import { migrationHint } from "@/lib/db/migration-hints";
import { SupplierPortalUpload } from "../supplier-portal-upload";
import { SupplierCertificateUpload } from "../certificate-upload";
import { EmptyRow, Panel } from "../portal-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giấy tờ & chứng nhận L1 | Vexim Trade", robots: { index: false, follow: false } };

/**
 * Trang riêng cho hồ sơ L1: giấy tờ bước đầu của đợt kiểm và các chứng nhận được AI
 * quét. Trang tổng quan không còn ô tải tệp nào.
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
  const l1Status = review?.status === "approved" ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung"
    : review?.status === "submitted" ? "Chờ duyệt" : "Đang rà soát";

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Giấy tờ & chứng nhận L1"
      sub="Giấy phép kinh doanh do Vexim đối chiếu thủ công. Chứng nhận được AI quét đơn vị đứng tên và ngày hết hạn."
      actions={<span className={`rounded-full px-3 py-1 text-[11px] font-bold ${review?.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{l1Status}</span>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu giấy tờ chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, báo Vexim để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <div className="space-y-5">
      <Panel icon={<FileCheck2 className="h-4 w-4 text-brand-700" />} title="Đợt kiểm giấy tờ L1" count={mine.length}
        sub="Tệp bạn đã tải trong đợt kiểm này. Vexim đối chiếu thủ công; tải lên không tự duyệt.">
        {mine.length > 0 && <ul className="mb-4 space-y-2 text-sm">{mine.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
          <span className="text-ink-800">{L1_DOC_ITEMS.find((i) => i.key === m.checklist_key)?.label ?? "Giấy tờ"}: {m.caption}</span>
          <a href={`/api/media/file/${m.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Xem tệp</a></li>)}</ul>}
        {allowedDocUpload ? <SupplierPortalUpload /> : <p className="text-[13px] text-ink-500">Đợt kiểm giấy tờ cơ bản đang khóa thêm tệp; bạn vẫn có thể tải mới hoặc gia hạn các chứng nhận ở khung bên dưới bất kỳ lúc nào.</p>}
      </Panel>

      <Panel title="Chứng nhận trên hồ sơ" count={certificates.length}
        sub="AI đọc đơn vị đứng tên (chính chủ hay đối tác) và ngày hết hạn; hệ thống nhắc trước 60 / 30 / 7 / 1 ngày.">
        {certificates.length ? <ul className="space-y-2 text-sm">{certificates.map((c) => {
          const left = daysUntilExpiry(c.valid_until);
          const live = Boolean(c.review_status === "approved" && c.publicly_visible && !c.staff_hidden && left !== null && left >= 0 && (c.holder_match === "owner" || c.holder_match === "partner"));
          return <li key={c.id} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink-900">{c.name}{c.number ? ` · #${c.number}` : ""}</span>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${c.holder_match === "owner" ? "bg-emerald-100 text-emerald-800" : c.holder_match === "partner" ? "bg-amber-100 text-amber-900" : "bg-ink-200 text-ink-700"}`}>
                  {c.holder_match === "owner" ? `Chính chủ${c.holder_name ? ` (${c.holder_name})` : ""}` : c.holder_match === "partner" ? `Đối tác: ${c.holder_name || "—"}` : "Chưa rõ đơn vị đứng tên"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${left === null ? "bg-ink-200 text-ink-700" : left < 0 ? "bg-rose-100 text-rose-800" : left <= 60 ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-800"}`}>
                  {c.valid_until ? `Hết hạn ${c.valid_until}${left !== null ? ` · còn ${left} ngày` : ""}` : "Chưa đọc được ngày hết hạn"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 font-bold ${c.staff_hidden ? "bg-rose-100 text-rose-800" : live ? "bg-emerald-100 text-emerald-800" : "bg-ink-200 text-ink-700"}`}>
                  {c.staff_hidden ? "Vexim đang ẩn" : live ? "Đang hiển thị công khai" : "Chưa hiển thị công khai"}
                </span>
              </div>
            </div>
            {(c.review_note || c.ai_summary) && <p className="mt-1 text-[11px] text-ink-600">{c.review_note || c.ai_summary}</p>}
          </li>;
        })}</ul> : <EmptyRow>Chưa có chứng nhận nào trên hồ sơ. Tải PDF hoặc ảnh bên dưới để AI tự quét.</EmptyRow>}
        <div className="mt-4 border-t border-ink-100 pt-4">
          <SupplierCertificateUpload certificates={certificates.map((c) => ({ id: c.id, name: c.name, valid_until: c.valid_until }))} />
        </div>
      </Panel>
    </div>
  </>;
}
