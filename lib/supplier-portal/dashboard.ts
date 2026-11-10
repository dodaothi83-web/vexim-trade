import type { Certificate, Supplier, SupplierNoticeRead, SupplierProduct, SupplierRfqInvitation, SupplierSubmission, SupplierVerificationRequest, Verification } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { publicProductTitle } from "@/lib/public/display-name";
import type { Locale } from "@/lib/i18n/config";
import { fill } from "@/lib/i18n/format";
import { noticesMessages } from "@/lib/i18n/portal/notices";
import { rfqsMessages } from "@/lib/i18n/portal/rfqs";
import { rfqBuyerContact, type RfqBuyerContact } from "@/lib/rfq/buyer-contact";
import { rfqChannel } from "@/lib/rfq/channel";
import { rfqEventAfter, supplierMatchHasReply } from "@/lib/rfq/portal-core";

export interface PortalNotice {
  key: string;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  kind: "rfq" | "verification" | "contact" | "product" | "certificate";
  /** Trang đúng để xử lý thông báo này; bấm vào là tới thẳng chỗ cần xem. */
  href: string;
}

export interface PortalInvite {
  matchId: string;
  code: string;
  title: string;
  status: string;
  sentAt: string;
  dueAt: string | null;
  quantity: string;
  destination: string;
  quotePrice: string | null;
  repliedAt: string | null;
  productId: string | null;
  /** Current, sanitized catalog details for this supplier's verified source product only. */
  linkedProduct: { spec: string | null; packaging: string | null; moq: string | null } | null;
  /** Buyer-visible request only: sanitized product text and an explicit allowlist of RFQ fields. */
  request: {
    description: string;
    grade: string | null;
    packaging: string | null;
    certifications: string | null;
    frequency: string | null;
    incoterm: string | null;
    delivery: string | null;
    wantsSamples: boolean;
    wantsInspection: boolean;
    wantsVideoCall: boolean;
  };
  /** Only the consented, whitelisted snapshot for this actually invited supplier. */
  buyerContact: RfqBuyerContact | null;
  /** Quotes can be revised; pending sourcing revisions do not overwrite the published snapshot. */
  canQuote: boolean;
  /** Same channel as the quote action: direct RFQs publish automatically; sourcing waits for Vexim. */
  directToBuyer: boolean;
  newBuyerMessage: boolean;
  publishedAt: string | null;
  /** Giá trị điền sẵn cho form báo giá (bản nháp hiện tại hoặc yêu cầu). */
  quoteDefaults: { price: string; currency: string; unit: string; incoterm: string; leadTimeDays: string; validUntil: string; buyerNote?: string };
}

const responded = (m: SupplierRfqInvitation) => !!m.supplier_replied_at || m.quote_price != null || m.status === "declined";

/**
 * Nhãn trạng thái lời mời theo ngôn ngữ. Mặc định tiếng Việt để API và CRM giữ nguyên
 * hành vi; trang RFQ truyền locale đọc từ cookie.
 */
function statusLabel(status: string, language: Locale): string {
  const map = rfqsMessages[language].status as Record<string, string>;
  return map[status] ?? rfqsMessages[language].status.processing;
}

type NoticeInput = {
  supplierId: string;
  supplier?: Supplier;
  invites: SupplierRfqInvitation[];
  products: SupplierProduct[];
  certificates?: Certificate[];
  reviews: Verification[];
  requests: SupplierVerificationRequest[];
  /** Hồ sơ bằng chứng NCC tự gửi qua cổng L2/L3 (nếu bảng supplier_submissions đã có). */
  submissions?: SupplierSubmission[];
  reads: SupplierNoticeRead[];
  now?: Date;
  /** Ngôn ngữ của câu thông báo; mặc định tiếng Việt để API cũ không đổi. */
  language?: Locale;
};

