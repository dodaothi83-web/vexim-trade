/**
 * Xử lý submit RFQ form (server action / API). Không phải server action trực tiếp
 * để có thể gọi từ cả Route Handler lẫn Server Action.
 */
import { headers } from "next/headers";

import { getStore } from "@/lib/db";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { listPublicCategoryProducts } from "@/lib/public/product-catalog";
import {
  sendRfqAckBuyer,
  sendRfqNewInternal,
} from "@/lib/email/rfq";
import type { Buyer, Rfq } from "@/lib/types";
import {
  emailDomain,
  fingerprint,
  generateAccessToken,
  generateRfqCode,
  hasMxRecord,
  isLikelyWebmail,
  normalizeCompanyWebsite,
  scoreSpam,
} from ".";
import { gcRateLimit, rateLimit } from "./rate-limit";

export interface SubmitRfqInput {
  // Step 1 – product
  product_text: string;
  source_product_id?: string | null;
  category_slug?: string | null;
  grade?: string | null;
  quantity?: number | null;
  unit?: string | null;
  frequency?: string | null;
  incoterm?: string | null;
  destination_country?: string | null;
  needed_by?: string | null;
  target_price?: number | null;
  target_price_currency?: string | null;
  wants_samples?: boolean;
  wants_inspection?: boolean;
  wants_video_call?: boolean;
  preferred_supplier_ids?: string[];
  packaging?: string | null;
  certifications?: string | null;
  message?: string | null;

  // Step 2 – company
  company: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  website?: string | null;
  business_type?: string | null;
  consent: boolean;

  // Metadata
  source_page?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;

  // Anti-spam
  honeypot?: string | null;
  turnstile_token?: string | null;
}

export interface SubmitRfqResult {
  ok: boolean;
  message: string;
  rfqId?: string;
  buyerId?: string;
  status?: string;
  accessToken?: string;
  statusPageUrl?: string;
  spam?: { score: number; flags: string[]; quarantine: boolean; needsReview: boolean };
  rateLimited?: boolean;
}

async function firstHeader(name: string): Promise<string | null> {
  const h = await headers();
  const v = h.get(name);
  return v ?? null;
}

