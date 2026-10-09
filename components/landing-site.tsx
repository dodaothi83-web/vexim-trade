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
            <a href="#work" className="transition hover:text-white">How we represent</a>
            <a href="#start" className="transition hover:text-white">What we represent</a>
          </nav>
          <a
            href="#send"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Ask about a product
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-semibold tracking-wide text-brand-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Veximtrade · a Vexim Global company
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
            We represent Vietnamese food producers.
            <span className="text-brand-300"> We tell you what is confirmed.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            Veximtrade handles export sales for selected Vietnamese producers. When a product
            reaches your team, you should know three things: what the producer states, what we
            have verified, and what is still open.
          </p>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            Then you decide whether to talk to the producer. That decision stays with you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#send"
              className="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-brand-700"
            >
              Ask about a product
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#work"
              className="rounded-full border border-white/20 px-6 py-3 text-[14px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              How we represent producers
            </a>
          </div>
        </div>
      </section>

      {/* ---------- The real cost ---------- */}
      <section id="cost" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          The real cost of a new supplier is the questions nobody answered.
        </h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="space-y-4 text-[15px] leading-relaxed text-slate-600">
            <p>
              A product sheet is not an answer. The price, the spec, the season and the paperwork
              each arrive one email at a time.
            </p>
            <p>
              Each unclear point sends your team back to the producer, then back to the inbox.
              That loop takes the weeks, not the price.
            </p>
            <p className="font-semibold text-ink-900">
              We keep that loop on our side of the table, and we label every answer with its
              source.
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

      {/* ---------- How we represent ---------- */}
      <section id="work" className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
            We represent the producer. You are the one we talk to.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Veximtrade is the sales desk for the producers we represent. We know what they make,
            how it is packed, and what they can provide. We do not present a product as verified
            until we have checked it.
          </p>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {HOW_WE_LABEL.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                <s.icon className="h-5 w-5 text-brand-700" />
                <h3 className="mt-3 text-[14.5px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-[1.25fr_1fr]">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">What a reply contains</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                A sample layout, not a real producer profile. Every reply separates what is stated
                from what is verified.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                {REPLY_CONTENTS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">What we ask you for</p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                <li>Product and the spec you need.</li>
                <li>Quantity and destination port.</li>
                <li>Delivery window and Incoterm.</li>
                <li>Certificates your market requires.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- What we represent ---------- */}
      <section id="start" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          What we represent.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          From cashew kernels and coffee to pepper and dried fruit, we represent selected
          Vietnamese food producers. For each product we represent, we work directly with the
          producer to understand its specifications, grades, seasonality, packing and export
          requirements. We share what the producer states, what we have checked, and what still
          needs confirmation. That way, buyers can assess each offer with clarity.
        </p>
        <p className="mt-5 text-[13px] text-slate-500">
          Veximtrade is part of the Vexim Global ecosystem in Hanoi.{" "}
          <a
            href="https://www.veximglobal.com/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-700 transition hover:underline"
          >
            About Vexim Global
          </a>
        </p>
      </section>

      {/* ---------- Form ---------- */}
      <section id="send" className="border-t border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
                Ask about one product.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Tell us the product and the spec. Within one working day we reply with what is
                stated, what is verified, what is still open, and the next step.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
                No portal and no subscription. If the answer is not yet this season, we say so
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
                  Send request
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
              We represent the producer. We tell you what is confirmed.
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
          © {new Date().getFullYear()} Veximtrade | VEXIM GLOBAL CO., LTD
        </div>
      </footer>
    </div>
  );
}
