import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Eye, FileText, Pencil, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierTypeLabel } from "@/lib/supplier";
import { migrationHint } from "@/lib/db/migration-hints";
import { Info, LevelChip, Panel, VerifyRow } from "../portal-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ doanh nghiệp", robots: { index: false, follow: false } };

const join = (value: (string | null | undefined)[] | undefined) => (value ?? []).filter(Boolean).join(" · ");
const vi = (value: Record<string, string> | undefined) => value?.vi || value?.en || "";

/**
 * Hồ sơ doanh nghiệp: dữ liệu nhà cung cấp đã khai, tình trạng từng cấp xác minh và
 * thông tin liên hệ nội bộ (không hiển thị công khai).
 *
 * Phần giao diện buyer nhìn thấy nằm ở trang “Trang của tôi”, dùng chung khung với trang
 * công khai. Ảnh bìa và ảnh đại diện thuộc trang đó, không đặt ở đây.
 */
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
  const [requestRows, submissionRows, certificateRows, productRows] = await Promise.all([
    optional("yêu cầu kiểm định", [] as Awaited<ReturnType<typeof store.listSupplierVerificationRequests>>,
      () => store.listSupplierVerificationRequests(supplier.id)),
    optional("hồ sơ tự gửi", [] as Awaited<ReturnType<typeof store.listSubmissions>>,
      () => store.listSubmissions(supplier.id)),
    optional("chứng nhận", [] as Awaited<ReturnType<typeof store.listCertificates>>,
      () => store.listCertificates(supplier.id)),
    optional("sản phẩm", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
  ]);

  const l1Approved = reviews.some((v) => v.target_level === 1 && v.status === "approved");
  const l2Approved = reviews.some((v) => v.target_level === 2 && v.status === "approved");
  const l3Approved = reviews.some((v) => v.target_level === 3 && v.status === "approved");
  const approvedLevels = [l1Approved, l2Approved, l3Approved].filter(Boolean).length;
  const l1Status = l1Approved ? "Đã duyệt" : review?.status === "returned" ? "Cần bổ sung"
    : review?.status === "submitted" ? "Chờ duyệt" : "Đang rà soát";
  const l2Own = submissionRows.find((s) => s.target_level === 2);
  const l3Own = submissionRows.find((s) => s.target_level === 3);
  const l2Status = l2Approved ? "Đã duyệt" : l2Own?.status === "pending_review" ? "Hồ sơ tự gửi đang chờ xét"
    : l2Own?.status === "returned" ? "Cần bổ sung bằng chứng" : l2Own?.status === "accepted" ? "Đã nhận vào đợt kiểm"
    : requestRows.find((r) => r.target_level === 2)?.status === "contacted" ? "Đã ghi nhận liên hệ" : "Chưa có bằng chứng";
  const l3Status = l3Approved ? "Đã duyệt" : l3Own?.status === "pending_review" ? "Hồ sơ tự gửi đang chờ xét"
    : l3Own?.status === "returned" ? "Cần bổ sung bằng chứng" : l3Own?.status === "accepted" ? "Đã nhận vào đợt kiểm"
    : requestRows.find((r) => r.target_level === 3)?.status === "contacted" ? "Đã ghi nhận liên hệ" : "Chưa có bằng chứng";
  const currentStep = !l1Approved ? 1 : !l2Approved ? 2 : !l3Approved ? 3 : null;
  const nextGoal = currentStep ? `L${currentStep} · ${currentStep === 1 ? "Giấy tờ" : currentStep === 2 ? "Nhà máy" : "Xuất khẩu"}` : "Đã đủ ba cấp";
  const published = supplier.status === "published";
  const about = vi(supplier.summary_i18n) || supplier.intro_source || "";
  const marketText = supplier.export_markets_i18n?.vi?.join(", ") || join(supplier.export_markets) || supplier.markets || "";
  const typeLabel = supplier.supplier_type ? supplierTypeLabel(supplier.supplier_type) : "Chưa khai loại hình";

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Hồ sơ doanh nghiệp"
      sub="Đây là hồ sơ buyer và bộ phận duyệt nhìn thấy, kèm tình trạng từng cấp xác minh. Mỗi cấp là một kết luận riêng."
      actions={<>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800">Bước tiếp theo: {nextGoal}</span>
        <Link href="/supplier/portal/profile/edit" className="btn btn-primary">
          <Pencil className="h-4 w-4" aria-hidden="true" />Chỉnh sửa hồ sơ
        </Link>
        <Link href="/supplier/portal/storefront" className="btn btn-ghost">
          <Eye className="h-4 w-4" aria-hidden="true" />Trang của tôi
        </Link>
      </>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu hồ sơ chưa tải được</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Panel icon={<FileText className="h-4 w-4 text-brand-700" />} title="Thông tin trên hồ sơ"
          sub="Bạn có thể cập nhật thông tin liên hệ, giới thiệu và thương mại. Tên pháp nhân, mã số thuế và kết quả xác minh do Vexim quản lý.">
          <p className="text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">Doanh nghiệp</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Tên pháp nhân" value={supplier.name} />
            <Info label="Tên thương mại" value={supplier.trade_name} />
            <Info label="Tên hiển thị" value={supplier.display_name} />
            <Info label="Loại hình" value={typeLabel} />
            <Info label="Mã số thuế (tự khai)" value={review?.tax_number || supplier.tax_id} />
            <Info label="Năm thành lập" value={supplier.founded_year ? String(supplier.founded_year) : null} />
            <Info label="Số nhân sự" value={typeof supplier.employees === "number" && supplier.employees > 0 ? String(supplier.employees) : null} />
            <Info label="Nhận nhãn riêng" value={supplier.private_label ? "Có" : "Không"} />
            <Info label="Địa chỉ đăng ký" value={supplier.address} />
            <Info label="Tỉnh / thành" value={supplier.province} />
          </dl>

          <p className="mt-5 text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">Thương mại</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Mặt hàng chính" value={supplier.products} />
            <Info label="Vùng nguyên liệu" value={supplier.raw_material_region} />
            <Info label="Xuất xứ nguyên liệu đầu vào" value={supplier.input_material_origin} />
            <Info label="Thị trường" value={marketText} />
            <Info label="Công suất mỗi tháng" value={supplier.capacity_per_month} />
            <Info label="MOQ" value={supplier.moq_text} />
            <Info label="Điều khoản thanh toán" value={supplier.payment_terms} />
            <Info label="Cảng xuất" value={join(supplier.ports)} />
            <Info label="Incoterms" value={join(supplier.incoterms)} />
            <Info label="Thời gian giao" value={supplier.lead_time_days ? `${supplier.lead_time_days} ngày` : null} />
            <Info label="Trạng thái hồ sơ" value={published ? "Đang công khai" : "Chưa công khai"} />
          </dl>

          <p className="mt-5 text-[10.5px] font-bold tracking-[0.14em] text-ink-400 uppercase">Liên hệ (không hiển thị công khai)</p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Người liên hệ" value={[supplier.contact_name, supplier.contact_title].filter(Boolean).join(" · ")} />
            <Info label="Điện thoại" value={supplier.phone} />
            <Info label="Email" value={supplier.email} />
            <Info label="Zalo" value={supplier.zalo} />
            <Info label="Website" value={supplier.website} />
          </dl>
          <p className="mt-4 text-[11px] leading-5 text-ink-500">Tên hiển thị, phần giới thiệu và thông tin thương mại là nội dung do bạn cung cấp. Email, điện thoại và giấy tờ nội bộ không hiển thị cho buyer.</p>
        </Panel>

        <Panel icon={<BadgeCheck className="h-4 w-4 text-brand-700" />} title="Giới thiệu trên trang công khai"
          sub="Phần buyer đọc đầu tiên trên trang công khai.">
          {about
            ? <p className="text-[13px] leading-6 whitespace-pre-line text-ink-700">{about}</p>
            : <p className="text-[13px] leading-6 text-ink-500">Chưa có phần giới thiệu. Gửi nội dung để bổ sung trước khi hồ sơ công khai.</p>}
        </Panel>
      </div>

      <Panel icon={<ShieldCheck className="h-4 w-4 text-brand-700" />} title="Bạn đang ở bước nào"
        sub="Ba đánh giá độc lập. Chỉ bộ phận duyệt có quyền xác nhận kết quả.">
        <ol className="space-y-2">
          {([
            { level: 1, title: "Kiểm tra giấy tờ", status: l1Status, on: l1Approved, href: "/supplier/portal/documents", cta: "Tải giấy tờ L1" },
            { level: 2, title: "Xác thực nhà máy", status: l2Status, on: l2Approved, href: "/supplier/portal/verification/factory", cta: "Nộp bằng chứng L2" },
            { level: 3, title: "Lịch sử xuất khẩu", status: l3Status, on: l3Approved, href: "/supplier/portal/verification/export", cta: "Nộp bằng chứng L3" },
          ] as const).map((step) => <li key={step.level} className="relative">
            <VerifyRow level={`L${step.level}`} title={step.title} status={step.status} on={step.on} />
            {currentStep === step.level && <span className="absolute top-2.5 right-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-300">
              Đang ở đây
            </span>}
            {!step.on && <Link href={step.href} className="mt-1 ml-11 inline-block text-[11.5px] font-semibold text-brand-700 hover:underline">{step.cta}</Link>}
          </li>)}
        </ol>
        <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5 text-[11.5px] leading-5 text-ink-700">
          {currentStep
            ? <>Bước tiếp theo của hồ sơ là <b className="text-ink-900">{nextGoal}</b>. Tải bằng chứng không tự cấp huy hiệu; từng cấp được kiểm và quyết định riêng.</>
            : <>Hồ sơ đã đủ ba cấp xác minh. Kết quả có thể được kiểm lại khi giấy tờ hết hạn hoặc có thay đổi.</>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/supplier/portal/documents" className="btn btn-ghost btn-sm">Giấy tờ L1</Link>
          <Link href="/supplier/portal/verification/factory" className="btn btn-soft btn-sm">Nộp bằng chứng nhà máy</Link>
          <Link href="/supplier/portal/verification/export" className="btn btn-soft btn-sm">Nộp chứng từ xuất khẩu</Link>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-ink-500">Nhãn xác minh trên trang buyer chỉ xuất hiện cho từng đánh giá đã được kiểm và phê duyệt.</p>
      </Panel>
    </div>
  </>;
}
