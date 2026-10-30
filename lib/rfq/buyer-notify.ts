/**
 * Tự động thông báo cho buyer khi có chuyển biến quan trọng trong vòng đời RFQ:
 *   - RFQ vào sampling (đã chọn 1 NCC để gửi mẫu / đàm phán sâu)
 *   - RFQ bị đóng lost (kèm lý do cho buyer)
 *
 * Những email này dùng replyTo = buyer+{code}@domain để hồi âm của buyer được
 * tự gắn vào timeline RFQ.
 */
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { htmlToText } from "@/lib/email/privacy";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS, COMPANY, resendConfigured } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { buyerReplyAddress } from "@/lib/rfq/reply-routing";
import type { Buyer, EmailMessage, Rfq, Supplier } from "@/lib/types";

type NotifKind = "sampling" | "lost";

const LOST_REASON_LABELS: Record<string, string> = {
  no_response: "Nhà cung cấp không phản hồi sau nhiều lần nhắc",
  price: "Giá chưa cạnh tranh",
  lead_time: "Chưa đáp ứng thời gian giao hàng",
  quality: "Chất lượng hoặc chứng chỉ chưa đáp ứng yêu cầu",
  buyer_went_elsewhere: "Bạn đã chọn phương án khác",
  cancelled: "Yêu cầu đã được huỷ",
  other: "Chưa thể thống nhất điều kiện giao dịch",
};

function buildSubject(kind: NotifKind, rfq: Rfq) {
  return kind === "sampling"
    ? `[${rfq.code}] Cập nhật: Đã chọn nhà cung cấp để gửi mẫu — ${rfq.product_text}`
    : `[${rfq.code}] Cập nhật: Đơn hàng tạm dừng — ${rfq.product_text}`;
}

function buildBody(kind: NotifKind, rfq: Rfq, buyer: Buyer, chosenSupplier?: Supplier | null) {
  const title = buildSubject(kind, rfq);
  const trackUrl = `${SITE_URL}/rfq/status/${rfq.access_token}`;
  const first = buyer.contact_name?.split(" ")[0] ?? "there";
  let body = `<p>Dear ${escapeHtml(first)},</p>`;

  if (kind === "sampling") {
    body += `
      <p>Cảm ơn sự kiên nhẫn của bạn trong thời gian qua. Đơn <strong>${escapeHtml(rfq.code)}</strong>
      (${escapeHtml(rfq.product_text)}${rfq.quantity ? `, ${escapeHtml(String(rfq.quantity))} ${escapeHtml(rfq.unit ?? "")}` : ""})
      hiện đã bước vào giai đoạn <strong>gửi mẫu</strong>.</p>`;
    if (chosenSupplier) {
      const name = chosenSupplier.display_name ?? chosenSupplier.trade_name ?? chosenSupplier.name;
      body += `
        <p>Chúng tôi đã chọn <strong>${escapeHtml(name)}</strong>${chosenSupplier.province ? ` (${escapeHtml(chosenSupplier.province)})` : ""}
        để tiến hành gửi mẫu và đàm phán chi tiết. Danh tính của bạn vẫn được bảo mật ở giai đoạn này;
        chúng tôi sẽ đứng ra điều phối việc vận chuyển mẫu, kết quả kiểm nghiệm và chứng chỉ liên quan.</p>`;
    } else {
      body += `<p>Chúng tôi đang phối hợp với nhà cung cấp đã được chọn để sớm chuyển mẫu cho bạn đánh giá.</p>`;
    }
    body += `
      <p>Các bước tiếp theo:</p>
      <ul>
        <li>Mẫu sẽ được gửi theo địa chỉ bạn đã cung cấp; chúng tôi sẽ thông báo tracking khi có.</li>
        <li>Nếu bạn có yêu cầu bổ sung về quy cách / đóng gói / chứng chỉ, vui lòng trả lời email này.</li>
        <li>Sau khi mẫu được duyệt, chúng tôi sẽ chốt điều khoản hợp đồng và lịch giao hàng.</li>
      </ul>`;
  } else {
    const reason = rfq.lost_reason ? LOST_REASON_LABELS[rfq.lost_reason] ?? "Chưa thể thống nhất điều kiện giao dịch" : "Chưa thể thống nhất điều kiện giao dịch";
    body += `
      <p>Chúng tôi rất tiếc phải thông báo rằng đơn <strong>${escapeHtml(rfq.code)}</strong>
      (${escapeHtml(rfq.product_text)}${rfq.quantity ? `, ${escapeHtml(String(rfq.quantity))} ${escapeHtml(rfq.unit ?? "")}` : ""})
      tạm thời không thể tiếp tục trong đợt này.</p>
      <p><strong>Lý do:</strong> ${escapeHtml(reason)}.</p>
      <p>Nếu bạn vẫn quan tâm đến sản phẩm này trong tương lai hoặc muốn yêu cầu báo giá lại
      với thông số điều chỉnh, vui lòng trả lời email này hoặc gửi yêu cầu mới — chúng tôi
      sẽ ưu tiên xử lý.</p>`;
  }

  body += `
    <p>Bạn có thể theo dõi trạng thái cập nhật tại link riêng:<br/>
    <a href="${trackUrl}" style="color:#0f766e;">${trackUrl}</a></p>
    <p>Best regards,<br/>Export Department · ${escapeHtml(COMPANY.name)}</p>`;

  return {
    subject: title,
    html: wrapPlainEmail({ title, body, preheader: kind === "sampling" ? "Đã chọn nhà cung cấp gửi mẫu — chúng tôi sẽ điều phối tiếp." : "Đơn hàng tạm dừng." }),
    text: htmlToText(body),
  };
}

/**
 * Gửi email trạng thái cho buyer và ghi vào bảng messages. Không throw nếu
 * buyer thiếu email — caller có thể tiếp tục.
 */
export async function notifyBuyerRfqStatus(
  rfq: Rfq,
  kind: NotifKind,
  chosenMatchId?: string | null,
): Promise<{ sent: boolean; reason?: string }> {
  if (!rfq.buyer_id) return { sent: false, reason: "no_buyer" };
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
  let chosenSupplier: Supplier | null = null;
  if (chosenMatchId) {
    const match = await store.getRfqMatch(chosenMatchId).catch(() => null);
    if (match && match.rfq_id === rfq.id) {
      chosenSupplier = await store.getSupplier(match.supplier_id).catch(() => null);
    }
  }
  const email = buildBody(kind, rfq, buyer, chosenSupplier);
  const ccEmails = buyer.cc_emails
    ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean)
    : [];
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
    replyTo: buyerReplyAddress(rfq.code),
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
