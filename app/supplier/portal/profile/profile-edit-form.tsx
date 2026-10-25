"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import type { Supplier } from "@/lib/types";
import { supplierTypeLabel } from "@/lib/supplier";
import { saveSupplierProfileEditAction } from "./profile-actions";

export function SupplierProfileEditForm({ supplier, email }: { supplier: Supplier; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setResult(null);
    try {
      const response = await saveSupplierProfileEditAction(new FormData(form));
      setResult(response);
      if (response.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-5">
    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">Thông tin được Vexim quản lý</h2>
      <p className="mt-1 text-sm leading-6 text-ink-600">Tên pháp nhân, mã số thuế, địa chỉ đăng ký và kết quả xác minh không thay đổi khi bạn lưu trang này. Liên hệ Vexim nếu cần cập nhật các thông tin đó.</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Readonly label="Tên pháp nhân" value={supplier.name} />
        <Readonly label="Mã số thuế" value={supplier.tax_id} />
        <Readonly label="Loại hình" value={supplier.supplier_type ? supplierTypeLabel(supplier.supplier_type) : "Chưa khai"} />
        <Readonly label="Email đăng nhập" value={email} />
        <div className="sm:col-span-2"><Readonly label="Địa chỉ đăng ký" value={supplier.address} /></div>
      </dl>
    </section>

    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">Thông tin liên hệ và hiển thị</h2>
      <p className="mt-1 text-sm leading-6 text-ink-600">Cập nhật thông tin liên hệ, giới thiệu và nội dung thương mại của doanh nghiệp. AI sẽ hỗ trợ dịch nội dung hiển thị cho buyer sang tiếng Anh sau khi bạn lưu.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Tên thương mại" name="trade_name" maxLength={180} defaultValue={supplier.trade_name ?? ""} />
        <Field label="Tên hiển thị trên trang" name="display_name" maxLength={180} defaultValue={supplier.display_name ?? ""} />
        <Field label="Liên hệ *" name="contact_name" required maxLength={120} defaultValue={supplier.contact_name ?? ""} />
        <Field label="Chức vụ" name="contact_title" maxLength={100} defaultValue={supplier.contact_title ?? ""} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} defaultValue={supplier.phone ?? ""} />
        <Field label="Zalo" name="zalo" maxLength={40} defaultValue={supplier.zalo ?? ""} />
        <Field label="Website (https://...)" name="website" maxLength={250} defaultValue={supplier.website ?? ""} />
        <Field label="Tỉnh / thành" name="province" maxLength={100} defaultValue={supplier.province ?? ""} />
        <Field label="Quốc gia" name="country" maxLength={100} defaultValue={supplier.country ?? "Vietnam"} />
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} defaultValue={supplier.products ?? ""} />
      </div>
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">Giới thiệu doanh nghiệp</span>
        <textarea name="intro_source" rows={5} maxLength={1500} className="input resize-y" defaultValue={supplier.intro_source ?? ""} placeholder="Mô tả điểm khác biệt của doanh nghiệp hoặc sản phẩm." />
      </label>
    </section>

    <section className="rounded-xl border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">Thông tin thương mại</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Năm thành lập" name="founded_year" type="number" min={0} max={new Date().getFullYear()} defaultValue={String(supplier.founded_year ?? "")} />
        <Field label="Số nhân viên" name="employees" type="number" min={0} max={1000000} defaultValue={String(supplier.employees ?? "")} />
        <Field label="Công suất mỗi tháng" name="capacity_per_month" maxLength={180} defaultValue={supplier.capacity_per_month ?? ""} />
        <Field label="MOQ" name="moq_text" maxLength={180} defaultValue={supplier.moq_text ?? ""} />
        <Field label="Lead time (ngày)" name="lead_time_days" type="number" min={0} max={3650} defaultValue={String(supplier.lead_time_days ?? "")} />
        <Field label="Thị trường đã phục vụ" name="markets" maxLength={800} defaultValue={supplier.markets ?? ""} />
        <Field label="Thị trường xuất khẩu (ngăn cách bằng dấu phẩy)" name="export_markets" maxLength={800} defaultValue={supplier.export_markets?.join(", ") ?? ""} />
        <Field label="Cảng xuất (ngăn cách bằng dấu phẩy)" name="ports" maxLength={800} defaultValue={supplier.ports?.join(", ") ?? ""} />
        <Field label="Incoterms (ngăn cách bằng dấu phẩy)" name="incoterms" maxLength={800} defaultValue={supplier.incoterms?.join(", ") ?? ""} />
        <Field label="Điều khoản thanh toán" name="payment_terms" maxLength={200} defaultValue={supplier.payment_terms ?? ""} />
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier.private_label ?? false} className="mt-1 h-4 w-4 accent-brand-700" />Nhận làm nhãn riêng / OEM</label>
    </section>

    {result && <p role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{result.message}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/supplier/portal/profile" className="btn btn-ghost"><ArrowLeft className="h-4 w-4" />Quay lại hồ sơ</Link>
      <button type="submit" disabled={busy} className="btn btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? "Đang lưu..." : "Lưu thay đổi"}</button>
    </div>
  </form>;
}

function Readonly({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-1 break-words font-medium text-ink-800">{value || "Chưa có"}</dd></div>;
}

function Field({ label, name, required, maxLength, defaultValue, type = "text", min, max }: {
  label: string; name: string; required?: boolean; maxLength?: number; defaultValue?: string;
  type?: string; min?: number; max?: number;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input name={name} type={type} required={required} maxLength={maxLength} min={min} max={max} defaultValue={defaultValue} className="input" />
  </label>;
}
