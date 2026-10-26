import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, ClipboardCheck, Factory, FileCheck2, ShieldCheck } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import { listPublicSuppliers } from "@/lib/public/catalog";

export const metadata: Metadata = {
  title: { absolute: "How we verify suppliers | Vexim Trade" },
  description:
    "Three evidence-based supplier checks: documents, factory verification, and completed delivery history review.",
  alternates: { canonical: "/how-we-verify" },
  openGraph: {
    title: "How we verify suppliers | Vexim Trade",
    description:
      "Three evidence-based supplier checks: documents, factory verification, and completed delivery history review.",
    url: "/how-we-verify",
    siteName: "Vexim Trade",
    type: "website",
  },
};

export default async function HowWeVerifyPage() {
  // Một hồ sơ thật đã công khai để buyer tự xem huy hiệu; trang vẫn nguyên vẹn khi chưa có hồ sơ nào.
  const example = await listPublicSuppliers().catch(() => []).then((list) =>
    list.find((s) => !s.is_demo && s.approved_verification_steps.length > 0) ?? list.find((s) => !s.is_demo) ?? null);
  const exampleHref = example ? `/suppliers/${encodeURIComponent(example.slug || example.id)}` : null;

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
        Each badge describes one check our team has approved. The three checks are independent of each other.
        A supplier may pass the delivery history review without factory verification. A profile with no approved checks is marked as under audit.
      </p>

      <section className="mt-8 rounded-lg border border-ink-200 bg-white p-6 sm:p-8" aria-label="Verification badges">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-900"><ShieldCheck className="h-5 w-5 text-emerald-700" /> The badges on a supplier profile</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">
          These are the badges used on supplier profiles. A badge is shown only after an authorised reviewer has approved that check.
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-2"><VerificationPips levels={[1, 2, 3]} /><VerificationTierBadge levels={[1, 2, 3]} /></p>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[14.5px] text-ink-700">
          A profile with no approved checks yet: <VerificationTierBadge levels={[]} />
        </p>
        {example && exampleHref && (
          <p className="mt-4 text-[14.5px] text-ink-700">
            See the badges on a live profile:{" "}
            <Link href={exampleHref} className="font-semibold text-brand-700 underline hover:text-brand-800">
              {example.display_name || example.name}
            </Link>
          </p>
        )}
      </section>

      <ol className="mt-12 space-y-6">
        <Step n={1} icon={<ClipboardCheck className="h-5 w-5" />} title="Document review"
          body="We review the supplier's business registration, tax code and other applicable documents. The result and the supporting evidence are recorded for each supplier." />
        <Step n={2} icon={<Factory className="h-5 w-5" />} title="Factory verification"
          body="Where an on-site visit is relevant, a team member records the factory location, facilities and visual evidence from the visit." />
        <Step n={3} icon={<FileCheck2 className="h-5 w-5" />} title="Delivery history review"
          body="We check evidence of a completed shipment or delivery independently of factory verification. Trading companies may pass this review without owning a factory. A won enquiry alone is not proof of delivery." />
      </ol>

      <section className="mt-12 rounded-lg border border-ink-200 bg-white p-6 sm:p-8" aria-label="Supplier evidence submission">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-900">
          <Camera className="h-5 w-5 text-emerald-700" /> Suppliers submit original evidence first
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">
          Before our team reviews checks 2 and 3, the supplier can submit evidence from their own supplier portal:
          nine original factory photographs (gate, warehouses, running production line, packing, carton with lot label,
          hygiene station, protective gear, pest control) and export documents such as bills of lading and customs
          declarations, or public source links.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-ink-700">
          <li>Key photos must show a handwritten Vexim verification code we issue, so the shots cannot be reused from elsewhere.</li>
          <li>We keep the original files and read camera metadata to flag forwarded, edited, off-daylight or location-mismatched photos.</li>
          <li>Automated scanning helps our reviewers prioritise, but a badge is only shown after a Vexim reviewer has approved the check. Nothing is approved or published automatically.</li>
        </ul>
      </section>

      <figure className="mt-12 overflow-hidden rounded-xl border border-ink-200">
        <div className="relative aspect-[16/9] w-full bg-ink-50 sm:aspect-[21/9]">
          <Image
            src="/images/home/review-desk.jpg"
            alt="Inspection checklist and product samples"
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
          />
        </div>
        <figcaption className="bg-ink-50 px-3 py-2 text-xs text-ink-600">Verification results are recorded separately for each supplier.</figcaption>
      </figure>

      <section className="mt-12 rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-900"><ShieldCheck className="h-5 w-5 text-emerald-700" /> What a badge does not mean</h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-700">A badge records that one check was approved. It does not:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-ink-700">
          <li>Guarantee product quality or the outcome of any deal.</li>
          <li>Sign contracts or make payments on your behalf.</li>
          <li>Replace your own inspection or legal review.</li>
        </ul>
      </section>

      <section className="mt-14 rounded-lg border border-ink-900 bg-ink-900 p-8 text-white">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Ready to source from reviewed suppliers?
        </p>
        <h2 className="mt-2 text-[24px] font-bold leading-snug sm:text-[28px]">
          Send a sourcing request. We reply in one business day.
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
  n: 1 | 2 | 3;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="rounded-lg border border-ink-200 bg-white p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-start">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-white">
            {icon}
          </div>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-700">Check {n}</p>
          <h3 className="mt-1 text-[20px] font-bold text-ink-900">{title}</h3>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-700">{body}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-600">
            Shown on the profile as: <VerificationPips levels={[n]} />
          </p>
        </div>
      </div>
    </li>
  );
}
