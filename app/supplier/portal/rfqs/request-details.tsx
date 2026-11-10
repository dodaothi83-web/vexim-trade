import type { PortalInvite } from "@/lib/supplier-portal/dashboard";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";

/** The buyer's request in the order a B2B supplier quotes from: order terms first, then
 * product requirements, then services, then the buyer's own words. Every field comes from
 * the allowlisted, sanitized projection, never from full RFQ specs. */
export function RequestDetails({ item, copy, className = "rounded-xl border border-brand-100 bg-brand-50/40 p-4 sm:p-5" }: {
  item: PortalInvite; copy: RfqsMessages["request"]; className?: string;
}) {
  const groups: Array<[string, Array<[string, string | null]>]> = [
    [copy.terms, [[copy.quantity, item.quantity], [copy.frequency, item.request.frequency],
      [copy.incoterm, item.request.incoterm], [copy.destination, item.destination], [copy.delivery, item.request.delivery]]],
    [copy.specs, [[copy.grade, item.request.grade], [copy.packaging, item.request.packaging],
      [copy.certifications, item.request.certifications]]],
  ];
  const extras = [
    item.request.wantsSamples && copy.samples,
    item.request.wantsInspection && copy.inspection,
    item.request.wantsVideoCall && copy.video,
  ].filter(Boolean);
  return <div className={className}>
    <h3 className="text-sm font-bold text-brand-900">{copy.title}</h3>
    {!item.linkedProduct && <p className="mt-2 text-[13px] leading-5 text-ink-600">{copy.noLinkedProduct}</p>}
    {groups.map(([heading, facts]) => facts.some(([, value]) => !!value) && <section key={heading} className="mt-4 first-of-type:mt-3">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-600">{heading}</h4>
      <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.filter(([, value]) => !!value).map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-[13px] text-ink-600">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-semibold text-ink-900">{value}</dd>
        </div>)}
      </dl>
    </section>)}
    {extras.length > 0 && <p className="mt-4 border-t border-brand-100 pt-3 text-sm text-ink-700">
      <span className="font-semibold">{copy.extras}</span> {extras.join(" · ")}
    </p>}
    {item.request.note && <div className="mt-4 border-t border-brand-100 pt-3">
      <h4 className="text-[12px] font-bold uppercase tracking-wide text-ink-600">{copy.note}</h4>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink-900">{item.request.note}</p>
    </div>}
  </div>;
}
