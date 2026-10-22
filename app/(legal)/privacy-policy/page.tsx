import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | Vexim Trade" },
  description: "How Vexim Trade collects, uses, protects and shares information, including information received when you sign in with Google.",
  alternates: { canonical: `${SITE_URL}/privacy-policy` },
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return <article className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Legal</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Privacy Policy</h1>
    <p className="mt-3 text-sm text-ink-500">Effective date: October 20, 2026 · Version 2</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">This policy describes how VEXIM GLOBAL CO., LTD (operating Vexim Trade, “Vexim”, “we” or “us”) handles information when you visit <a className="font-semibold text-brand-700 underline" href={SITE_URL}>{SITE_URL}</a>, request a quote, create a supplier account or use our staff tools. Vexim Trade is a business-to-business sourcing platform connecting buyers with Vietnamese suppliers. Questions or privacy requests can be sent to <a className="font-semibold text-brand-700 underline" href="mailto:contact@veximglobal.com">contact@veximglobal.com</a>.</p>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-data">
      <h2 id="privacy-data" className="text-xl font-bold text-ink-900">1. Information we collect</h2>
      <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-ink-700">
        <li><strong>Buyer enquiries:</strong> company and contact details, email, phone if supplied, products, specifications, quantity, destination, requested services, messages, consent record and the status of your request. A form may also send campaign parameters or a referrer.</li>
        <li><strong>Supplier accounts and submissions:</strong> account name and email, business and contact details, product information, images, certificates, tax/bank and verification documents you choose to provide, and staff review decisions. Some of these are sensitive business records and remain internal unless a separate public-display decision is made.</li>
        <li><strong>Use of the site:</strong> page-view totals by date and public page, and limited security or service logs. Our page-view reports are approximate; they do not identify unique buyers or store IP addresses or visitor identifiers in the page-view tables. Browsers may use session storage to avoid repeatedly counting the same page in one tab. Optional analytics and performance technologies run only after you allow them through Cookie settings. See our <Link href="/cookie-policy" className="font-semibold text-brand-700 underline">Cookie Policy</Link> for the categories and controls.</li>
        <li><strong>Communications:</strong> emails you send to us or receive from us, replies, and records needed to follow up on enquiries or manage accounts.</li>
      </ul>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-google">
      <h2 id="privacy-google" className="text-xl font-bold text-ink-900">2. Sign in with Google</h2>
      <p className="text-sm leading-7 text-ink-700">If you choose Google sign-in or supplier registration, Vexim requests only the <strong>email</strong> and <strong>basic profile</strong> scopes. Through our authentication provider, we receive your verified email address, an identifier associated with your sign-in and available name/profile information to verify your identity, create a supplier account if you explicitly register, or match you to an existing Vexim account. A Google login does not by itself approve a supplier, publish a listing or grant staff access. We do not request Gmail, Google Drive, Contacts or Calendar access, and we do not use Google profile data for advertising or sell it.</p>
      <p className="text-sm leading-7 text-ink-700">Google authentication is processed through Supabase Auth. Vexim stores the name, email and account role needed to operate your Vexim account; Google identity and authentication data may also be processed by Supabase for the sign-in flow. Our application does not use a Google access token to call other Google APIs on your behalf. You can revoke Vexim’s Google access in your Google Account settings; contact us separately if you also want to request deletion of your Vexim account and submitted records.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-use">
      <h2 id="privacy-use" className="text-xl font-bold text-ink-900">3. How we use information</h2>
      <p className="text-sm leading-7 text-ink-700">We use information to authenticate users, review supplier applications and product submissions, respond to buyer enquiries, identify potentially suitable suppliers, arrange requested introductions, communicate about your account or RFQ, protect the service against abuse, and maintain and improve the platform. Supplier document, factory-visit and delivery-history reviews are separate human decisions; uploading information never automatically grants a public verification badge.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-share">
      <h2 id="privacy-share" className="text-xl font-bold text-ink-900">4. When information is shared</h2>
      <p className="text-sm leading-7 text-ink-700">Authorized Vexim staff can access information needed for their work. To obtain a quote, Vexim may share the requirements in a buyer’s enquiry with the suppliers we contact about it; we do not disclose the buyer’s email, phone or company contact details to them until the buyer approves an introduction. Supplier profiles, products, certificates and verification summaries appear publicly only after the applicable Vexim review and publication steps. Internal evidence and private documents are not automatically made public.</p>
      <p className="text-sm leading-7 text-ink-700">We use service providers for hosting and infrastructure (including Vercel), database and authentication (Supabase), email delivery (Resend), and Google sign-in. Optional anti-spam and document-review tools may process the information needed for those features when enabled; human staff make verification decisions. We may disclose information where required by law or to protect the security of the service. We do not sell Google user data or provide it to advertising networks.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-retention">
      <h2 id="privacy-retention" className="text-xl font-bold text-ink-900">5. Retention and security</h2>
      <p className="text-sm leading-7 text-ink-700">We retain account, enquiry and review information while needed to provide the service, handle follow-up and disputes, meet legal obligations or maintain security records. When no longer needed, we delete or de-identify it where reasonably possible, subject to applicable retention requirements. Aggregated page-view counts are not tied to an account. We use access controls, server-side processing and secure connections, but no online service can guarantee absolute security.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-rights">
      <h2 id="privacy-rights" className="text-xl font-bold text-ink-900">6. Your choices and requests</h2>
      <p className="text-sm leading-7 text-ink-700">You may ask us to access, correct or delete your personal information, withdraw consent where applicable, or ask about our handling of your data by emailing <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>. You can change or withdraw cookie choices at any time through <strong>Cookie settings</strong> in the footer of a public page. We may need to verify your identity and may retain records when required by law or for legitimate security and dispute purposes. Revoking Google sign-in is separate from deleting a Vexim account and may affect your ability to log in. Our service is intended for business users, not children.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="privacy-changes">
      <h2 id="privacy-changes" className="text-xl font-bold text-ink-900">7. Updates and contact</h2>
      <p className="text-sm leading-7 text-ink-700">We may update this policy as our service changes. The effective date above will be revised when material changes are published. Contact: VEXIM GLOBAL CO., LTD, Hanoi, Vietnam · <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>. For rules about using the site, read our <Link href="/terms-of-service" className="font-semibold text-brand-700 underline">Terms of Service</Link>.</p>
    </section>
  </article>;
}
