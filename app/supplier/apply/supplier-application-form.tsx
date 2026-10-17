"use client";

import Link from "next/link";
import { useState } from "react";

export function SupplierApplicationForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
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
      const data = await res.json() as { ok: boolean; message: string };
      setResult(data);
      if (data.ok) element.reset();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-7 space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Họ và tên người liên hệ *" name="contact_name" required maxLength={120} />
      <Field label="Email đăng nhập *" name="email" type="email" required maxLength={200} />
      <Field label="Mật khẩu (ít nhất 8 ký tự gồm chữ và số) *" name="password" type="password" required minLength={8} maxLength={128} />
      <Field label="Nhập lại mật khẩu *" name="password2" type="password" required minLength={8} maxLength={128} />
    </div>
    <p className="text-sm text-ink-600">Sau khi xác nhận email và đăng nhập, bạn sẽ điền thông tin doanh nghiệp và loại hình nhà máy/thương nhân ngay trong dashboard. Chỉ khi Vexim xác nhận hồ sơ, các chức năng cổng NCC mới được mở.</p>
    <label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 accent-brand-700" /><span>Tôi đồng ý tạo tài khoản, cung cấp thông tin cho Vexim kiểm tra thủ công và nhận email xác nhận.</span></label>
    <input name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <button type="submit" disabled={busy || result?.ok} className="btn btn-primary w-full justify-center">{busy ? "Đang tạo tài khoản..." : "Tạo tài khoản nhà cung cấp"}</button>
    {result && <div role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.message}{result.ok && <p className="mt-2">Sau khi xác nhận email, <Link href="/login" className="font-semibold underline">đăng nhập</Link> để hoàn thiện hồ sơ.</p>}
    </div>}
  </form>;
}

function Field({ label, name, type = "text", required, maxLength, minLength }: {
  label: string; name: string; type?: string; required?: boolean; maxLength?: number; minLength?: number;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input className="input" name={name} type={type} required={required} maxLength={maxLength} minLength={minLength} autoComplete={name === "email" ? "email" : name === "password" ? "new-password" : undefined} />
  </label>;
}
