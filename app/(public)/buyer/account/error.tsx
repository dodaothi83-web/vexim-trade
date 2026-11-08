"use client";
import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { signOutBuyerAction } from "@/app/(public)/buyer/sign-in/actions";

export default function BuyerAccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [vi, setVi] = useState(false);
  useEffect(() => { setVi(document.cookie.split("; ").some((cookie) => cookie === "vexim_locale=vi")); }, []);
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <div role="alert" className="mx-auto max-w-2xl px-5 py-16"><h1 className="text-xl font-bold">{vi ? "Chưa tải được tài khoản" : "Account could not be loaded"}</h1><p className="mt-3 text-sm text-ink-600">{vi ? "Vui lòng thử lại. Nếu lỗi tiếp tục, hãy đăng nhập lại." : "Please try again. If the issue continues, sign in again."}</p><button onClick={reset} className="btn btn-primary mt-5">{vi ? "Thử lại" : "Try again"}</button><form action={signOutBuyerAction} className="mt-4"><button className="text-sm font-semibold text-brand-700">{vi ? "Đăng xuất để đăng nhập lại" : "Sign out to sign in again"}</button></form></div>;
}
