import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Globe2, Lock, ShieldCheck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "For suppliers – Get listed on Veximtrade",
  description:
    "Vietnamese manufacturers and exporters: apply to be listed on Veximtrade. We verify your factory, handle international buyer RFQs and manage payments.",
};

export default function ForSuppliersPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "For suppliers" },
        ]}
      />

      <h1
        className="mt-4 text-[38px] font-bold leading-tight text-ink-900 sm:text-[46px]"
        style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', letterSpacing: "-0.01em" }}
      >
        For Vietnamese suppliers
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-700">
        We work directly with manufacturers, processors and licensed exporters in Vietnam. We verify
        your factory, bring qualified international buyers and manage the sourcing desk — so you can
        focus on production and quality.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        <Benefit
          icon={<Globe2 className="h-5 w-5" />}
          title="Qualified international buyers"
          body="We pre-qualify every RFQ: company check, MX record validation, Turnstile anti-bot and internal spam scoring before it reaches you."
        />
        <Benefit
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Verified badge & trust"
          body="Pass our on-site verification and appear with a Factory-verified badge buyers trust. Profiles are indexed publicly as soon as we reach 10+ verified listings."
        />
        <Benefit
          icon={<Lock className="h-5 w-5" />}
          title="You control what is public"
          body="Pricing and factory video are only shown after you sign a written consent. Default profile hides FOB pricing and contact details."
        />
      </div>

      <section className="mt-14">
        <h2 className="text-[22px] font-bold text-ink-900">How it works</h2>
        <ol className="mt-5 space-y-5 text-[15px] text-ink-700">
          <StepItem
            n="1"
            title="Submit your application"
            body="Send us your company details, main products and factory address. Your profile starts in draft."
          />
          <StepItem
            n="2"
            title="We review documents and visit your factory"
            body="Our Hanoi desk checks your business registration and schedules a short on-site visit (Level 1) or full audit (Level 2)."
          />
          <StepItem
            n="3"
            title="Go live and receive RFQs"
            body="Published profiles receive matched RFQs via our desk. We handle buyer communication in English, send you a short brief and coordinate samples."
          />
          <StepItem
            n="4"
            title="Orders, introductions & follow-up"
            body="When a buyer selects you we introduce both sides under a 12-month protection window and help with contracts, inspection and shipment follow-up."
          />
        </ol>
      </section>

      <section className="mt-14 rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
        <h3 className="flex items-center gap-2 text-[17px] font-bold text-ink-900">
          <FileText className="h-5 w-5 text-brand-700" />
          What we need from you
        </h3>
        <ul className="mt-4 grid gap-2 text-[14px] text-ink-700 sm:grid-cols-2">
          {[
            "Business registration & tax code",
            "Factory address and main contact",
            "Main product list, MOQ and lead time",
            "Port(s) and Incoterms you usually ship",
            "Export certificates (HACCP, BRC, organic…) if any",
            "Company overview / English profile (we can help draft)",
          ].map((it) => (
            <li key={it} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" />
              {it}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 rounded-lg border border-ink-900 bg-ink-900 p-8 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Apply to be listed
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-snug sm:text-[28px]">
          Start your supplier application.
        </h2>
        <p className="mt-2 max-w-2xl text-[14.5px] text-white/80">
          We are currently onboarding cashew (and adjacent food) suppliers in Vietnam. Other categories
          are reviewed on a rolling basis.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="mailto:sales@veximtrade.com?subject=Supplier%20application"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-900 hover:bg-ink-100"
          >
            Email sales@veximtrade.com <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/how-we-verify"
            className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            How we verify
          </Link>
        </div>
        <p className="mt-4 text-[12px] text-white/60">
          The self-serve application form is coming soon. For now, please email us directly so our desk
          can start your profile.
        </p>
      </section>
    </div>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
        {icon}
      </div>
      <p className="mt-4 text-[15px] font-bold text-ink-900">{title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-600">{body}</p>
    </div>
  );
}

function StepItem({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-[13px] font-bold text-white">
        {n}
      </div>
      <div>
        <p className="text-[15px] font-semibold text-ink-900">{title}</p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-ink-600">{body}</p>
      </div>
    </li>
  );
}
