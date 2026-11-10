import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, MailCheck, MessageCircle, ShieldCheck, Timer } from "lucide-react";
import { Breadcrumbs } from "@/components/ui";
import type { Buyer, Rfq } from "@/lib/types";
import { quotePortalCopy } from "@/lib/rfq/portal-copy";
import type { Locale } from "@/lib/i18n/config";

function statusInfo(status: string) {
  switch (status) {
    case "new":
      return {
        tone: "bg-sky-50 text-sky-800 ring-sky-200",
        dot: "bg-sky-500",
        title: "Received – waiting for assignment",
        body: "Your request has been received and is being reviewed by our export desk. We will assign it to a specialist within a few hours (business days, Hanoi time).",
        icon: Clock,
      };
    case "needs_review":
    case "in_progress":
      return {
        tone: "bg-sky-50 text-sky-800 ring-sky-200",
        dot: "bg-sky-500",
        title: "Under review – preparing your supplier list",
        body: "Your request passed our initial screening. We are clarifying any missing details and selecting suitable suppliers.",
        icon: ShieldCheck,
      };
    case "matching":
    case "quoted":
    case "sampling":
      return {
        tone: "bg-amber-50 text-amber-800 ring-amber-200",
        dot: "bg-amber-500",
        title: "Suppliers are responding",
        body: "Suppliers are responding. Published quotes appear below in your account; email is only a notification.",
        icon: Timer,
      };
    case "won":
      return {
        tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        dot: "bg-emerald-500",
        title: "Supplier selected",
        body: "You chose a supplier and, with your approval, we passed your details on. Contract, payment and shipment are agreed directly between you and the supplier.",
        icon: CheckCircle2,
      };
    case "lost":
      return {
        tone: "bg-ink-100 text-ink-700 ring-ink-200",
        dot: "bg-ink-500",
        title: "Closed",
        body: "This request is closed. Reach out to your desk contact or start a new request if you have more needs.",
        icon: CheckCircle2,
      };
    case "spam":
      return {
        tone: "bg-red-50 text-red-800 ring-red-200",
        dot: "bg-red-500",
        title: "Quarantined for review",
        body: "Your request was flagged by spam filters and is being reviewed manually. If you are a genuine buyer, you will hear from us shortly.",
        icon: ShieldCheck,
      };
    default:
      return {
        tone: "bg-slate-100 text-slate-800 ring-slate-200",
        dot: "bg-slate-500",
        title: "Status unavailable",
        body: "We could not determine the current status.",
        icon: Clock,
      };
  }
}

function questionStatusInfo(status: string) {
  switch (status) {
    case "matching":
      return {
        tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        dot: "bg-emerald-500",
        title: "Sent to supplier",
        body: "Your question and contact email were sent to the selected supplier. They can reply directly to your email.",
        icon: CheckCircle2,
      };
    case "needs_review":
      return {
        tone: "bg-sky-50 text-sky-800 ring-sky-200",
        dot: "bg-sky-500",
        title: "Under review",
        body: "Your question must be reviewed before it can be shared with the selected supplier.",
        icon: ShieldCheck,
      };
    case "in_progress":
      return {
        tone: "bg-sky-50 text-sky-800 ring-sky-200",
        dot: "bg-sky-500",
        title: "Delivery support in progress",
        body: "Vexim is helping with delivery of your saved question to the selected supplier.",
        icon: Clock,
      };
    case "spam":
      return {
        tone: "bg-red-50 text-red-800 ring-red-200",
        dot: "bg-red-500",
        title: "Quarantined for review",
        body: "Your question was flagged by spam filters and has not been sent to the supplier.",
        icon: ShieldCheck,
      };
    case "new":
      return {
        tone: "bg-amber-50 text-amber-800 ring-amber-200",
        dot: "bg-amber-500",
        title: "Saved, delivery pending",
        body: "We saved your question but could not confirm delivery to the supplier yet. Vexim will help with delivery.",
        icon: Clock,
      };
    default:
      return {
        tone: "bg-slate-100 text-slate-800 ring-slate-200",
        dot: "bg-slate-500",
        title: "Status unavailable",
        body: "We could not determine the current delivery status. Your original question is still saved.",
        icon: Clock,
      };
  }
}

/** Only the buyer-visible published snapshot, not draft match fields or supplier contact. */
export type BuyerQuote = { id: string; supplier: string; location: string | null; href?: string; unread?: boolean;
  newQuote?: boolean; price: string; incoterm: string | null; leadTimeDays: number | null; validUntil: string | null;
  version?: number; note?: string | null };
export type BuyerPreQuoteThread = Pick<BuyerQuote, "id" | "supplier" | "location" | "href" | "unread">;