/** RFQ thực sự đã chuyển cho NCC này: bỏ bản nháp, bản đề xuất và bản của NCC khác. */
function relevantInvites(supplierId: string, invites: SupplierRfqInvitation[]) {
  return invites.filter((m) => m.supplier_id === supplierId && !!m.sent_to_supplier_at && m.status !== "proposed" && !!m.rfq &&
    m.rfq.source_page !== "/rfq?intent=question");
}

function safeRequestText(value: unknown, language: Locale, max: number): string | null {
  if (typeof value !== "string") return null;
  // Buyer requirements and catalog fields are free text. Strip unsolicited email/phone/URLs;
  // only the separately consented buyerContact block may disclose direct contacts.
  return withoutDirectContacts(value.trim())
    .replaceAll("[contact via Vexim]", rfqsMessages[language].request.redacted)
    .slice(0, max).trim() || null;
}

/** Only consented contact and whitelisted, sanitized RFQ requirements; no CRM row or desk notes. */
function projectInvites(relevant: SupplierRfqInvitation[], products: SupplierProduct[], supplierId: string, language: Locale): PortalInvite[] {
  const fallback = rfqsMessages[language].fallback;
  const productMap = new Map(products.filter((p) => p.supplier_id === supplierId).map((p) => [p.id, p]));
  return relevant.map((m) => {
    const rfq = m.rfq!;
    const text = (value: unknown, max = 200) => safeRequestText(value, language, max);
    const product = rfq.source_product_id ? productMap.get(rfq.source_product_id) : null;
    // The name on the buyer-facing product card is not necessarily the supplier's raw name.
    const title = product ? text(publicProductTitle(product)) || fallback.title : fallback.title;
    const month = text(rfq.shipment_month, 7);
    const deliveryMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
      ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : null;
    const destination = [text(rfq.destination_country), text(rfq.destination_port)].filter(Boolean).join(" · ");
    return {
      matchId: m.id, code: rfq.code, title,
      status: statusLabel(m.status, language), sentAt: m.sent_to_supplier_at!,
      dueAt: m.response_due_at ?? null,
      quantity: rfq.quantity && rfq.unit ? `${rfq.quantity} ${text(rfq.unit, 30) || ""}`.trim() : fallback.quantity,
      destination: destination || fallback.destination,
      repliedAt: m.supplier_replied_at ?? null,
      quotePrice: m.quote_price != null ? `${m.quote_price} ${m.quote_currency || ""}/${text(m.quote_unit || rfq.unit, 20) || ""}` : null,
      productId: product?.id ?? null,
      linkedProduct: product ? {
        spec: text(product.spec_i18n?.[language] || product.spec, 260) ||
          text(product.description_i18n?.[language] || product.description, 260),
        packaging: text(product.packaging_i18n?.[language] || product.packaging, 160),
        moq: text(product.moq, 80),
      } : null,
      request: {
        description: text(rfq.product_text, 4_000) || fallback.title,
        grade: text(rfq.grade), packaging: text(rfq.packaging, 500),
        certifications: text(rfq.certifications, 500), frequency: text(rfq.frequency, 100),
        incoterm: text(rfq.incoterm, 30), delivery: deliveryMonth || text(rfq.needed_by, 100),
        wantsSamples: rfq.wants_samples === true, wantsInspection: rfq.wants_inspection === true,
        wantsVideoCall: rfq.wants_video_call === true,
      },
      buyerContact: rfqBuyerContact({ specs: rfq as Record<string, unknown>,
        source_product_id: rfq.source_product_id, preferred_supplier_ids: rfq.preferred_supplier_ids }, supplierId),
      canQuote: ["sent_to_supplier", "no_response", "quoted", "presented_to_buyer"].includes(m.status) &&
        !["won", "lost", "spam"].includes(rfq.status ?? ""),
      newBuyerMessage: supplierMatchHasReply(m),
      publishedAt: m.sent_to_buyer_at ?? null,
      directToBuyer: !!rfqBuyerContact({ specs: rfq as Record<string, unknown>,
        source_product_id: rfq.source_product_id, preferred_supplier_ids: rfq.preferred_supplier_ids }, supplierId) &&
        rfqChannel({ source_page: rfq.source_page, source_product_id: rfq.source_product_id,
          preferred_supplier_ids: rfq.preferred_supplier_ids ?? [], specs: { sourcing_request_id: rfq.sourcing_request_id } }) === "direct",
      quoteDefaults: {
        price: m.quote_price != null ? String(m.quote_price) : "",
        currency: m.quote_currency || "USD",
        unit: text(m.quote_unit || rfq.unit, 20) || "",
        incoterm: (m.quote_incoterm || rfq.incoterm || "FOB").toUpperCase(),
        leadTimeDays: m.quote_lead_time_days != null ? String(m.quote_lead_time_days) : "",
        validUntil: m.quote_valid_until ? m.quote_valid_until.slice(0, 10) : "",
        buyerNote: m.quote_buyer_note ?? "",
      },
    };
  }).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/**
 * Việc cần làm = RFQ đã chuyển mà NCC chưa trả lời. Tách khỏi trang tổng quan để
 * trang RFQ là nơi duy nhất xử lý việc này.
 */
export function buildSupplierTasks(invites: PortalInvite[], relevant: SupplierRfqInvitation[]) {
  return invites.filter((m) => m.canQuote && !m.repliedAt && relevant.some((r) => r.id === m.matchId && ["sent_to_supplier", "no_response"].includes(r.status)));
}

/** Bốn chỉ số báo cáo lời mời báo giá trong khoảng ngày đã chọn. */
export function buildSupplierReport(input: { supplierId: string; invites: SupplierRfqInvitation[]; products: SupplierProduct[]; days: 7 | 30 | 90; now?: Date; language?: Locale }) {
  const now = input.now ?? new Date();
  const fallbackRow = rfqsMessages[input.language ?? "vi"].fallback.productRow;
  const relevant = relevantInvites(input.supplierId, input.invites);
  const productMap = new Map(input.products.filter((p) => p.supplier_id === input.supplierId).map((p) => [p.id, p]));
  const cutoff = now.getTime() - input.days * 86400_000;
  const period = relevant.filter((m) => Date.parse(m.sent_to_supplier_at!) >= cutoff && Date.parse(m.sent_to_supplier_at!) <= now.getTime());
  const group = new Map<string, { id: string; name: string; sent: number; quoted: number }>();
  for (const m of period) {
    const product = m.rfq!.source_product_id ? productMap.get(m.rfq!.source_product_id) : null;
    const key = product?.id ?? "other";
    const row = group.get(key) ?? { id: key, name: product ? withoutDirectContacts(publicProductTitle(product)).slice(0, 200) || fallbackRow : fallbackRow, sent: 0, quoted: 0 };
    row.sent += 1;
    if (m.quote_price != null) row.quoted += 1;
    group.set(key, row);
  }
  return {
    sent: period.length,
    responded: period.filter(responded).length,
    quoted: period.filter((m) => m.quote_price != null).length,
    selected: period.filter((m) => m.status === "selected").length,
    byProduct: [...group.values()].sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name)),
  };
}

