"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { transport } from "@/lib/email/send";
import { requireRfqStaffSender } from "@/lib/rfq/staff-sender";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { notifyBuyerRfqStatus } from "@/lib/rfq/buyer-notify";
import type { EmailMessage } from "@/lib/types";

/**
 * Gửi email thủ công cho một NCC liên quan đến một RFQ match (VD: nhắc phản hồi, hỏi thêm thông tin).
 * Ghi lại vào bảng messages và timeline.
 */
export async function composeMatchEmailAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const session = await getSession();

  const rfqId = String(fd.get("rfq_id") || "").trim();
  const matchId = String(fd.get("match_id") || "").trim();
  const toOverride = String(fd.get("to_override") || "").trim();
  const subject = String(fd.get("subject") || "").trim();
  const body = String(fd.get("body") || "").trim();
  const ccRaw = String(fd.get("cc") || "").trim();

  if (!rfqId || !matchId) throw new Error("Thiếu RFQ/match.");
  if (!subject || !body) throw new Error("Thiếu tiêu đề hoặc nội dung.");

  const store = getStore();
  const [rfq, match] = await Promise.all([store.getRfq(rfqId), store.getRfqMatch(matchId)]);
  if (!rfq) throw new Error("RFQ không tồn tại.");
  if (!match || match.rfq_id !== rfqId) throw new Error("Match không thuộc RFQ này.");
  const supplier = await store.getSupplier(match.supplier_id);
  if (!supplier) throw new Error("Không tìm thấy NCC.");

  const to = toOverride || supplier.email;
  if (!to) throw new Error("NCC chưa có email — vui lòng điền địa chỉ nhận.");

  const toEmails = to.split(",").map((s) => s.trim()).filter(Boolean);
  const ccEmails = ccRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const html = wrapPlainEmail({ title: subject, body: `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(body)}</div>` });
  const text = body;

  const sender = await requireRfqStaffSender(session?.uid ?? "");
  const delivery = await transport({
    to: toEmails,
    cc: ccEmails.length ? ccEmails : undefined,
    from: sender.header,
    replyTo: supplierReplyAddress(rfq.code, match.id),
    subject,
    html,
    text,
    headers: {
      "X-RFQ-Code": rfq.code,
      "X-RFQ-Match": match.id,
    },
  });
  if (!delivery.ok || delivery.status !== "sent") throw new Error(`Không gửi được email NCC: ${delivery.error ?? "Resend chưa gửi thật"}`);

  await store.addMessage({
    buyer_id: null,
    supplier_id: supplier.id,
    rfq_id: rfq.id,
    rfq_match_id: match.id,
    kind: "manual",
    stage: null,
    direction: "supplier",
    thread_id: `rfq-${rfq.id}-match-${match.id}`,
    subject,
    to_emails: toEmails,
    cc_emails: ccEmails,
    bcc_emails: [],
    body_html: html,
    body_text: text,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: delivery.status,
    provider: delivery.provider,
    error: null,
    created_by: session?.uid ?? null,
  } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });

  revalidatePath(`/crm/rfqs/${rfqId}`);
}

