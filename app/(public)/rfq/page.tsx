import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "Request a quote | Veximtrade",
  description: "Send a sourcing request — our export desk replies in one business day.",
  robots: { index: false, follow: true },
};

export default function RfqPlaceholder() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Request a quote" },
        ]}
      />
      <h1
        className="mt-4 text-[34px] font-bold leading-tight text-ink-900 sm:text-[42px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        Request a quote
      </h1>
      <p className="mt-4 text-[15.5px] leading-relaxed text-ink-700">
        Our 3-step sourcing request form is being finalised (Turnstile, spam scoring, MX check,
        shortlist builder). For now, please email our desk directly and we will reply within one
        business day.
      </p>
      <div className="mt-8 rounded-lg border border-ink-200 bg-white p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          Contact our export desk
        </p>
        <a
          href="mailto:sales@veximtrade.com?subject=Sourcing%20request"
          className="mt-2 block text-[18px] font-semibold text-ink-900 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900"
        >
          sales@veximtrade.com
        </a>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-600">
          Please include: product + grade, quantity, destination port, target price (if any) and your
          company website.
        </p>
      </div>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to categories
      </Link>
    </div>
  );
}
