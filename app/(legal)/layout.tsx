import { getBuyerSession, getBuyerUser } from "@/lib/auth/buyer-session";
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { PublicSignInLink } from "@/components/public-sign-in-link";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";

/** Public legal documents must load without a session or a working marketplace database. */
export default async function LegalLayout({ children }: { children: ReactNode }) {
  const buyerSession = await getBuyerSession();
  // A profile lookup failure must not prevent public pages from loading.
  const buyerAccount = buyerSession ? await getBuyerUser().catch(() => null) : null;
  return <div lang="en" className="min-h-screen bg-slate-50 text-ink-900">
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-black text-brand-800" aria-label="Vexim Trade home">
          <Logo className="h-12 w-12" /><span>Vexim Trade</span>
        </Link>
        <PublicSignInLink buyerEmail={buyerSession?.email ?? null} buyerCompanyName={buyerAccount?.company_name ?? null} />
      </div>
    </header>
    <main id="main-content" className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">{children}</main>
    <PlatformLegalStrip variant="footer" />
  </div>;
}
