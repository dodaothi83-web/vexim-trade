import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { migrationHint } from "@/lib/db/migration-hints";
import { Info, Panel, VerifyRow } from "../portal-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

/** Thông tin doanh nghiệp đã khai và tình trạng ba cấp xác minh, tách khỏi tổng quan. */
export default async function SupplierProfilePage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, review, reviews, store } = access;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] chưa đọc được ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [requestRows, submissionRows] = await Promise.all([
    optional("yêu cầu kiểm định", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("hồ sơ tự gửi", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
  ]);

  const l1Approved = reviews.some((v) => v.target_level === 1 && v.status === "approved");
  const l2Approved = reviews.some((v) => v.target_level === 2 && v.status === "approved");
  const l3Approved = reviews.some((v) => v.target_level === 3 && v.status === "approved");
  const l1Status = l1Approved ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung"
    : review?.status === "submitted" ? "Chờ duyệt" : "Đang rà soát";
  const nextGoal = l1Approved ? "L2 · Nhà máy" : "L1 · Giấy tờ";

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Hồ sơ doanh nghiệp"
      sub="Thông tin bạn đã khai và tình trạng từng cấp xác minh. Mỗi cấp là một kết luận riêng của Vexim."
      actions={<span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">Bước tiếp theo: {nextGoal}</span>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu hồ sơ chưa tải được</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Panel icon={<FileText className="h-4 w-4 text-brand-700" />} title="Thông tin đã khai"
        sub="Cần sửa thông tin hoặc số tài khoản đã khai, liên hệ nhân viên Vexim.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Tên doanh nghiệp" value={supplier.name} />
          <Info label="Tên hiển thị" value={supplier.display_name || supplier.trade_name} />
          <Info label="Mã số thuế (tự khai)" value={review?.tax_number} />
          <Info label="Người liên hệ" value={supplier.contact_name} />
          <Info label="Điện thoại" value={supplier.phone} />
          <Info label="Địa chỉ" value={supplier.address} />
          <Info label="Mặt hàng chính" value={supplier.products} />
          <Info label="Trạng thái hồ sơ" value={supplier.status === "published" ? "Đang công khai" : "Chưa công khai"} />
        </dl>
        <p className="mt-4 text-[11px] leading-4 text-ink-500">Tên hiển thị, giới thiệu và thông tin thương mại là nội dung đề xuất để Vexim biên tập, chưa tự động công khai.</p>
      </Panel>

      <Panel icon={<BadgeCheck className="h-4 w-4 text-brand-700" />} title="Tình trạng xác minh"
        sub="Ba đánh giá độc lập. Chỉ nhân viên Vexim có quyền xác nhận kết quả.">
        <div className="space-y-2">
          <VerifyRow level="L1" title="Kiểm tra giấy tờ" status={l1Status} on={l1Approved} />
          {([2, 3] as const).map((step) => {
            const approved = step === 2 ? l2Approved : l3Approved;
            const own = submissionRows.find((s) => s.target_level === step);
            const contact = requestRows.find((r) => r.target_level === step);
            const status = approved ? "Đã duyệt" : own?.status === "pending_review" ? "Hồ sơ tự gửi đang chờ xét" : own?.status === "returned" ? "Cần bổ sung bằng chứng"
              : own?.status === "accepted" ? "Vexim đã nhận vào đợt kiểm" : contact?.status === "contacted" ? "Vexim đã ghi nhận liên hệ" : "Chưa có bằng chứng";
            return <VerifyRow key={step} level={`L${step}`} title={step === 2 ? "Xác thực nhà máy" : "Lịch sử xuất khẩu"} status={status} on={approved} />;
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/supplier/portal/documents" className="btn btn-ghost btn-sm">Giấy tờ L1</Link>
          <Link href="/supplier/portal/verification" className="btn btn-soft btn-sm">Cổng tự xác thực L2 · L3</Link>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-ink-500">Tải bằng chứng không tự cấp huy hiệu. Nhãn buyer chỉ xuất hiện cho từng đánh giá được nhân viên Vexim kiểm và người có quyền duyệt phê.</p>
      </Panel>
    </div>
  </>;
}
