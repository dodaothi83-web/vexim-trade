import { Resend } from "resend";

import { FROM_ADDRESS, resendConfigured } from "@/lib/config";
import { getStore } from "@/lib/db";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { transport, threadId } from "@/lib/email/send";
import type { EmailMessage } from "@/lib/types";

/**
 * Xử lý sự kiện email.received từ Resend Inbound.
 *
 * Webhook của Resend CHỈ mang metadata (from/to/subject/email_id); nội dung thật
 * phải kéo bằng Receiving API (resend.emails.receiving.get). Ở chế độ demo
 * (chưa có RESEND_API_KEY) ta lưu phần metadata kèm ghi chú, để luồng vẫn chạy
 * được khi phát triển — giống triết lý "simulated" của tầng gửi.
 */

export interface InboundEventMeta {
  email_id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
}

export interface InboundFull {
  from: string;
  to: string[];
  cc?: string[] | null;
  subject: string;
  html: string | null;
  text: string | null;
  created_at: string;
  message_id: string | null;
  headers?: Record<string, string> | null;
  attachment_names?: string[];
}

export interface InboundOutcome {
  saved: boolean;
  reason?: "duplicate" | "self" | "error";
  messageId?: string | null;
  threadId?: string | null;
  notified?: number;
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Địa chỉ cần báo khi có thư đến: env INBOUND_NOTIFY_EMAILS, nếu không thì admin+sale đang hoạt động. */
/**
 * Danh sách nhận thông báo thư đến.
 * - Thư từ buyer/prospect: gửi cho người phụ trách (khớp theo tên). Nếu chưa có phụ trách
 *   hoặc không tìm thấy tài khoản, gửi cho quản trị viên để không bỏ sót.
 * - Thư từ NCC hoặc địa chỉ không xác định: giữ hành vi cũ (quản trị viên và nhân viên kinh doanh).
 * - INBOUND_NOTIFY_EMAILS (nếu đặt) luôn được ưu tiên.
 */
async function notifyRecipients(
  from: string,
  ownerName: string | null,
  hasCustomerRecord: boolean,
): Promise<string[]> {
  const fromEnv = process.env.INBOUND_NOTIFY_EMAILS?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv.filter((e) => !sameEmail(e, from));
  const store = getStore();
  const users = await store.listUsers().catch(() => []);
  const receivingDomains = new Set(
    (process.env.INBOUND_DOMAINS?.split(/[,;\s]+/) ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")),
  );
  receivingDomains.add("veximtrade.com");
  const pick = (list: typeof users) =>
    list
      .map((u) => u.email)
      .filter((e) => !sameEmail(e, from))
      // Không báo vào địa chỉ thuộc domain nhận thư: thư báo sẽ tự quay lại thành thư đến → vòng lặp
      .filter((e) => !receivingDomains.has(e.split("@")[1]?.toLowerCase() ?? ""));

  const active = users.filter((u) => u.is_active);
  if (hasCustomerRecord) {
    const owner = (ownerName ?? "").trim().toLowerCase();
    const ownerUsers = owner
      ? active.filter((u) => (u.name ?? "").trim().toLowerCase() === owner)
      : [];
    const ownerEmails = pick(ownerUsers);
    if (ownerEmails.length) return ownerEmails;
    return pick(active.filter((u) => u.role === "admin"));
  }
  return pick(active.filter((u) => u.role === "admin" || u.role === "sale"));
}

export async function processInboundEvent(
  meta: InboundEventMeta,
  fetchFull: (emailId: string) => Promise<InboundFull | null>,
): Promise<InboundOutcome> {
  if (!meta.email_id) return { saved: false, reason: "error" };
  const store = getStore();

  // Resend phát lại webhook khi không nhận 2xx → chống trùng bằng email_id
  const existingBefore = await store.listMessages(500).catch(() => [] as EmailMessage[]);
  if (existingBefore.some((m) => m.rfc_message_id === meta.email_id || m.id === meta.email_id)) {
    return { saved: false, reason: "duplicate" };
  }

  const full = await fetchFull(meta.email_id).catch((err) => {
    console.error("[inbound] không kéo được nội dung thư:", err);
    return null;
  });

  const from = (full?.from ?? meta.from ?? "").trim();
  if (!from) return { saved: false, reason: "error" };
  // Thư do chính hệ thống gửi ra quay vòng lại (forward, auto-reply) thì bỏ qua
  if (sameEmail(from, FROM_ADDRESS)) return { saved: false, reason: "self" };

  const subject = (full?.subject ?? meta.subject ?? "").trim() || "(không có tiêu đề)";
  const [buyers, suppliers, prospects] = await Promise.all([
    store.listBuyers(),
    store.listSuppliers(),
    store.listProspects().catch(() => []),
  ]);
  const buyer = buyers.find((b) => b.email && sameEmail(b.email, from)) ?? null;
  const prospect = prospects.find((p) => p.email && sameEmail(p.email, from)) ?? null;
  const supplier = !buyer && !prospect
    ? (suppliers.find((s) => s.email && sameEmail(s.email, from)) ?? null)
    : null;
  const direction: "buyer" | "supplier" = supplier ? "supplier" : "buyer";
  const tid = threadId(direction, from);

  let html = full?.html ?? "";
  let text = full?.text ?? "";
  if (!html && !text) {
    html = `<p style="color:#64748b;font-style:italic">(Không kéo được nội dung thư từ Resend — chỉ có metadata.)</p>`;
  } else if (!html && text) {
    html = text
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");
  }
  if (!text && html) text = subject;

  // RFC Message-ID gốc (ổn định qua mọi chặng forward) — dùng chống trùng THỨ HAI
  // (cùng một thư đến qua 2 đường: chuyển tiếp + retry) và làm In-Reply-To khi trả lời.
  const rawRfc = full?.message_id || full?.headers?.["message-id"] || "";
  const rfcId = rawRfc
    ? (rawRfc.trim().startsWith("<") ? rawRfc.trim() : `<${rawRfc.trim()}>`)
    : meta.email_id;
  const existing = await store.listMessages(500).catch(() => [] as EmailMessage[]);
  if (existing.some((m) => m.rfc_message_id === rfcId)) {
    return { saved: false, reason: "duplicate" };
  }

  const saved = await store
    .addMessage({
      buyer_id: buyer?.id ?? null,
      supplier_id: supplier?.id ?? null,
      ...(prospect ? { prospect_id: prospect.id } : {}),
      kind: "inbound",
      stage: null,
      direction,
      thread_id: tid,
      subject,
      to_emails: full?.to ?? meta.to ?? [],
      cc_emails: full?.cc ?? meta.cc ?? [],
      bcc_emails: [],
      body_html: html,
      body_text: text,
      attachments: (full?.attachment_names ?? []).map((name, i) => ({
        id: `inbound-${meta.email_id}-${i}`,
        name,
        size: 0,
        type: "application/octet-stream",
      })),
      rfc_message_id: rfcId,
      read_at: null,
      status: "received",
      provider: "resend",
      error: null,
      created_by: from,
      sent_at: full?.created_at ?? new Date().toISOString(),
    })
    .catch((err) => {
      console.error("[inbound] lưu thư đến thất bại:", err);
      return null;
    });

  if (!saved) return { saved: false, reason: "error" };
  if (prospect) {
    if (["new", "researched", "ready", "contacted"].includes(prospect.status)) {
      await store.updateProspect(prospect.id, { status: "replied" }).catch(() => null);
    }
    await store.addProspectActivity({
      prospect_id: prospect.id,
      channel: "email",
      summary: `Nhận email: ${subject}`,
      created_by: from,
    }).catch(() => null);
  }

  // ---- Báo cho đội ngũ (email tóm tắt) ----
  const recipients = await notifyRecipients(
    from,
    buyer?.owner ?? prospect?.owner ?? null,
    Boolean(buyer || prospect),
  ).catch(() => [] as string[]);
  let notified = 0;
  if (recipients.length) {
    const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const link = appUrl ? `${appUrl}/mail` : "trang Hộp thư trong CRM";
    const body = `
      <p>Có thư mới gửi vào hệ thống Vexim Trade.</p>
      <p><strong>Từ:</strong> ${escapeHtml(from)}<br/>
         <strong>Tiêu đề:</strong> ${escapeHtml(subject)}<br/>
         <strong>Mạch thư:</strong> ${escapeHtml(tid)}</p>
      <p>Mở ${appUrl ? `<a href="${escapeHtml(appUrl)}/mail" style="color:#0f766e;">Hộp thư trong CRM</a> để xem và trả lời.` : link + " để xem và trả lời."}</p>`;
    const res = await transport({
      to: recipients,
      subject: `[VXT] Thư mới từ ${from}: ${subject}`,
      html: wrapPlainEmail({ title: `Thư mới từ ${from}`, body }),
      text: `Thư mới từ ${from}\nTiêu đề: ${subject}\nMở ${link} để xem và trả lời.`,
      headers: { "X-VXT-Notify": "inbound" },
    }).catch(() => null);
    notified = res?.ok ? recipients.length : 0;
  }

  return { saved: true, messageId: saved.id, threadId: tid, notified };
}

/** Hàm kéo nội dung thật từ Resend Receiving API (dùng ở production). */
export function makeResendFetcher(): (emailId: string) => Promise<InboundFull | null> {
  return async (emailId) => {
    if (!resendConfigured()) return null;
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.receiving.get(emailId);
    if (error || !data) {
      console.error("[inbound] receiving.get lỗi:", error?.message);
      return null;
    }
    return {
      from: data.from,
      to: data.to ?? [],
      cc: data.cc ?? null,
      subject: data.subject ?? "",
      html: data.html ?? null,
      text: data.text ?? null,
      created_at: data.created_at,
      message_id: data.message_id ?? null,
      headers: data.headers ?? null,
      attachment_names: (data.attachments ?? []).map((a) => a.filename ?? "tệp đính kèm"),
    };
  };
}
