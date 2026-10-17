"use client";

import Link from "next/link";
import { useState } from "react";
import { SupplierProfileFields } from "@/app/supplier/portal/supplier-profile-form";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

export function SupplierApplicationForm({ googleEmail, categories }: { googleEmail?: string; categories: CategoryProposalOption[] }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(googleEmail ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (!googleEmail && form.get("password") !== form.get("password2")) {
      setResult({ ok: false, message: "Hai lần nhập mật khẩu không khớp." }); return;
    }
    form.delete("password2");
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/supplier-signup", { method: "POST", body: form });
      const data = await res.json() as { ok: boolean; message: string };
      setResult(data);
      if (data.ok) { element.reset(); setEmail(googleEmail ?? ""); }
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-7 space-y-5">
    {!googleEmail && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
      <a href="/api/auth/google/start?intent=signup" className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"><span className="text-base font-black text-blue-600" aria-hidden="true">G</span> Đăng ký nhanh bằng Google</a>
      <p className="mt-2 text-xs text-ink-600">Google xác thực email; bạn vẫn cần khai hồ sơ trang NCC dưới đây và chờ Vexim duyệt. Hãy chọn Google trước khi điền form để không mất nội dung chưa lưu.</p>
    </div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm"><span className="mb-1 block font-semibold">Email đăng nhập *</span>
        <input name="email" type="email" required maxLength={200} className="input" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!googleEmail} autoComplete="email" /></label>
      {googleEmail ? <p className="self-center text-sm text-emerald-800">✓ Đã xác thực Google. Không cần tạo mật khẩu; điền hồ sơ bên dưới để Vexim xét duyệt.</p> : <>
        <Field label="Mật khẩu (ít nhất 8 ký tự gồm chữ và số) *" name="password" type="password" required minLength={8} maxLength={128} />
        <Field label="Nhập lại mật khẩu *" name="password2" type="password" required minLength={8} maxLength={128} />
      </>}
    </div>
    <p className="text-sm text-ink-600">Đây là form tạo hồ sơ trang nhà cung cấp, không chỉ tạo tài khoản. Sau khi nộp{googleEmail ? "" : " và xác nhận email"}, bạn đăng nhập xem trạng thái chờ Vexim xác nhận; hồ sơ/sản phẩm không tự công khai.</p>
    <SupplierProfileFields email={email} categories={categories} />
    <input name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <button type="submit" disabled={busy || result?.ok} className="btn btn-primary w-full justify-center">{busy ? "Đang tạo tài khoản..." : "Tạo tài khoản nhà cung cấp"}</button>
    {result && <div role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.message}{result.ok && <p className="mt-2">{googleEmail ? "Google đã xác thực email. " : "Sau khi xác nhận email, "}<Link href="/login" className="font-semibold underline">đăng nhập ở form chung</Link> để theo dõi việc Vexim xác nhận hồ sơ.</p>}
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
