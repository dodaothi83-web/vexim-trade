import type { Metadata } from "next";
import Link from "next/link";

import { decodePasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Đặt lại mật khẩu · Cổng nhà cung cấp",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = (sp.token ?? "").trim();
  const decoded = decodePasswordResetToken(token);

  return (
    <>
      <h1 className="text-[18px] font-black text-ink-900">Đặt lại mật khẩu</h1>

      {!decoded.ok ? (
        <div className="mt-4 space-y-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
            {decoded.reason === "expired"
              ? "Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút)."
              : "Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu."}
          </p>
          <p className="text-center text-xs text-ink-600">
            <Link href="/auth/forgot-password" className="font-semibold text-brand-700 underline">
              Gửi lại yêu cầu đặt lại mật khẩu
            </Link>{" "}
            ·{" "}
            <Link href="/login" className="font-semibold text-brand-700 underline">
              Quay lại đăng nhập
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
            Nhập mật khẩu mới cho tài khoản <strong className="text-ink-800">{decoded.payload.email}</strong>.
          </p>
          <ResetPasswordForm token={token} />
          <p className="mt-5 text-center text-xs text-ink-600">
            <Link href="/login" className="font-semibold text-brand-700 underline">
              Quay lại đăng nhập
            </Link>
          </p>
        </>
      )}
    </>
  );
}
