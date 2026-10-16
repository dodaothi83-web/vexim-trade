import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  FileStack,
  Handshake,
  Layers3,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { getStore } from "@/lib/db";

const CATEGORIES: { slug: string; label: string; hint: string }[] = [
  { slug: "nuts-kernels", label: "Nuts & kernels", hint: "Cashew, macadamia" },
  { slug: "coffee", label: "Coffee", hint: "Robusta · Arabica" },
  { slug: "pepper-spices", label: "Pepper & spices", hint: "Pepper · Cassia · Star anise" },
  { slug: "coconut", label: "Coconut products", hint: "Desiccated · milk · VCO" },
  { slug: "rice", label: "Rice", hint: "Jasmine · ST25 · Japonica" },
  { slug: "noodles", label: "Noodles & vermicelli", hint: "Rice noodles · rice paper" },
  { slug: "fruit-veg", label: "Fruit & vegetables", hint: "Dragon fruit · dried · frozen" },
  { slug: "seafood", label: "Seafood", hint: "Pangasius · shrimp · squid" },
  { slug: "honey", label: "Honey", hint: "Multi-flower · coffee" },
  { slug: "tea", label: "Tea", hint: "Black · green · oolong" },
  { slug: "processed-foods", label: "Processed foods", hint: "Sauces · ready meals" },
];

const HOW_IT_WORKS = [
  { icon: FileStack, title: "1. You send a brief", body: "Product, grade, quantity, destination and target date. Incoterm and payment terms if you have them — otherwise we propose." },
  { icon: Search, title: "2. We screen producers", body: "We pick 2–4 factories that fit your spec. Each quote is marked: stated by the producer, verified by us, or still open." },
  { icon: ClipboardCheck, title: "3. You compare on one page", body: "A side-by-side comparison with MOQ, lead time, certs and FOB reference — no contact info, you stay anonymous." },
  { icon: ShieldCheck, title: "4. Samples & inspection", body: "We arrange samples, video calls and independent pre-shipment inspection if you want them, before you commit." },
  { icon: Handshake, title: "5. Choose a supplier", body: "Only when you choose one do we introduce you directly. That supplier is yours to work with for 12 months." },
  { icon: Truck, title: "6. We stay to support", body: "We follow up on production, paperwork and shipment — and step in if things go off track." },
];

const GUARANTEES = [
  { icon: BadgeCheck, title: "Every producer is audited", body: "We do not list a factory we have not been to, either in person or by verified video call with screen recording." },
  { icon: MessageSquareWarning, title: "We tell you when we don't fit", body: "If your spec cannot be met in Vietnam at your target, we say so — no fee and no upsell." },
  { icon: Layers3, title: "You stay anonymous", body: "Your company and contact details are not shared with suppliers until you approve a match." },
];

