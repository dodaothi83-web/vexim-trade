import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, MessageCircle, ShieldCheck, Timer } from "lucide-react";
import { Breadcrumbs } from "@/components/ui";
import type { Buyer, Rfq } from "@/lib/types";
import { quotePortalCopy } from "@/lib/rfq/portal-copy";
import type { Locale } from "@/lib/i18n/config";
import { linkedSourcingRequestId, rfqChannel } from "@/lib/rfq/channel";

function directStatusInfo(rfq: Rfq, locale: Locale, hasQuote: boolean) {
  const vi = locale === "vi";
  const base = { tone: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", icon: Clock };
  if (rfq.status === "new") return { ...base,
    title: vi ? "Đã lưu, đang chuyển tới nhà cung cấp" : "Saved, portal delivery pending",
    body: rfq.specs?.direct_delivery_version === "portal_direct_v2"
      ? (vi ? "Hệ thống tự thử lại việc chuyển yêu cầu vào cổng của nhà cung cấp bạn chọn. Vexim không xử lý giao dịch này."
        : "The system will retry delivery to your chosen supplier's portal. Vexim does not manage this transaction.")
      : (vi ? "Chưa xác nhận đã chuyển yêu cầu cũ tới nhà cung cấp. Hãy liên hệ hỗ trợ nếu cần kiểm tra."
        : "Delivery of this older request has not been confirmed. Contact support if you need help checking it."),
  };
  if (rfq.status === "quoted" && hasQuote) return { ...base,
    title: vi ? "Có báo giá từ nhà cung cấp" : "Supplier quote available",
    body: vi ? "Mở báo giá bên dưới để trao đổi trực tiếp với nhà cung cấp. Vexim không điều phối giao dịch này."
      : "Open the quote below and discuss it with the supplier. Vexim does not manage this transaction.",
  };
  if (rfq.status === "matching" || rfq.status === "quoted") return { ...base,
    title: vi ? "Đã chuyển tới nhà cung cấp" : "Sent directly to supplier",
    body: vi ? "Nhà cung cấp bạn chọn có thể xem yêu cầu trên cổng. Báo giá chỉ hiện khi được công bố."
      : "Your chosen supplier can view this request in their portal. A quote appears here only when published.",
  };
  if (rfq.status === "lost" || rfq.status === "won") return { ...base,
    title: vi ? "Yêu cầu trực tiếp đã đóng" : "Direct request closed",
    body: vi ? "Bạn và nhà cung cấp tự xử lý giao dịch. Nếu chưa tìm được bên phù hợp, hãy tạo RFQ tìm nguồn MỚI cho Vexim."
      : "You and the supplier manage this transaction. If it did not work out, create a NEW sourcing RFQ for Vexim.",
  };
  return { ...base, title: vi ? "Yêu cầu trực tiếp" : "Direct request",
    body: vi ? "Xem báo giá và trao đổi với nhà cung cấp bạn chọn. Vexim chỉ xem để hỗ trợ hoặc giải quyết tranh chấp."
      : "Review your chosen supplier's quote and conversation. Vexim has read-only access for support or disputes.",
  };
}

function statusInfo(status: Rfq["status"], locale: Locale, hasQuote: boolean) {
  const vi = locale === "vi";
  switch (status) {
    case "new": return {
      tone: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", icon: Clock,
      title: vi ? "Vexim đã nhận yêu cầu" : "Vexim received your request",
      body: vi ? "Vexim sẽ xem nhu cầu và chọn nhà cung cấp phù hợp. Bạn có thể trao đổi với Vexim ở mạch bên dưới."
        : "Vexim will review your needs and shortlist suitable suppliers. You can message Vexim below.",
    };
    case "needs_review":
    case "in_progress": return {
      tone: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", icon: ShieldCheck,
      title: vi ? "Vexim đang xem yêu cầu" : "Vexim is reviewing your request",
      body: vi ? "Vexim kiểm tra thông tin và chọn nhà cung cấp. Liên hệ của bạn không được chuyển tới bên được mời."
        : "Vexim checks your requirements and selects suppliers. Your contact details stay with Vexim.",
    };
    case "matching":
    case "quoted":
    case "sampling": return {
      tone: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", icon: Timer,
      title: hasQuote ? (vi ? "Có báo giá do Vexim trình" : "Published quotes available")
        : (vi ? "Vexim đang điều phối" : "Vexim is coordinating"),
      body: vi ? "Báo giá đã công bố sẽ hiện bên dưới. Hãy trao đổi về báo giá hoặc việc gửi mẫu với Vexim tại đây."
        : "Published quotes appear below. Discuss quotes and samples with Vexim in this account.",
    };
    case "won": return {
      tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", icon: CheckCircle2,
      title: vi ? "Đã chọn nhà cung cấp" : "Supplier selected",
      body: vi ? "Yêu cầu tìm nguồn đã kết thúc. Bạn và nhà cung cấp tự thỏa thuận hợp đồng, thanh toán; Vexim không tự chuyển liên hệ của bạn."
        : "This sourcing RFQ is complete. You and the supplier arrange the contract and payment; Vexim does not automatically share your contact details.",
    };
    case "lost": return {
      tone: "bg-ink-100 text-ink-700 ring-ink-200", dot: "bg-ink-500", icon: CheckCircle2,
      title: vi ? "Yêu cầu đã đóng" : "Request closed",
      body: vi ? "Mạch trao đổi này chỉ để xem lại. Nếu vẫn cần tìm nguồn, hãy tạo một yêu cầu mới."
        : "This conversation is now read-only. Create a new request if you still need to source this product.",
    };
    case "spam": return {
      tone: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500", icon: ShieldCheck,
      title: vi ? "Đang kiểm tra yêu cầu" : "Request under review",
      body: vi ? "Yêu cầu chưa được chuyển tới nhà cung cấp. Nếu cần hỗ trợ, hãy liên hệ Vexim."
        : "This request has not been sent to suppliers. Contact Vexim if you need assistance.",
    };
    default: return {
      tone: "bg-slate-100 text-slate-800 ring-slate-200", dot: "bg-slate-500", icon: Clock,
      title: vi ? "Chưa rõ trạng thái" : "Status unavailable",
      body: vi ? "Chưa xác định được trạng thái hiện tại. Hãy thử lại sau."
        : "We could not determine the current status. Please try again later.",
    };
  }
}

function questionStatusInfo(status: Rfq["status"], locale: Locale) {
  const vi = locale === "vi";
  const base = { tone: "bg-slate-100 text-slate-800 ring-slate-200", dot: "bg-slate-500", icon: Clock };
  if (status === "matching") return { ...base,
    title: vi ? "Câu hỏi cũ đã gửi" : "Previous question sent",
    body: vi ? "Câu hỏi này thuộc luồng RFQ cũ và chỉ giữ lịch sử. Hãy dùng Chat with supplier trên trang sản phẩm để hỏi mới."
      : "This question belongs to the former RFQ flow and is read-only. Use Chat with supplier on the product page to ask again.",
  };
  if (status === "spam") return { ...base,
    title: vi ? "Câu hỏi cũ bị cách ly" : "Previous question quarantined",
    body: vi ? "Câu hỏi này chưa được chuyển tới nhà cung cấp. Hãy dùng Chat with supplier để gửi câu hỏi mới."
      : "This question was not delivered to the supplier. Use Chat with supplier to ask again.",
  };
  return { ...base, title: vi ? "Lịch sử câu hỏi" : "Previous question",
    body: vi ? "Chưa xác nhận câu hỏi cũ đã tới nhà cung cấp. Hãy dùng Chat with supplier trên trang sản phẩm để hỏi mới."
      : "Delivery of this older question is unconfirmed. Use Chat with supplier on the product page to ask again.",
  };
}

/** Only the buyer-visible published snapshot, not draft match fields or supplier contact. */
export type BuyerQuote = { id: string; supplier: string; location: string | null; href?: string; unread?: boolean;
  newQuote?: boolean; price: string; incoterm: string | null; leadTimeDays: number | null; validUntil: string | null;
  version?: number; note?: string | null };
export type BuyerPreQuoteThread = Pick<BuyerQuote, "id" | "supplier" | "location" | "href" | "unread">;

export function BuyerEnquiryDetail({ rfq, buyer, quotes = [], preQuoteThreads = [], quotesUnavailable = false, locale = "en", mediatedThread }: {
  rfq: Rfq; buyer: Buyer; quotes?: BuyerQuote[]; preQuoteThreads?: BuyerPreQuoteThread[];
  quotesUnavailable?: boolean; locale?: Locale; mediatedThread?: React.ReactNode;
}) {
  const copy = quotePortalCopy[locale];
  const isQuestion = rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
  const channel = rfqChannel(rfq);
  const sourcing = channel === "sourcing";
  const originalSourcingId = sourcing ? linkedSourcingRequestId(rfq) : null;
  const accountHref = sourcing ? "/buyer/account?tab=vexim" : "/buyer/account?tab=requests";
  const info = isQuestion ? questionStatusInfo(rfq.status, locale) : channel === "direct"
    ? directStatusInfo(rfq, locale, quotes.length > 0) : statusInfo(rfq.status, locale, quotes.length > 0);
  const Icon = info.icon;

  return (
    <div lang={locale} className="mx-auto max-w-3xl px-5 py-10 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: sourcing ? (locale === "vi" ? "Tìm nguồn qua Vexim" : "Vexim sourcing")
            : (locale === "vi" ? "RFQ trực tiếp" : "Direct RFQs"), href: accountHref },
          { label: rfq.code },
        ]}
      />

      <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-7 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          {isQuestion ? (locale === "vi" ? "Câu hỏi sản phẩm cũ" : "Previous product question")
            : sourcing ? (locale === "vi" ? "Tìm nguồn qua Vexim" : "Sourcing via Vexim")
              : (locale === "vi" ? "RFQ trực tiếp" : "Direct RFQ")}
        </p>
        <h1 className="mt-1 font-mono text-[16px] font-bold text-ink-900">{rfq.code}</h1>

        <div className={"mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 " + info.tone}>
          <span className={"h-2 w-2 rounded-full " + info.dot} />
          {info.title}
        </div>

        <div className="mt-5 rounded-lg bg-ink-50 p-4">
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 text-brand-700" aria-hidden="true" />
            <p className="text-[14px] leading-relaxed text-ink-700">{info.body}</p>
          </div>
        </div>

        {originalSourcingId && <Link href={`/buyer/account/sourcing/${encodeURIComponent(originalSourcingId)}`}
          className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
          {locale === "vi" ? "Xem yêu cầu tìm nguồn ban đầu và tệp riêng tư" : "View original sourcing request and private files"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>}

        {!isQuestion && <section className="mt-6 border-t border-ink-100 pt-5" aria-labelledby="quotes-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="quotes-title" className="text-[16px] font-bold text-ink-900">{sourcing ? (locale === "vi" ? "Báo giá do Vexim trình" : "Quotes presented by Vexim") : copy.offersTitle}{quotes.length ? ` (${quotes.length})` : ""}</h2>
            {quotes.length > 0 && <span className="text-[12px] text-ink-500">{copy.published}</span>}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-ink-600">{sourcing ? (locale === "vi" ? "Xem từng báo giá nhà cung cấp do Vexim tổng hợp. Mọi trao đổi đi qua Vexim ở mạch bên dưới." : "Review each supplier offer Vexim has presented. Discuss all sourcing questions with Vexim in the conversation below.") : copy.offersSub}</p>
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

        {mediatedThread && <div className="mt-6">{mediatedThread}</div>}

        <dl className="mt-6 grid gap-3 border-t border-ink-100 pt-5 text-[13.5px] sm:grid-cols-2">
          <Row k={locale === "vi" ? "Sản phẩm" : "Product"} v={rfq.product_text} />
          {isQuestion ? <Row k={locale === "vi" ? "Câu hỏi" : "Question"} v={String(rfq.specs?.notes ?? "—")} /> : <>
            <Row k={locale === "vi" ? "Số lượng" : "Quantity"} v={rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—"} />
            <Row k={locale === "vi" ? "Nơi giao" : "Destination"} v={rfq.destination_country ?? "—"} />
            <Row k="Incoterm" v={rfq.incoterm ?? "—"} />
          </>}
          {buyer && <Row k={locale === "vi" ? "Công ty" : "Company"} v={buyer.company} />}
          {buyer?.email && <Row k={locale === "vi" ? "Liên hệ" : "Contact"} v={buyer.email} />}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
          <Link href={accountHref} className="btn btn-soft">{sourcing ? (locale === "vi" ? "Tất cả yêu cầu tìm nguồn" : "All sourcing requests")
            : (locale === "vi" ? "Tất cả RFQ trực tiếp" : "All direct RFQs")}</Link>
          <Link href={isQuestion ? "/buyer/account/messages" : "/rfq"} className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-ink-800">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            {isQuestion ? (locale === "vi" ? "Mở tin nhắn nhà cung cấp" : "Open supplier messages")
              : channel === "direct" ? (locale === "vi" ? "Tạo RFQ tìm nguồn MỚI" : "Create a NEW sourcing RFQ")
                : (locale === "vi" ? "Gửi yêu cầu mới" : "Send a new request")}
          </Link>
          {sourcing && <a href="#vexim-conversation" className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-4 py-2 text-[13.5px] font-semibold text-ink-800 hover:border-ink-900">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />{locale === "vi" ? "Trao đổi với Vexim" : "Discuss with Vexim"}
          </a>}
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
          {isQuestion
            ? (locale === "vi" ? "Câu hỏi này chỉ để xem lại. Hãy mở trang sản phẩm để hỏi mới bằng Chat with supplier."
              : "This question is read-only. Open the product page and use Chat with supplier for a new question.")
            : (locale === "vi" ? "Xem tiến độ và gửi tin trong tài khoản. Email chỉ để thông báo."
              : "Check progress and send messages in your account. Email is for notifications only.")}
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
