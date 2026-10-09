"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
} from "lucide-react";

import { submitQuoteLeadAction } from "@/app/actions";
import { COMPANY } from "@/lib/config";

/**
 * Landing viết từ vị trí đại diện: Veximtrade là đơn vị bán hàng xuất khẩu cho
 * nhà sản xuất Việt Nam đã chọn. Buyer được nói chuyện trực tiếp với Vexim, nhưng
 * luôn thấy rõ: nhà sản xuất nói gì, Vexim đã xác minh gì, và điều gì còn mở.
 * Giọng điệu: ngắn, rõ, không phô trương, quyết định thuộc về buyer.
 */

const HOW_IT_WORKS = [
  {
    title: "You tell us what you need",
    desc: "Product, spec or grade, volume, destination port, delivery window and Incoterm. The more precise, the faster we match.",
  },
  {
    title: "We review the brief",
    desc: "We check it against the producers we represent, and against what they can supply in the season you need.",
  },
  {
    title: "We tell you what we found",
    desc: "A producer that fits, with what is stated, what is verified and what is still open. Or a plain answer that no fit exists yet.",
  },
];

const OPEN_QUESTIONS = [
  "Is the spec on the sheet the one that will actually ship?",
  "Which season and which lot does this price come from?",
  "What paperwork can the producer provide, and when?",
  "What is the minimum order, and how is it packed?",
];

const HOW_WE_LABEL = [
  {
    icon: Info,
    title: "Stated by the producer",
    desc: "Specs, capacity and certificates the producer gives us. We mark them as stated, not checked.",
  },
  {
    icon: CheckCircle2,
    title: "Verified by us",
    desc: "Items we checked against documents or records. Each one shows what it was checked against.",
  },
  {
    icon: Search,
    title: "Still open",
    desc: "Points we have not confirmed yet. We list them, so you can ask before you rely on them.",
  },
];

const REPLY_CONTENTS = [
  "Product: grade, spec and packing, as stated by the producer.",
  "Verified: the items we confirmed, with the document or record behind each one.",
  "Open: what still needs an answer before you rely on it.",
  "Availability: the volume and season we can confirm for the period.",
  "Next step: a call with the producer, or a plain “not yet this season.”",
];


const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "DAP", "DDP", "Not sure yet"];
const PAYMENT_METHODS = ["T/T", "L/C", "D/P", "D/A", "Open account", "Not sure yet"];

/**
 * Logo chính thức giữ NGUYÊN bản file public/logo-vexim.png (canvas 1024² với viền
 * trong suốt dày). Đo bounding box phần có nội dung (748×553, tâm 50.3%/46.0%) rồi
 * crop phần viền bằng background-size/position ở lớp HIỂN THỊ, không sửa file.
 * Hộp chứa phải đúng tỉ lệ nội dung 1.3526 (cao 44px → rộng ~60px).
 */
const LOGO_BG: React.CSSProperties = {
  backgroundImage: "url(/logo-vexim.png)",
  backgroundSize: "136.9% auto",
  backgroundPosition: "51.3% 41.3%",
  backgroundRepeat: "no-repeat",
};

