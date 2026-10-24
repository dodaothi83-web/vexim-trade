"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function SupplierAccountForm() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("password") !== form.get("password2")) {
      setMessage({ ok: false, text: "Hai lần nhập mật khẩu không khớp." }); return;
    }
    form.delete("password2");
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/supplier-signup", { method: "POST", body: form });
      const result = await response.json() as { ok: boolean; message: string };
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) element.reset();
    } catch { setMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-6 space-y-4">
    <label className="block text-sm"><span className="mb-1 block font-semibold">Họ tên người đăng ký</span>
      <input name="name" className="input" required minLength={2} maxLength={120} autoComplete="name" /></label>
    <label className="block text-sm"><span className="mb-1 block font-semibold">Email đăng nhập</span>
      <input name="email" type="email" className="input" required maxLength={200} autoComplete="email" /></label>
    <label className="block text-sm"><span className="mb-1 block font-semibold">Mật khẩu (8-128 ký tự, gồm chữ và số)</span>
      <span className="relative block"><input name="password" type={show ? "text" : "password"} className="input pr-10" required minLength={8} maxLength={128} autoComplete="new-password" />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
    <label className="block text-sm"><span className="mb-1 block font-semibold">Nhập lại mật khẩu</span>
      <input name="password2" type={show ? "text" : "password"} className="input" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
    <label className="flex items-start gap-2 text-xs text-ink-700"><input name="consent" type="checkbox" value="yes" required className="mt-0.5" />Tôi đồng ý tạo tài khoản để gửi hồ sơ doanh nghiệp đi duyệt.</label>
    <input name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    <button type="submit" disabled={busy || message?.ok} className="btn btn-primary w-full justify-center">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo tài khoản…</> : "Tạo tài khoản bằng email"}</button>
    {message && <p role="status" className={`rounded-lg border p-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>{message.text}{message.ok && <> <Link href="/login" className="font-bold underline">Đến trang đăng nhập</Link></>}</p>}
    <div className="flex items-center gap-3 text-xs text-ink-500"><span className="h-px flex-1 bg-ink-200" />hoặc<span className="h-px flex-1 bg-ink-200" /></div>
    <a href="/api/auth/google/start?intent=signup" className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"><span aria-hidden="true" className="text-base font-black text-blue-600">G</span> Tiếp tục với Google</a>
    <p className="text-center text-xs leading-5 text-ink-500">Tiếp tục với Google đồng nghĩa bạn đồng ý tạo tài khoản nhà cung cấp để gửi hồ sơ doanh nghiệp. Google chỉ xác thực email; bạn vẫn phải khai hồ sơ doanh nghiệp và chờ được mở quyền. Xem <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link> và <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>.</p>
  </form>;
}
