"use client";

import { useState, useTransition } from "react";
import { updateBuyerCompanyAction } from "@/app/(public)/buyer/account/actions";

export function BuyerAccountProfile({ email, company, isVi }: { email: string; company: string; isVi: boolean }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const companyName = String(new FormData(event.currentTarget).get("company") ?? "");
    setStatus(null);
    startTransition(async () => {
      const result = await updateBuyerCompanyAction(companyName).catch(() => ({ ok: false }));
      setStatus(result.ok ? "success" : "error");
    });
  }} className="mt-5 max-w-lg space-y-5">
    <div><label htmlFor="buyer-email" className="block text-sm font-semibold">Email</label><input id="buyer-email" type="email" readOnly value={email} className="mt-2 w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-ink-600" /><p className="mt-2 text-xs text-ink-500">{isVi ? "Email đã xác minh dùng để đăng nhập và nhận phản hồi." : "Your verified email is used to sign in and receive replies."}</p></div>
    <div><label htmlFor="buyer-company" className="block text-sm font-semibold">{isVi ? "Tên công ty" : "Company name"}</label><input id="buyer-company" name="company" autoComplete="organization" defaultValue={company} maxLength={160} className="mt-2 w-full rounded-lg border border-ink-300 px-3 py-2" /></div>
    <button className="btn btn-primary" disabled={pending}>{pending ? (isVi ? "Đang lưu..." : "Saving...") : (isVi ? "Lưu thay đổi" : "Save changes")}</button>
    {status && <p role="status" className={status === "success" ? "text-sm text-green-700" : "text-sm text-red-700"}>{status === "success" ? (isVi ? "Đã lưu thông tin." : "Account details saved.") : (isVi ? "Chưa lưu được. Vui lòng thử lại." : "Could not save. Please try again.")}</p>}
  </form>;
}
