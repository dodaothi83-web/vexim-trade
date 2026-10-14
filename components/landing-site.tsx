"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Quote,
} from "lucide-react";

import { submitQuoteLeadAction } from "@/app/actions";
import { Logo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";

/**
 * Landing page — "Dossier" variant (B).
 *
 * Văn phong và bố cục khớp với mẫu trên Arena.site: serif heading, bảng thay cho
 * thẻ card, chip Stated / Verified / Open màu cố định (xám/xanh/vàng), không ảnh
 * hero lớn, không banner. Form liên hệ giữ nguyên backend (submitQuoteLeadAction)
 * và giữ honeypot chống bot.
 *
 * Design A ("Classic" — funnel/4 stages màu mè) được thay bằng layout này.
 */

const HEADING: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  letterSpacing: "-0.01em",
};

const PRODUCTS = ["Cashew", "Coffee", "Pepper", "Dried fruit"] as const;
const PRODUCT_OPTIONS = ["", "Cashew", "Coffee", "Pepper", "Dried fruit", "Other"];

type Tone = "stated" | "verified" | "open";
const TONE: Record<Tone, { dot: string; chip: string; label: string }> = {
  stated: {
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    label: "Stated",
  },
  verified: {
    dot: "bg-emerald-600",
    chip: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
    label: "Verified",
  },
  open: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    label: "Open",
  },
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE[tone].chip}`}>
      <span className={`h-2 w-2 rounded-full ${TONE[tone].dot}`} />
      {children}
    </span>
  );
}

const SHORTLIST: { point: string; tone: Tone }[] = [
  { point: "Business registration", tone: "verified" },
  { point: "Spec sheet", tone: "stated" },
  { point: "Food safety certificate", tone: "verified" },
  { point: "Price, season and lot", tone: "open" },
  { point: "MOQ and packing", tone: "stated" },
];

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Will the spec on the sheet be the one that ships?",
    a: "Spec is agreed in a signed spec sheet before samples.",
  },
  {
    q: "Which season and lot is this price from?",
    a: "Every price shows its season and lot, or is marked Open.",
  },
  {
    q: "What paperwork can the producer provide, and when?",
    a: "Certificates are checked against the document, source shown.",
  },
  {
    q: "What is the minimum order and how is it packed?",
    a: "MOQ and packing are confirmed in writing first.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Send your brief.",
    desc: "Product, spec, volume, destination and the date you need the goods.",
    out: "You receive: a brief we both confirm in writing.",
  },
  {
    n: 2,
    title: "We screen and shortlist.",
    desc: "Every point is marked Stated, Verified or Open.",
    out: "You receive: a shortlist you can check.",
  },
  {
    n: 3,
    title: "Samples and talks.",
    desc: "Spec signed before samples ship. We coordinate meetings and send a written summary after each. Factory visit is optional.",
    out: "You receive: a signed spec sheet and a summary after every meeting.",
  },
  {
    n: 4,
    title: "Before and after shipment.",
    desc: "Optional independent inspection. Dates are estimates until confirmed.",
    out: "You receive: inspection results and documents as they are issued.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "We needed a cashew supplier with documentation our compliance team could audit. Veximtrade\u2019s shortlist showed which certificates were verified and which were still open, so we knew exactly what to ask before the first call.",
    name: "Anna Keller",
    role: "Procurement Director, Brightfield Foods Import",
    country: "Germany",
  },
  {
    quote:
      "No fluff. They told us which of our specs the producer could meet and which it couldn\u2019t. That saved us two rounds of samples.",
    name: "Marcus Lee",
    role: "Sourcing Manager, Harbor & Oak Provisions (private-label brand)",
    country: "United States",
  },
  {
    quote:
      "I assumed another middleman. What changed my mind was the fee disclosure, and that I could call the producer directly. I did. Everything matched.",
    name: "Omar Haddad",
    role: "Owner, Delta Gate Distribution",
    country: "UAE",
  },
  {
    quote:
      "Brief to shortlist in 4 days. Three producers, two matched our grade and packing. First container shipped in 6 weeks.",
    name: "Sofia Marin",
    role: "Trader, Linden Trade Partners",
    country: "Netherlands",
  },
  {
    quote:
      "It was our first time buying from Vietnam, and I was nervous. The written summary after every meeting kept me calm. I always knew what was agreed and what was still open.",
    name: "Emily Carter",
    role: "Founder, Maple Lane Pantry",
    country: "Australia",
  },
];

const RULES = [
  "Business registration is checked before a producer is shown to any buyer.",
  "Certificates and capacity are verified against documents where we can.",
  "A producer that fails screening is not shown, whatever its fee. One that misleads a buyer is removed.",
];

const PROMISES = [
  { label: "Sign direct", desc: "You sign the contract with the producer." },
  { label: "Call any producer", desc: "You may contact any producer we introduce." },
  { label: "No mark-up", desc: "Your price is the producer\u2019s price." },
];

export function LandingSite() {
  const [form, setForm] = useState({
    company: "",
    name: "",
    email: "",
    country: "",
    product: "",
    productOther: "",
    quantity: "",
    message: "",
    // Giữ các field cũ để server action không báo lỗi thiếu type
    incoterm: "" as string,
    payment_method: "" as string,
    lead_time: "" as string,
    company_website: "" as string,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const product =
      form.product === "Other" && form.productOther.trim()
        ? form.productOther.trim()
        : form.product;
    const res = await submitQuoteLeadAction({
      company: form.company,
      name: form.name,
      email: form.email,
      country: form.country,
      product,
      quantity: form.quantity,
      incoterm: form.incoterm || undefined,
      payment_method: form.payment_method || undefined,
      lead_time: form.lead_time || undefined,
      message: form.message,
      company_website: form.company_website,
    });
    setBusy(false);
    if (res.ok) setDone(res.message);
    else setError(res.message);
  }

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* ---------- Top bar / product strip ---------- */}
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-5 py-3.5 sm:px-8">
          <Logo className="h-9 w-[49px] shrink-0" />
          <span className="hidden text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500 sm:block">
            Veximtrade
          </span>
          <nav className="ml-auto flex items-center gap-1.5 text-[13px] text-ink-600">
            {PRODUCTS.map((p, i) => (
              <span key={p} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-300">·</span>}
                <span className="transition hover:text-ink-900">{p}</span>
              </span>
            ))}
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto max-w-5xl px-5 pb-10 pt-14 sm:px-8 sm:pt-20">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          {PRODUCTS.join(" · ")}
        </p>
        <h1
          className="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] text-ink-900 sm:text-[52px] sm:leading-[1.08]"
          style={HEADING}
        >
          Verified Vietnamese food producers, matched to your brief.
        </h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-relaxed text-ink-700">
          Cashew, coffee, pepper and dried fruit. Send your spec, volume and destination. In 3–5
          working days you get a shortlist where every claim is marked{" "}
          <Chip tone="stated">Stated</Chip> <Chip tone="verified">Verified</Chip> or{" "}
          <Chip tone="open">Open</Chip>.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#request"
            className="inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-ink-800"
          >
            Start a sourcing request
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#sample"
            className="inline-flex items-center gap-2 rounded-md border border-ink-300 px-5 py-3 text-[14px] font-semibold text-ink-800 transition hover:border-ink-900 hover:text-ink-900"
          >
            See a sample shortlist
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-5 text-[13px] text-ink-500">
          Free for buyers · Written reply by the next business day · No portal, no subscription
        </p>
      </section>

      {/* ---------- Sample shortlist card ---------- */}
      <section id="sample" className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <div className="rounded-lg border border-ink-200">
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3 text-[13px] text-ink-500">
            <span className="font-semibold text-ink-700">Shortlist · Cashew W320</span>
            <span>Day 4</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {SHORTLIST.map((row) => (
              <li
                key={row.point}
                className="flex items-center justify-between gap-4 px-5 py-3.5 text-[14.5px]"
              >
                <span className="text-ink-800">{row.point}</span>
                <Chip tone={row.tone}>{TONE[row.tone].label}</Chip>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-200 px-5 py-2.5 text-[12px] italic text-ink-400">
            Illustrative example
          </div>
        </div>
      </section>

      {/* ---------- The problem ---------- */}
      <section className="border-t border-ink-200">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              The problem
            </p>
            <h2
              className="mt-4 text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
              style={HEADING}
            >
              An unmatched supplier costs you a week. Usually more.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
              A list of suppliers is not a match. Every name adds another email, spec sheet and
              call that goes nowhere. We answer four questions before you see a name.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-ink-200">
            <table className="w-full text-left text-[14.5px]">
              <thead className="bg-ink-50 text-[12px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">The question</th>
                  <th className="px-5 py-3 font-semibold">Our answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {QUESTIONS.map((row) => (
                  <tr key={row.q} className="align-top">
                    <td className="px-5 py-4 text-ink-900">{row.q}</td>
                    <td className="px-5 py-4 text-ink-600">{row.a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
          <p className="border-t border-ink-200 pt-6 text-[15px] font-semibold text-ink-900">
            We do the screening first. You see the producers that fit.
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="border-t border-ink-200">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            How it works
          </p>
          <h2
            className="mt-4 text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
            style={HEADING}
          >
            From your brief to the shipment, in four steps.
          </h2>
          <ol className="mt-10 grid gap-0 overflow-hidden rounded-lg border border-ink-200 sm:grid-cols-2">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="border-b border-ink-200 p-6 last:border-b-0 sm:border-r sm:border-ink-200 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-[13px] font-bold text-ink-400">{s.n}</span>
                  <h3 className="text-[20px] font-bold leading-snug text-ink-900" style={HEADING}>
                    {s.title}
                  </h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{s.desc}</p>
                <p className="mt-4 text-[13px] font-semibold text-ink-900">{s.out}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Founder ---------- */}
      <section className="border-t border-ink-200">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[240px_1fr]">
          <div>
            {/* Chân dung founder chưa có asset — để khung chữ theo tỉ lệ đứng, đúng như
                thiết kế mẫu đánh dấu "Portrait to be added". */}
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md border border-dashed border-ink-300 bg-ink-50 text-[11px] uppercase tracking-wider text-ink-400">
              LH portrait
            </div>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              Founder
            </p>
          </div>
          <div>
            <h2
              className="text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
              style={HEADING}
            >
              The person behind every shortlist.
            </h2>
            <p className="mt-4 text-[15px] font-semibold text-ink-800">
              Luong Van Hoc · Founder, Veximtrade · Vexim Global
            </p>
            <blockquote className="mt-6 border-l-2 border-ink-900 pl-5 text-[17px] leading-relaxed text-ink-800">
              <Quote className="-ml-1 mb-1 h-5 w-5 text-ink-400" aria-hidden="true" />
              I spent 15 years across Vietnam&rsquo;s cashew / coffee / pepper trade. I kept
              seeing buyers lose weeks to suppliers whose claims nobody had checked. I started
              Veximtrade to fix that. Every shortlist that leaves our desk carries my name.
            </blockquote>
            <p className="mt-6 text-[13px] text-ink-500">
              Luong Van Hoc · VEXIM GLOBAL CO., LTD · Tax code 0111040294 · Hanoi, Vietnam
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Testimonials ---------- */}
      <section className="border-t border-ink-200">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Buyers
          </p>
          <h2
            className="mt-4 text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
            style={HEADING}
          >
            What buyers say.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col justify-between rounded-lg border border-ink-200 p-6"
              >
                <blockquote className="text-[15.5px] leading-relaxed text-ink-800">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 border-t border-ink-100 pt-4">
                  <p className="text-[14.5px] font-bold text-ink-900">{t.name}</p>
                  <p className="text-[13px] text-ink-600">{t.role}</p>
                  <p className="text-[12px] text-ink-400">{t.country}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Fees & producer selection ---------- */}
      <section className="border-t border-ink-200">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Fees and producer selection
          </p>
          <h2
            className="mt-4 text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
            style={HEADING}
          >
            Free for buyers. Honest about who pays.
          </h2>
          <div className="mt-6 space-y-5 text-[16px] leading-relaxed text-ink-700">
            <p>
              Producers pay Veximtrade a fixed fee / a commission on shipped orders for
              representation. We are not a neutral adviser, so we publish our rules:
            </p>
            <ul className="space-y-3">
              {RULES.map((r) => (
                <li key={r} className="flex items-start gap-3 text-[15.5px] text-ink-800">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  {r}
                </li>
              ))}
            </ul>
            <p>
              You sign directly with the producer, you may contact any producer we introduce, and
              your price is the producer&rsquo;s price with no mark-up.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {PROMISES.map((p) => (
              <div
                key={p.label}
                className="flex-1 min-w-[180px] rounded-lg border border-ink-200 px-5 py-4"
              >
                <p className="text-[14.5px] font-bold text-ink-900">{p.label}</p>
                <p className="mt-1 text-[13px] text-ink-600">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Form ---------- */}
      <section id="request" className="border-t border-ink-200 bg-ink-50">
        <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              Start here
            </p>
            <h2
              className="mt-4 text-3xl font-bold leading-tight text-ink-900 sm:text-[40px] sm:leading-tight"
              style={HEADING}
            >
              Tell us what you need.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
              Describe the product, spec, volume and destination. You get a written reply by the
              start of your next business day: what is stated, verified and open, and the next
              step. Only company, email and product are required.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Chip tone="stated">Stated</Chip>
              <Chip tone="verified">Verified</Chip>
              <Chip tone="open">Open</Chip>
            </div>
            <p className="mt-4 text-[13px] text-ink-500">
              Free for buyers · No portal, no subscription
            </p>
          </div>

          {done ? (
            <div className="rounded-lg border border-emerald-300 bg-white p-6">
              <p className="flex items-center gap-2 text-[15px] font-bold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                Request received
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-emerald-900">{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-lg border border-ink-200 bg-white p-6">
              {/* Honeypot chống bot */}
              <input
                type="text"
                value={form.company_website}
                onChange={(e) => set("company_website", e.target.value)}
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">
                    Company <span className="text-red-600">*</span>
                  </span>
                  <input
                    className="input"
                    required
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                    placeholder="Your company"
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Email <span className="text-red-600">*</span>
                  </span>
                  <input
                    className="input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="name@company.com"
                  />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="label">
                  Product <span className="text-red-600">*</span>
                </span>
                <select
                  className="input"
                  required
                  value={form.product}
                  onChange={(e) => set("product", e.target.value)}
                >
                  {PRODUCT_OPTIONS.map((opt) => (
                    <option key={opt || "empty"} value={opt}>
                      {opt || "Select a product"}
                    </option>
                  ))}
                </select>
              </label>
              {form.product === "Other" && (
                <label className="mt-3 block">
                  <span className="label">Which product?</span>
                  <input
                    className="input"
                    value={form.productOther}
                    onChange={(e) => set("productOther", e.target.value)}
                    placeholder="e.g. cinnamon, coconut, frozen fruit"
                  />
                </label>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Your name</span>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Contact person"
                  />
                </label>
                <label className="block">
                  <span className="label">Volume</span>
                  <input
                    className="input"
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    placeholder="e.g. 18 MT / 1×40ft"
                  />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="label">Destination</span>
                <input
                  className="input"
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                  placeholder="e.g. Germany, USA, UAE"
                />
              </label>
              <label className="mt-4 block">
                <span className="label">Spec and packing</span>
                <textarea
                  className="input min-h-[92px]"
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Grade, packing, certificates you need, destination port, timeline"
                />
              </label>
              {error && (
                <p className="mt-3 text-[13px] font-semibold text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink-900 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-ink-800 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Start a sourcing request
              </button>
              <p className="mt-3 text-[12.5px] text-ink-500">
                Free for buyers · Written reply by the next business day
              </p>
            </form>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
