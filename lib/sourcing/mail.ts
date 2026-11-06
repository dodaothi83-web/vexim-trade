import brandColors from "@/lib/brand/colors.json";
import { FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { htmlToText } from "@/lib/email/privacy";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { sourcingReplyAddress, sourcingThreadId } from "@/lib/rfq/reply-routing";
import { SITE_URL } from "@/lib/site";
import type { SourcingRequest } from "@/lib/types";

/**
 * Thư cho người mua về một yêu cầu tìm nguồn. Cả hai thư đi qua bộ gửi chung, được lưu vào
 * mạch `sourcing-{id}` để hiện trên hồ sơ trong CRM, và có Reply-To định tuyến: người mua trả
 * lời email thì bộ nhận thư gắn đúng vào yêu cầu này.
 */

const VI_TEXT = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** Thư phản hồi theo ngôn ngữ nhân viên đã viết: có dấu tiếng Việt thì dùng khung tiếng Việt. */
export function replyLanguage(text: string): "vi" | "en" {
  return VI_TEXT.test(text) ? "vi" : "en";
}

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function requestLink(id: string): string {
  return `${SITE_URL}/buyer/account/sourcing/${encodeURIComponent(id)}`;
}

function excerpt(text: string, max = 600): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

async function deliver(store: DataStore, input: {
  request: SourcingRequest;
  subject: string;
  title: string;
  body: string;
  kind: "auto" | "manual";
  createdBy: string | null;
}) {
  const { request } = input;
  const html = wrapPlainEmail({ title: input.title, body: input.body });
  const text = htmlToText(input.body);
  const delivery = await transport({
    to: [request.buyer_email],
    from: FROM_ADDRESS,
    replyTo: sourcingReplyAddress(request.id),
    subject: input.subject,
    html,
    text,
    headers: { "X-Sourcing-Request": request.id },
  });
  const crmBuyer = typeof store.getBuyerByEmail === "function"
    ? await store.getBuyerByEmail(request.buyer_email).catch(() => null) : null;
  await store.addMessage({
    buyer_id: crmBuyer?.id ?? null,
    supplier_id: null,
    rfq_id: null,
    rfq_match_id: null,
    kind: input.kind,
    stage: null,
    direction: "buyer",
    thread_id: sourcingThreadId(request.id),
    subject: input.subject,
    to_emails: [request.buyer_email],
    cc_emails: [],
    bcc_emails: [],
    body_html: html,
    body_text: text,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: delivery.status,
    provider: delivery.provider,
    error: delivery.error,
    created_by: input.createdBy,
    sent_at: delivery.ok ? new Date().toISOString() : null,
  }).catch((error) => console.error("[sourcing] email sent but not logged", error));
  return delivery;
}

/** Xác nhận đã nhận yêu cầu, kèm link vào tài khoản. Lỗi gửi không làm hỏng việc lưu yêu cầu. */
export async function sendSourcingAck(store: DataStore, request: SourcingRequest, language: "vi" | "en") {
  const ref = shortRef(request.id);
  const link = requestLink(request.id);
  const vi = language === "vi";
  const title = vi ? `Vexim đã nhận yêu cầu tìm nguồn ${ref}` : `We received your sourcing request ${ref}`;
  const body = vi ? `
    <p>Xin chào,</p>
    <p>Vexim đã nhận yêu cầu tìm nguồn của bạn. Đội ngũ sẽ xem nhu cầu và phản hồi trong tài khoản của bạn.</p>
    <div style="margin:14px 0;padding:12px 16px;background:${brandColors.surface};border-radius:8px;white-space:pre-wrap;">${escapeHtml(excerpt(request.content))}</div>
    <p><a href="${escapeHtml(link)}">Xem yêu cầu trong tài khoản</a></p>
    <p>Cần bổ sung thông tin, bạn chỉ cần trả lời email này.</p>
    <p>Trân trọng,<br/>Vexim Trade</p>` : `
    <p>Hello,</p>
    <p>We received your sourcing request. Our team will review it and reply in your account.</p>
    <div style="margin:14px 0;padding:12px 16px;background:${brandColors.surface};border-radius:8px;white-space:pre-wrap;">${escapeHtml(excerpt(request.content))}</div>
    <p><a href="${escapeHtml(link)}">View your request</a></p>
    <p>To add details, simply reply to this email.</p>
    <p>Best regards,<br/>Vexim Trade</p>`;
  return deliver(store, { request, subject: `[${ref}] ${title}`, title, body, kind: "auto", createdBy: null });
}

/** Báo người mua khi nhân viên lưu phản hồi mới; nội dung phản hồi nằm ngay trong thư. */
export async function sendSourcingReply(store: DataStore, request: SourcingRequest, reply: string, staffEmail: string) {
  const ref = shortRef(request.id);
  const link = requestLink(request.id);
  const vi = replyLanguage(reply) === "vi";
  const needsInfo = request.status === "needs_info";
  const title = vi
    ? (needsInfo ? `Vexim cần thêm thông tin cho yêu cầu ${ref}` : `Vexim đã phản hồi yêu cầu ${ref}`)
    : (needsInfo ? `We need more details for request ${ref}` : `Update on your sourcing request ${ref}`);
  const body = vi ? `
    <p>Xin chào,</p>
    <p>${needsInfo ? "Để tìm đúng nhà cung cấp, Vexim cần bạn bổ sung thông tin dưới đây." : "Vexim có phản hồi cho yêu cầu tìm nguồn của bạn."}</p>
    <div style="margin:14px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};white-space:pre-wrap;">${escapeHtml(reply)}</div>
    <p>Trả lời email này để gửi thông tin cho Vexim, hoặc <a href="${escapeHtml(link)}">xem yêu cầu trong tài khoản</a>.</p>
    <p>Trân trọng,<br/>Vexim Trade</p>` : `
    <p>Hello,</p>
    <p>${needsInfo ? "To find the right supplier, we need a few more details from you." : "We have an update on your sourcing request."}</p>
    <div style="margin:14px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};white-space:pre-wrap;">${escapeHtml(reply)}</div>
    <p>Reply to this email to send us more information, or <a href="${escapeHtml(link)}">view the request in your account</a>.</p>
    <p>Best regards,<br/>Vexim Trade</p>`;
  return deliver(store, { request, subject: `[${ref}] ${title}`, title, body, kind: "manual", createdBy: staffEmail });
}
