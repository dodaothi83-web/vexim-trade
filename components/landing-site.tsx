"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
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
 * Landing viết theo đúng bản chất Veximtrade rút từ chuỗi email outreach:
 * buyer không thiếu nhà cung cấp, họ thiếu thời gian sàng lọc. Vexim làm
 * "first pass" ở Việt Nam để danh sách đến tay buyer chỉ còn vài nguồn đáng
 * trao đổi. Giọng điệu: mạch lạc, cụ thể, không hứa hẹn phô trương.
 */

const SCREENING_WORK = [
  "Checking whether the company is real: registry, history, people.",
  "Reading specs and deciding if the product actually matches your market.",
  "Chasing export history: who they shipped to, how often, how it ended.",
  "Quotations, samples, import requirements. Again, for every new source.",
];

const WHAT_WE_DO = [
  {
    icon: Search,
    title: "We find the candidates",
    desc: "On the ground in Vietnam, in the categories we know, not from a web search at midnight.",
  },
  {
    icon: FileCheck2,
    title: "We check what matters",
    desc: "Production capacity, product and spec fit, export history, and the requirements your market will ask about.",
  },
  {
    icon: ShieldCheck,
    title: "We keep filtering",
    desc: "Until what reaches your inbox is a short list worth a conversation, or an honest “not yet, this season”.",
  },
];

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
            <a href="#cost" className="transition hover:text-white">The real cost</a>
            <a href="#work" className="transition hover:text-white">What we do</a>
            <a href="#start" className="transition hover:text-white">Where we start</a>
          </nav>
          <a
            href="#send"
            className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-700 md:ml-0"
          >
            Send a requirement
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
            Finding suppliers in Vietnam is easy.
            <span className="text-brand-300"> Knowing which ones deserve your team’s time is not.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            Every new source arrives with homework: company records, specs, export history,
            quotations, samples, import requirements. Multiply that by ten sources and most of
            the month goes to <strong className="font-semibold text-white">filtering</strong>, not
            deciding.
          </p>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            We do that part. The first pass, on the ground in Vietnam, before a supplier ever
            reaches your inbox.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#send"
              className="flex items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-[14px] font-bold text-white transition hover:bg-brand-700"
            >
              Send us one requirement
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#work"
              className="rounded-full border border-white/20 px-6 py-3 text-[14px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              See what we take off your plate
            </a>
          </div>
        </div>
      </section>

      {/* ---------- The real cost ---------- */}
      <section id="cost" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="max-w-2xl text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          Sourcing has a line item nobody budgets for: the screening.
        </h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="space-y-4 text-[15px] leading-relaxed text-slate-600">
            <p>
              The price on the quotation is not the whole cost. Before there is a price, there is
              the search, and the search is where the weeks go.
            </p>
            <p>
              Do it for every new product and the screening becomes the project. Your team did not
              join to read registries all quarter.
            </p>
            <p className="font-semibold text-ink-900">
              That is the work we built Veximtrade to absorb.
            </p>
          </div>
          <ul className="space-y-3">
            {SCREENING_WORK.map((t) => (
              <li key={t} className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-white px-4 py-3 text-[13.5px] leading-relaxed text-slate-600">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- What we do ---------- */}
      <section id="work" className="border-y border-ink-100 bg-ink-50/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
            We are not a directory. There is nothing to browse.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            You send a requirement. We work the Vietnam side, searching, vetting, checking,
            and return what your team can actually use: a short list worth talking to, or a
            straight answer that now is not the season. Either way, the decision stays yours.
          </p>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {WHAT_WE_DO.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                <s.icon className="h-5 w-5 text-brand-700" />
                <h3 className="mt-3 text-[14.5px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-ink-900 p-6 text-white">
            <p className="text-[15px] leading-relaxed">
              <strong className="font-bold">The deal, in one sentence:</strong> we spend the weeks
              on the first pass so your team spends its hours on the few sources that deserve a
              conversation, and you remain the one who decides.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-[1.25fr_1fr]">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">What the first pass returns</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                An illustrative format, not a real supplier profile or completed verification.
                We share what was checked, what remains open, and the evidence behind each point.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                <li>
                  <span className="font-semibold text-ink-900">Company:</span> verified legal name
                  and registration source.
                </li>
                <li>
                  <span className="font-semibold text-ink-900">Export history:</span> markets and
                  available supporting records.
                </li>
                <li>
                  <span className="font-semibold text-ink-900">Product fit:</span> grades and specs
                  checked against your requirement.
                </li>
                <li>
                  <span className="font-semibold text-ink-900">Capacity:</span> confirmed volume
                  and the basis for that figure.
                </li>
                <li>
                  <span className="font-semibold text-ink-900">Open points:</span> gaps or risks
                  still needing an answer.
                </li>
                <li>
                  <span className="font-semibold text-ink-900">Next step:</span> worth a conversation,
                  or not yet.
                </li>
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <p className="text-[13px] font-bold text-ink-900">
                What we check
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
                <li>Company identity and registration details.</li>
                <li>Product specifications against your requirement.</li>
                <li>Export history and the records available to support it.</li>
                <li>What is confirmed, what is not, and what needs follow-up.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Where we start ---------- */}
      <section id="start" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-black tracking-tight text-ink-900">Where our network runs deepest</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            [
              "Cashew kernels",
              "W240, W320, W450, splits: grades, packing, crop seasons and lot-level QC we know by name.",
            ],
            [
              "Vietnamese produce",
              "Coffee, pepper, dried fruit and more, sourced through the same vetted producer network.",
            ],
            [
              "Your category, next",
              "The method is category-agnostic. Credibility is earned per category, and we tell you honestly where we are today.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-ink-200 bg-white p-5">
              <h3 className="text-[14.5px] font-bold text-ink-900">{t}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[13px] text-slate-500">
          Backed by the Vexim Global ecosystem in Hanoi: production, processing and international
          trade under one roof.{" "}
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
                Start with one product.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
                Tell us what you are sourcing. Within one working day we will look at the Vietnam
                side and tell you whether there is a source worth your time, and what the first
                pass found.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
                No portal, no subscription, no pressure. If Vietnam is not the answer this season,
                we will say so plainly. Keep our contact for the next one.
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
                  Requirement received
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
                    placeholder="Product or category, e.g. cashew kernels W320"
                  />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.6fr]">
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
                    <span className="label">Anything else we should know</span>
                    <textarea
                      className="input min-h-[64px]"
                      value={form.message}
                      onChange={(e) => set("message", e.target.value)}
                      placeholder="Grade or spec, packing, delivery schedule, Incoterm, target price"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                  Only company, email and product are required. Market or destination, quantity,
                  grade or spec, packing, delivery schedule, Incoterm and target price are optional,
                  but they help us make a sharper first pass.
                </p>
                {error && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 flex items-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send it over
                </button>
                <p className="mt-2 text-[11.5px] text-slate-400">
                  One working day for a first look. Your details stay with our export desk.
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
              We do the first pass, so your team can do the deciding.
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
