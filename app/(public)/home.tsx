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
  User,
} from "lucide-react";

import { getStore } from "@/lib/db";
import { COMPANY } from "@/lib/config";

const CATEGORIES: { slug: string; label: string }[] = [
  { slug: "cashew", label: "Cashew" },
  { slug: "pepper", label: "Pepper" },
  { slug: "coffee", label: "Coffee" },
  { slug: "rice", label: "Rice" },
  { slug: "coconut", label: "Coconut" },
  { slug: "cinnamon", label: "Cassia cinnamon" },
  { slug: "star-anise", label: "Star anise" },
  { slug: "dragon-fruit", label: "Dragon fruit" },
  { slug: "dried-fruit", label: "Dried fruit" },
  { slug: "shrimp", label: "Shrimp" },
  { slug: "pangasius", label: "Pangasius" },
  { slug: "noodles", label: "Noodles" },
];

const HOW_IT_WORKS = [
  {
    icon: FileStack,
    title: "1. Tell us what you need",
    body: "Product, grade, quantity, destination and when you need it. If you're unsure about Incoterms or payment terms, we'll suggest what's usual.",
  },
  {
    icon: Search,
    title: "2. We find suppliers that fit",
    body: "We contact producers we know and check them before they reach you.",
  },
  {
    icon: ClipboardCheck,
    title: "3. Compare quotes side by side",
    body: "Price, MOQ, lead time and certificates on one page. You decide who to talk to.",
  },
  {
    icon: ShieldCheck,
    title: "4. Samples, order and shipment",
    body: "We arrange samples and inspection if you want them, then follow the order until it ships.",
  },
];

const PROMISES = [
  { icon: BadgeCheck, title: "We visit before we list.", body: "A supplier only gets our Factory audited badge after someone from our team has been to the factory." },
  { icon: Search, title: "We're clear about what we've checked.", body: "Every quote shows which details we've confirmed and which come from the supplier." },
  { icon: Layers3, title: "Your details stay private.", body: "Suppliers see your requirements, not your contact information, until you decide to go ahead." },
  { icon: Handshake, title: "We stay with your order.", body: "Our team follows it through production, paperwork and shipment." },
];

