import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { getAuthMessages } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { m } = await getAuthMessages();
  return { title: `${m.forgot.title} · ${m.shell.portalName}`, robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/");

  const { locale, m } = await getAuthMessages();

  return (
    <AuthSplitShell caption={m.login.shellCaption} points={m.login.shellPoints}>
      <h1 className="text-[18px] font-black text-ink-900">{m.forgot.title}</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">{m.forgot.subtitle}</p>

      <ForgotPasswordForm
        messages={m.forgot}
        lang={locale}
        emailLabel={m.login.email}
        emailPlaceholder={m.login.emailPlaceholder}
      />

      <p className="mt-5 text-center text-xs text-ink-600">
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {m.forgot.backToLogin}
        </Link>
      </p>
    </AuthSplitShell>
  );
}
