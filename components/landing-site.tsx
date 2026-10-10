"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { submitQuoteLeadAction } from "@/app/actions";
import { COMPANY } from "@/lib/config";
import { Logo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";

/**
 * Landing dành cho buyer Mỹ: nhìn là hiểu. Tiêu đề lớn, chữ serif cho tiêu đề,
 * sơ đồ thay cho đoạn văn dài, và màu có nghĩa (xanh = đã kiểm tra, vàng = còn mở,
 * xám = nhà sản xuất nêu). Giọng văn ngắn, rõ, không dấu chấm than.
 */

const HEADING: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  letterSpacing: "-0.01em",
};

const OPEN_QUESTIONS = [
  "Is the spec on the sheet the one that will actually ship?",
  "Which season and which lot does this price come from?",
  "What paperwork can the producer provide, and when?",
  "What is the minimum order, and how is it packed?",
];

const HOW_IT_WORKS = [
  {
    title: "You send the brief",
    desc: "Product, spec or grade, volume, destination port, delivery window and Incoterm.",
  },
  {
    title: "We match it",
    desc: "We check the brief against the producers we represent and what they can supply in your season.",
  },
  {
    title: "You get a clear answer",
    desc: "A producer that fits, with what is stated and what is verified. Or a plain no for now.",
  },
];

const REPLY_KEY = [
  {
    tone: "stated",
    title: "Stated",
    desc: "What the producer tells us: specs, capacity, certificates.",
  },
  {
    tone: "verified",
    title: "Verified",
    desc: "What we have checked against documents or records. Each point shows its source.",
  },
  {
    tone: "open",
    title: "Still open",
    desc: "What is not confirmed yet. We list it, so you can ask before you rely on it.",
  },
];

