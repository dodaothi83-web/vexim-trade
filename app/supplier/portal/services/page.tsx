import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SUPPLIER_SERVICE_KEYS, type SupplierServiceKeyValue } from "@/lib/supplier-services";
import type { SupplierServiceRequest } from "@/lib/types";
import { ServiceCards } from "./service-cards";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.services.metaTitle, robots: { index: false, follow: false } };
}

const STATUS_CLASS: Record<SupplierServiceRequest["status"], string> = {
  submitted: "bg-sky-50 text-sky-800",
  in_consultation: "bg-amber-50 text-amber-800",
  quoted: "bg-emerald-50 text-emerald-800",
  closed: "bg-ink-100 text-ink-600",
};

/**
 * "Dịch vụ Vexim": nhà cung cấp gửi yêu cầu tư vấn và theo dõi trạng thái ngay trong cổng,
 * giống mục dịch vụ của các sàn thương mại điện tử. Chỉ là yêu cầu tư vấn, không có giá.
 */
export default async function SupplierServicesPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { store, supplier, user } = access;
  const { m, intl } = await getPortalMessages();
  const copy = m.services;

  let requests: SupplierServiceRequest[] = [];
  try {
    requests = await store.listSupplierServiceRequests({ supplierId: supplier.id, limit: 50 });
  } catch (error) {
    // Bảng chưa tạo (chưa chạy migration): vẫn hiện thẻ dịch vụ, danh sách để trống.
    console.error("[supplier-services] list failed", error);
  }
  const ownRequests = requests.filter((request) => request.supplier_id === supplier.id);
  const openKeys = [...new Set(ownRequests.filter((r) => r.status !== "closed").map((r) => r.service_key))] as SupplierServiceKeyValue[];
  const date = (value: string) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
    <ServiceCards services={SUPPLIER_SERVICE_KEYS} openKeys={openKeys} email={user.email} copy={copy} />

    <section aria-labelledby="my-service-requests" className="mt-8 rounded-xl border border-ink-200 bg-white shadow-sm">
      <h2 id="my-service-requests" className="border-b border-ink-100 px-5 py-4 text-[15px] font-bold text-ink-900 sm:px-6">{copy.mine.title}</h2>
      {ownRequests.length === 0 ? (
        <p className="px-5 py-6 text-sm leading-6 text-ink-600 sm:px-6">{copy.mine.empty}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {ownRequests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{copy.services[request.service_key]?.title ?? request.service_key}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {copy.mine.reference} <span className="font-mono">{request.reference}</span>
                  {" · "}{fill(copy.mine.sentOn, { date: date(request.created_at) })}
                  {request.updated_at !== request.created_at && <>{" · "}{fill(copy.mine.updatedOn, { date: date(request.updated_at) })}</>}
                </p>
                {request.note && <p className="mt-1.5 line-clamp-2 break-words text-xs leading-5 text-ink-600">{request.note}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[request.status]}`}>{copy.status[request.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  </>;
}
