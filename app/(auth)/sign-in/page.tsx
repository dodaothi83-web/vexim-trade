import Link from "next/link";
import { ArrowRight, Factory, ShoppingBag } from "lucide-react";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { getLocale } from "@/lib/i18n/server";
import { signInEntryMessages } from "@/lib/i18n/sign-in-entry";
import { safeNextPath } from "@/lib/buyer/next-path";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: `${signInEntryMessages[locale].title} · Vexim Trade`, robots: { index: false, follow: false } };
}

/** A shared entrance, not a shared session or automatic email-to-role lookup. */
export default async function SignInEntryPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const locale = await getLocale();
  const m = signInEntryMessages[locale];
  const next = safeNextPath((await searchParams).next);
  const options = [
    { title: m.buyer, description: m.buyerDescription, href: `/buyer/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`, icon: ShoppingBag },
    { title: m.supplier, description: m.supplierDescription, href: "/login", icon: Factory },
  ];
  return <AuthSplitShell caption={m.caption}>
    <h1 className="text-xl font-bold text-ink-900">{m.title}</h1>
    <p className="mt-2 text-sm leading-6 text-ink-600">{m.intro}</p>
    <nav aria-label={m.intro} className="mt-5 space-y-3">
      {options.map(({ title, description, href, icon: Icon }) => <Link key={href} href={href} prefetch={false} className="group flex min-h-24 items-center gap-3 rounded-xl border border-ink-200 p-4 transition hover:border-brand-600 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink-900">{title}</span><span className="mt-1 block text-xs leading-5 text-ink-600">{description}</span></span>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
      </Link>)}
    </nav>
    <p className="mt-5 text-center text-sm text-ink-600">{m.newAccount}{" "}<Link href="/register" className="font-semibold text-brand-700 underline underline-offset-2">{m.register}</Link></p>
    <div className="mt-5 border-t border-ink-100 pt-4 text-center"><Link href="/login" prefetch={false} className="text-xs font-semibold text-ink-500 underline underline-offset-2 hover:text-brand-700">{m.staff}</Link></div>
  </AuthSplitShell>;
}
