"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Factory, FileCheck2, Loader2, Mail, MapPin, Phone, ShieldCheck, Ship } from "lucide-react";

import { submitQuoteLeadAction } from "@/app/actions";
import { COMPANY } from "@/lib/config";

const PRODUCTS = [
  {
    name: "Cashew kernels W240",
    desc: "Premium large white wholes, vacuum-packed for long-haul retail contracts.",
  },
  {
    name: "Cashew kernels W320 / W450",
    desc: "Standard export grades for processing, confectionery and ingredient buyers.",
  },
  {
    name: "Split & baby kernels (SW / BB)",
    desc: "Cost-effective grades for industrial roasting and food manufacturing.",
  },
  {
    name: "Other Vietnamese produce",
    desc: "Coffee, pepper and dried fruit sourced through our approved producer network on request.",
  },
];

const PROCESS = [
  {
    icon: Mail,
    title: "1 · Enquiry",
    desc: "Tell us grade, quantity and destination. Our export desk replies within one working day.",
  },
  {
    icon: FileCheck2,
    title: "2 · Quote & PI",
    desc: "Indicative price range first, then full quotation and proforma invoice with clear Incoterms.",
  },
  {
    icon: Factory,
    title: "3 · Production & QC",
    desc: "Approved partner factories process your lot; moisture, colour and count checked per batch.",
  },
  {
    icon: Ship,
    title: "4 · Shipment & docs",
    desc: "Fumigation, phytosanitary, C/O and full shipping documents delivered with the container.",
  },
];

function Logo({ className }: { className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return (
      <span className={className}>
        <span className="block text-[22px] font-black tracking-[0.35em] text-white">VEXIM</span>
        <span className="block text-[10px] font-semibold tracking-[0.5em] text-white/60">
          EXPORT SALES
        </span>
      </span>
    );
  }
  return (
    // Logo chính thức (nền trong suốt) — đặt tại public/logo-vexim.png, giữ nguyên bản
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-vexim.png"
      alt="Vexim Trade — Export Sales"
      className={className}
      onError={() => setOk(false)}
    />
  );
}