export default async function HomeContent() {
  const store = getStore();
  const allCategories = (await store.listCategories({ publishedOnly: true }));
  const supCount = (await store.listSuppliers()).filter((s) => s.status === "published").length;
  const haveSlug = new Set(allCategories.map((c) => c.slug));

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-ink-900 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 55%, #fff 1px, transparent 1px)",
            backgroundSize: "28px 28px, 40px 40px",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-start">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-brand-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Sourcing from Vietnam
              </span>
              <h1
                className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-[56px]"
                style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
              >
                Buy from Vietnamese producers you can trust
              </h1>
              <p className="mt-5 max-w-xl text-[15.5px] leading-[1.6] text-brand-100/90 sm:text-[17px]">
                Cashew, pepper, coffee, rice and more. Tell us what you need and we'll come back within one business day
                with 2 to 4 suppliers that fit. Our team checks every one of them first.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/rfq"
                  className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-brand-900 shadow-lg shadow-black/20 transition hover:bg-brand-50"
                >
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/how-we-verify"
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10"
                >
                  See how we check suppliers
                </Link>
              </div>
              {supCount > 0 && (
                <div className="mt-8 border-t border-white/15 pt-5 text-[13px] text-brand-100/80">
                  We've visited and audited <strong className="text-white">{supCount}</strong> factories across Vietnam.
                </div>
              )}
            </div>

            {/* Quote card */}
            <div className="relative">
              <div className="rounded-2xl bg-white/95 p-5 text-ink-900 shadow-2xl shadow-black/30 backdrop-blur">
                <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                  <ShieldCheck className="h-4 w-4" /> Get quotes from checked suppliers
                </div>
                <h3 className="mt-2 text-[20px] font-bold leading-tight">Tell us what you need</h3>
                <p className="mt-1 text-[13.5px] text-ink-600">Free, and no account needed.</p>
                <ul className="mt-4 space-y-2 text-[13.5px] text-ink-700">
                  <Bullet>Suppliers won't see your company name until you choose to talk to them.</Bullet>
                  <Bullet>You get 2 to 4 options that match your specs.</Bullet>
                  <Bullet>Each quote shows what we've checked ourselves and what the supplier has told us.</Bullet>
                  <Bullet>We can arrange samples and pre-shipment inspection.</Bullet>
                </ul>
                <Link
                  href="/rfq"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-3 text-[14px] font-bold text-white transition hover:bg-brand-800"
                >
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-2 text-center text-[11.5px] text-ink-500">You can write in your own language.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="categories" className="border-b border-ink-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">What we source</h2>
              <p className="mt-1 max-w-2xl text-[14.5px] text-ink-600">
                Pick a category to see suppliers. If you can't find what you're looking for, tell us and we'll look for it.
              </p>
            </div>
            <Link
              href="/rfq"
              className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:text-brand-800"
            >
              Looking for something else? <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {CATEGORIES.map((c) => {
              const exists = haveSlug.has(c.slug);
              return (
                <li key={c.slug}>
                  <Link
                    href={exists ? `/products/${c.slug}` : "/rfq"}
                    className={
                      "group flex h-full items-center justify-between rounded-lg border px-4 py-4 transition " +
                      (exists
                        ? "border-ink-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                        : "border-dashed border-ink-200 bg-ink-50/60 hover:border-brand-200 hover:bg-white")
                    }
                  >
                    <span className="text-[14.5px] font-semibold text-ink-900 group-hover:text-brand-700">
                      {c.label}
                    </span>
                    <span className="text-[11.5px] font-semibold text-brand-700">
                      {exists ? "Browse suppliers →" : "Request quotes →"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-ink-50/50">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-brand-700">How it works</div>
            <h2 className="mt-2 text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">Four steps, one reply per day</h2>
            <p className="mt-2 text-[14.5px] text-ink-600">Most buyers hear back from us within one business day.</p>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[11.5px] font-bold text-ink-400">0{i + 1}</span>
                </div>
                <h3 className="mt-3 text-[15.5px] font-bold text-ink-900">{s.title}</h3>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-ink-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PROMISES */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-brand-700">What we promise</div>
              <h2 className="mt-2 text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">No guesswork, no hidden suppliers.</h2>
              <p className="mt-3 text-[14.5px] text-ink-600">
                We're based in Hanoi. When we say a factory has been audited, one of us has been through the gate.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/rfq" className="btn btn-primary">
                  Request a quote <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/for-suppliers" className="btn btn-ghost">
                  Are you a Vietnamese supplier?
                </Link>
              </div>
            </div>
            <ul className="grid gap-4">
              {PROMISES.map((g) => (
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

      {/* TEAM — cho đến khi có ảnh thật, hiển thị placeholder 1 người (CEO).
          Thay ảnh + bio bằng link/public/images/team/luong-van-hoc.jpg khi có. */}
      <section className="bg-ink-50/50">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-brand-700">Who you'll be working with</div>
            <h2 className="mt-2 text-[28px] font-black tracking-tight text-ink-900 sm:text-3xl">A small team in Hanoi.</h2>
            <p className="mt-2 text-[14.5px] text-ink-600">
              The person reading your email is the person who visits the factory.
            </p>
          </div>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <li className="rounded-xl border border-ink-200 bg-white p-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <User className="h-10 w-10" />
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-ink-900">Luong Van Hoc</h3>
              <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-brand-700">CEO & Founder</p>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-600">
                Has worked with cashew and agricultural exporters in Binh Phuoc and the Central Highlands since 2019.
                Based in Hanoi.
              </p>
              {/* Thêm đồng sự vào đây khi có: <li> thứ 2-3 với cùng cấu trúc. */}
            </li>
          </ul>
          <p className="mt-4 text-[12px] text-ink-500">
            Photos and short bios for the rest of the team are being added.
          </p>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h2 className="text-[26px] font-black leading-tight sm:text-3xl">Not sure where to start?</h2>
            <p className="mt-2 max-w-xl text-[14.5px] text-brand-100/90">
              Send us a short note about what you're looking for. We'll reply within one business day.
            </p>
          </div>
          <Link
            href="/rfq"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[14px] font-bold text-brand-900 transition hover:bg-brand-50"
          >
            Request a quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
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
