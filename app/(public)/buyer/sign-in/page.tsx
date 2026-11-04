import { getLocale } from "@/lib/i18n/server";
import { buyerAuthMessages } from "@/lib/i18n/buyer-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { BuyerSignInForm } from "@/components/buyer-sign-in-form";
import { getBuyerSession } from "@/lib/auth/buyer-session";
import { safeNextPath } from "@/lib/buyer/next-path";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: `${buyerAuthMessages[locale].signIn} · Vexim Trade`, robots: { index: false, follow: false } };
}

export default async function BuyerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; oauth?: string }>;
}) {
  const locale = await getLocale();
  const m = buyerAuthMessages[locale];
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  // Đã đăng nhập rồi thì không bắt đăng nhập lại.
  if (await getBuyerSession()) redirect(next ?? "/");

  const error = sp.error && Object.hasOwn(m.linkErrors, sp.error) ? m.linkErrors[sp.error as keyof typeof m.linkErrors] : null;
  const oauthError = sp.oauth && Object.hasOwn(m.oauthErrors, sp.oauth) ? m.oauthErrors[sp.oauth as keyof typeof m.oauthErrors] : null;

  return (
    <AuthSplitShell
      caption={m.caption}
      lede={m.lede}
      points={m.points}
      note={m.note}
    >
      <h1 className="text-[18px] font-black text-ink-900">{m.title}</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
        {m.intro}
      </p>

      <BuyerSignInForm messages={m} lang={locale} next={next} initialError={error} initialOauthError={oauthError} />

      <p className="mt-6 border-t border-ink-100 pt-4 text-[12px] leading-relaxed text-ink-500">
        {m.supplierQuestion}{" "}
        <Link href="/login" prefetch={false} className="font-semibold text-brand-700 underline">
          {m.supplierLink}
        </Link>
      </p>
    </AuthSplitShell>
  );
}