/** Chuyển RFQ sang sampling (bắt đầu gửi mẫu). */
export async function markSamplingAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const rfqId = String(fd.get("rfq_id") || "").trim();
  const selectedMatchId = String(fd.get("selected_match_id") || "").trim();
  if (!rfqId) throw new Error("Thiếu RFQ.");
  const store = getStore();
  const before = await store.getRfq(rfqId);
  if (!before) throw new Error("RFQ không tồn tại.");
  if (selectedMatchId) {
    const m = await store.getRfqMatch(selectedMatchId);
    if (!m || m.rfq_id !== rfqId) throw new Error("NCC đã chọn không thuộc RFQ này.");
    if (before.status !== "sampling") await store.updateRfqMatch(m.id, { status: "selected" });
  }
  const rfq = before.status === "sampling" ? before : await store.updateRfq(rfqId, { status: "sampling" });
  if (before.status !== "sampling") {
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: rfqId, action: "status.sampling",
      before: { status: before.status }, after: { status: rfq.status, selected_match_id: selectedMatchId || null },
    }).catch((err) => console.error("[rfq] không ghi được audit sampling:", err));
  }
  // Chỉ một email cho mỗi giai đoạn. Nếu gửi thất bại, submit lại nút này để thử lại.
  const notified = await notifyBuyerRfqStatus(rfq, "sampling", selectedMatchId || null);
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${rfqId}`);
  if (!notified.sent && notified.reason !== "already_sent" && notified.reason !== "pending") {
    throw new Error("Đã lưu trạng thái sampling nhưng chưa gửi được thông báo buyer. Vui lòng thử lại.");
  }
}

/** Đóng RFQ lost (bắt buộc lý do). */
export async function markLostAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const rfqId = String(fd.get("rfq_id") || "").trim();
  const reason = String(fd.get("lost_reason") || "").trim();
  const note = String(fd.get("note") || "").trim();
  if (!rfqId) throw new Error("Thiếu RFQ.");
  if (!reason) throw new Error("Bắt buộc chọn lý do mất đơn.");
  const store = getStore();
  const before = await store.getRfq(rfqId);
  if (!before) throw new Error("RFQ không tồn tại.");
  const rfq = before.status === "lost" ? before : await store.updateRfq(rfqId, {
    status: "lost",
    lost_reason: reason,
    closed_reason: note || null,
  });
  if (before.status !== "lost") {
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: rfqId, action: "status.lost",
      before: { status: before.status }, after: { status: rfq.status, lost_reason: rfq.lost_reason },
    }).catch((err) => console.error("[rfq] không ghi được audit lost:", err));
  }
  const notified = await notifyBuyerRfqStatus(rfq, "lost");
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${rfqId}`);
  if (!notified.sent && notified.reason !== "already_sent" && notified.reason !== "pending") {
    throw new Error("Đã lưu trạng thái lost nhưng chưa gửi được thông báo buyer. Vui lòng thử lại.");
  }
}

/** Gửi nhắc nhở NCC đã được gửi RFQ nhưng chưa phản hồi sau X ngày (gửi ngay cho một NCC chỉ định). */
export async function sendFollowUpAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const session = await getSession();
  const rfqId = String(fd.get("rfq_id") || "").trim();
  const matchId = String(fd.get("match_id") || "").trim();
  if (!rfqId || !matchId) throw new Error("Thiếu tham số.");
  const store = getStore();
  const rfq = await store.getRfq(rfqId);
  const match = await store.getRfqMatch(matchId);
  if (!rfq || !match || match.rfq_id !== rfqId) throw new Error("RFQ/match không hợp lệ.");
  const sup = await store.getSupplier(match.supplier_id);
  if (!sup || !sup.email) throw new Error("NCC chưa có email.");

  const subject = `Nhắc: ${rfq.code} — vui lòng phản hồi báo giá`;
  const deadline = new Date(); deadline.setDate(deadline.getDate() + 2);
  const deadlineStr = deadline.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" });
  const body = `Kính gửi Anh/Chị ${sup.contact_name ?? sup.name},\n\nPhòng Xuất khẩu Vexim xin nhắc lại yêu cầu báo giá ${rfq.code} (${rfq.product_text}, ${rfq.quantity ?? ""} ${rfq.unit ?? ""}) đã gửi trước đó.\n\nNếu không thể tham gia chào giá lần này, rất mong Anh/Chị phản hồi ngắn gọn để chúng tôi thông báo cho buyer. Nếu có thể chào giá, vui lòng hồi âm trước ${deadlineStr}.\n\nTrân trọng,\nPhòng Xuất khẩu · Vexim Trade`;

  const html = wrapPlainEmail({
    title: subject,
    body: `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(body)}</div>`,
  });
  const sender = await requireRfqStaffSender(session?.uid ?? "");
  const delivery = await transport({
    to: [sup.email],
    from: sender.header,
    replyTo: supplierReplyAddress(rfq.code, match.id),
    subject,
    html,
    text: body,
    headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Match": match.id },
  });
  if (!delivery.ok || delivery.status !== "sent") throw new Error(`Không gửi được email nhắc NCC: ${delivery.error ?? "Resend chưa gửi thật"}`);
  await store.addMessage({
    buyer_id: null,
    supplier_id: sup.id,
    rfq_id: rfq.id,
    rfq_match_id: match.id,
    kind: "rfq_followup",
    stage: null,
    direction: "supplier",
    thread_id: `rfq-${rfq.id}-match-${match.id}`,
    subject,
    to_emails: [sup.email],
    cc_emails: [],
    bcc_emails: [],
    body_html: html,
    body_text: body,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: delivery.status,
    provider: delivery.provider,
    error: null,
    created_by: session?.uid ?? null,
  } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