export function BuyerEnquiryDetail({ rfq, buyer, quotes = [], preQuoteThreads = [], quotesUnavailable = false, locale = "en" }: {
  rfq: Rfq; buyer: Buyer; quotes?: BuyerQuote[]; preQuoteThreads?: BuyerPreQuoteThread[];
  quotesUnavailable?: boolean; locale?: Locale;
}) {
  const copy = quotePortalCopy[locale];
  const isQuestion = rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
  const info = isQuestion ? questionStatusInfo(rfq.status) : statusInfo(rfq.status);
  const Icon = info.icon;

  return (
    <div lang={locale} className="mx-auto max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "My enquiries", href: "/buyer/account?tab=requests" },
          { label: rfq.code },
        ]}
      />

      <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-7 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          {isQuestion ? "Supplier question" : "Request"}
        </p>
        <h1 className="mt-1 font-mono text-[16px] font-bold text-ink-900">{rfq.code}</h1>

        <div className={"mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 " + info.tone}>
          <span className={"h-2 w-2 rounded-full " + info.dot} />
          {info.title}
        </div>

        <div className="mt-5 rounded-lg bg-ink-50 p-4">
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 text-brand-700" />
            <p className="text-[14px] leading-relaxed text-ink-700">{info.body}</p>
          </div>
        </div>

        {!isQuestion && <section className="mt-6 border-t border-ink-100 pt-5" aria-labelledby="quotes-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="quotes-title" className="text-[16px] font-bold text-ink-900">{copy.offersTitle}{quotes.length ? ` (${quotes.length})` : ""}</h2>
            <span className="text-[12px] text-ink-500">{copy.published}</span>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-ink-600">{copy.offersSub}</p>
          {quotesUnavailable && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
            {locale === "vi" ? "Chưa tải được cập nhật báo giá. Vui lòng thử lại sau." : "Quote updates are temporarily unavailable. Please try again."}</p>}
          {!quotesUnavailable && !quotes.length && <p className="mt-4 rounded-lg bg-ink-50 p-4 text-[13px] leading-6 text-ink-600">{copy.noOffers}</p>}
          <ul className="mt-3 space-y-3">{quotes.map((q) => <li key={q.id}>
            <Link href={q.href ?? `/buyer/account/requests/${encodeURIComponent(rfq.id)}/offers/${encodeURIComponent(q.id)}`}
              prefetch={false} className="group block rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-600">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><p className="break-words text-[14px] font-bold text-ink-900">{q.supplier}</p>
                  {q.location && <p className="mt-0.5 text-[12px] text-ink-600">{q.location}</p>}</div>
                {q.unread && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">{q.newQuote ? copy.newQuote : copy.newUpdate}</span>}
              </div>
              <p className="mt-3 break-words text-[20px] font-extrabold text-brand-900">{q.price}</p>
              <p className="mt-1 text-[12.5px] text-ink-600">
                {[q.incoterm, q.leadTimeDays != null ? `${q.leadTimeDays} ${copy.days}` : null, q.validUntil ? `${copy.validUntil} ${q.validUntil}` : null,
                  q.version && q.version > 1 ? `${copy.version} ${q.version}` : null].filter(Boolean).join(" · ")}
              </p>
              {q.note && <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words border-t border-ink-100 pt-2 text-[12.5px] leading-5 text-ink-700">{q.note}</p>}
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-brand-700 group-hover:underline">{copy.viewOffer}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
            </Link>
          </li>)}</ul>
          {!!preQuoteThreads.length && <div className="mt-5 border-t border-ink-100 pt-4">
            <p className="text-[13px] text-ink-600">{copy.pendingDirect}</p>
            <ul className="mt-3 space-y-2">{preQuoteThreads.map((item) => <li key={item.id}>
              <Link href={item.href ?? `/buyer/account/requests/${encodeURIComponent(rfq.id)}/offers/${encodeURIComponent(item.id)}`}
                prefetch={false} className="flex min-h-12 items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-[13px] font-semibold text-brand-700 hover:border-brand-300 hover:bg-brand-50">
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 break-words">{item.supplier} · {copy.discussBeforeQuote}</span>
                {item.unread && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">{copy.newUpdate}</span>}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>)}</ul>
          </div>}
        </section>}

        <dl className="mt-6 grid gap-3 border-t border-ink-100 pt-5 text-[13.5px] sm:grid-cols-2">
          <Row k="Product" v={rfq.product_text} />
          {isQuestion ? <Row k="Question" v={String(rfq.specs?.notes ?? "—")} /> : <>
            <Row k="Quantity" v={rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—"} />
            <Row k="Destination" v={rfq.destination_country ?? "—"} />
            <Row k="Incoterm" v={rfq.incoterm ?? "—"} />
          </>}
          {buyer && <Row k="Company" v={buyer.company} />}
          {buyer?.email && <Row k="Contact" v={buyer.email} />}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
          <Link href="/buyer/account?tab=requests" className="btn btn-soft">All enquiries</Link>
          <Link
            href="/rfq"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-ink-800"
          >
            <MailCheck className="h-4 w-4" /> Send another request
          </Link>
          <a
            href={`mailto:hello@veximtrade.com?subject=${encodeURIComponent("Follow-up on " + rfq.code)}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-4 py-2 text-[13.5px] font-semibold text-ink-800 hover:border-ink-900"
          >
            {isQuestion ? "Get help with this question" : "Reply to this email"}
          </a>
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
          {isQuestion ? <>
            Return to your account to check delivery of the original question. Supplier replies go to your email and are not shown here.
          </> : <>
            Return to your account to check progress. Sign in with the email address used for this request.
          </>}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-400">{k}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] font-medium text-ink-800">{v}</dd>
    </div>
  );
}
