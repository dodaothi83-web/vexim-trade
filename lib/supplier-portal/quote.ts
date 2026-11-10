import type { DataStore } from "@/lib/db/types";
import type { EmailMessage, RfqMatch, RfqMatchStatus, Supplier } from "@/lib/types";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { canDirectPublishRfqQuote, cleanQuoteBuyerNote } from "@/lib/rfq/portal-core";

/** Drafts remain private until publication. Direct RFQs publish after saving; sourcing
 * revisions wait for Vexim again. Published versions are immutable buyer snapshots. */

export const QUOTE_CURRENCIES = ["USD", "EUR", "VND"] as const;
export const QUOTE_INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DDP"] as const;
/** Published quotes can be revised; the old buyer-visible snapshot remains until the new one is published. */
export const QUOTABLE_MATCH_STATUSES: RfqMatchStatus[] = ["sent_to_supplier", "no_response", "quoted", "presented_to_buyer"];
const CLOSED_RFQ = ["won", "lost", "spam"];

export type QuoteErrorKey =
  | "notFound" | "closed" | "price" | "currency" | "unit" | "incoterm" | "leadTime" | "validUntil" | "note" | "buyerNote";

export type SupplierQuoteInput =
  | { intent: "quote"; price: number; currency: string; unit: string; incoterm: string; leadTimeDays: number; validUntil: string | null; note: string; buyerNote: string }
  | { intent: "decline"; note: string };

/** Đọc và kiểm tra form; trả mã lỗi để giao diện hiện đúng ngôn ngữ. */
export function parseSupplierQuote(fd: FormData, now = new Date()): { ok: true; value: SupplierQuoteInput } | { ok: false; error: QuoteErrorKey } {
  const note = String(fd.get("note") ?? "").trim();
  if (note.length > 1000) return { ok: false, error: "note" };
  if (String(fd.get("intent") ?? "") === "decline") return { ok: true, value: { intent: "decline", note } };
  const publicNote = cleanQuoteBuyerNote(fd.get("buyer_note"));
  if (!publicNote.ok) return { ok: false, error: publicNote.error };

  const priceRaw = String(fd.get("price") ?? "").trim().replace(",", ".");
  const price = Number(priceRaw);
  if (!/^\d+(\.\d{1,4})?$/.test(priceRaw) || !(price > 0) || price >= 1e9) return { ok: false, error: "price" };
  const currency = String(fd.get("currency") ?? "").trim().toUpperCase();
  if (!(QUOTE_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: "currency" };
  const unit = String(fd.get("unit") ?? "").trim();
  if (!unit || unit.length > 20 || withoutDirectContacts(unit) !== unit) return { ok: false, error: "unit" };
  const incoterm = String(fd.get("incoterm") ?? "").trim().toUpperCase();
  if (!(QUOTE_INCOTERMS as readonly string[]).includes(incoterm)) return { ok: false, error: "incoterm" };
  const leadRaw = String(fd.get("lead_time_days") ?? "").trim();
  const leadTimeDays = Number(leadRaw);
  if (!/^\d+$/.test(leadRaw) || leadTimeDays < 1 || leadTimeDays > 365) return { ok: false, error: "leadTime" };
  const validRaw = String(fd.get("valid_until") ?? "").trim();
  let validUntil: string | null = null;
  if (validRaw) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(validRaw) ? Date.parse(`${validRaw}T23:59:59Z`) : NaN;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (!Number.isFinite(day) || day < today || day > today + 366 * 86400_000) return { ok: false, error: "validUntil" };
    validUntil = validRaw;
  }
  return { ok: true, value: { intent: "quote", price, currency, unit, incoterm, leadTimeDays, validUntil, note, buyerNote: publicNote.note } };
}