export type SupplierRfqBoard = ReturnType<typeof buildSupplierRfqBoard>;

/** Toàn bộ dữ liệu cho trang RFQ: danh sách, việc cần trả lời và báo cáo. */
export function buildSupplierRfqBoard(input: { supplierId: string; invites: SupplierRfqInvitation[]; products: SupplierProduct[]; days: 7 | 30 | 90; now?: Date; language?: Locale }) {
  const language = input.language ?? "vi";
  const relevant = relevantInvites(input.supplierId, input.invites);
  const invites = projectInvites(relevant, input.products, input.supplierId, language);
  return {
    invites,
    tasks: buildSupplierTasks(invites, relevant),
    report: buildSupplierReport({ ...input, language }),
  };
}

/**
 * Thông báo là một chức năng riêng: chỉ trang Thông báo và chuông ở thanh trên dùng
 * danh sách này. Mọi thông báo đều là sự kiện đã có thật trong dữ liệu, không phải
 * lời nhắc tự sinh.
 */
export function buildSupplierNotices(input: NoticeInput): PortalNotice[] {
  const { supplierId, products, reviews, requests, reads } = input;
  const now = input.now ?? new Date();
  const t = noticesMessages[input.language ?? "vi"];
  const relevant = relevantInvites(supplierId, input.invites);
  const readKeys = new Set(reads.filter((r) => r.supplier_id === supplierId).map((r) => r.notice_key));
  const notices: PortalNotice[] = [];
  const add = (key: string, title: string, detail: string, at: string, kind: PortalNotice["kind"], href: string) => {
    if (at && !Number.isNaN(Date.parse(at))) notices.push({ key, title, detail, at, kind, href, read: readKeys.has(key) });
  };
  // Mỗi thông báo trỏ đúng nơi phải mở, không phải một trang chung.
  const levelHref = (level: number) => level === 1 ? "/supplier/portal/documents"
    : level === 2 ? "/supplier/portal/verification/factory" : "/supplier/portal/verification/export";
  const levelLabel = (level: number) => level === 1 ? t.levels.documents : level === 2 ? t.levels.factory : t.levels.delivery;
  const CERT_HREF = "/supplier/portal/documents#chung-nhan";
  if (input.supplier?.id === supplierId && input.supplier.onboarding_status === "approved") {
    add(`onboarding-approved:${supplierId}`, t.onboardingApproved.title, t.onboardingApproved.detail, input.supplier.updated_at, "verification", "/supplier/portal");
  }
  for (const m of relevant) {
    add(`rfq:${m.id}`, fill(t.rfqSent.title, { code: m.rfq!.code }), t.rfqSent.detail, m.sent_to_supplier_at!, "rfq", "/supplier/portal/rfqs");
    if (m.status === "selected") add(`selected:${m.id}`, fill(t.rfqSelected.title, { code: m.rfq!.code }), t.rfqSelected.detail, m.updated_at, "rfq", "/supplier/portal/rfqs");
    const replyAt = m.last_buyer_message_at ?? (m.last_thread_sender === "buyer" ? m.last_thread_message_at : null);
    if (replyAt) {
      const key = `rfq-reply:${m.id}:${replyAt}`;
      add(key, fill(t.rfqReply.title, { code: m.rfq!.code }), t.rfqReply.detail, replyAt,
        "rfq", `/supplier/portal/rfqs/${encodeURIComponent(m.id)}`);
      const notice = notices.find((n) => n.key === key);
      if (notice) notice.read = notice.read || (!!m.supplier_last_read_at && !rfqEventAfter(replyAt, m.supplier_last_read_at));
    }
  }
  for (const v of reviews.filter((v) => v.supplier_id === supplierId)) {
    const label = levelLabel(v.target_level);
    if (v.status === "returned") add(`returned:${v.id}`, fill(t.reviewReturned.title, { label }), t.reviewReturned.detail, v.updated_at, "verification", levelHref(v.target_level));
    if (v.status === "approved") add(`approved:${v.id}`, fill(t.reviewApproved.title, { label }), t.reviewApproved.detail, v.approved_at || v.updated_at, "verification", levelHref(v.target_level));
  }
  // Only show the current staff decision. Draft saves, uploads and pending review are not decisions.
  for (const p of products.filter((p) => p.supplier_id === supplierId)) {
    if (p.supplier_review_status === "approved") {
      const live = p.supplier_originated === true && p.ready_for_buyer === true;
      add(`product-approved:${p.id}`, fill(live ? t.product.live : t.product.pending, { name: p.name }),
        live ? t.product.liveDetail : t.product.pendingDetail,
        p.updated_at, "product", `/supplier/portal/products/${p.id}`);
    }
    if (p.supplier_review_status === "changes_requested") add(`product-changes:${p.id}`, fill(t.product.changes, { name: p.name }), p.supplier_review_note || t.product.changesFallback, p.updated_at, "product", `/supplier/portal/products/${p.id}`);
  }
  const todayMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  for (const c of (input.certificates ?? []).filter((c) => c.supplier_id === supplierId)) {
    if (c.review_status === "approved") {
      if (c.publicly_visible) add(`cert-published:${c.id}`, fill(t.certificate.published, { name: c.name }), t.certificate.publishedDetail, c.updated_at, "certificate", CERT_HREF);
      else add(`cert-approved:${c.id}`, fill(t.certificate.approved, { name: c.name }), t.certificate.approvedDetail, c.checked_at || c.updated_at, "certificate", CERT_HREF);
    }
    if (c.review_status === "changes_requested") add(`cert-changes:${c.id}`, fill(t.certificate.changes, { name: c.name }), c.review_note || t.certificate.changesFallback, c.updated_at, "certificate", CERT_HREF);
    if (c.review_status === "rejected") add(`cert-rejected:${c.id}`, fill(t.certificate.rejected, { name: c.name }), c.review_note || t.certificate.rejectedFallback, c.updated_at, "certificate", CERT_HREF);
    if (c.review_status !== "rejected" && c.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(c.valid_until)) {
      const endMs = Date.parse(`${c.valid_until}T00:00:00Z`);
      const daysLeft = Math.floor((endMs - todayMs) / 86_400_000);
      if (daysLeft >= 0 && daysLeft <= 60) {
        add(
          `cert-expiring:${c.id}`,
          fill(t.certificate.expiring, { days: daysLeft, name: c.name }),
          fill(t.certificate.expiringDetail, { date: c.valid_until }),
          c.updated_at || now.toISOString(),
          "certificate",
          CERT_HREF,
        );
      }
    }
  }
  for (const s of (input.submissions ?? []).filter((row) => row.supplier_id === supplierId)) {
    const label = s.target_level === 2 ? t.submissions.factory : t.submissions.export;
    if (s.status === "pending_review") add(`submission-queued:${s.id}`, fill(t.submission.queued, { label }), t.submission.queuedDetail, s.submitted_at || s.updated_at, "verification", levelHref(s.target_level));
    if (s.status === "returned") add(`submission-returned:${s.id}`, fill(t.submission.returned, { label }), s.review_note || t.submission.returnedFallback, s.reviewed_at || s.updated_at, "verification", levelHref(s.target_level));
    if (s.status === "accepted") add(`submission-accepted:${s.id}`, fill(t.submission.accepted, { label }), t.submission.acceptedDetail, s.reviewed_at || s.updated_at, "verification", levelHref(s.target_level));
  }
  for (const r of requests.filter((r) => r.supplier_id === supplierId && r.status === "contacted" && r.contacted_at)) {
    add(`contacted:${r.target_level}`, fill(t.contacted.title, { label: levelLabel(r.target_level) }), t.contacted.detail, r.contacted_at!, "contact", levelHref(r.target_level));
  }
  return notices.sort((a, b) => b.at.localeCompare(a.at));
}

/** Dữ liệu cho trang Thông báo: danh sách và số chưa đọc. */
export function buildSupplierNoticeFeed(input: NoticeInput & { language?: Locale }) {
  const notices = buildSupplierNotices(input);
  return { notices, unreadCount: notices.filter((n) => !n.read).length };
}

/** Ảnh chụp tổng hợp, giữ nguyên cho các nơi cần cả ba phần cùng lúc. */
export function buildSupplierDashboard(input: NoticeInput & { days: 7 | 30 | 90; language?: Locale }) {
  const language = input.language ?? "vi";
  const relevant = relevantInvites(input.supplierId, input.invites);
  const invites = projectInvites(relevant, input.products, input.supplierId, language);
  const notices = buildSupplierNotices(input);
  return {
    invites,
    notices,
    unreadCount: notices.filter((n) => !n.read).length,
    tasks: buildSupplierTasks(invites, relevant),
    report: buildSupplierReport({ ...input, language }),
  };
}
