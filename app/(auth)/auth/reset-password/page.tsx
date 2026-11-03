import Link from "next/link";

import { decodePasswordResetToken } from "@/lib/auth/password-reset";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { getAuthMessages } from "@/lib/i18n/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { m } = await getAuthMessages();
  return { title: `${m.reset.title} · ${m.shell.portalName}`, robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = (sp.token ?? "").trim();
  const decoded = decodePasswordResetToken(token);
  const { locale, m } = await getAuthMessages();

  return (
    <AuthSplitShell caption={m.login.shellCaption} points={m.login.shellPoints}>
      <h1 className="text-[18px] font-black text-ink-900">{m.reset.title}</h1>

      {!decoded.ok ? (
        <div className="mt-4 space-y-4">
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
            {decoded.reason === "expired" ? m.reset.expired : m.reset.invalid}
          </p>
          <p className="text-center text-xs text-ink-600">
            <Link href="/auth/forgot-password" className="font-semibold text-brand-700 underline">
              {m.reset.resend}
            </Link>{" "}
            ·{" "}
            <Link href="/login" className="font-semibold text-brand-700 underline">
              {m.reset.backToLogin}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
            {m.reset.subtitle} <strong className="text-ink-800">{decoded.payload.email}</strong>.
          </p>
          <ResetPasswordForm
            token={token}
            messages={m.reset}
            lang={locale}
            showPasswordLabel={m.login.showPassword}
            hidePasswordLabel={m.login.hidePassword}
          />
          <p className="mt-5 text-center text-xs text-ink-600">
            <Link href="/login" className="font-semibold text-brand-700 underline">
              {m.reset.backToLogin}
            </Link>
          </p>
        </>
      )}
    </AuthSplitShell>
  );
}
