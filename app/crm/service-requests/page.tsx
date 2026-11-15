import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import {
  isSupplierServiceStatus,
  SUPPLIER_SERVICE_LABELS_VI,
  SUPPLIER_SERVICE_STATUS_LABELS_VI,
  SUPPLIER_SERVICE_STATUSES,
} from "@/lib/supplier-services";
import type { SupplierServiceRequest } from "@/lib/types";
import { updateServiceRequestStatusAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yêu cầu dịch vụ", robots: { index: false, follow: false } };

const STATUS_CLASS: Record<SupplierServiceRequest["status"], string> = {
  submitted: "bg-sky-50 text-sky-800",
  in_consultation: "bg-amber-50 text-amber-800",
  quoted: "bg-emerald-50 text-emerald-800",
  closed: "bg-ink-100 text-ink-600",
};

/** Yêu cầu tư vấn dịch vụ Vexim mà nhà cung cấp gửi từ cổng ("Dịch vụ Vexim"). */
export default async function ServiceRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requirePagePermission("suppliers.view", "/crm");
  const canManage = hasPermission(session.role, "suppliers.manage");
  const raw = (await searchParams).status;
  const status = isSupplierServiceStatus(raw) ? raw : undefined;
  const store = getStore();

  let requests: SupplierServiceRequest[] = [];
  let unavailable = false;
  try {
    requests = await store.listSupplierServiceRequests({ status, limit: 300 });
  } catch (error) {
    console.error("[crm service-requests] list failed", error);
    unavailable = true;
  }
  const suppliers = requests.length ? await store.listSuppliers().catch(() => []) : [];
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const date = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

  return <>
    <PageHeader title="Yêu cầu dịch vụ" sub="Nhà cung cấp gửi yêu cầu tư vấn từ mục Dịch vụ Vexim trong cổng. Đổi trạng thái để họ theo dõi." />
    <nav aria-label="Lọc theo trạng thái" className="mb-4 flex flex-wrap gap-1.5">
      {[undefined, ...SUPPLIER_SERVICE_STATUSES].map((value) => (
        <Link key={value ?? "all"} href={value ? `/crm/service-requests?status=${value}` : "/crm/service-requests"}
          aria-current={status === value ? "page" : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === value ? "bg-brand-800 text-white" : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
          {value ? SUPPLIER_SERVICE_STATUS_LABELS_VI[value] : "Tất cả"}
        </Link>
      ))}
    </nav>

    {unavailable ? (
      <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Chưa đọc được bảng yêu cầu dịch vụ. Hãy chạy migration 20261123_supplier_service_requests.sql.
      </p>
    ) : requests.length === 0 ? (
      <p className="rounded-xl border border-ink-200 bg-white p-6 text-sm text-ink-600">Chưa có yêu cầu nào.</p>
    ) : (
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
        {requests.map((request) => {
          const supplier = supplierById.get(request.supplier_id);
          return (
            <li key={request.id} className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-900">{SUPPLIER_SERVICE_LABELS_VI[request.service_key] ?? request.service_key}</p>
                <p className="mt-0.5 text-sm">
                  {supplier ? <Link href={`/crm/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} className="font-semibold text-brand-700 hover:underline">{supplier.name}</Link>
                    : <span className="text-ink-500">Nhà cung cấp không còn</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  <span className="font-mono">{request.reference}</span> · Gửi {date(request.created_at)} · {request.requested_email}
                  {supplier?.phone ? ` · ${supplier.phone}` : ""}
                </p>
                {request.note && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-ink-50 px-3 py-2 text-sm leading-6 text-ink-700">{request.note}</p>}
              </div>
              {canManage ? (
                <form action={updateServiceRequestStatusAction} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="id" value={request.id} />
                  <label className="sr-only" htmlFor={`status-${request.id}`}>Trạng thái</label>
                  <select id={`status-${request.id}`} name="status" defaultValue={request.status} className="input py-1.5 text-sm">
                    {SUPPLIER_SERVICE_STATUSES.map((value) => <option key={value} value={value}>{SUPPLIER_SERVICE_STATUS_LABELS_VI[value]}</option>)}
                  </select>
                  <button type="submit" className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-900">Lưu</button>
                </form>
              ) : (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[request.status]}`}>{SUPPLIER_SERVICE_STATUS_LABELS_VI[request.status]}</span>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </>;
}
