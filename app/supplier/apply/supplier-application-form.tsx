"use client";

import Link from "next/link";
import { useState } from "react";

export function SupplierApplicationForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; notification?: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("password") !== form.get("password2")) {
      setResult({ ok: false, message: "Hai lần nhập mật khẩu không khớp." }); return;
    }
    form.delete("password2");
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/supplier-signup", { method: "POST", body: form });
      const data = await res.json() as { ok: boolean; message: string; notification?: string };
      setResult(data);
      if (data.ok) element.reset();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-7 space-y-7">
    <section><h2 className="text-base font-bold text-ink-900">1. Thông tin doanh nghiệp</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên pháp lý doanh nghiệp *" name="name" required maxLength={180} />
        <Field label="Tên thương mại (nếu có)" name="trade_name" maxLength={180} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Loại hình *</span>
          <select name="supplier_type" className="input" required><option value="manufacturer">Nhà sản xuất</option><option value="trading">Công ty thương mại</option><option value="cooperative">Hợp tác xã</option></select>
        </label>
        <Field label="Tỉnh / thành" name="province" maxLength={100} />
        <Field label="Địa chỉ" name="address" maxLength={250} />
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} />
        <Field label="Người liên hệ *" name="contact_name" required maxLength={120} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} />
        <Field label="Email dùng để đăng nhập *" name="email" type="email" required maxLength={200} />
        <Field label="Mã số thuế (chỉ nhập số) *" name="tax_number" inputMode="numeric" pattern="[0-9]+" required maxLength={32} />
        <Field label="Số tài khoản ngân hàng (chỉ nhập số) *" name="bank_account_number" inputMode="numeric" pattern="[0-9]+" required maxLength={34} />
        <Field label="Mật khẩu (ít nhất 8 ký tự gồm chữ và số) *" name="password" type="password" required minLength={8} maxLength={128} />
        <Field label="Nhập lại mật khẩu *" name="password2" type="password" required minLength={8} maxLength={128} />
      </div>
      <p className="mt-2 text-xs text-ink-500">Bạn sẽ nhận email xác nhận tài khoản qua Supabase trước khi đăng nhập. Mã số thuế/số tài khoản do doanh nghiệp khai chưa được Vexim đối chiếu.</p>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">2. Giấy tờ bước đầu · Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Chỉ nhận tệp thuộc các mục dưới đây (PDF/JPG/PNG/WebP, tối đa 15 MB/tệp và 5 tệp). Giấy ATTP và HACCP không bắt buộc, đặc biệt với doanh nghiệp thương mại. Bạn có thể bổ sung giấy tờ sau khi xác nhận email.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([
          ["business_license", "Đăng ký doanh nghiệp"], ["food_safety", "Giấy ATTP (nếu có)"],
          ["haccp_or_brc", "HACCP/BRC/ISO (nếu có)"], ["product_certs", "Chứng chỉ sản phẩm (nếu có)"],
          ["export_license", "Giấy phép xuất khẩu (nếu áp dụng)"],
        ] as const).map(([key, label]) => <label className="block text-sm" key={key}><span className="mb-1 block font-semibold">{label}</span>
          <input type="file" name={`doc:${key}`} accept=".pdf,image/jpeg,image/png,image/webp" className="input" /></label>)}
      </div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">3. Muốn Vexim xác minh thêm?</h2>
      <p className="mt-1 text-sm text-ink-600">Sau khi hồ sơ được rà soát, kết quả đã duyệt giúp buyer hiểu rõ hơn mức độ kiểm chứng và có thể hỗ trợ khả năng được tìm thấy. Chọn yêu cầu không tự cấp nhãn, không bảo đảm vị trí hiển thị.</p>
      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer gap-3 rounded-xl border border-ink-200 p-4"><input type="checkbox" name="request:2" value="yes" className="mt-1 h-4 w-4 accent-brand-700" /><span><strong className="block">Thăm nhà máy</strong><small className="text-ink-600">Nhân viên Vexim sẽ liên hệ lên lịch thăm cơ sở và tự tải ảnh/bằng chứng sau khi kiểm tra. Không bắt buộc đối với công ty thương mại không có nhà máy.</small></span></label>
        <label className="flex cursor-pointer gap-3 rounded-xl border border-ink-200 p-4"><input type="checkbox" name="request:3" value="yes" className="mt-1 h-4 w-4 accent-brand-700" /><span><strong className="block">Lịch sử giao hàng</strong><small className="text-ink-600">Vexim sẽ liên hệ đối chiếu chứng từ một lô hàng đã hoàn tất. Có thể thực hiện độc lập dù không thăm nhà máy.</small></span></label>
      </div>
    </section>
    <label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 accent-brand-700" /><span>Tôi đồng ý gửi thông tin và giấy tờ cho Vexim lưu giữ nội bộ, kiểm tra thủ công và liên hệ để xác minh; tôi hiểu hồ sơ chưa được công khai hay đánh dấu đạt.</span></label>
    <input name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <button type="submit" disabled={busy || result?.ok} className="btn btn-primary w-full justify-center">{busy ? "Đang gửi hồ sơ..." : "Gửi hồ sơ đăng ký"}</button>
    {result && <div role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.message}{result.ok && result.notification !== "sent" && <p className="mt-1">Thông báo email nội bộ có thể chưa gửi; yêu cầu vẫn nằm trong hàng đợi CRM.</p>}
      {result.ok && <p className="mt-2">Sau khi xác nhận email, <Link href="/login" className="font-semibold underline">đăng nhập</Link> để xem hồ sơ và bổ sung giấy tờ bước đầu.</p>}
    </div>}
  </form>;
}

function Field({ label, name, type = "text", required, maxLength, minLength, inputMode, pattern }: {
  label: string; name: string; type?: string; required?: boolean; maxLength?: number; minLength?: number;
  inputMode?: "numeric"; pattern?: string;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input className="input" name={name} type={type} required={required} maxLength={maxLength} minLength={minLength} inputMode={inputMode} pattern={pattern} autoComplete={name === "email" ? "email" : name === "password" ? "new-password" : undefined} />
  </label>;
}
