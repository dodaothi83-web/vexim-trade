import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quên mật khẩu · Cổng nhà cung cấp",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/");

  return (
    <>
      <h1 className="text-[18px] font-black text-ink-900">Quên mật khẩu</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
        Nhập email tài khoản của bạn. Hệ thống sẽ gửi liên kết đặt lại mật khẩu có hiệu lực trong 30 phút.
      </p>

      <ForgotPasswordForm />

      <p className="mt-5 text-center text-xs text-ink-600">
        Nhớ mật khẩu rồi?{" "}
        <Link href="/login" className="font-semibold text-brand-700 underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </>
  );
}