export function LandingSite() {
  const [form, setForm] = useState({
    company: "",
    name: "",
    email: "",
    country: "",
    product: "Cashew kernels W320",
    quantity: "",
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
    <div className="min-h-screen bg-white text-slate-800">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo className="h-11 w-auto" />
          <nav className="ml-auto hidden items-center gap-5 text-[13px] font-medium text-slate-300 md:flex">
            <a href="#products" className="transition hover:text-white">Products</a>
            <a href="#process" className="transition hover:text-white">Process</a>
            <a href="#quality" className="transition hover:text-white">Quality</a>
            <a href="#contact" className="transition hover:text-white">Contact</a>
          </nav>
          <a
            href="#contact"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Request a quote
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold tracking-wide text-brand-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            A member of Vexim Global
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Vietnamese cashew &amp; agricultural products, exported to your specification.
          </h1>
          <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-slate-300">
            We work directly with approved producers and processing factories in Vietnam —
            controlling quality from raw material to container loading, with transparent
            pricing and complete export documentation for every shipment.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#contact"
              className="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-brand-700"
            >
              Request a quote
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#products"
              className="rounded-full border border-white/20 px-6 py-3 text-[14px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              View products &amp; specs
            </a>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-1 gap-6 border-t border-white/10 pt-8 sm:grid-cols-3">
            {[
              ["Factory-direct", "Approved producers & processors, audited per season"],
              ["Lot-by-lot QC", "Moisture, colour, count & packing checked before loading"],
              ["Full export docs", "Phytosanitary, fumigation, C/O and insurance per contract"],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="text-[14px] font-bold text-white">{t}</dt>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-slate-400">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- Products ---------- */}
      <section id="products" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-black tracking-tight text-ink-900">Products &amp; grades</h2>
        <p className="mt-2 max-w-2xl text-[14px] text-slate-500">
          Core export line is Vietnamese cashew kernels; other produce is sourced on request
          through the same approved network.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PRODUCTS.map((p) => (
            <div key={p.name} className="rounded-2xl border border-ink-200 bg-white p-5">
              <h3 className="text-[15px] font-bold text-ink-900">{p.name}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-slate-400">
          Packing: 22.76kg vacuum tins × 2 per carton, or 50lb / 25kg flexible bags in cartons —
          per buyer requirement. Crop-year stock, origin Vietnam.
        </p>
      </section>

      {/* ---------- Process ---------- */}
      <section id="process" className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-black tracking-tight text-ink-900">How we work</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                <s.icon className="h-5 w-5 text-brand-700" />
                <h3 className="mt-3 text-[14px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Quality ---------- */}
      <section id="quality" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-ink-900">Quality &amp; compliance</h2>
            <ul className="mt-6 space-y-3 text-[13.5px] leading-relaxed text-slate-600">
              {[
                "Moisture ≤ 5%, defect count within AFI/AQL tolerance for the contracted grade.",
                "Partner factories operate HACCP-aligned food safety programmes; audit reports available on request.",
                "Fumigation and phytosanitary certification issued for every export lot.",
                "Traceability: each carton batch is tied to its processing lot and loading inspection record.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-ink-900 p-6 text-white">
            <h3 className="text-[15px] font-bold">Backed by the Vexim Global ecosystem</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
              Vexim Trade is the export arm of Vexim Global — a Vietnamese business ecosystem
              spanning production, processing and international trade. Group backing gives our
              buyers stability in supply, financing and long-term commitments.
            </p>
            <a
              href="https://www.veximglobal.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-300 transition hover:text-brand-200"
            >
              About Vexim Global
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Quote form ---------- */}
      <section id="contact" className="border-t border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-ink-900">Request a quote</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                Send your requirement — grade, quantity, destination — and our export desk will
                reply within one working day with next steps and an indicative price range.
              </p>
              <ul className="mt-6 space-y-2.5 text-[13px] text-slate-600">
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-brand-700" />
                  {COMPANY.email}
                </li>
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-brand-700" />
                  {COMPANY.phone}
                </li>
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 text-brand-700" />
                  {COMPANY.address}
                </li>
              </ul>
            </div>

            {done ? (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
                <p className="flex items-center gap-2 text-[15px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" />
                  Enquiry received
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
                    <span className="label">Country</span>
                    <input
                      className="input"
                      value={form.country}
                      onChange={(e) => set("country", e.target.value)}
                      placeholder="Destination market"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Product</span>
                    <select
                      className="input"
                      value={form.product}
                      onChange={(e) => set("product", e.target.value)}
                    >
                      {[...PRODUCTS.map((p) => p.name), "Other / multiple"].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Quantity</span>
                    <input
                      className="input"
                      value={form.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                      placeholder="e.g. 18 MT / 1×40ft"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="label">Requirement *</span>
                  <textarea
                    className="input min-h-[110px]"
                    required
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Grade, packing, destination port, target schedule…"
                  />
                </label>
                {error && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 flex items-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send enquiry
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="bg-ink-900 text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo className="h-10 w-auto" />
            <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed">
              {COMPANY.name} · {COMPANY.address}
              <br />
              {COMPANY.phone} · {COMPANY.email}
            </p>
          </div>
          <div className="text-[12.5px]">
            <p className="font-semibold text-slate-200">Vexim Global ecosystem</p>
            <a
              href="https://www.veximglobal.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block transition hover:text-white"
            >
              www.veximglobal.com
            </a>
            <p className="mt-4 font-semibold text-slate-200">Partners &amp; staff</p>
            <a href="/login" className="mt-1 inline-block transition hover:text-white">
              Staff sign in
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[11.5px] text-slate-500">
          © {new Date().getFullYear()} {COMPANY.name} — a member of Vexim Global.
        </div>
      </footer>
    </div>
  );
}
