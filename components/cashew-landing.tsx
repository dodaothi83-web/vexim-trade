"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Container,
  FileCheck2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Ruler,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { submitQuoteLeadAction } from "@/app/actions";
import { COMPANY } from "@/lib/config";
import { Logo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";
import {
  CASHEW_FAQS,
  CASHEW_GRADE_OPTIONS,
  CASHEW_INCOTERMS,
  CASHEW_PAYMENT_METHODS,
  CASHEW_PHOTOS,
  CASHEW_STEPS,
  CASHEW_TRUST_LINE,
  CASHEW_NAV,
  EVIDENCE_TONE,
  PRODUCER_DATA,
  SCREENING_QUESTIONS,
  SPEC_ROWS,
  VIETNAM_STATS,
  VIETNAM_STATS_SOURCE,
  isPending,
  type CashewPhoto,
  type CashewPhotoKey,
} from "@/lib/cashew-content";

/**
 * Trang đích /cashew — chạy quảng cáo Google cho thị trường Mỹ.
 *
 * Nguyên tắc (theo brief 12/10/2026):
 *  - Một việc duy nhất: khiến buyer Mỹ gửi brief hạt điều. Không khối nào cạnh tranh CTA.
 *  - Giữ chất minh bạch của trang chủ: Stated / Verified / Open; không "certified",
 *    không "guaranteed", không "best price", không "FDA-compliant". Số chưa chắc thì để trống có chủ đích.
 *  - Tiếng Anh Mỹ, ghi lb song song kg, giá tính bằng USD.
 *  - Ảnh: ảnh THẬT của nhà sản xuất, không ảnh AI, không stock sai sản phẩm. Chưa có file
 *    trong public/cashew/ -> ô placeholder ghi rõ cảnh cần chụp, trang không bao giờ hiện ảnh vỡ.
 *  - Nút CTA: vàng hạt điều #D9A441 với chữ navy (tương phản 7.9:1 — teal-trắng của trang chủ
 *    chỉ 3.6:1, không đạt AA cho chữ 16px). Toàn bộ CTA lấy từ hai hằng số dưới đây, đổi 1 dòng là
 *    quay về teal của trang chủ nếu muốn thống nhất thương hiệu tuyệt đối.
 */

const CTA_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[#D9A441] px-7 py-4 text-[16px] font-bold text-[#0f172a] transition hover:bg-[#c9932f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a] disabled:opacity-60";
const CTA_SMALL =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[#D9A441] px-5 py-2.5 text-[15px] font-semibold text-[#0f172a] transition hover:bg-[#c9932f]";
/** Cùng font đề với trang chủ (components/landing-site.tsx) — brief yêu cầu giữ nguyên font. */
const HEADING: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  letterSpacing: "-0.01em",
};
const CREAM = "bg-[#FAF6EE]";
const NAVY = "bg-[#0f172a]";

const STEP_ICON = {
  brief: ClipboardCheck,
  screen: ShieldCheck,
  sample: FileCheck2,
  talk: Mail,
  ship: Truck,
} as const;

export function CashewLanding({
  photosReady,
  attribution,
}: {
  /** Ảnh nào đã có file trong public/cashew/ — kiểm tra ở server */
  photosReady: Partial<Record<CashewPhotoKey, boolean>>;
  /** utm_* của lượt truy cập, gửi kèm lead để đo theo nhóm quảng cáo */
  attribution: string | null;
}) {
  const [form, setForm] = useState({
    company: "",
    name: "",
    email: "",
    product: "Cashew kernels",
    quantity: "",
    country: "",
    incoterm: "",
    payment_method: "",
    lead_time: "",
    message: "",
    company_website: "",
  });
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const formSection = useRef<HTMLDivElement | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Nút cố định đáy màn hình trên mobile: ẩn khi khối form đã hiện ra */
  useEffect(() => {
    const node = formSection.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setShowStickyBar(!entries.some((e) => e.isIntersecting)), {
      threshold: 0.08,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Grade ghép vào product để phòng sale thấy ngay trong tiêu đề hồ sơ, không phải mở chi tiết.
    // Nếu buyer sửa ô "What are you sourcing?" thì giữ chữ của họ, chỉ nối thêm grade.
    const product = [form.product.trim() || "Cashew kernels", grade.trim()]
      .filter(Boolean)
      .join(" · ");
    const res = await submitQuoteLeadAction({
      ...form,
      product,
      landing: "cashew",
      attribution,
    });
    setBusy(false);
    if (res.ok) {
      setDone(res.message);
      // Sự kiện chuyển đổi: GA4 nhận generate_lead. Muốn bắn thẳng Google Ads conversion thì đặt
      // NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID (dạng "AW-XXXXXXXXX/YYYYYYY") — xem .env.example.
      const sendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID?.trim();
      const w = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof w.gtag === "function") {
        const params = new URLSearchParams(window.location.search);
        w.gtag("event", "generate_lead", {
          ...(sendTo ? { send_to: sendTo } : {}),
          currency: "USD",
          value: 1,
          item_category: "cashew_kernels",
          grade: grade || "not specified",
          destination: form.country || "not specified",
          utm_source: params.get("utm_source") ?? undefined,
          utm_medium: params.get("utm_medium") ?? undefined,
          utm_campaign: params.get("utm_campaign") ?? undefined,
          utm_content: params.get("utm_content") ?? undefined,
        });
      }
      return;
    }
    setError(res.message);
  }

  return (
    <div lang="en" className="min-h-screen bg-white text-ink-900">
      <a
        href="#send"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-[14px] focus:font-semibold"
      >
        Skip to the request form
      </a>

      {/* ---------------- Header ---------------- */}
      <header className={`${NAVY} border-b border-white/10 text-white`}>
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3 sm:px-8">
          <a href="/" className="flex items-center gap-2.5" aria-label="Veximtrade home">
            <Logo className="h-11 w-[60px] shrink-0" />
            <span className="hidden text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:block">
              Cashew kernels
            </span>
          </a>
          <nav className="ml-auto hidden items-center gap-7 text-[15px] font-medium text-slate-200 md:flex">
            {CASHEW_NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-[#D9A441]">
                {n.label}
              </a>
            ))}
          </nav>
          <a href="#send" className={`${CTA_SMALL} ml-auto md:ml-0`}>
            Request a Quote
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* ---------------- 1. Hero ---------------- */}
      <section className={`${NAVY} text-white`}>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-[#D9A441]">
              <ShieldCheck className="h-4 w-4" />
              Veximtrade · a Vexim Global company
            </p>
            <h1 className="mt-6 text-[42px] font-bold leading-[1.06] sm:text-[56px]" style={HEADING}>
              Vietnamese Cashew Kernels, Matched to Your Spec
            </h1>
            <p className="mt-6 max-w-xl text-[19px] leading-relaxed text-slate-200">
              Tell us your grade, volume and destination. We screen Vietnamese producers against your brief and show
              you the one that fits.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="#send" className={CTA_BUTTON}>
                Request a Quote
                <ArrowRight className="h-5 w-5" />
              </a>
              <a
                href="#work"
                className="rounded-md border-2 border-white/40 px-7 py-3.5 text-[16px] font-semibold text-white transition hover:border-white hover:bg-white hover:text-ink-900"
              >
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-col gap-2 text-[14.5px] text-slate-300 sm:flex-row sm:flex-wrap sm:gap-x-6">
              {CASHEW_TRUST_LINE.map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D9A441]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <Photo photo={CASHEW_PHOTOS.hero} ready={Boolean(photosReady.hero)} onDark />
        </div>
      </section>

      {/* ---------------- 2. Why source from Vietnam ---------------- */}
      <section id="why" className={CREAM}>
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="max-w-3xl text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>
            Vietnam supplies about 80% of the world’s cashew kernel exports, and shipped roughly 186,600 tonnes of
            kernels in the first four months of 2026.
          </h2>
          <p className="mt-6 max-w-3xl text-[18px] leading-relaxed text-ink-700">
            That scale means many processors, and a wide spread in grade, packing and documentation. The hard part is
            not finding a supplier. It is finding the one that matches your spec.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {VIETNAM_STATS.map((s) => (
              <div key={s.figure} className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-ink-200">
                <p className="text-[44px] font-bold leading-none text-ink-900">{s.figure}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">{VIETNAM_STATS_SOURCE}</p>
        </div>
      </section>

      {/* ---------------- 3. A supplier list is not a match ---------------- */}
      <section id="problem">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>A supplier list is not a match</h2>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-ink-700">
              Every name on a list brings another email, another spec sheet and another call that goes nowhere. For
              cashew, the questions that cost you time are always the same:
            </p>
            <ul className="mt-8 space-y-3">
              {SCREENING_QUESTIONS.map((q) => (
                <li key={q} className="flex items-start gap-3 text-[16.5px] leading-snug text-ink-800">
                  <Ruler className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-ink-50 p-7 ring-1 ring-ink-200">
            <p className="text-[13px] font-bold uppercase tracking-wider text-ink-500">What we do first</p>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-800">
              We do the screening first, so you see the producer that fits your brief — not a list to work through.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
              Each point in our reply is marked Stated, Verified or Open, so you know what you can rely on today.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- 4. Typical specs ---------------- */}
      <section id="specs" className={CREAM}>
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>Typical specs for U.S. orders</h2>
          <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-ink-700">
            Typical figures seen in trade records, not a promise. Each producer confirms its own grades, packing and
            terms in writing before you evaluate samples.
          </p>
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <dl className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
              {SPEC_ROWS.map((row, i) => (
                <div
                  key={row.item}
                  className={`grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,210px)_1fr] sm:gap-4 ${
                    i % 2 ? "bg-ink-50/60" : ""
                  }`}
                >
                  <dt className="text-[13px] font-bold uppercase tracking-wide text-ink-500">{row.item}</dt>
                  <dd className="text-[15.5px] leading-relaxed text-ink-900">
                    {isPending(row.value) ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2.5 py-1 text-[12.5px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        Open · {row.value}
                      </span>
                    ) : (
                      row.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-5">
              <Photo photo={CASHEW_PHOTOS.grades} ready={Boolean(photosReady.grades)} />
              <Photo photo={CASHEW_PHOTOS.pieces} ready={Boolean(photosReady.pieces)} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 5. Process ---------------- */}
      <section id="work">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>From your brief to the shipment</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {CASHEW_STEPS.map((step, i) => {
              const Icon = STEP_ICON[step.icon];
              return (
                <li key={step.title} className="flex flex-col rounded-2xl bg-ink-50 p-5 ring-1 ring-ink-200">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[13px] font-bold text-[#D9A441]">
                      {i + 1}
                    </span>
                    <Icon className="h-5 w-5 text-ink-500" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-[15.5px] font-bold leading-snug text-ink-900">{step.title}</p>
                  <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-600">{step.desc}</p>
                  <p className="mt-3 border-t border-ink-200 pt-3 text-[13px] leading-relaxed text-ink-700">
                    <span className="font-bold text-ink-900">You receive:</span> {step.output}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---------------- 6. Stated / Verified / Open ---------------- */}
      <section className={`${NAVY} text-white`}>
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="max-w-3xl text-[26px] font-bold leading-tight sm:text-[32px]" style={HEADING}>
            Every reply tells you where each fact comes from
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {EVIDENCE_TONE.map((t) => (
              <div key={t.key} className={`rounded-2xl border p-6 ${t.box}`}>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide ${t.chip}`}
                >
                  {t.title}
                </span>
                <p className="mt-4 text-[15px] leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 7. Documents and U.S. requirements ---------------- */}
      <section id="documents" className={CREAM}>
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>Documents and U.S. requirements</h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-[17px] leading-relaxed text-ink-800">
                Documents available from the producer:{" "}
                {isPending(PRODUCER_DATA.documents) ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-2.5 py-1 text-[13px] font-semibold text-amber-900">
                    Open · {PRODUCER_DATA.documents}
                  </span>
                ) : (
                  <strong>{PRODUCER_DATA.documents}</strong>
                )}
              </p>
              <p className="mt-6 text-[17px] font-bold leading-relaxed text-ink-900">
                Cashew is a tree nut and a major allergen under U.S. labelling rules.
              </p>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-700">
                U.S. importers are responsible for their own FDA and FSVP obligations. We share the documents each
                producer holds, and we do not replace your own inspection or legal review.
              </p>
            </div>
            <ul className="space-y-3 rounded-2xl bg-white p-6 text-[15px] leading-relaxed text-ink-800 ring-1 ring-ink-200">
              <li className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                Raw nut origin: {PRODUCER_DATA.rawNutOrigin}.
              </li>
              <li className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                We list only documents that exist. Nothing on this page says “certified” unless the producer’s
                certificate is in hand.
              </li>
              <li className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                Prices move with the crop. We quote per lot, with the crop and the lot named.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- 8. Samples and shipping ---------------- */}
      <section id="shipping">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>Samples and shipping</h2>
            <p className="mt-6 text-[17px] leading-relaxed text-ink-700">
              Samples follow the schedule agreed in your spec sheet, with sample costs paid by you. Goods ship in 20’
              or 40’ containers to {PRODUCER_DATA.usPorts}. Dates from the producer or the carrier are marked as
              estimates until confirmed.
            </p>
            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-ink-50 p-5 text-[15px] leading-relaxed text-ink-800 ring-1 ring-ink-200">
              <Container className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              <p>
                A 20’ container carries around 700 cartons of 22.68 kg (50 lb) each — roughly 15.9 MT. We confirm the
                loading plan with the producer before you commit.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Photo photo={CASHEW_PHOTOS.cartons} ready={Boolean(photosReady.cartons)} />
            <Photo photo={CASHEW_PHOTOS.container} ready={Boolean(photosReady.container)} />
            <div className="sm:col-span-2">
              <Photo photo={CASHEW_PHOTOS.sorting} ready={Boolean(photosReady.sorting)} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- 9. FAQ ---------------- */}
      <section id="faq" className={CREAM}>
        <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
          <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>Questions buyers ask</h2>
          <div className="mt-8 divide-y divide-ink-200 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200">
            {CASHEW_FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`cashew-faq-${i}`}
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-ink-50"
                  >
                    <span className="flex-1 text-[16px] font-semibold text-ink-900">{f.q}</span>
                    <span
                      className={`shrink-0 text-[18px] leading-none text-ink-500 transition-transform ${open ? "rotate-45" : ""}`}
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </button>
                  {open && (
                    <p id={`cashew-faq-${i}`} className="px-5 pb-5 text-[15.5px] leading-relaxed text-ink-700">
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- 10. Send your cashew brief ---------------- */}
      <section id="send" ref={formSection} className={`${NAVY} text-white`}>
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-[30px] font-bold leading-tight sm:text-[38px]" style={HEADING}>Send your cashew brief</h2>
            <p className="mt-6 text-[17px] leading-relaxed text-slate-200">
              Describe the grade, the volume and where it goes. You get a written reply by the start of your next
              business day — what is stated, what is verified, what is still open, and the next step.
            </p>
            <ul className="mt-8 space-y-3 text-[15.5px] text-slate-200">
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-[#D9A441]" />
                <a href={`mailto:${COMPANY.email}`} className="transition hover:text-white">
                  {COMPANY.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-[#D9A441]" />
                <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="transition hover:text-white">
                  {COMPANY.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#D9A441]" />
                {COMPANY.address}
              </li>
            </ul>
            <p className="mt-8 text-[14px] leading-relaxed text-slate-400">
              No portal and no subscription. If we cannot find a fit this season, we say so plainly.
            </p>
          </div>

          {done ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-50 p-6 text-emerald-950">
              <p className="flex items-center gap-2 text-[15px] font-bold">
                <CheckCircle2 className="h-5 w-5" />
                Request received
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed">{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-2xl bg-white p-6 text-ink-900 shadow-pop sm:p-7">
              {/* Honeypot chống bot — người thật không thấy ô này */}
              <input
                type="text"
                name="company_website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.company_website}
                onChange={(e) => set("company_website", e.target.value)}
                className="hidden"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company *" required>
                  <input
                    className="input"
                    required
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                    placeholder="Your company name"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Your name">
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Contact person"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Email *" required>
                  <input
                    className="input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="Destination (U.S. port or city)">
                  <input
                    className="input"
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    placeholder="e.g. Los Angeles, Long Beach, Newark"
                    autoComplete="off"
                  />
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="What are you sourcing? *" required>
                  <input
                    className="input"
                    required
                    value={form.product}
                    onChange={(e) => set("product", e.target.value)}
                    placeholder="Cashew kernels"
                  />
                </Field>
                <Field label="Grade / size">
                  <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
                    <option value="">Select</option>
                    {CASHEW_GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Quantity">
                  <input
                    className="input"
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    placeholder="e.g. 1×20’ (15.9 MT)"
                  />
                </Field>
                <Field label="Incoterm">
                  <select className="input" value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
                    <option value="">Select</option>
                    {CASHEW_INCOTERMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Payment method">
                  <select
                    className="input"
                    value={form.payment_method}
                    onChange={(e) => set("payment_method", e.target.value)}
                  >
                    <option value="">Select</option>
                    {CASHEW_PAYMENT_METHODS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="When do you need it?">
                  <input
                    className="input"
                    value={form.lead_time}
                    onChange={(e) => set("lead_time", e.target.value)}
                    placeholder="e.g. shipment in Q1 2027"
                  />
                </Field>
                <Field label="Anything else we should know">
                  <input
                    className="input"
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Packing, moisture, certificates, labelling"
                  />
                </Field>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
                Required: company, email and what you are sourcing. Grade, quantity, destination, Incoterm, payment
                method and the rest are optional — send what you already know, and “Not sure yet” is a perfectly good
                answer.
              </p>
              {error && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className={`${CTA_BUTTON} mt-4 w-full`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit Cashew Request
              </button>
              <p className="mt-2 text-[11.5px] text-ink-500">
                Only company, email and product are required. No portal and no subscription.
                {attribution ? " We use the link you arrived from to route your brief to the right desk." : ""}
              </p>
            </form>
          )}
        </div>
      </section>

      <SiteFooter />

      {/* Nút Request a Quote cố định đáy màn hình trên mobile — ẩn khi đã cuộn tới khối form */}
      {showStickyBar && !done && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0f172a]/95 p-3 backdrop-blur sm:hidden">
          <a href="#send" className={`${CTA_BUTTON} w-full`}>
            Request a Quote
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {required ? <span className="sr-only">required</span> : null}
    </label>
  );
}

/**
 * Khung ảnh. Chưa có file trong public/cashew/ thì vẽ placeholder ghi rõ cảnh cần chụp:
 * trang không hiện ảnh vỡ, đội chụp ảnh thấy ngay việc còn thiếu, và alt text đã soạn sẵn.
 */
function Photo({ photo, ready, onDark = false }: { photo: CashewPhoto; ready: boolean; onDark?: boolean }) {
  const aspect = { aspectRatio: `${photo.width} / ${photo.height}` };
  if (ready) {
    return (
      <img
        src={`/cashew/${photo.file}`}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={photo.eager ? "eager" : "lazy"}
        fetchPriority={photo.eager ? "high" : "auto"}
        decoding="async"
        className="w-full rounded-2xl object-cover ring-1 ring-black/5"
        style={aspect}
      />
    );
  }
  return (
    <figure
      className={`flex items-center rounded-2xl border border-dashed p-5 text-[12.5px] leading-relaxed ${
        onDark ? "border-white/25 text-slate-300" : "border-ink-300 bg-white text-ink-500"
      }`}
      style={aspect}
    >
      <div className="flex-1">
        <span
          className={`block text-[11px] font-bold uppercase tracking-wider ${onDark ? "text-[#D9A441]" : "text-ink-400"}`}
        >
          Photo to come
        </span>
        <span className="mt-1.5 block">{photo.shot}</span>
        <code className={`mt-2 block break-all text-[11px] ${onDark ? "text-slate-400" : "text-ink-400"}`}>
          public/cashew/{photo.file}
        </code>
      </div>
    </figure>
  );
}