function Logo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Vexim Trade, Export Sales"
      className={className}
      style={LOGO_BG}
    />
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
    <div className="min-h-screen bg-white text-slate-800">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <Logo className="h-12 w-[65px] shrink-0" />
          <nav className="ml-auto hidden items-center gap-5 text-[13px] font-medium text-slate-300 md:flex">
            <a href="#cost" className="transition hover:text-white">Why it costs time</a>
            <a href="#work" className="transition hover:text-white">How it works</a>
            <a href="#start" className="transition hover:text-white">Who we represent</a>
          </nav>
          <a
            href="#send"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Tell us what you are sourcing
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-ink-900 text-white">
        <img
          src="/images/hero-abstract.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/70 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold tracking-wide text-brand-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Veximtrade · a Vexim Global company
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            Finding the right Vietnamese producer should not take your whole quarter.
          </h1>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            Tell us what you need: the product, the spec, the volume and the port. We review your
            brief and connect you with a suitable Vietnamese producer where one is available.
          </p>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            Where no producer fits, we tell you so. You keep your time.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#send"
              className="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-brand-700"
            >
              Tell us what you are sourcing
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#work"
              className="rounded-full border border-white/20 px-6 py-3 text-[14px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* ---------- The real cost ---------- */}
      <section id="cost" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          An unmatched supplier costs you a week. Usually more.
        </h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="space-y-4 text-[15px] leading-relaxed text-slate-600">
            <p>
              A list of suppliers is not a match. Each name brings another email, another spec
              sheet, another call that goes nowhere.
            </p>
            <p>
              Your team pays for that search in hours that should have gone to the one producer
              who fits. That is the cost nobody puts on the budget.
            </p>
            <p className="font-semibold text-ink-900">
              We do the matching before your team is involved.
            </p>
          </div>
          <div>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Questions we answer before they reach you
            </p>
            <ul className="space-y-3">
              {OPEN_QUESTIONS.map((t) => (
                <li key={t} className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-white px-4 py-3 text-[13.5px] leading-relaxed text-slate-600">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="work" className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
            You send the brief. We do the matching.
          </h2>
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                <p className="text-[12px] font-semibold text-slate-400">Step {i + 1}</p>
                <h3 className="mt-2 text-[14.5px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{s.desc}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">What a reply contains</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                Every reply separates what the producer states from what we have verified.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                {REPLY_CONTENTS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">What helps us match faster</p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                <li>Product and the spec or grade you need.</li>
                <li>Volume, destination port and delivery window.</li>
                <li>Incoterm and payment method you expect.</li>
                <li>Certificates your market requires.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Who we represent ---------- */}
      <section id="start" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <img
          src="/images/section-abstract.jpg"
          alt=""
          aria-hidden="true"
          className="mb-10 h-44 w-full rounded-2xl object-cover sm:h-56"
        />
        <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          We are not a directory. We represent a selected group of producers.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          From cashew kernels and coffee to pepper and dried fruit, we represent selected
          Vietnamese food producers. For each product we represent, we work directly with the
          producer to understand its specifications, grades, seasonality, packing and export
          requirements. We share what the producer states, what we have checked, and what still
          needs confirmation. That way, buyers can assess each offer with clarity.
        </p>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          We do not hold every product, and we will not pretend to. If your product is outside
          what we represent, we say so in our reply.
        </p>
      </section>

      {/* ---------- Form ---------- */}
      <section id="send" className="border-t border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                Tell us what you need.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Describe the product, the spec, the volume and where it goes. Within one working day
                we reply with what is stated, what is verified, what is still open, and the next step.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
                No portal and no subscription. If we cannot find a fit this season, we say so
                plainly.
              </p>
              <ul className="mt-7 space-y-2.5 text-[13px] text-slate-600">
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
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="bg-ink-900 text-slate-400">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo className="h-10 w-[54px] shrink-0" />
            <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed">
              Veximtrade | VEXIM GLOBAL CO., LTD
              <br />
              {COMPANY.address}
              <br />
              {COMPANY.phone} · {COMPANY.email}
            </p>
            <p className="mt-3 text-[12.5px] italic text-slate-500">
              We match the brief. The decision stays with you.
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
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://www.linkedin.com/company/vexim-global/posts/?feedView=all"
                target="_blank"
                rel="noreferrer"
                aria-label="Vexim Global on LinkedIn"
                title="LinkedIn"
                className="block transition hover:opacity-80"
              >
                <img src="/linkedin.png" alt="" width={32} height={32} className="h-8 w-8" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61568290953268"
                target="_blank"
                rel="noreferrer"
                aria-label="Vexim Global on Facebook"
                title="Facebook"
                className="block transition hover:opacity-80"
              >
                <img src="/facebook.png" alt="" width={32} height={32} className="h-8 w-8" />
              </a>
            </div>
            <p className="mt-4 font-semibold text-slate-200">Partners &amp; staff</p>
            <a href="/login" className="mt-1 inline-block transition hover:text-white">
              Staff sign in
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[11.5px] text-slate-500">
          © {new Date().getFullYear()} Veximtrade | VEXIM GLOBAL CO., LTD
        </div>
      </footer>
    </div>
  );
}
