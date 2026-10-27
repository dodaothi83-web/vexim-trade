import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Globe2, Lock, ShieldCheck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

export const metadata: Metadata = {
  title: "For suppliers – Get listed on Veximtrade",
  description:
    "Vietnamese manufacturers and trading companies: register your supplier profile. Independent document checks, factory verification and delivery history reviews are confirmed by Vexim staff.",
  alternates: { canonical: "/for-suppliers" },
  openGraph: {
    title: "For suppliers – Get listed on Vexim Trade",
    description:
      "Vietnamese manufacturers and trading companies: register your supplier profile. Independent document checks, factory verification and delivery history reviews are confirmed by Vexim staff.",
    url: "/for-suppliers",
    siteName: "Vexim Trade",
    type: "website",
  },
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
        We work with manufacturers, cooperatives and trading companies in Vietnam. Start with a document review; factory verification and a delivery history review can be requested independently when relevant.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        <Benefit
          icon={<Globe2 className="h-5 w-5" />}
          title="Qualified international buyers"
          body="We pre-qualify every RFQ: company check, MX record validation, an invisible anti-bot challenge and internal spam scoring before it reaches you."
        />
        <Benefit
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Verified badge & trust"
          body="Each approved review earns its own badge. A trading company can show reviewed delivery history without claiming factory verification."
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
            title="Create an account, then submit your company profile"
            body="Sign up with email or Google. In your locked supplier dashboard, enter company details and upload documents for Vexim review. Account creation alone does not create or publish a supplier page."
          />
          <StepItem
            n="2"
            title="Our staff reviews your documents"
            body="Vexim separately decides when to enable your dashboard tools. Document checks, factory verification and delivery-history reviews are conducted independently by authorised staff; none passes automatically when you upload files."
          />
          <StepItem
            n="3"
            title="Go live and receive RFQs"
            body="Once Vexim separately approves publication and prepares buyer-ready products, published profiles can receive matched RFQs via our desk. We coordinate buyer communication and samples."
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
            "Main contact and business address",
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
            href="/supplier/register"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-semibold text-ink-900 hover:bg-ink-100"
          >
            Create supplier account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/how-we-verify"
            className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            How we verify
          </Link>
        </div>
        <p className="mt-4 text-[12px] text-white/60">
          Create an account and confirm your email first (or continue with Google). Then complete your company profile in the supplier dashboard; Vexim will review it before enabling portal tools.
        </p>
        <p className="mt-3 text-[13px] text-white/80">
          Already have an account?{" "}
          <Link href="/login" prefetch={false} className="font-semibold text-white underline underline-offset-2 hover:text-white/80">
            Sign in
          </Link>
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
