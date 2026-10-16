import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Factory, FileCheck2, PackageCheck, ShieldCheck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "How we verify suppliers | Veximtrade",
  description:
    "Our 4-step factory verification: business license check, on-site visit, production & certificate review, and ongoing monitoring.",
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
        Every supplier published on Veximtrade goes through a documented verification by our Hanoi
        desk. Levels reflect how deep we have checked — so you know exactly what the badge means.
      </p>

      <ol className="mt-12 space-y-10">
        <Step
          n={1}
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Document review"
          body={
            <>
              We collect the business registration certificate, tax code, export license (when applicable)
              and primary product range. Documents are cross-checked against government registries and
              certificate issuers.
            </>
          }
        />
        <Step
          n={2}
          icon={<Factory className="h-5 w-5" />}
          title="On-site factory visit"
          body={
            <>
              A Vexim inspector visits the factory, records a short video walkthrough, photographs the
              production line, warehouse and packaging area, and confirms the address matches the
              registration. Two staff from our team must sign off the report (4-eyes rule).
            </>
          }
        />
        <Step
          n={3}
          icon={<PackageCheck className="h-5 w-5" />}
          title="Production, MOQ & pricing check"
          body={
            <>
              We verify actual monthly capacity, lead times, MOQ ranges and sample availability against
              what is published. Prices shown publicly (if any) are shown only with the supplier&apos;s
              written consent.
            </>
          }
        />
        <Step
          n={4}
          icon={<FileCheck2 className="h-5 w-5" />}
          title="Sample & certificate audit"
          body={
            <>
              Where relevant, we check food safety, organic, HACCP, BRC or other certificates directly
              with the issuer and pull production samples for basic QC before we publish a Level&nbsp;2
              supplier profile.
            </>
          }
        />
      </ol>

      <section className="mt-14 rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-900">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          Verification levels
        </h2>
        <ul className="mt-5 space-y-4 text-[14.5px] text-ink-700">
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
              L0
            </span>
            <span>
              <strong className="text-ink-900">Documents received, not yet audited.</strong> The supplier
              has submitted an application; profile is shown only after internal review and never with
              the Verified badge.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-emerald-50 px-2 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
              L1
            </span>
            <span>
              <strong className="text-ink-900">Factory verified.</strong> Documents confirmed and
              on-site visit completed by a Vexim inspector.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full bg-emerald-700 px-2 text-[11px] font-bold text-white">
              L2
            </span>
            <span>
              <strong className="text-ink-900">Factory + certificates + samples audited.</strong> Highest
              standard; capacity, certificates and samples re-checked by a second reviewer.
            </span>
          </li>
        </ul>
        <p className="mt-6 text-[13px] text-ink-500">
          Verification is point-in-time. We re-verify active suppliers at least once a year and suspend
          profiles that fail a re-check.
        </p>
      </section>

      <section className="mt-14 rounded-lg border border-ink-900 bg-ink-900 p-8 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Ready to source from verified factories?
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-snug sm:text-[28px]">
          Send a sourcing request — we reply in one business day.
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/rfq"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-900 hover:bg-ink-100"
          >
            Start a sourcing request <ArrowRight className="h-4 w-4" />
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
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Step {n}</p>
        <h3 className="mt-1 text-[20px] font-bold text-ink-900">{title}</h3>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-700">{body}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Signed off by two Vexim staff before publishing
        </p>
      </div>
    </li>
  );
}
