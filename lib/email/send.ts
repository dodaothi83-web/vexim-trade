import { Resend } from "resend";

import { FROM_ADDRESS, resendConfigured } from "@/lib/config";
import { getStore } from "@/lib/db";
import {
  buildBuyerEmail,
  buildSupplierAssignedEmail,
  buildSupplierEmail,
  wrapEmailShell,
  type EmailPayload,
} from "@/lib/email/templates";
import { getStage, type StageKey } from "@/lib/pipeline";
import type { Attachment, Buyer, Supplier } from "@/lib/types";

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}

export interface TransportResult {
  ok: boolean;
  status: "sent" | "simulated" | "failed";
  provider: "resend" | "local";
  error: string | null;
}

/** Lớp vận chuyển duy nhất: có RESEND_API_KEY thì gửi thật, không thì ở chế độ demo */
export async function transport(mail: OutgoingMail): Promise<TransportResult> {
  const recipients = mail.to.filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, status: "failed", provider: "local", error: "Không có người nhận" };
  }
  if (!resendConfigured()) {
    return { ok: true, status: "simulated", provider: "local", error: null };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipients,
      cc: mail.cc?.length ? mail.cc.filter(Boolean) : undefined,
      bcc: mail.bcc?.length ? mail.bcc.filter(Boolean) : undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments?.length
        ? mail.attachments.map((a) => ({
            filename: a.name,
            content: a.content,
            contentType: a.type || "application/octet-stream",
          }))
        : undefined,
    });
    if (error) {
      return { ok: false, status: "failed", provider: "resend", error: `${error.name}: ${error.message}` };
    }
    return { ok: true, status: "sent", provider: "resend", error: null };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      provider: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function threadId(direction: "buyer" | "supplier", primary: string): string {
  return `${direction}:${primary.trim().toLowerCase()}`;
}

/* ================================================================== */
/* EMAIL TỰ ĐỘNG THEO GIAI ĐOẠN                                       */
/* ================================================================== */

export interface StageUpdateResult {
  sent: boolean;
  buyerSent: boolean;
  supplierSent: boolean;
  simulated: boolean;
  failed: boolean;
  messages: string[];
}

export interface SendStageUpdateParams {
  buyer: Buyer;
  supplier: Supplier | null;
  stage: StageKey;
  note?: string | null;
  /** Bắt buộc gửi kể cả với trạng thái "Mất đơn / Hoãn" */
  force?: boolean;
  messageToBuyer?: string | null;
  messageToSupplier?: string | null;
  skipBuyer?: boolean;
  skipSupplier?: boolean;
}

/**
 * Quy tắc nghiệp vụ:
 *  - Mỗi giai đoạn có bộ nội dung RIÊNG cho buyer (EN) và cho NCC (VI).
 *  - Buyer: luôn gửi nếu có email.
 *  - NCC: CHỈ gửi khi đơn đã được gắn NCC và NCC có email.
 *  - Trạng thái "Mất đơn / Hoãn": mặc định KHÔNG gửi.
 */
