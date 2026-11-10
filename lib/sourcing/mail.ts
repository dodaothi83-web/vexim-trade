import { FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { sourcingThreadId } from "@/lib/rfq/reply-routing";
import { SITE_URL } from "@/lib/site";
import type { SourcingRequest } from "@/lib/types";

const VI_TEXT = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
export function replyLanguage(text: string): "vi" | "en" { return VI_TEXT.test(text) ? "vi" : "en"; }
const link = (id: string) => `${SITE_URL}/buyer/account/sourcing/${encodeURIComponent(id)}`;

/** Sourcing requests are handled in the account. Mail is a link-only notice;
 * free-text buyer/staff replies remain in the request record, never in email.
 */
async function deliver(store: DataStore, request: SourcingRequest, language: "vi" | "en", kind: "auto" | "manual", staff: string | null) {
  const title = language === "vi" ? `Cập nhật yêu cầu tìm nguồn ${request.id.slice(0, 8).toUpperCase()}`
    : `Sourcing request update ${request.id.slice(0, 8).toUpperCase()}`;
  const url = link(request.id);
  const body = language === "vi"
    ? `<p>Yêu cầu tìm nguồn của bạn đã có cập nhật.</p><p><a href="${escapeHtml(url)}">Đăng nhập để xem nội dung và trao đổi với Vexim</a></p><p>Không trả lời thư thông báo này; email không cập nhật yêu cầu.</p>`
    : `<p>Your sourcing request has an update.</p><p><a href="${escapeHtml(url)}">Sign in to view the details and talk to Vexim</a></p><p>Do not reply to this notification; email replies do not update the request.</p>`;
  const html = wrapPlainEmail({ title: escapeHtml(title), body });
  const text = `${title}\n${url}\nSign in to view your request. Email is a notification only.`;
  const delivery = await transport({ to: [request.buyer_email], from: FROM_ADDRESS, subject: title, html, text });
  const buyer = await store.getBuyerByEmail(request.buyer_email).catch(() => null);
  await store.addMessage({ buyer_id: buyer?.id ?? null, supplier_id: null, rfq_id: null, rfq_match_id: null,
    kind, stage: null, direction: "buyer", thread_id: sourcingThreadId(request.id), subject: title,
    to_emails: [request.buyer_email], cc_emails: [], bcc_emails: [], body_html: html, body_text: text,
    attachments: [], rfc_message_id: null, read_at: null, status: delivery.status, provider: delivery.provider,
    error: delivery.error, created_by: staff, sent_at: delivery.ok ? new Date().toISOString() : null,
  }).catch((error) => console.error("[sourcing] notification not logged", error));
  return delivery;
}

export async function sendSourcingAck(store: DataStore, request: SourcingRequest, language: "vi" | "en") {
  return deliver(store, request, language, "auto", null);
}

export async function sendSourcingReply(store: DataStore, request: SourcingRequest, reply: string, staffEmail: string) {
  return deliver(store, request, replyLanguage(reply), "manual", staffEmail);
}
