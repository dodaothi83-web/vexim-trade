import Link from "next/link";
import { AlertTriangle, Clock3, FileCheck2, HelpCircle, Maximize2 } from "lucide-react";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { Breadcrumbs } from "@/components/ui";
import { certificateSchemeLabel, isUnclassifiedCertificateScheme } from "@/lib/certificate-scheme";
import type { Certificate } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Giấy tờ & chứng nhận", robots: { index: false, follow: false } };

function daysLeft(iso: string | null, today: string): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const diff = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(diff) ? Math.round(diff / 86_400_000) : null;
}

/**
 * Hàng đợi phân loại giấy tờ.
 *
 * Nhà cung cấp chỉ tải giấy lên một kho chung; mọi việc phân loại (loại giấy, phạm vi,
 * công khai) nằm ở phía nhân viên. Trang này gom đúng những việc còn tồn để theo dõi
 * tiến độ, kèm số đếm — không tự chốt loại giấy cho bất kỳ giấy nào.
 */
export default async function CertificateQueuePage() {
  const session = await requirePagePermission("verifications.view", "/crm/certificates");
  const store = getStore();
  const today = new Date().toISOString().slice(0, 10);
  const canInspect = hasPermission(session.role, "verifications.inspect");

  const suppliers = await store.listSuppliers().catch((error) => {
    console.error("[crm] không đọc được nhà cung cấp để gom giấy tờ", error);
    return [];
  });
  const supplierName = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const certificates: Certificate[] = suppliers.length
    ? await store.listCertificatesForSuppliers(suppliers.map((supplier) => supplier.id))
      .catch((error) => {
        console.error("[crm] không đọc được giấy tờ", error);
        return [] as Certificate[];
      })
    : [];

  const unclassified = certificates.filter((certificate) =>
    isUnclassifiedCertificateScheme(certificate.certificate_scheme ?? null) &&
    certificate.review_status !== "rejected");
  const pending = certificates.filter((certificate) => certificate.review_status === "pending");
  const expiring = certificates.filter((certificate) => {
    if (certificate.review_status !== "approved") return false;
    const left = daysLeft(certificate.valid_until, today);
    return left !== null && left >= 0 && left <= 60;
  });
  const scopeRequests = certificates.filter((certificate) => (certificate.requested_product_ids ?? []).length > 0);
  const renewals = certificates.filter((certificate) => Boolean(certificate.supersedes_certificate_id));

  const sections = [
    {
      key: "unclassified",
      title: "Giấy chưa phân loại",
      hint: "Chọn loại giấy để giấy vào đúng đường ra: L1, badge sản phẩm hay đơn hàng.",
      icon: HelpCircle,
      rows: unclassified,
    },
    {
      key: "pending",
      title: "Chờ duyệt",
      hint: "Đã có tệp nhưng chưa duyệt đăng; kiểm đơn vị đứng tên, hạn và phạm vi.",
      icon: Clock3,
      rows: pending,
    },
    {
      key: "expiring",
      title: "Sắp hết hạn (60 ngày)",
      hint: "Nhắc nhà cung cấp tải bản gia hạn; bản cũ vẫn hiệu lực tới khi bản mới được duyệt.",
      icon: AlertTriangle,
      rows: expiring,
    },
    {
      key: "requests",
      title: "Xin mở rộng phạm vi",
      hint: "Nhà cung cấp muốn dùng giấy cho thêm sản phẩm; duyệt ở dòng chứng nhận của họ.",
      icon: Maximize2,
      rows: scopeRequests,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Vận hành sàn", href: "/crm/dashboard" }, { label: "Giấy tờ & chứng nhận" }]} />}
        title="Giấy tờ & chứng nhận"
        sub="Một kho giấy cho mọi hồ sơ. Phân loại quyết định giấy có lên trang người mua hay chỉ dùng cho L1 và đơn hàng."
        actions={<span className="rounded-full bg-ink-100 px-3 py-1 text-[12px] font-semibold text-ink-700">
          {certificates.length} giấy · {renewals.length} bản gia hạn
        </span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <Card key={section.key} className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-ink-500 uppercase">
              <section.icon className="h-3.5 w-3.5" aria-hidden="true" /> {section.title}
            </p>
            <p className="mt-1 text-[22px] font-black tabular-nums text-ink-900">{section.rows.length}</p>
            <p className="mt-1 text-[11.5px] leading-4 text-ink-600">{section.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {sections.filter((section) => section.rows.length > 0).map((section) => (
          <Card key={section.key} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-900">
                <FileCheck2 className="h-4 w-4 text-brand-700" aria-hidden="true" /> {section.title}
              </h2>
              <span className="text-[12px] font-semibold text-ink-600">{section.rows.length} giấy</span>
            </div>
            <ul className="divide-y divide-ink-100">
              {section.rows.slice(0, 40).map((certificate) => {
                const left = daysLeft(certificate.valid_until, today);
                const schemeLabel = certificateSchemeLabel(certificate.certificate_scheme ?? null, "vi");
                return (
                  <li key={certificate.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[12.5px]">
                    <span className="min-w-0 font-semibold text-ink-900">{certificate.name}</span>
                    <span className="text-ink-500">{supplierName.get(certificate.supplier_id) ?? "Không rõ nhà cung cấp"}</span>
                    <Badge className={schemeLabel ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900"}>
                      {schemeLabel ?? "Chưa phân loại"}
                    </Badge>
                    {certificate.valid_until && (
                      <span className="text-ink-600">
                        hạn {certificate.valid_until}{left !== null ? ` · còn ${left} ngày` : ""}
                      </span>
                    )}
                    {certificate.superseded_by_certificate_id && <Badge className="bg-ink-100 text-ink-700">Đã có bản mới</Badge>}
                    <Link
                      href={`/crm/suppliers/${certificate.supplier_id}/audit/documents`}
                      className="ml-auto text-[12px] font-semibold text-brand-700 underline"
                    >
                      {canInspect ? "Phân loại →" : "Xem hồ sơ →"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
        {sections.every((section) => section.rows.length === 0) && (
          <Card className="p-6 text-center">
            <p className="text-sm font-semibold text-ink-900">Không còn giấy nào cần xử lý.</p>
            <p className="mt-1 text-[12.5px] text-ink-600">
              Giấy mới nhà cung cấp tải lên sẽ vào đây để phân loại trước khi lên trang người mua.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
