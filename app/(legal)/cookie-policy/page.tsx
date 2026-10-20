import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Cookie Policy | Vexim Trade" },
  description: "How Vexim Trade uses cookies and similar technologies, and how visitors can accept, reject or change their choices.",
  alternates: { canonical: `${SITE_URL}/cookie-policy` },
  robots: { index: true, follow: true },
};

function CookieTable({ rows }: { rows: Array<[string, string, string, string]> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="min-w-[680px] w-full border-collapse text-left text-[13px] leading-6 text-ink-700">
        <thead className="bg-ink-50 text-ink-900">
          <tr>
            <th className="px-3 py-2 font-bold">Cookie or technology</th>
            <th className="px-3 py-2 font-bold">Provider</th>
            <th className="px-3 py-2 font-bold">Purpose</th>
            <th className="px-3 py-2 font-bold">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, provider, purpose, duration]) => (
            <tr key={name} className="border-t border-ink-100 align-top">
              <td className="px-3 py-2 font-semibold text-ink-900">{name}</td>
              <td className="px-3 py-2">{provider}</td>
              <td className="px-3 py-2">{purpose}</td>
              <td className="px-3 py-2">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiePolicyPage() {
  return (
    <article className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Legal</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Cookie Policy</h1>
      <p className="mt-3 text-sm text-ink-500">Effective date: October 20, 2026 · Version 1</p>
      <p className="mt-6 text-sm leading-7 text-ink-700">
        This policy explains how VEXIM GLOBAL CO., LTD, operating Vexim Trade, uses cookies and similar technologies on {SITE_URL}. It should be read with our <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>. Questions can be sent to <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>.
      </p>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-choices">
        <h2 id="cookie-choices" className="text-xl font-bold text-ink-900">1. Your choices</h2>
        <p className="text-sm leading-7 text-ink-700">Strictly necessary cookies are always active because the site cannot work securely without them. Analytics, performance and marketing technologies are switched off until you allow them in the cookie banner or in Cookie settings.</p>
        <p className="text-sm leading-7 text-ink-700">On your first visit, you can accept all cookies, reject optional cookies or customize each category. We remember the choice for 12 months in the <code className="rounded bg-ink-100 px-1 py-0.5 text-[12px]">vexim_cookie_consent</code> cookie. We will ask again when that period ends or when this policy version changes.</p>
        <p className="text-sm leading-7 text-ink-700">You can change or withdraw your choice at any time by opening <strong>Cookie settings</strong> in the footer of a public page. If you reject analytics after previously allowing it, we stop loading analytics tools for future visits and send a denied consent signal where a tool is already open. You can also delete stored cookies in your browser settings.</p>
      </section>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-necessary">
        <h2 id="cookie-necessary" className="text-xl font-bold text-ink-900">2. Strictly necessary cookies</h2>
        <CookieTable rows={[
          ["vexim_cookie_consent", "Vexim Trade", "Remembers your cookie choices so we do not ask on every page.", "12 months"],
          ["vxt_session", "Vexim Trade", "Keeps a signed in account session secure. It is used only for account areas.", "7 days"],
          ["vxt_google_flow and vxt_google_signup", "Vexim Trade", "Completes the Google sign in flow securely.", "10 minutes"],
        ]} />
      </section>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-analytics">
        <h2 id="cookie-analytics" className="text-xl font-bold text-ink-900">3. Analytics and performance</h2>
        <p className="text-sm leading-7 text-ink-700">These tools load only after you allow the Analytics and performance category.</p>
        <CookieTable rows={[
          ["_ga, _ga_<measurement ID> and _gid", "Google Analytics", "Helps us understand visits and interactions on public pages.", "Set by Google according to its current cookie rules"],
          ["Performance measurement", "Vercel Speed Insights", "Measures page loading and real user performance so we can fix slow pages.", "Set by Vercel according to its current service rules"],
          ["Session storage view markers", "Vexim Trade", "Prevents the same public page from being counted repeatedly in one browser tab. Aggregate page view tables do not store a visitor ID.", "Until the browser tab is closed"],
        ]} />
      </section>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-marketing">
        <h2 id="cookie-marketing" className="text-xl font-bold text-ink-900">4. Marketing and advertising</h2>
        <p className="text-sm leading-7 text-ink-700">We do not currently set advertising cookies on Vexim Trade. Advertising or campaign measurement technologies will remain off unless you allow the Marketing and advertising category. If we add such a tool, we will update this policy with the provider, purpose and duration before or when the tool is introduced.</p>
      </section>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-third-party">
        <h2 id="cookie-third-party" className="text-xl font-bold text-ink-900">5. Third party content and links</h2>
        <p className="text-sm leading-7 text-ink-700">Product videos load from a video provider only after you press play. The provider may use cookies or similar technologies under its own policy. Links to services such as WhatsApp, LinkedIn and Facebook do not set their cookies on Vexim Trade; after you follow a link, the other service handles your visit under its own policy.</p>
      </section>

      <section className="mt-9 space-y-3" aria-labelledby="cookie-browser">
        <h2 id="cookie-browser" className="text-xl font-bold text-ink-900">6. Browser controls and contact</h2>
        <p className="text-sm leading-7 text-ink-700">Most browsers let you block or delete cookies. Blocking strictly necessary cookies can prevent sign in and other core functions from working. For questions about cookies or personal information, contact VEXIM GLOBAL CO., LTD, Hanoi, Vietnam at <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>.</p>
      </section>
    </article>
  );
}