/** Ghi báo giá / từ chối vào lời mời. Ném lỗi mã `notFound` hoặc `closed` khi không được phép. */
export async function recordSupplierPortalQuote(input: {
  store: DataStore;
  supplier: Pick<Supplier, "id" | "email">;
  actorEmail: string;
  matchId: string;
  quote: SupplierQuoteInput;
}): Promise<{ code: string; rfqId: string; matchId: string; updatedAt: string; intent: SupplierQuoteInput["intent"]; direct: boolean }> {
  const { store, supplier, quote } = input;
  const match = await store.getRfqMatch(input.matchId);
  // Lời mời của nhà cung cấp khác hay chưa được gửi thì coi như không tồn tại.
  if (!match || match.supplier_id !== supplier.id || !match.sent_to_supplier_at) throw new Error("notFound");
  const rfq = await store.getRfq(match.rfq_id);
  if (!rfq || rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question") throw new Error("notFound");
  if (CLOSED_RFQ.includes(rfq.status) || !QUOTABLE_MATCH_STATUSES.includes(match.status) ||
      (quote.intent === "decline" && !!match.sent_to_buyer_at)) throw new Error("closed");

  const now = new Date().toISOString();
  const patch: Partial<RfqMatch> = quote.intent === "quote"
    ? {
        status: "quoted",
        quote_price: quote.price,
        quote_currency: quote.currency,
        quote_unit: quote.unit,
        quote_incoterm: quote.incoterm,
        quote_lead_time_days: quote.leadTimeDays,
        quote_valid_until: quote.validUntil,
        quote_buyer_note: quote.buyerNote || null,
        supplier_replied_at: match.supplier_replied_at ?? now,
      }
    : { status: "declined", supplier_replied_at: match.supplier_replied_at ?? now };
  const saved = await store.updateRfqMatchIfState(match.id, supplier.id, match.status, match.updated_at, patch);
  if (!saved) throw new Error("closed"); // Another tab/staff action published or closed it first.

  // Ghi vào timeline RFQ để nhân viên thấy ngay trong CRM, cùng mạch với thư của lời mời này.
  const summary = quote.intent === "quote"
    ? [
        `Giá: ${quote.price} ${quote.currency} / ${quote.unit}`,
        `Incoterm: ${quote.incoterm}`,
        `Lead time: ${quote.leadTimeDays} ngày`,
        quote.validUntil ? `Hiệu lực đến: ${quote.validUntil}` : null,
        quote.buyerNote ? `Điều kiện hiển thị cho người mua: ${quote.buyerNote}` : null,
      ].filter(Boolean).join("\n")
    : "Nhà cung cấp không tham gia chào giá lần này.";
  const body = quote.note ? `${summary}\n\nGhi chú của nhà cung cấp:\n${quote.note}` : summary;
  const subject = quote.intent === "quote"
    ? `Báo giá qua cổng nhà cung cấp – ${rfq.code}`
    : `Nhà cung cấp từ chối qua cổng – ${rfq.code}`;
  await store.addMessage({
    buyer_id: null,
    supplier_id: supplier.id,
    rfq_id: rfq.id,
    rfq_match_id: match.id,
    kind: "inbound",
    stage: null,
    direction: "supplier",
    thread_id: `rfq-${rfq.id}-match-${match.id}`,
    subject,
    to_emails: [],
    cc_emails: [],
    bcc_emails: [],
    body_html: "",
    body_text: body,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: "received",
    provider: "local",
    error: null,
    created_by: input.actorEmail,
    sent_at: now,
  } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null })
    .catch((err) => console.error("[supplier-portal] quote saved but timeline entry failed", err));

  await store.addAuditLog({
    actor_id: null,
    actor_email: input.actorEmail,
    entity: "rfq_match",
    entity_id: match.id,
    action: quote.intent === "quote" ? "supplier_portal.quote" : "supplier_portal.decline",
    before: { status: match.status, quote_price: match.quote_price },
    after: { status: patch.status, quote_price: patch.quote_price ?? null },
  }).catch((err) => console.error("[supplier-portal] quote audit failed", err));

  // Only this supplier's explicitly consented direct invitation can self-publish.
  return { code: rfq.code, rfqId: rfq.id, matchId: match.id, updatedAt: saved.updated_at, intent: quote.intent,
    direct: canDirectPublishRfqQuote(rfq, match) };
}
