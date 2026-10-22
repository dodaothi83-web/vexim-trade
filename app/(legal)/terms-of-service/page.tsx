import Link from "next/link";
import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Terms of Service | Vexim Trade" },
  description: "Terms for using Vexim Trade's public marketplace, RFQ service and supplier account portal.",
  alternates: { canonical: `${SITE_URL}/terms-of-service` },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <article className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">Vexim Trade · Legal</p>
    <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">Terms of Service</h1>
    <p className="mt-3 text-sm text-ink-500">Effective date: October 18, 2026 · Version 1</p>
    <p className="mt-6 text-sm leading-7 text-ink-700">These terms apply to the website <a href={SITE_URL} className="font-semibold text-brand-700 underline">{SITE_URL}</a> and the services provided through it by VEXIM GLOBAL CO., LTD (“Vexim Trade”, “Vexim”, “we” or “us”). Please read them before submitting an enquiry, creating an account or using the supplier portal. If you do not agree, do not use these services.</p>

    <section className="mt-9 space-y-3" aria-labelledby="terms-service">
      <h2 id="terms-service" className="text-xl font-bold text-ink-900">1. What Vexim Trade provides</h2>
      <p className="text-sm leading-7 text-ink-700">Vexim Trade is a business-to-business sourcing and supplier-discovery service. Buyers can browse information and send a request for quotation (RFQ). Suppliers may submit business profiles and products for Vexim review. We may introduce parties, help compare offers and coordinate follow-up. Sending an RFQ, receiving a suggested supplier or viewing a reference price does <strong>not</strong> create an order, guarantee a quotation, or confirm a purchase or shipment. Commercial terms are agreed separately by the relevant parties in writing.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-accounts">
      <h2 id="terms-accounts" className="text-xl font-bold text-ink-900">2. Accounts and access</h2>
      <p className="text-sm leading-7 text-ink-700">You must provide accurate account details and keep your login secure. You are responsible for activity under your account and should notify us if you suspect unauthorized access. Google sign-in verifies identity for an existing permitted account or a supplier registration; it does not automatically approve supplier access, products, verification results or public listings. Vexim may review applications, request corrections, limit or suspend access where reasonably necessary to protect the service or respond to misuse.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-content">
      <h2 id="terms-content" className="text-xl font-bold text-ink-900">3. Submissions and supplier information</h2>
      <p className="text-sm leading-7 text-ink-700">You are responsible for the accuracy, legality and rights to any text, images, documents, product specifications or other materials you submit. Do not submit false certificates, misleading claims, unauthorized personal data or material you are not entitled to share. You grant Vexim permission to store, review, format and display submitted business or product content as needed to operate the service, subject to our publication controls and <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>. Internal documents are not automatically public. Vexim may decline or remove content that is inaccurate, unlawful or unsuitable for the platform.</p>
      <p className="text-sm leading-7 text-ink-700">Document checks, factory visits and delivery-history reviews are separate evaluations. A badge reflects only the specific review approved by Vexim; it is not a product certification or a guarantee of future performance. Product details, availability, prices, lead times and certifications should be confirmed with the supplier for each transaction.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-rfq">
      <h2 id="terms-rfq" className="text-xl font-bold text-ink-900">4. RFQs and introductions</h2>
      <p className="text-sm leading-7 text-ink-700">Buyers should provide genuine, reasonably complete requirements and use the RFQ service for legitimate business enquiries. Vexim may share requirements with the suppliers we contact about the request, to seek a response, while withholding direct buyer contact details until the buyer approves an introduction. We cannot promise that a particular supplier will respond, that a requested price or delivery date will be available, or that a transaction will be completed. Samples, inspections, payments, shipping and any binding commitments require separate agreement.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-conduct">
      <h2 id="terms-conduct" className="text-xl font-bold text-ink-900">5. Acceptable use and intellectual property</h2>
      <p className="text-sm leading-7 text-ink-700">Do not misuse the site, attempt unauthorized access, scrape private data, send spam, upload harmful content or interfere with other users. Vexim’s site design, brand and original content remain the property of their respective owners. You may use public listings for evaluating sourcing opportunities, but you may not copy or republish them in a misleading way. Any third-party content remains subject to its owner’s rights.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-limitations">
      <h2 id="terms-limitations" className="text-xl font-bold text-ink-900">6. Availability and limitations</h2>
      <p className="text-sm leading-7 text-ink-700">We work to keep the service accurate and available, but public information may change and technical interruptions can occur. Buyer and supplier decisions should not rely solely on website content. Nothing on the site replaces your own commercial, legal, safety or compliance checks. To the extent permitted by applicable law, Vexim is not responsible for losses arising solely from reliance on unconfirmed supplier statements, indicative prices or unavailable features. This section does not limit rights that cannot lawfully be excluded.</p>
    </section>

    <section className="mt-9 space-y-3" aria-labelledby="terms-contact">
      <h2 id="terms-contact" className="text-xl font-bold text-ink-900">7. Changes, questions and contact</h2>
      <p className="text-sm leading-7 text-ink-700">We may update these terms as the service develops and will revise the effective date when a new version is published. Use of personal information is described in the <Link href="/privacy-policy" className="font-semibold text-brand-700 underline">Privacy Policy</Link>. For questions or complaints, contact VEXIM GLOBAL CO., LTD, Hanoi, Vietnam at <a href="mailto:contact@veximglobal.com" className="font-semibold text-brand-700 underline">contact@veximglobal.com</a>. These terms are subject to applicable Vietnamese law.</p>
    </section>
  </article>;
}
