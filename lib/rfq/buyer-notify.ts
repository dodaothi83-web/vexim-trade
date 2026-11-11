/**
 * Tự động thông báo cho buyer khi có chuyển biến quan trọng trong vòng đời RFQ:
 *   - RFQ vào sampling (đã chọn 1 NCC để gửi mẫu / đàm phán sâu)
 *   - RFQ bị đóng lost (kèm lý do cho buyer)
 *
 * Email chỉ chứa đường dẫn vào tài khoản; trả lời email không cập nhật RFQ.
 */
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS, resendConfigured } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { rfqChannel } from "@/lib/rfq/channel";
import type { EmailMessage, Rfq } from "@/lib/types";

type NotifKind = "sampling" | "lost";

function buildBody(kind: NotifKind, rfq: Rfq) {
  const subject = `${kind === "sampling" ? "Sourcing request moved to sampling" : "Sourcing request closed"} (Ref ${rfq.code})`;
  const link = `${SITE_URL}/buyer/account/requests/${encodeURIComponent(rfq.id)}`;
  const body = `<p>Your sourcing request on Vexim Trade has an update.</p>
    <p><a href="${escapeHtml(link)}">Sign in to review the details and reply</a></p>
    <p>This email is a notification only; replies are not recorded as RFQ messages.</p>`;
  return { subject, html: wrapPlainEmail({ title: escapeHtml(subject), body }),
    text: `${subject}\n${link}\nSign in for details. Email is a notification only.` };
}

/**
 * Gửi email trạng thái cho buyer và ghi vào bảng messages. Không throw nếu
 * buyer thiếu email — caller có thể tiếp tục.
 */
export async function notifyBuyerRfqStatus(
  rfq: Rfq,
  kind: NotifKind,
  _chosenMatchId?: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  if (!rfq.buyer_id || rfqChannel(rfq) !== "sourcing") return { sent: false, reason: "no_buyer" };
  const store = getStore();
  // One durable row per RFQ + stage. A draft reserves the send before talking
  // to Resend; the unique index prevents concurrent requests from sending twice.
  const previous = (await store.listMessagesForRfq(rfq.id)).find(
    (m) => m.kind === "buyer_status_update" && m.stage === kind,
  );
  if (previous?.status === "sent" || previous?.status === "simulated") {
    return { sent: false, reason: "already_sent" };
  }
  if (previous?.status === "draft") return { sent: false, reason: "pending" };
  const buyer = await store.getBuyer(rfq.buyer_id).catch(() => null);
  if (!buyer || !buyer.email) return { sent: false, reason: "no_buyer_email" };
  const email = buildBody(kind, rfq);
  const ccEmails: string[] = [];
  const row = {
    buyer_id: buyer.id,
    supplier_id: null,
    rfq_id: rfq.id,
    rfq_match_id: null,
    kind: "buyer_status_update" as const,
    stage: kind,
    direction: "buyer" as const,
    thread_id: `rfq-${rfq.id}-buyer`,
    subject: email.subject,
    to_emails: [buyer.email],
    cc_emails: ccEmails,
    bcc_emails: [],
    body_html: email.html,
    body_text: email.text,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: "draft" as const,
    provider: "resend" as const,
    error: null,
    created_by: null,
  };
  let claim: EmailMessage;
  if (previous?.status === "failed") {
    // Retry a failed delivery without creating a second timeline entry.
    claim = await store.updateMessage(previous.id, { status: "draft", error: null });
  } else {
    try {
      claim = await store.addMessage(row as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
    } catch (err) {
      // Concurrent insert won the unique index — do not send a duplicate.
      const winner = (await store.listMessagesForRfq(rfq.id)).find(
        (m) => m.kind === "buyer_status_update" && m.stage === kind,
      );
      if (winner) return {
        sent: false,
        reason: winner.status === "sent" || winner.status === "simulated" ? "already_sent" : "pending",
      };
      throw err;
    }
  }
  if (process.env.NODE_ENV === "production" && !resendConfigured()) {
    await store.updateMessage(claim.id, { status: "failed", error: "RESEND_API_KEY chưa được cấu hình." });
    return { sent: false, reason: "transport_failed" };
  }
  const res = await transport({
    to: [buyer.email],
    cc: ccEmails.length ? ccEmails : undefined,
    from: FROM_ADDRESS,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Notify": kind },
  }).catch((err) => {
    console.error(`[rfq-notify] gửi ${kind} cho người mua thất bại:`, err);
    return null;
  });
  await store.updateMessage(claim.id, {
    status: res?.status ?? "failed",
    provider: res?.provider ?? "resend",
    error: res?.error ?? (res ? null : "Lỗi khi gọi dịch vụ gửi email"),
    sent_at: res?.ok ? new Date().toISOString() : null,
  });
  if (!res?.ok) return { sent: false, reason: "transport_failed" };

  return { sent: true };
}
