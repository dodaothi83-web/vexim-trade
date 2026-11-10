import { redirect } from "next/navigation";
import Link from "next/link";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { getAuthMessages } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { m } = await getAuthMessages();
  return { title: `${m.login.title} · ${m.shell.portalName}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; oauth?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/");

  const sp = await searchParams;
  const { locale, m } = await getAuthMessages();
  const reasonKey = sp.reason === "not_found" || sp.reason === "locked" || sp.reason === "unreadable" ? sp.reason : null;
  const oauthKey = sp.oauth && sp.oauth in m.login.oauth ? (sp.oauth as keyof typeof m.login.oauth) : null;

  let needsSetup = false;
  try {
    needsSetup = (await getStore().countUsers()) === 0;
  } catch {
    needsSetup = false;
  }

  return (
    <AuthSplitShell
      caption={m.login.shellCaption}
      points={m.login.shellPoints}
    >
      <h1 className="text-[18px] font-black text-ink-900">{m.login.title}</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">{m.login.subtitle}</p>

      {reasonKey && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          <p className="font-semibold">{m.login.reasonTitles[reasonKey]}</p>
          <div className="mt-1">{m.login.reasonBodies[reasonKey]}</div>
        </div>
      )}

      {sp.oauth === "not_allowed" ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {m.login.noSupplierAccount}{" "}
          <Link href="/register" className="font-semibold text-brand-700 underline">
            {m.login.registerHere}
          </Link>
        </p>
      ) : oauthKey ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {m.login.oauth[oauthKey]}
        </p>
      ) : null}

      <LoginForm needsSetup={needsSetup} messages={m.login} lang={locale} />

      <p className="mt-5 text-center text-xs text-ink-600">
        {m.login.noAccount}{" "}
        <Link href="/register" className="font-semibold text-brand-700 underline">
          {m.login.registerFree}
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-ink-500">
        {m.login.buyerQuestion}{" "}
        <Link href="/rfq" className="font-semibold text-brand-700 underline">
          {m.login.sendQuoteRequest}
        </Link>{" "}
        {m.login.buyerSignInHint}, {m.login.orSeeTypes}{" "}
        <Link href="/register" className="font-semibold text-brand-700 underline">
          {m.login.seeAccountTypes}
        </Link>
        .
      </p>
    </AuthSplitShell>
  );
}