const TONE: Record<string, { bar: string; chip: string; label: string }> = {
  stated: { bar: "bg-slate-400", chip: "bg-slate-100 text-slate-700", label: "Stated" },
  verified: { bar: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-800", label: "Verified" },
  open: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800", label: "Open" },
};

const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP", "Not sure yet"];
const PAYMENT_METHODS = ["T/T", "L/C", "D/P", "D/A", "Open account", "Not sure yet"];

function FunnelDiagram() {
  const rows = [
    { w: "w-full", label: "Many suppliers, unverified" },
    { w: "w-4/5", label: "Screening: records, specs, history" },
    { w: "w-3/5", label: "Questions back and forth" },
    { w: "w-2/5", label: "Producers that fit your brief" },
  ];
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {rows.map((r, i) => (
        <div key={r.label} className="flex justify-center">
          <div
            className={`${r.w} rounded-lg px-4 py-3 text-center text-[14px] font-semibold ${
              i === rows.length - 1 ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700"
            }`}
          >
            {r.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LandingSite() {
  const [form, setForm] = useState({
    company: "",
    name: "",
    email: "",
    country: "",
    product: "",
    quantity: "",
    incoterm: "",
    payment_method: "",
    lead_time: "",
    message: "",
    company_website: "",
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
    const res = await submitQuoteLeadAction(form);
    setBusy(false);
    if (res.ok) setDone(res.message);
    else setError(res.message);
  }

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3 sm:px-8">
          <Logo className="h-12 w-[65px] shrink-0" />
          <nav className="ml-auto hidden items-center gap-7 text-[15px] font-medium text-ink-700 md:flex">
            <a href="#problem" className="transition hover:text-brand-700">The problem</a>
            <a href="#work" className="transition hover:text-brand-700">How it works</a>
            <a href="#start" className="transition hover:text-brand-700">Who we represent</a>
          </nav>
          <a
            href="#send"
            className="ml-auto flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Start a sourcing request
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold text-brand-700">
            <ShieldCheck className="h-4 w-4" />
            Veximtrade · a Vexim Global company
          </p>
          <h1
            className="mt-6 text-5xl font-bold leading-[1.05] text-ink-900 sm:text-6xl"
            style={HEADING}
          >
            Finding the right Vietnamese producer should not take your whole quarter.
          </h1>
          <p className="mt-7 max-w-xl text-[19px] leading-relaxed text-ink-700">
            Send us your brief. We match it to a Vietnamese producer that fits, and tell you
            plainly when none does.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="#send"
              className="flex items-center gap-2 rounded-md bg-brand-600 px-7 py-4 text-[16px] font-semibold text-white transition hover:bg-brand-700"
            >
              Start a sourcing request
              <ArrowRight className="h-5 w-5" />
            </a>
            <a
              href="#work"
              className="rounded-md border-2 border-ink-900 px-7 py-3.5 text-[16px] font-semibold text-ink-900 transition hover:bg-ink-900 hover:text-white"
            >
              See how it works
            </a>
          </div>
        </div>
        <div className="relative">
          <img
            src="/images/hero-scene.jpg"
            alt=""
            aria-hidden="true"
            className="aspect-[5/4] w-full rounded-2xl object-cover"
          />
        </div>
      </section>

      {/* ---------- The problem, in one picture ---------- */}
      <section id="problem" className="bg-ink-50">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-4xl font-bold leading-tight text-ink-900 sm:text-5xl" style={HEADING}>
              An unmatched supplier costs you a week. Usually more.
            </h2>
            <p className="mt-6 text-[18px] leading-relaxed text-ink-700">
              A list of suppliers is not a match. Each name brings another email, another spec
              sheet and another call that goes nowhere.
            </p>
            <p className="mt-4 text-[18px] leading-relaxed text-ink-700">
              Your team pays for that search in hours that should have gone to the one producer
              who fits.
            </p>
            <ul className="mt-8 space-y-3">
              {OPEN_QUESTIONS.map((t) => (
                <li key={t} className="flex items-start gap-3 text-[16px] leading-snug text-ink-800">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-ink-200 sm:p-8">
            <p className="mb-5 text-[13px] font-bold uppercase tracking-wider text-ink-500">
              Where the weeks go
            </p>
            <FunnelDiagram />
            <p className="mt-6 border-t border-ink-100 pt-5 text-[16px] font-semibold text-ink-900">
              We do the screening first. You see the one that fits.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="work" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="text-4xl font-bold leading-tight text-ink-900 sm:text-5xl" style={HEADING}>
          You send the brief. We do the matching.
        </h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border-2 border-ink-900 p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-[20px] font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-6 text-[24px] font-bold leading-snug text-ink-900" style={HEADING}>
                {s.title}
              </h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-700">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- What the reply looks like ---------- */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-4xl font-bold leading-tight sm:text-5xl" style={HEADING}>
            Every reply tells you what is stated, what is verified, and what is still open.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {REPLY_KEY.map((k) => (
              <div key={k.title} className="rounded-2xl bg-white p-7 text-ink-900">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-bold ${TONE[k.tone].chip}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${TONE[k.tone].bar}`} />
                  {TONE[k.tone].label}
                </span>
                <h3 className="mt-5 text-[24px] font-bold" style={HEADING}>{k.title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-700">{k.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Who we represent ---------- */}
      <section id="start" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <img
          src="/images/producers-section.jpg"
          alt=""
          aria-hidden="true"
          className="mb-14 h-56 w-full rounded-2xl object-cover object-[center_40%] sm:h-80"
        />
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <h2 className="text-4xl font-bold leading-tight text-ink-900 sm:text-5xl" style={HEADING}>
            We are not a directory. We represent a selected group of producers.
          </h2>
          <div className="space-y-5 text-[18px] leading-relaxed text-ink-700">
            <p>
              From cashew kernels and coffee to pepper and dried fruit, we represent selected
              Vietnamese food producers. We work directly with each one on specifications, grades,
              seasonality, packing and export requirements.
            </p>
            <p>
              We do not hold every product, and we will not pretend to. If your product is outside
              what we represent, we say so in our reply.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Form ---------- */}
      <section id="send" className="bg-ink-50">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <h2 className="text-4xl font-bold leading-tight text-ink-900 sm:text-5xl" style={HEADING}>
              Tell us what you need.
            </h2>
            <p className="mt-6 text-[18px] leading-relaxed text-ink-700">
              Describe the product, the spec, the volume and where it goes. Within one working day
              (Vietnam time, UTC+7) we reply with what is stated, what is verified, what is still
              open, and the next step.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-600">
              No portal and no subscription. If we cannot find a fit this season, we say so plainly.
            </p>
            <ul className="mt-8 space-y-3 text-[16px] text-ink-800">
              <li className="flex items-center gap-3"><Mail className="h-5 w-5 text-brand-700" />{COMPANY.email}</li>
              <li className="flex items-center gap-3"><Phone className="h-5 w-5 text-brand-700" />{COMPANY.phone}</li>
              <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />{COMPANY.address}</li>
            </ul>
          </div>

          {done ? (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
                <p className="flex items-center gap-2 text-[15px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                  Request received
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-emerald-900">{done}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="rounded-2xl bg-white p-6 ring-1 ring-ink-200">
                {/* Honeypot chống bot: người thật không thấy ô này */}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Company *</span>
                    <input
                      className="input"
                      required
                      value={form.company}
                      onChange={(e) => set("company", e.target.value)}
                      placeholder="Your company name"
                    />
                  </label>
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
                    <span className="label">Email *</span>
                    <input
                      className="input"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="name@company.com"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Your market</span>
                    <input
                      className="input"
                      value={form.country}
                      onChange={(e) => set("country", e.target.value)}
                      placeholder="e.g. United States, EU, Korea"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="label">What are you sourcing? *</span>
                  <input
                    className="input"
                    required
                    value={form.product}
                    onChange={(e) => set("product", e.target.value)}
                    placeholder="Product, grade or spec"
                  />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Quantity (if known)</span>
                    <input
                      className="input"
                      value={form.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                      placeholder="e.g. 18 MT / 1×40ft"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Quote basis (Incoterm)</span>
                    <select
                      className="input"
                      value={form.incoterm}
                      onChange={(e) => set("incoterm", e.target.value)}
                    >
                      <option value="">Select</option>
                      {INCOTERMS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Payment method</span>
                    <select
                      className="input"
                      value={form.payment_method}
                      onChange={(e) => set("payment_method", e.target.value)}
                    >
                      <option value="">Select</option>
                      {PAYMENT_METHODS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Lead time required</span>
                    <input
                      className="input"
                      value={form.lead_time}
                      onChange={(e) => set("lead_time", e.target.value)}
                      placeholder="e.g. 30 days after order"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="label">Anything else we should know</span>
                  <textarea
                    className="input min-h-[64px]"
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Grade or spec, packing, delivery window, destination port, certificates you need"
                  />
                </label>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                  Only company, email and product are required. The other fields are optional, but
                  they help us give you a sharper first reply.
                </p>
                {error && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 flex items-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Submit sourcing request
                </button>
                <p className="mt-2 text-[11.5px] text-slate-400">
                  One working day for the first reply. Your details stay with our export desk.
                </p>
              </form>
            )}

        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <SiteFooter />
    </div>
  );
}