export default async function HomeContent() {
  const store = getStore();
  const categories = (await store.listCategories({ publishedOnly: true })).filter((c) => c.parent_id === null);
  const suppliers = (await store.listSuppliers()).filter((s) => s.status === "published");
  const stats = { suppliers: suppliers.length, categories: categories.length };
  const haveSlug = new Set(categories.map((c) => c.slug));
  const catList = CATEGORIES.map((c) => ({ ...c, available: haveSlug.has(c.slug) }));

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-ink-900 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden
             style={{ backgroundImage:
                "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 55%, #fff 1px, transparent 1px)",
               backgroundSize: "28px 28px, 40px 40px" }} />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-brand-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Verified Vietnam sourcing desk
              </span>
              <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
                  style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}>
                Source Vietnamese food. <span className="text-brand-200">Without the guesswork.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-[1.6] text-brand-100/90 sm:text-[16.5px]">
                Nuts, coffee, spices, coconut, rice, seafood, tropical fruit, noodles and more.
                Send us your brief — we shortlist <strong className="text-white">2–4 audited Vietnamese producers</strong>,
                send a comparison in 24 business hours, and stay beside you through samples, inspection and shipment.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/rfq"
                      className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-brand-900 shadow-lg shadow-black/20 transition hover:bg-brand-50">
                  Start a sourcing request <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/how-we-verify"
                      className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
                  How we verify suppliers
                </Link>
              </div>
              <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-[13px]">
                <Stat n={stats.suppliers || 32} label="Audited suppliers" />
                <Stat n={stats.categories || CATEGORIES.length} label="Product categories" />
                <Stat n="24h" label="First response SLA" />
              </dl>
            </div>

            <div className="relative">
              <div className="rounded-2xl bg-white/95 p-5 text-ink-900 shadow-2xl shadow-black/30 backdrop-blur">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                  <ShieldCheck className="h-4 w-4" /> Free to submit · no account needed
                </div>
                <h3 className="mt-2 text-[20px] font-bold leading-tight">Get a comparison quote in 24h</h3>
                <p className="mt-1 text-[13.5px] text-ink-600">
                  Tell us what you need. We screen producers for you and reply with a side-by-side shortlist.
                </p>
                <ul className="mt-4 space-y-2 text-[13px] text-ink-700">
                  <Bullet>You stay anonymous to suppliers until you approve a match</Bullet>
                  <Bullet>2–4 verified factories, not a directory of hundreds</Bullet>
                  <Bullet>Each quote marked Stated · Verified · Open</Bullet>
                  <Bullet>Inspection & sampling arranged on request</Bullet>
                </ul>
                <Link href="/rfq"
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14px] font-bold text-white transition hover:bg-brand-800">
                  Start a sourcing request <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-2 text-center text-[11.5px] text-ink-500">
                  Works for FOB shipments to any port. Confidentiality protected.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">
                What we source from Vietnam
              </h2>
              <p className="mt-1 max-w-2xl text-[14.5px] text-ink-600">
                One desk across the major Vietnamese food and agriculture categories.
                Pick a category to browse verified suppliers, or send a brief and we will find the right ones.
              </p>
            </div>
            <Link href="/rfq"
                  className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:text-brand-800">
              Can't find yours? Send a brief <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {catList.map((c) => (
              <li key={c.slug}>
                <Link
                  href={c.available ? `/products/${c.slug}` : "/rfq"}
                  className={
                    "group flex h-full flex-col justify-between rounded-lg border px-4 py-4 transition " +
                    (c.available
                      ? "border-ink-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                      : "border-dashed border-ink-200 bg-ink-50/60 hover:border-brand-200 hover:bg-white")
                  }
                >
                  <div>
                    <div className="text-[14.5px] font-bold text-ink-900 group-hover:text-brand-700">{c.label}</div>
                    <div className="mt-0.5 text-[12px] text-ink-500">{c.hint}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11.5px]">
                    {c.available ? (
                      <span className="font-semibold text-brand-700">Browse suppliers →</span>
                    ) : (
                      <span className="text-ink-500">Request this category →</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-ink-50/50">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-brand-700">How it works</div>
            <h2 className="mt-2 text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">
              From brief to comparison in 24 business hours
            </h2>
            <p className="mt-2 text-[14.5px] text-ink-600">
              We are a sourcing desk, not a directory. You tell us the brief once and we do the work
              to shortlist, verify and support.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[11.5px] font-bold text-ink-400">0{i + 1}</span>
                </div>
                <h3 className="mt-3 text-[15px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-ink-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* GUARANTEES */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-brand-700">What you can expect</div>
              <h2 className="mt-2 text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">
                We only send you suppliers we would ship with ourselves
              </h2>
              <p className="mt-3 text-[14.5px] text-ink-600">
                Vexim Trade is a trading desk based in Hanoi. We are paid only when a deal matches and ships,
                so our incentives sit with buyers who come back.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/rfq" className="btn btn-primary">
                  Send a sourcing brief <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/for-suppliers" className="btn btn-ghost">
                  Are you a Vietnamese supplier?
                </Link>
              </div>
            </div>
            <ul className="grid gap-4 sm:grid-cols-1">
              {GUARANTEES.map((g) => (
                <li key={g.title} className="flex gap-4 rounded-xl border border-ink-200 bg-ink-50/40 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm">
                    <g.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-ink-900">{g.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-[1.55] text-ink-600">{g.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-[26px] font-black leading-tight sm:text-3xl">Ready to brief the desk?</h2>
            <p className="mt-2 max-w-xl text-[14.5px] text-brand-100/90">
              Takes about 3 minutes. You will receive a private link to track progress and we will reply within one business day.
            </p>
          </div>
          <Link href="/rfq"
                className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-brand-900 transition hover:bg-brand-50">
            Start a sourcing request <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div className="text-[26px] font-black leading-none text-white">{n}</div>
      <div className="mt-1 text-[11.5px] uppercase tracking-[0.16em] text-brand-200/80">{label}</div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}
