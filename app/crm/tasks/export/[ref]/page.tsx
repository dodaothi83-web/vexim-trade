import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheckBig, ExternalLink, FileText, RotateCcw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePagePermission } from "@/lib/auth/session";
import { exportPublicSummary } from "@/lib/crm/export-review";
import { getStore } from "@/lib/db";
import { loadStaffSubmission } from "@/lib/supplier-portal/submission-access";
import { submissionFileHref } from "@/lib/supplier-portal/submission-view";
import { L3_EXPORT_ITEMS } from "@/lib/types";
import { auditHref } from "@/lib/verification";
import { canSelfApproveVerification } from "@/lib/verification-policy";
import { DecisionPanel } from "./decision-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xét chứng từ xuất khẩu" };

interface FileRow { id: string; label: string; href: string; image: boolean }

const docLabel = (key: string | null | undefined) => L3_EXPORT_ITEMS.find((item) => item.key === key)?.label ?? "Chứng từ";

/**
 * Xét nhanh chứng từ xuất khẩu (L2): bên trái là tệp, bên phải ba câu Có/Không và hai nút.
 * `ref` = "s-<id>" cho hồ sơ tự gửi còn chờ, "v-<id>" cho đợt kiểm đã nhận nhưng chưa quyết định.
 */
export default async function ExportReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const session = await requirePagePermission("verifications.view", "/crm/dashboard");
  if (!hasPermission(session.role, "media.internal")) notFound();
  const { ref } = await params;
  const kind = ref.startsWith("s-") ? "submission" : ref.startsWith("v-") ? "verification" : null;
  const id = ref.slice(2);
  if (!kind || !id) notFound();
  const store = getStore();

  let supplierId: string; let supplierName: string; let files: FileRow[]; let links: string[] = [];
  let shipment: { ref: string | null; date: string | null; destination: string | null };
  let note: string | null = null;
  let detailHref: string;
  if (kind === "submission") {
    const loaded = await loadStaffSubmission(id);
    if (!loaded || loaded.submission.target_level !== 3) notFound();
    const s = loaded.submission;
    supplierId = s.supplier_id; supplierName = loaded.supplier.name;
    files = loaded.items.filter((item) => item.storage_path).map((item) => ({
      id: item.id, label: docLabel(item.checklist_key), href: submissionFileHref(item.storage_path!), image: (item.mime ?? "").startsWith("image/"),
    }));
    links = loaded.links.map((link) => link.url);
    shipment = { ref: s.shipment_ref, date: s.shipped_on, destination: s.shipment_destination };
    note = s.supplier_note;
    detailHref = `/crm/verifications/submissions/${s.id}`;
    if (s.status !== "pending_review") {
      const linked = s.verification_id ? await store.getVerification(s.verification_id) : null;
      return <Done supplierName={supplierName} outcome={s.status === "returned" ? { returned: s.review_note } : linked?.status === "approved" ? "approved" : "other"} />;
    }
  } else {
    const v = await store.getVerification(id);
    if (!v || v.target_level !== 3) notFound();
    const supplier = await store.getSupplier(v.supplier_id);
    supplierId = v.supplier_id; supplierName = supplier?.name ?? "Nhà cung cấp";
    files = (await store.listMedia("verification", v.id)).filter((m) => m.storage_path && ["image", "document", "certificate"].includes(m.kind)).map((m) => ({
      id: m.id, label: m.caption || docLabel(m.checklist_key), href: `/api/media/file/${m.storage_path}`, image: m.kind === "image",
    }));
    shipment = { ref: v.shipment_ref, date: v.shipped_on, destination: v.shipment_destination };
    detailHref = auditHref(v.supplier_id, 3, v.id);
    if (!["in_progress", "scheduled", "submitted"].includes(v.status)) {
      return <Done supplierName={supplierName} outcome={v.status === "approved" ? "approved" : v.status === "returned" ? { returned: v.return_reason } : "other"} />;
    }
  }

  const canDecide = canSelfApproveVerification(session.role);
  const summary = exportPublicSummary({ destination: shipment.destination, shippedOn: shipment.date });

  return <>
    <PageHeader eyebrow="Chứng từ xuất khẩu · L2" title={supplierName} sub="Mở từng tệp để xem, trả lời ba câu hỏi, rồi bấm Duyệt hoặc Trả lại."
      actions={<Link href="/crm/tasks" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Việc cần làm</Link>} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-[15px] font-bold text-ink-900">Lô hàng nhà cung cấp khai</h2>
          <dl className="mt-2 grid gap-2 text-[14px] sm:grid-cols-3">
            <Info label="Mã lô / đơn" value={shipment.ref} />
            <Info label="Ngày xuất" value={shipment.date ? new Date(`${shipment.date}T00:00:00`).toLocaleDateString("vi-VN") : null} />
            <Info label="Nước nhận hàng" value={shipment.destination} />
          </dl>
          {note && <p className="mt-3 rounded-lg bg-ink-50 p-3 text-[13px] text-ink-700"><strong>Nhà cung cấp ghi chú:</strong> {note}</p>}
        </Card>
        <Card className="p-4">
          <h2 className="text-[15px] font-bold text-ink-900">Tệp chứng từ · {files.length}</h2>
          {!files.length && <p className="mt-2 text-[14px] text-ink-600">Nhà cung cấp chưa tải tệp nào. Bấm Trả lại để yêu cầu bổ sung.</p>}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {files.map((file) => <li key={file.id}>
              <a href={file.href} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40">
                {file.image
                  // Ảnh nội bộ mở qua route có kiểm tra quyền, không dùng next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={file.href} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-ink-200 object-cover" />
                  : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500"><FileText className="h-6 w-6" aria-hidden="true" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink-900">{file.label}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700">Bấm để mở<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></span>
                </span>
              </a>
            </li>)}
          </ul>
          {links.length > 0 && <div className="mt-3">
            <p className="text-[13px] font-semibold text-ink-700">Đường dẫn nhà cung cấp gửi</p>
            <ul className="mt-1 space-y-1 text-[13px]">{links.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline">{url}</a></li>)}</ul>
          </div>}
        </Card>
        <p className="text-xs text-ink-500">Cần xem chi tiết hơn? <Link href={detailHref} className="font-semibold text-brand-700 underline">Mở trang đầy đủ</Link></p>
      </div>
      <DecisionPanel kind={kind} id={id} canDecide={canDecide} summary={summary} supplierHref={`/crm/suppliers/${supplierId}`} />
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-ink-900">{value || "Không ghi"}</dd></div>;
}

/** Sau khi bấm Duyệt/Trả lại, trang tự làm mới về đây: nói rõ kết quả và dẫn sang việc tiếp theo. */
function Done({ supplierName, outcome }: { supplierName: string; outcome: "approved" | "other" | { returned: string | null } }) {
  const returned = typeof outcome === "object";
  return <>
    <PageHeader eyebrow="Chứng từ xuất khẩu · L2" title={supplierName} />
    <Card className="max-w-2xl space-y-4 p-6">
      <p role="status" className={"flex items-start gap-2 rounded-lg p-3 text-[15px] font-semibold " + (returned ? "bg-warning-surface text-warning" : "bg-success-surface text-success")}>
        {returned ? <RotateCcw className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
        {outcome === "approved" ? "Đã duyệt. Nhà cung cấp được báo qua email và người mua thấy kết quả trên hồ sơ."
          : returned ? "Đã trả lại. Nhà cung cấp sẽ sửa trong cổng rồi gửi lại." : "Hồ sơ này đã được xử lý."}
      </p>
      {returned && outcome.returned && <p className="text-[14px] text-ink-700"><strong>Lý do đã gửi:</strong> {outcome.returned}</p>}
      <Link href="/crm/tasks" className="btn btn-primary w-full justify-center py-3 text-[15px] sm:w-auto">Làm việc tiếp theo</Link>
    </Card>
  </>;
}
