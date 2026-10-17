"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Supplier } from "@/lib/types";
import { SUPPLIER_TYPES } from "@/lib/supplier";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";

const FILE_LABELS: Record<typeof INITIAL_DOCUMENT_KEYS[number], string> = {
  business_license: "Đăng ký doanh nghiệp", food_safety: "Giấy ATTP (nếu có)",
  haccp_or_brc: "HACCP/BRC/ISO (nếu có)", product_certs: "Chứng chỉ sản phẩm (nếu có)",
  export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
};

export function SupplierProfileForm({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; notification?: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/supplier-portal/profile", { method: "POST", body: new FormData(event.currentTarget) });
      const data = await response.json() as { ok: boolean; message: string; notification?: string };
      setResult(data);
      if (data.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-7 rounded-xl border border-ink-200 bg-white p-5 sm:p-7">
    <section><h2 className="text-xl font-black text-ink-900">1. Thông tin nhà cung cấp</h2>
      <p className="mt-1 text-sm text-ink-600">Email đăng nhập: {supplier.email}. Chọn loại hình để Vexim hiểu đúng doanh nghiệp của bạn; đây không phải quyền truy cập CRM.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên pháp lý doanh nghiệp *" name="name" required maxLength={180} defaultValue={supplier.onboarding_status === "changes_requested" ? supplier.name : ""} />
        <Field label="Tên thương mại (nếu có)" name="trade_name" maxLength={180} defaultValue={supplier.trade_name ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Loại hình nhà cung cấp *</span>
          <select name="supplier_type" className="input" required defaultValue={supplier.supplier_type ?? ""}>
            <option value="" disabled>Chọn nhà máy / thương nhân / hợp tác xã</option>
            {SUPPLIER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} defaultValue={supplier.products ?? ""} />
        <Field label="Tỉnh / thành" name="province" maxLength={100} defaultValue={supplier.province ?? ""} />
        <Field label="Địa chỉ" name="address" maxLength={250} defaultValue={supplier.address ?? ""} />
        <Field label="Người liên hệ *" name="contact_name" required maxLength={120} defaultValue={supplier.contact_name ?? ""} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} defaultValue={supplier.phone ?? ""} />
        <Field label="Mã số thuế (chỉ nhập số) *" name="tax_number" required maxLength={32} inputMode="numeric" pattern="[0-9]+" defaultValue={supplier.tax_id ?? ""} />
        <Field label="Số tài khoản ngân hàng (chỉ nhập số) *" name="bank_account_number" required maxLength={34} inputMode="numeric" pattern="[0-9]+" />
      </div>
      <p className="mt-2 text-xs text-ink-500">Mã số thuế và số tài khoản do bạn tự khai; Vexim sẽ kiểm tra, không tự đánh dấu giấy tờ “Đạt”.</p>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">2. Giấy tờ bước đầu · Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Ảnh/PDF tối đa 15 MB/tệp, tổng tối đa 5 tệp. ATTP, HACCP không bắt buộc với thương nhân. Tải lên không tự duyệt.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{INITIAL_DOCUMENT_KEYS.map((key) =>
        <label key={key} className="block text-sm"><span className="mb-1 block font-semibold">{FILE_LABELS[key]}</span>
          <input type="file" name={`doc:${key}`} accept=".pdf,image/jpeg,image/png,image/webp" className="input" /></label>)}</div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">3. Muốn Vexim xác minh thêm?</h2>
      <p className="mt-1 text-sm text-ink-600">Chọn yêu cầu chỉ để Vexim liên hệ. Mỗi đánh giá được duyệt riêng; không bắt buộc thăm nhà máy đối với thương nhân.</p>
      <div className="mt-4 space-y-3">{([2, 3] as const).map((level) =>
        <label key={level} className="flex gap-3 rounded-xl border border-ink-200 p-4"><input type="checkbox" name={`request:${level}`} value="yes" className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">{level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng"}</strong><small className="text-ink-600">Vexim sẽ liên hệ để kiểm tra và tải bằng chứng theo đúng đợt, không tự duyệt.</small></span></label>)}</div>
    </section>
    <label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 accent-brand-700" /><span>Tôi đồng ý gửi thông tin và tài liệu cho Vexim kiểm tra nội bộ; tài khoản chưa hoạt động cho đến khi Vexim xác nhận.</span></label>
    <button type="submit" disabled={busy || result?.ok} className="btn btn-primary w-full justify-center">{busy ? "Đang nộp hồ sơ..." : "Gửi hồ sơ cho Vexim xác nhận"}</button>
    {result && <div role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.message}{result.ok && result.notification !== "sent" && <p className="mt-1">Email nội bộ có thể chưa gửi; hồ sơ vẫn ở hàng chờ Vexim.</p>}
    </div>}
  </form>;
}

function Field({ label, name, required, maxLength, inputMode, pattern, defaultValue }: {
  label: string; name: string; required?: boolean; maxLength: number; inputMode?: "numeric"; pattern?: string; defaultValue?: string;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input name={name} className="input" required={required} maxLength={maxLength} inputMode={inputMode} pattern={pattern} defaultValue={defaultValue} />
  </label>;
}
