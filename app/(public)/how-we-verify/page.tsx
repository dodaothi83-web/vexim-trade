import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Factory, FileCheck2, ShieldCheck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "How we verify suppliers | Veximtrade",
  description:
    "Three evidence-based supplier checks: documents, on-site factory visit, and completed delivery history review.",
  alternates: { canonical: "/how-we-verify" },
  openGraph: {
    title: "How we verify suppliers | Vexim Trade",
    description:
      "Three evidence-based supplier checks: documents, on-site factory visit, and completed delivery history review.",
    url: "/how-we-verify",
    siteName: "Vexim Trade",
    type: "website",
  },
};

export default function HowWeVerifyPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "How we verify" },
        ]}
      />

      <h1
        className="mt-4 text-[38px] font-bold leading-tight text-ink-900 sm:text-[46px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        How we verify suppliers
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-700">
        Each badge describes one check our team has approved. A supplier may pass delivery history without a factory visit. A profile with no approved checks says “Under audit”.
      </p>

      <ol className="mt-12 space-y-10">
        <Step n={1} icon={<ClipboardCheck className="h-5 w-5" />} title="Document review" body="We review the supplier's registration and applicable documents, recording the result and supporting evidence. An authorised reviewer approves the check." />
        <Step n={2} icon={<Factory className="h-5 w-5" />} title="On-site factory visit" body="Where an on-site visit is relevant, our team records facility photos and any available visit details. An authorised reviewer checks the evidence." />
        <Step n={3} icon={<FileCheck2 className="h-5 w-5" />} title="Delivery history review" body="We check evidence of a completed shipment or delivery independently of a factory visit. Trading companies may pass this review without owning a factory. A won enquiry alone is not proof of delivery." />
      </ol>

      <section className="mt-14 rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-900"><ShieldCheck className="h-5 w-5 text-emerald-700" /> What the badge means</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">A supplier receives one badge per approved check. Document review, factory visit and delivery history are independent; passing delivery review does not imply a factory visit. Profiles without an approved review are marked as under audit.</p>
      </section>

      <section className="mt-14 rounded-lg border border-ink-900 bg-ink-900 p-8 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Ready to source from reviewed suppliers?
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-snug sm:text-[28px]">
          Send a sourcing request — we reply in one business day.
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/rfq"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-900 hover:bg-ink-100"
          >
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            Browse categories
          </Link>
        </div>
      </section>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <div className="flex items-start">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-white">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Check {n}</p>
        <h3 className="mt-1 text-[20px] font-bold text-ink-900">{title}</h3>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-700">{body}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Approved by an authorised reviewer before a badge is shown
        </p>
      </div>
    </li>
  );
}
