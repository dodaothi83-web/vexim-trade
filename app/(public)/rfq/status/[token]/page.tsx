import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MailCheck, ShieldCheck, Timer } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Request status | Veximtrade",
  robots: { index: false, follow: false },
};

function statusInfo(status: string) {
  switch (status) {
    case "new":
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
        title: "Under review – preparing shortlist",
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
        body: "We are collecting quotes and lead times from shortlisted suppliers. You will receive a comparison by email within 1 business day.",
        icon: Timer,
      };
    case "won":
      return {
        tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        dot: "bg-emerald-500",
        title: "Order confirmed",
        body: "Your order has been confirmed with the chosen supplier. We will coordinate production and shipment.",
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

export default async function RfqStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const store = getStore();
  const rfq = await store.getRfqByToken(token).catch(() => null);
  if (!rfq) notFound();

  const buyer = rfq.buyer_id ? await store.getBuyer(rfq.buyer_id).catch(() => null) : null;
  const info = statusInfo(rfq.status);
  const Icon = info.icon;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Request a quote", href: "/rfq" },
          { label: "Status" },
        ]}
      />

      <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-7 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          Request
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

        <dl className="mt-6 grid gap-3 border-t border-ink-100 pt-5 text-[13.5px] sm:grid-cols-2">
          <Row k="Product" v={rfq.product_text} />
          <Row k="Quantity" v={rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—"} />
          <Row k="Destination" v={rfq.destination_country ?? "—"} />
          <Row k="Incoterm" v={rfq.incoterm ?? "—"} />
          {buyer && <Row k="Company" v={buyer.company} />}
          {buyer?.email && <Row k="Contact" v={buyer.email} />}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
          <Link
            href="/rfq"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-ink-800"
          >
            <MailCheck className="h-4 w-4" /> Send another request
          </Link>
          <a
            href={`mailto:sales@veximtrade.com?subject=${encodeURIComponent("Follow-up on " + rfq.code)}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-4 py-2 text-[13.5px] font-semibold text-ink-800 hover:border-ink-900"
          >
            Reply to this email
          </a>
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
          Bookmark this page — you can return any time to check progress without logging in. The link
          is private and unique to your request.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-400">{k}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium text-ink-800">{v}</dd>
    </div>
  );
}
