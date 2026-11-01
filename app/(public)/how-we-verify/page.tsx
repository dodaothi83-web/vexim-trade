import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, Factory, FileCheck2, ShieldCheck, Truck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { VERIFICATION_LEVEL_TONES, VerificationTierBadge } from "@/components/verification-tier";

export const metadata: Metadata = {
  title: { absolute: "How we verify suppliers | Vexim Trade" },
  description:
    "The three checks behind every supplier badge: registered business, production source and export track record. Approved by a Vexim reviewer, never automatically.",
  alternates: { canonical: "/how-we-verify" },
  openGraph: {
    title: "How we verify suppliers | Vexim Trade",
    description:
      "The three checks behind every supplier badge: registered business, production source and export track record. Approved by a Vexim reviewer, never automatically.",
    url: "/how-we-verify",
    siteName: "Vexim Trade",
    type: "website",
  },
};

/** Bốn lợi ích người mua nhận được; câu chữ do người phụ trách nội dung chốt. */
const BENEFITS = [
  { lead: "Less time screening.", body: "Start conversations with suppliers whose basics are already reviewed." },
  { lead: "Fewer surprises.", body: "Know whether you&apos;re dealing with the producer or a trading company, and where the goods come from." },
  { lead: "Confidence on export readiness.", body: "See which suppliers have shipped internationally before." },
  { lead: "Clear, honest signals.", body: "Each badge means one specific check passed, nothing more and nothing less." },
] as const;

export default function HowWeVerifyPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "How we verify" },
        ]}
      />

      <h1 className="mt-4 max-w-3xl text-[32px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[42px]">
        Know what&apos;s been checked before you request a quote
      </h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-700">
        Sourcing from Vietnam usually means weeks of screening: is this a real company, do they actually
        make the product, have they exported before? We check these for you, and every supplier profile
        shows exactly which checks have passed.
      </p>

      <section className="mt-10" aria-labelledby="benefits-title">
        <h2 id="benefits-title" className="text-[20px] font-bold text-ink-900">What verification gives you</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <li key={item.lead} className="flex gap-3 rounded-lg border border-ink-200 bg-white p-4">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <p className="text-[14.5px] leading-relaxed text-ink-700">
                <strong className="font-semibold text-ink-900">{item.lead}</strong> {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="checks-title">
        <h2 id="checks-title" className="text-[20px] font-bold text-ink-900">The three checks</h2>
        <ol className="mt-4 space-y-4">
          <Step n={1} icon={<ClipboardCheck className="h-5 w-5" />} title="Registered business"
            question="Is this a real, legally registered company?"
            body="We review the supplier&apos;s business registration before they can appear on Vexim Trade." />
          <Step n={2} icon={<Factory className="h-5 w-5" />} title="Production source"
            question="Who actually makes the goods?"
            body="For manufacturers and cooperatives, we review evidence of their own production facility. For trading companies, we review their contract with a partner factory, so you know where your order will be produced." />
          <Step n={3} icon={<Truck className="h-5 w-5" />} title="Export track record"
            question="Have they shipped internationally before?"
            body="We review evidence of past export shipments, a strong sign the supplier understands export documents, packing and timelines." />
        </ol>
        <p className="mt-4 text-[14.5px] leading-relaxed text-ink-700">
          Each check is independent. A supplier may show some badges and not others. Profiles still being
          reviewed are marked <VerificationTierBadge levels={[]} />.
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-ink-200 bg-white p-6 sm:p-8" aria-labelledby="people-title">
        <h2 id="people-title" className="flex items-center gap-2 text-[18px] font-bold text-ink-900">
          <ShieldCheck className="h-5 w-5 text-emerald-700" /> Reviewed by people, not automated
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">
          Every badge is approved by a Vexim reviewer. Nothing a supplier uploads is published or approved
          automatically.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-ink-200 bg-white p-6 sm:p-8" aria-labelledby="limits-title">
        <h2 id="limits-title" className="flex items-center gap-2 text-[18px] font-bold text-ink-900">
          <FileCheck2 className="h-5 w-5 text-emerald-700" /> What a badge does not cover
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">
          Badges help you shortlist with confidence. They do not guarantee product quality or a deal outcome,
          and they do not replace your own inspection, sample approval or legal review. Vexim coordinates
          quotes and samples with you throughout.
        </p>
      </section>

      <section className="mt-12 rounded-lg border border-ink-900 bg-ink-900 p-8 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Ready to source from reviewed suppliers?
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-snug sm:text-[28px]">
          Send a sourcing request. We reply within one business day.
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

/**
 * Mỗi bước một thẻ: số thứ tự, câu hỏi người mua thật sự hỏi, rồi một câu trả lời ngắn.
 * Không đi vào giấy tờ hay quy trình nội bộ, vì trang này dành cho người mua.
 */
function Step({
  n,
  icon,
  title,
  question,
  body,
}: {
  n: 1 | 2 | 3;
  icon: React.ReactNode;
  title: string;
  question: string;
  body: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${VERIFICATION_LEVEL_TONES[n].pip}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-[18px] font-bold leading-snug text-ink-900">{title}</h3>
          <p className="mt-1 text-[14px] italic leading-relaxed text-ink-600">{question}</p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-700">{body}</p>
        </div>
      </div>
    </li>
  );
}