export async function sendStageUpdate(
  params: SendStageUpdateParams,
): Promise<StageUpdateResult> {
  const { buyer, supplier, stage, force = false } = params;
  const store = getStore();
  const stageDef = getStage(stage);
  const messages: string[] = [];
  let buyerSent = false;
  let supplierSent = false;
  let simulated = false;
  let failed = false;

  if (stageDef.silent && !force) {
    messages.push(
      `Trạng thái "${stageDef.label}" không gửi email tự động — chỉ ghi nhận nội bộ.`,
    );
    return { sent: false, buyerSent, supplierSent, simulated, failed, messages };
  }

  // ---------- 1. Email cho buyer (tiếng Anh) ----------
  if (params.skipBuyer) {
    messages.push("Bỏ qua email buyer theo lựa chọn của người gửi.");
  } else if (buyer.email && buyer.email.trim()) {
    const payload = buildBuyerEmail({
      buyer,
      stage,
      note: params.messageToBuyer ?? params.note ?? null,
    });
    const cc = (buyer.cc_emails ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await transport({ to: [buyer.email.trim()], cc, ...payload });
    buyerSent = res.ok;
    simulated = simulated || res.status === "simulated";
    failed = failed || !res.ok;
    messages.push(
      res.ok
        ? `${res.status === "simulated" ? "[DEMO] Đã tạo" : "Đã gửi"} email buyer → ${buyer.email}${cc.length ? ` (cc: ${cc.join(", ")})` : ""}`
        : `Gửi email buyer thất bại: ${res.error}`,
    );
    await saveAutoMessage({
      buyer,
      supplierId: null,
      stage,
      direction: "buyer",
      payload,
      to: [buyer.email.trim()],
      cc,
      res,
    });
  } else {
    messages.push("Buyer chưa có email — bỏ qua email buyer.");
  }

  // ---------- 2. Email cho NCC (tiếng Việt) ----------
  if (params.skipSupplier) {
    messages.push("Bỏ qua email nhà cung cấp theo lựa chọn của người gửi.");
  } else if (!supplier) {
    messages.push("Chưa gắn nhà cung cấp cho khách này — email chỉ gửi tới buyer.");
  } else if (!supplier.email || !supplier.email.trim()) {
    messages.push(`NCC "${supplier.name}" chưa có email — bỏ qua email NCC.`);
  } else {
    const payload = buildSupplierEmail({
      buyer,
      supplier,
      stage,
      note: params.messageToSupplier ?? params.note ?? null,
    });
    const res = await transport({ to: [supplier.email.trim()], ...payload });
    supplierSent = res.ok;
    simulated = simulated || res.status === "simulated";
    failed = failed || !res.ok;
    messages.push(
      res.ok
        ? `${res.status === "simulated" ? "[DEMO] Đã tạo" : "Đã gửi"} email NCC → ${supplier.email}`
        : `Gửi email NCC thất bại: ${res.error}`,
    );
    await saveAutoMessage({
      buyer,
      supplierId: supplier.id,
      stage,
      direction: "supplier",
      payload,
      to: [supplier.email.trim()],
      cc: [],
      res,
    });
  }

  return {
    sent: buyerSent || supplierSent,
    buyerSent,
    supplierSent,
    simulated,
    failed,
    messages,
  };
}

async function saveAutoMessage(opts: {
  buyer: Buyer;
  supplierId: string | null;
  stage: StageKey;
  direction: "buyer" | "supplier";
  payload: EmailPayload;
  to: string[];
  cc: string[];
  res: TransportResult;
}) {
  await getStore()
    .addMessage({
      buyer_id: opts.buyer.id,
      supplier_id: opts.supplierId,
      kind: "auto",
      stage: opts.stage,
      direction: opts.direction,
      thread_id: threadId(opts.direction, opts.to[0] ?? ""),
      subject: opts.payload.subject,
      to_emails: opts.to,
      cc_emails: opts.cc,
      bcc_emails: [],
      body_html: opts.payload.html,
      body_text: opts.payload.text,
      attachments: [],
      status: opts.res.status,
      provider: opts.res.provider,
      error: opts.res.error,
      created_by: opts.buyer.owner,
      sent_at: opts.res.ok ? new Date().toISOString() : null,
    })
    .catch(() => null);
}

/* ================================================================== */
/* EMAIL DO ĐỘI NGŨ TỰ SOẠN (trình soạn thảo kiểu Gmail/Zoho)          */
/* ================================================================== */

export interface ManualMailInput {
  buyerId?: string | null;
  supplierId?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** nội dung HTML do trình soạn thảo tạo ra */
  bodyHtml: string;
  bodyText?: string;
  attachments?: Attachment[];
  author?: string | null;
}

export interface ManualMailResult {
  ok: boolean;
  status: "sent" | "simulated" | "failed";
  error: string | null;
  messageId: string | null;
}

export async function sendManualMail(input: ManualMailInput): Promise<ManualMailResult> {
  const html = wrapEmailShell({
    title: input.subject,
    body: input.bodyHtml,
  });
  const res = await transport({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    html,
    text: input.bodyText,
    attachments: input.attachments,
  });
  const store = getStore();
  const saved = await store
    .addMessage({
      buyer_id: input.buyerId ?? null,
      supplier_id: input.supplierId ?? null,
      kind: "manual",
      stage: null,
      direction: input.direction,
      thread_id: threadId(input.direction, input.to[0] ?? ""),
      subject: input.subject,
      to_emails: input.to,
      cc_emails: input.cc ?? [],
      bcc_emails: input.bcc ?? [],
      body_html: html,
      body_text: input.bodyText ?? "",
      attachments: input.attachments ?? [],
      status: res.status,
      provider: res.provider,
      error: res.error,
      created_by: input.author ?? null,
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    .catch(() => null);

  return {
    ok: res.ok,
    status: res.status,
    error: res.error,
    messageId: saved?.id ?? null,
  };
}

export async function saveDraft(input: ManualMailInput): Promise<string | null> {
  const html = wrapEmailShell({ title: input.subject || "(bản nháp)", body: input.bodyHtml });
  const saved = await getStore()
    .addMessage({
      buyer_id: input.buyerId ?? null,
      supplier_id: input.supplierId ?? null,
      kind: "manual",
      stage: null,
      direction: input.direction,
      thread_id: threadId(input.direction, input.to[0] ?? "(chưa có người nhận)"),
      subject: input.subject || "(không có tiêu đề)",
      to_emails: input.to,
      cc_emails: input.cc ?? [],
      bcc_emails: input.bcc ?? [],
      body_html: html,
      body_text: input.bodyText ?? "",
      attachments: input.attachments ?? [],
      status: "draft",
      provider: "local",
      error: null,
      created_by: input.author ?? null,
      sent_at: null,
    })
    .catch(() => null);
  return saved?.id ?? null;
}

/* ================================================================== */
/* EMAIL KHI BUYER VỪA ĐƯỢC GÁN VÀO NCC                               */
/* ================================================================== */

export async function sendSupplierAssigned(
  buyer: Buyer,
  supplier: Supplier,
): Promise<{ ok: boolean; status: "sent" | "simulated" | "failed"; error: string | null }> {
  if (!supplier.email || !supplier.email.trim()) {
    return { ok: false, status: "failed", error: "Nhà cung cấp chưa có email" };
  }
  const payload = buildSupplierAssignedEmail({ buyer, supplier });
  const res = await transport({ to: [supplier.email.trim()], ...payload });
  await getStore()
    .addMessage({
      buyer_id: buyer.id,
      supplier_id: supplier.id,
      kind: "auto",
      stage: buyer.stage,
      direction: "supplier",
      thread_id: threadId("supplier", supplier.email.trim()),
      subject: payload.subject,
      to_emails: [supplier.email.trim()],
      cc_emails: [],
      bcc_emails: [],
      body_html: payload.html,
      body_text: payload.text,
      attachments: [],
      status: res.status,
      provider: res.provider,
      error: res.error,
      created_by: buyer.owner,
      sent_at: res.ok ? new Date().toISOString() : null,
    })
    .catch(() => null);
  return { ok: res.ok, status: res.status, error: res.error };
}