async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || secret === "x" || secret === "") return true; // chưa cấu hình => bỏ qua ở dev
  if (!token) return false;
  try {
    const ip = (await firstHeader("x-forwarded-for"))?.split(",")[0]?.trim() ?? "127.0.0.1";
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function rejectWebmail(): boolean {
  return process.env.RFQ_REJECT_WEBMAIL === "true";
}

export async function submitRfq(raw: SubmitRfqInput): Promise<SubmitRfqResult> {
  // 1) Rate limit per IP/UA
  gcRateLimit();
  const ip = (await firstHeader("x-forwarded-for"))?.split(",")[0]?.trim() ?? null;
  const ua = await firstHeader("user-agent");
  const fp = fingerprint(ip, ua);
  const rl = rateLimit(`rfq:${fp}`, { windowMs: 60 * 60 * 1000, max: 5 }); // 5 RFQ/giờ/người
  if (!rl.ok) {
    return {
      ok: false,
      message: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 giờ.",
      rateLimited: true,
    };
  }

  // 2) Turnstile
  const turnstileOk = await verifyTurnstile(raw.turnstile_token);

  // 3) Spam score (3 ngưỡng):
  //    - < 40   : new        → ghi nhận ngay, ack buyer, báo desk (SLA 4h/24h áp dụng).
  //    - 40–99  : needs_review → nghi ngờ, ack buyer với dòng "đang xem xét thủ công",
  //                              internal email được gắn cờ spam review, không auto-assign.
  //    - ≥ 100  : spam       → cách ly, KHÔNG gửi ack buyer, chỉ gửi cảnh báo nội bộ.
  const { score: spamScore, flags } = scoreSpam({
    name: raw.contact_name,
    email: raw.email,
    company: raw.company,
    website: raw.website,
    message: raw.message,
    productText: raw.product_text,
    phone: raw.phone,
    honeypot: raw.honeypot,
    turnstileOk,
  });
  let rfqStatus: Rfq["status"] = "new";
  let ackBuyer = true;
  if (spamScore >= 100) { rfqStatus = "spam"; ackBuyer = false; }
  else if (spamScore >= 40) { rfqStatus = "needs_review"; ackBuyer = true; }

  // 4) Từ chối webmail nếu cờ bật
  if (rejectWebmail() && isLikelyWebmail(raw.email)) {
    return {
      ok: false,
      message: "Vui lòng dùng email công ty (không dùng Gmail / Yahoo / Outlook).",
    };
  }

  // 5) Kiểm tra MX (best-effort)
  const domain = emailDomain(raw.email);
  if (domain) {
    const mx = await hasMxRecord(domain);
    if (!mx.ok) {
      return {
        ok: false,
        message: "Tên miền email không có bản ghi MX. Vui lòng kiểm tra lại địa chỉ email.",
      };
    }
  }

  if (!raw.consent) {
    return { ok: false, message: "Bạn cần đồng ý với chính sách bảo mật." };
  }
  if (!raw.product_text.trim()) {
    return { ok: false, message: "Vui lòng mô tả sản phẩm cần báo giá." };
  }
  if (!raw.company.trim() || !raw.contact_name.trim() || !raw.email.trim()) {
    return { ok: false, message: "Vui lòng điền đầy đủ tên công ty, người liên hệ và email." };
  }

  // 6) Upsert buyer theo email
  const store = getStore();
  const web = normalizeCompanyWebsite(raw.website ?? null);

  let buyer: Buyer | null = null;
  // Tìm buyer theo email
  const all = await store.listBuyers().catch(() => []);
  if (raw.email) {
    buyer = all.find((b) => b.email && b.email.toLowerCase() === raw.email.toLowerCase().trim()) ?? null;
  }

  const buyerInput = {
    company: raw.company.trim(),
    contact_name: raw.contact_name.trim(),
    email: raw.email.trim().toLowerCase(),
    email_domain: domain,
    cc_emails: null,
    phone: raw.phone?.trim() ?? null,
    country: raw.country?.trim() ?? null,
    website: web,
    linkedin: null,
    instagram: null,
    product: raw.product_text.trim(),
    spec: [raw.grade, raw.packaging, raw.certifications].filter(Boolean).join(" · ") || null,
    quantity: raw.quantity && raw.unit ? `${raw.quantity} ${raw.unit}` : null,
    target_price:
      raw.target_price && raw.target_price_currency
        ? `${raw.target_price} ${raw.target_price_currency}`
        : null,
    payment_method: null,
    payment_terms: null,
    incoterm: raw.incoterm ?? null,
    port: null,
    expected_ship_date: raw.needed_by ?? null,
    deal_value: null,
    supplier_id: null,
    hide_buyer_from_supplier: true,
    stage: "new",
    owner: null,
    source: raw.source_page ?? "rfq_form",
    priority: "normal" as const,
    next_action: null,
    next_action_date: null,
    notes: raw.message?.trim() ?? null,
    business_type: raw.business_type?.trim() ?? null,
    consent_at: new Date().toISOString(),
    consent_policy_version: "v1",
    is_blocked: false,
  };

  if (buyer) {
    // Update (giữ stage/owner cũ, không theo GĐ0 spec tự đẩy stage)
    buyer = await store.updateBuyer(buyer.id, {
      ...buyerInput,
      stage: buyer.stage,
      owner: buyer.owner,
    });
  } else {
    buyer = await store.createBuyer(buyerInput);
  }

  // 7) Lấy category theo slug nếu có
  let categoryId: string | null = null;
  let category = null as Awaited<ReturnType<typeof store.getCategoryBySlug>>;
  if (raw.category_slug) {
    category = await store.getCategoryBySlug(raw.category_slug).catch(() => null);
    categoryId = category?.id ?? null;
  }

  // 8) Sinh code (đếm số RFQ trong ngày để gán seq — đơn giản bằng cách đếm RFQ có code bắt đầu RFQ-YYYYMMDD-)
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `RFQ-${yyyymmdd}-`;
  const today = (await store.listRfqs()).filter((r) => r.code.startsWith(prefix));
  const seq = today.length + 1;
  const code = generateRfqCode(seq);

  // Resolve preferred_supplier_ids (chỉ giữ những NCC published)
  let preferredIds: string[] = [];
  if (raw.preferred_supplier_ids && raw.preferred_supplier_ids.length > 0) {
    const publ = await listPublicSuppliers().catch(() => []);
    const pubIds = new Set(publ.map((s) => s.id));
    preferredIds = raw.preferred_supplier_ids.filter((id) => pubIds.has(id));
  }

  // Attribution only when the URL names a real, published buyer-ready product of the preferred supplier.
  // A buyer may edit product_text; never guess product identity from that free text.
  const sourceProductId = category?.status === "published" && category.is_published && raw.source_product_id && preferredIds.length
    ? (await listPublicCategoryProducts(category).catch(() => [])).some((p) => p.id === raw.source_product_id && preferredIds.includes(p.supplierId) &&
        p.name.trim().toLowerCase() === raw.product_text.trim().toLowerCase())
      ? raw.source_product_id : null
    : null;

  const utm = {
    ...(raw.utm_source ? { source: raw.utm_source } : {}),
    ...(raw.utm_medium ? { medium: raw.utm_medium } : {}),
    ...(raw.utm_campaign ? { campaign: raw.utm_campaign } : {}),
  };

  const rfq = await store.createRfq({
    code,
    buyer_id: buyer.id,
    category_id: categoryId,
    product_text: raw.product_text.trim(),
    specs: {
      grade: raw.grade ?? null,
      packaging: raw.packaging ?? null,
      certifications: raw.certifications ?? null,
    },
    quantity: raw.quantity ?? null,
    unit: raw.unit ?? null,
    frequency: raw.frequency ?? null,
    destination_country: raw.destination_country ?? null,
    incoterm: raw.incoterm ?? null,
    needed_by: raw.needed_by ?? null,
    target_price: raw.target_price ?? null,
    target_price_currency: raw.target_price_currency ?? null,
    wants_samples: raw.wants_samples ?? false,
    wants_inspection: raw.wants_inspection ?? false,
    wants_video_call: raw.wants_video_call ?? false,
    preferred_supplier_ids: preferredIds,
    source_product_id: sourceProductId,
    source_page: raw.source_page ?? null,
    utm,
    referrer: raw.referrer ?? null,
    spam_score: spamScore,
    spam_flags: flags,
    status: rfqStatus,
    assigned_to: null,
    first_response_at: null,
    lost_reason: null,
    closed_reason: null,
    access_token: generateAccessToken(),
  });

  // Audit log — ghi nhận mọi RFQ submit vào hệ thống (người gửi là "buyer:email").
  try {
    await store.addAuditLog({
      actor_id: buyer.id,
      actor_email: buyer.email,
      entity: "rfq",
      entity_id: rfq.id,
      action: rfqStatus === "spam" ? "submit_spam" : rfqStatus === "needs_review" ? "submit_flagged" : "submit",
      before: null,
      after: { status: rfqStatus, spam_score: spamScore, spam_flags: flags },
    });
  } catch {
    // audit lỗi không làm hỏng luồng submit
  }

  // Gửi email (best-effort; lỗi gửi không làm mất RFQ vì đã lưu vào DB).
  try {
    if (ackBuyer) await sendRfqAckBuyer({ rfq, buyer });
    await sendRfqNewInternal({ rfq, buyer });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[rfq] email send failed, but rfq is saved:", err);
  }

  let message = "Yêu cầu đã được gửi! Kiểm tra email để theo dõi tiến độ.";
  if (rfqStatus === "needs_review") message = "Yêu cầu đã được nhận. Chúng tôi đang xem xét thủ công và sẽ liên lạc lại trong vòng vài giờ làm việc.";
  if (rfqStatus === "spam") message = "Yêu cầu đã được nhận và đang chờ duyệt.";

  return {
    ok: true,
    message,
    rfqId: rfq.id,
    buyerId: buyer.id,
    status: rfq.status,
    accessToken: rfq.access_token,
    // spam RFQ không tiết lộ link theo dõi (không có ack).
    statusPageUrl: rfqStatus === "spam" ? undefined : `/rfq/status/${rfq.access_token}`,
    spam: { score: spamScore, flags, quarantine: rfqStatus === "spam", needsReview: rfqStatus === "needs_review" },
  };
}
