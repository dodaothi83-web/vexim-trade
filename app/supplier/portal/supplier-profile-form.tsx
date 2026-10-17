"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Supplier, SupplierType } from "@/lib/types";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { SUPPLIER_TYPES } from "@/lib/supplier";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";

const FILE_LABELS: Record<typeof INITIAL_DOCUMENT_KEYS[number], string> = {
  business_license: "Đăng ký doanh nghiệp", food_safety: "Giấy ATTP (nếu có)",
  haccp_or_brc: "HACCP/BRC/ISO (nếu có)", product_certs: "Chứng chỉ sản phẩm (nếu có)",
  export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
};

export function SupplierProfileFields({ supplier, email, categories }: { supplier?: Supplier; email: string; categories: CategoryProposalOption[] }) {
  const [supplierType, setSupplierType] = useState<SupplierType | "">(supplier?.supplier_type ?? "");
  const [visitRequested, setVisitRequested] = useState(false);
  const visitLocked = supplierType === "trading";
  return <>
    <section><h2 className="text-xl font-black text-ink-900">1. Thông tin nhà cung cấp</h2>
      <p className="mt-1 text-sm text-ink-600">Email đăng nhập: {email}. Chọn loại hình để Vexim hiểu đúng doanh nghiệp của bạn; đây không phải quyền truy cập CRM.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên pháp lý doanh nghiệp *" name="name" required maxLength={180} defaultValue={supplier?.onboarding_status === "changes_requested" ? supplier?.name : ""} />
        <Field label="Tên thương mại (nếu có)" name="trade_name" maxLength={180} defaultValue={supplier?.trade_name ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Loại hình nhà cung cấp *</span>
          <select name="supplier_type" className="input" required value={supplierType} onChange={(event) => {
            const next = event.target.value as SupplierType | "";
            setSupplierType(next);
            if (next === "trading") setVisitRequested(false);
          }}>
            <option value="" disabled>Chọn nhà máy / thương nhân / hợp tác xã</option>
            {SUPPLIER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} defaultValue={supplier?.products ?? ""} />
        <Field label="Tỉnh / thành" name="province" maxLength={100} defaultValue={supplier?.province ?? ""} />
        <Field label="Địa chỉ" name="address" maxLength={250} defaultValue={supplier?.address ?? ""} />
        <Field label="Người liên hệ *" name="contact_name" required maxLength={120} defaultValue={supplier?.contact_name ?? ""} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} defaultValue={supplier?.phone ?? ""} />
        <Field label="Mã số thuế (chỉ nhập số) *" name="tax_number" required maxLength={32} inputMode="numeric" pattern="[0-9]+" defaultValue={supplier?.tax_id ?? ""} />
        <Field label="Số tài khoản ngân hàng (chỉ nhập số) *" name="bank_account_number" required maxLength={34} inputMode="numeric" pattern="[0-9]+" />
      </div>
      <p className="mt-2 text-xs text-ink-500">Mã số thuế và số tài khoản do bạn tự khai; Vexim sẽ kiểm tra, không tự đánh dấu giấy tờ “Đạt”.</p>
    </section>
    <CategoryProposals categories={categories} supplier={supplier} />
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">3. Thông tin hiển thị trên trang NCC</h2>
      <p className="mt-1 text-sm text-ink-600">Các trường bổ sung giúp Vexim xây trang nhà cung cấp. Chỉ xuất hiện công khai khi Vexim quyết định xuất bản hồ sơ; sản phẩm/ảnh sản phẩm khai riêng sau khi tài khoản được duyệt.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên hiển thị trên trang" name="display_name" maxLength={180} defaultValue={supplier?.display_name ?? ""} />
        <Field label="Website (https://...)" name="website" maxLength={250} defaultValue={supplier?.website ?? ""} />
        <Field label="Quốc gia" name="country" maxLength={100} defaultValue={supplier?.country ?? "Vietnam"} />
        <Field label="Chức vụ người liên hệ" name="contact_title" maxLength={100} defaultValue={supplier?.contact_title ?? ""} />
        <Field label="Zalo" name="zalo" maxLength={40} defaultValue={supplier?.zalo ?? ""} />
        <Field label="Năm thành lập" name="founded_year" maxLength={4} inputMode="numeric" defaultValue={String(supplier?.founded_year ?? "")} />
        <Field label="Số nhân viên" name="employees" maxLength={8} inputMode="numeric" defaultValue={String(supplier?.employees ?? "")} />
        <Field label="Công suất mỗi tháng" name="capacity_per_month" maxLength={180} defaultValue={supplier?.capacity_per_month ?? ""} />
        <Field label="MOQ" name="moq_text" maxLength={180} defaultValue={supplier?.moq_text ?? ""} />
        <Field label="Lead time (ngày)" name="lead_time_days" maxLength={5} inputMode="numeric" defaultValue={String(supplier?.lead_time_days ?? "")} />
        <Field label="Thị trường đã phục vụ" name="markets" maxLength={800} defaultValue={supplier?.markets ?? ""} />
        <Field label="Thị trường xuất khẩu (ngăn cách bằng dấu phẩy)" name="export_markets" maxLength={800} defaultValue={supplier?.export_markets?.join(", ") ?? ""} />
        <Field label="Cảng xuất (ngăn cách bằng dấu phẩy)" name="ports" maxLength={800} defaultValue={supplier?.ports?.join(", ") ?? ""} />
        <Field label="Incoterms (ngăn cách bằng dấu phẩy)" name="incoterms" maxLength={800} defaultValue={supplier?.incoterms?.join(", ") ?? ""} />
        <Field label="Điều khoản thanh toán" name="payment_terms" maxLength={200} defaultValue={supplier?.payment_terms ?? ""} />
      </div>
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">Giới thiệu bằng tiếng Anh (cho trang buyer)</span><textarea name="summary_en" rows={4} maxLength={1500} className="input" defaultValue={supplier?.summary_i18n?.en ?? ""} placeholder="A Vietnam-based producer of..." /></label>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier?.private_label ?? false} /> Nhận làm nhãn riêng / OEM</label>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">4. Giấy tờ bước đầu · Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Ảnh/PDF tối đa 15 MB/tệp, tổng tối đa 5 tệp. ATTP, HACCP không bắt buộc với thương nhân. Tải lên không tự duyệt.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{INITIAL_DOCUMENT_KEYS.map((key) =>
        <label key={key} className="block text-sm"><span className="mb-1 block font-semibold">{FILE_LABELS[key]}</span>
          <input type="file" name={`doc:${key}`} accept=".pdf,image/jpeg,image/png,image/webp" className="input" /></label>)}</div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">5. Muốn Vexim xác minh thêm?</h2>
      <p className="mt-1 text-sm text-ink-600">Chọn yêu cầu chỉ để Vexim liên hệ. Mỗi đánh giá được duyệt riêng; thương nhân vẫn có thể yêu cầu kiểm tra lịch sử giao hàng.</p>
      <div className="mt-4 space-y-3">
        <label className={`flex gap-3 rounded-xl border p-4 ${visitLocked ? "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200"}`}>
          <input type="checkbox" name="request:2" value="yes" checked={visitRequested} onChange={(event) => setVisitRequested(event.target.checked)} disabled={visitLocked} className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">Thăm nhà máy</strong><small className={visitLocked ? "text-ink-500" : "text-ink-600"}>{visitLocked ? "Không áp dụng cho thương nhân trên form đăng ký. Vexim có thể xem xét riêng nếu cần." : "Vexim sẽ liên hệ để kiểm tra và tải bằng chứng theo đúng đợt, không tự duyệt."}</small></span>
        </label>
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:3" value="yes" className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">Lịch sử giao hàng</strong><small className="text-ink-600">Vexim sẽ liên hệ để kiểm tra và tải bằng chứng theo đúng đợt, không tự duyệt.</small></span>
        </label>
      </div>
    </section>
    <label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 accent-brand-700" /><span>Tôi đồng ý gửi thông tin và tài liệu cho Vexim kiểm tra nội bộ; tài khoản chưa hoạt động cho đến khi Vexim xác nhận.</span></label>
  </>;
}

