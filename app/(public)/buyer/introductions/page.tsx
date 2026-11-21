import type { Metadata } from "next";
import Link from "next/link";

import { IntroStopForm, IntroTokenForm, IntroUnsubscribeForm } from "@/components/buyer-introductions";
import { getStore } from "@/lib/db";
import { introFrequency, readIntroductions } from "@/lib/buyer/introductions";
import { introCategories, verifyIntroToken } from "@/lib/buyer/introductions-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Supplier introductions | Vexim Trade", robots: { index: false, follow: false } };

/** Trang mở từ thư mời/thư chào mừng (link ký 30 ngày, không cần đăng nhập). */
export default async function BuyerIntroductionsPage({ searchParams }: { searchParams: Promise<{ t?: string; c?: string; stop?: string; unsubscribe?: string }> }) {
  const { t = "", c, stop, unsubscribe } = await searchParams;
  const email = verifyIntroToken(t);
  const account = email ? await getStore().getBuyerUserByEmail(email).catch(() => null) : null;
  const wrap = (children: React.ReactNode) => <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">{children}</main>;
  if (!account?.verified_at) return wrap(<>
    <h1 className="text-2xl font-bold text-ink-900">This link has expired</h1>
    <p className="mt-2 text-sm leading-6 text-ink-600">Sign in to choose the products you source. It takes a few seconds.</p>
    <Link href="/buyer/sign-in?next=%2Fbuyer%2Faccount%3Ftab%3Dprofile" className="mt-5 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white">Sign in</Link>
  </>);
  if (unsubscribe) return wrap(<>
    <h1 className="text-2xl font-bold text-ink-900">Unsubscribe from supplier introductions?</h1>
    <p className="mb-5 mt-2 text-sm leading-6 text-ink-600">{account.email} will stop getting supplier introductions. Quote and account emails continue.</p>
    <IntroUnsubscribeForm token={t} />
  </>);
  if (stop) return wrap(<>
    <h1 className="text-2xl font-bold text-ink-900">Stop invitations?</h1>
    <p className="mb-5 mt-2 text-sm leading-6 text-ink-600">We won&apos;t ask {account.email} to choose products again. Your account stays as it is.</p>
    <IntroStopForm token={t} />
  </>);
  const categories = (await introCategories()).map(({ id, slug, name }) => ({ id, slug, name }));
  const chosen = readIntroductions(account.introductions).categories ?? [];
  const initial = [...new Set([...(account.marketing_opt_in ? chosen : []), ...(c && categories.some((x) => x.id === c) ? [c] : [])])];
  return wrap(<>
    <p className="text-sm text-ink-500">{account.email}</p>
    <h1 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">What do you source?</h1>
    <p className="mb-6 mt-2 text-sm leading-6 text-ink-600">Pick the products you buy. We&apos;ll introduce matching checked suppliers, up to twice a week.</p>
    <IntroTokenForm token={t} categories={categories} initial={initial} frequency={introFrequency(readIntroductions(account.introductions))} />
  </>);
}