function CategoryProposals({ categories, supplier }: { categories: CategoryProposalOption[]; supplier?: Supplier }) {
  const [selected, setSelected] = useState<string[]>(() => (supplier?.requested_category_slugs ?? []).filter((slug) => categories.some((c) => c.slug === slug)));
  return <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">2. Danh mục kinh doanh đề xuất</h2>
    <p className="mt-1 text-sm text-ink-600">Chọn tối đa 5 danh mục Vexim đang có. Đây là thông tin NCC tự khai để Vexim xem xét, không tự gắn sản phẩm vào danh mục hoặc công khai gian hàng. “Mặt hàng chính” ở trên vẫn giúp bạn mô tả chi tiết.</p>
    {categories.length ? <fieldset className="mt-4"><legend className="text-xs font-semibold text-ink-600">Chọn ít nhất một danh mục hoặc ghi mục Khác bên dưới</legend>
      <div className="mt-2 grid max-h-80 gap-2 overflow-y-auto rounded-xl border border-ink-200 p-2 sm:grid-cols-2">{categories.map((c) => <label key={c.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${selected.includes(c.slug) ? "border-teal-500 bg-teal-50 text-teal-950" : "border-ink-200 bg-white text-ink-700 hover:border-teal-300"}`}>
        <input type="checkbox" name="requested_category_slugs" value={c.slug} checked={selected.includes(c.slug)} disabled={!selected.includes(c.slug) && selected.length >= 5}
          onChange={(e) => setSelected((old) => e.target.checked ? [...old, c.slug] : old.filter((slug) => slug !== c.slug))} className="mt-0.5 size-4 accent-teal-700" />
        <span><strong className="block">{c.label}</strong>{c.group && <span className="text-xs text-ink-500">Nhóm {c.group}</span>}</span></label>)}</div>
      <p className="mt-2 text-xs text-ink-500">Đã chọn {selected.length}/5 · Vexim xác nhận danh mục cuối cùng trong CRM.</p>
    </fieldset> : <p className="mt-3 text-xs text-amber-800">Vexim chưa mở danh mục để chọn; hãy mô tả mặt hàng chính và ghi chú bên dưới.</p>}
    <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">Khác / chưa thấy danh mục phù hợp</span>
      <input name="requested_category_other" className="input" maxLength={180} placeholder="Ví dụ: hạt macca chế biến" defaultValue={supplier?.requested_category_other ?? ""} /></label>
  </section>;
}

export function SupplierProfileForm({ supplier, categories }: { supplier: Supplier; categories: CategoryProposalOption[] }) {
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
    <SupplierProfileFields supplier={supplier} email={supplier.email ?? ""} categories={categories} />
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
