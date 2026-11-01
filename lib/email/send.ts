import { Resend } from "resend";

import { FROM_ADDRESS, resendConfigured } from "@/lib/config";
import { getStore } from "@/lib/db";
import { formatFrom, senderAddressFor } from "@/lib/email/sender";
import { planDelivery } from "@/lib/email/suppression";
import { suppressedEmails } from "@/lib/email/suppression-store";
import {
  buildBuyerEmail,
  buildSupplierAssignedEmail,
  buildSupplierEmail,
  wrapPlainEmail,
  type EmailPayload,
} from "@/lib/email/templates";
import { getStage, type StageKey } from "@/lib/pipeline";
import { mergeOverrides } from "@/lib/email/stage-content";
import { mailTopic, openThread, rfqCodeForBuyer } from "@/lib/email/threading";
import { loadForSend, toRef } from "@/lib/mail/attachments";
import type { Buyer, EmailAttachment, Supplier } from "@/lib/types";

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /**
   * Địa chỉ ghi ở header From. Bỏ trống = dùng địa chỉ chức năng (EMAIL_FROM).
   * Thư cho buyer luôn nên truyền vào địa chỉ cá nhân của người phụ trách
   * (dung@veximtrade.com) — xem lib/email/sender.ts.
   */
  from?: string | null;
  /** Reply-To; bỏ trống thì email client mặc định trả lời đúng địa chỉ From. */
  replyTo?: string | null;
  /** Header RFC tuỳ chỉnh (In-Reply-To / References) để Gmail gom đúng mạch thư */
  headers?: Record<string, string>;
  html: string;
  text?: string;
  /** base64 chỉ tồn tại trong bộ nhớ lúc gửi qua Resend — KHÔNG lưu vào DB */
  attachments?: { filename: string; content: string; contentType: string }[];
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
  // Địa chỉ đã bounce cứng hoặc đã báo cáo thư rác thì dừng ngay tại đây, trước
  // khi chạm Resend: gửi tiếp chỉ làm giảm uy tín của domain hello@veximtrade.com
  // cho mọi người nhận khác. Đây là chốt duy nhất cho mọi đường thư trong hệ thống.
  const suppressed = await suppressedEmails([...recipients, ...(mail.cc ?? []), ...(mail.bcc ?? [])]);
  const plan = planDelivery(mail, suppressed);
  if (plan.blocked) {
    return { ok: false, status: "failed", provider: "local", error: plan.reason ?? "Địa chỉ đã ngừng nhận thư." };
  }
  mail = plan.mail;
  const to = mail.to;
  if (!resendConfigured()) {
    // Never report success for an email that production could not actually send.
    if (process.env.NODE_ENV === "production") return {
      ok: false, status: "failed", provider: "local", error: "RESEND_API_KEY chưa được cấu hình.",
    };
    return { ok: true, status: "simulated", provider: "local", error: null };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: mail.from?.trim() || FROM_ADDRESS,
      replyTo: mail.replyTo?.trim() || undefined,
      to,
      cc: mail.cc?.length ? mail.cc.filter(Boolean) : undefined,
      bcc: mail.bcc?.length ? mail.bcc.filter(Boolean) : undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments?.length ? mail.attachments : undefined,
      headers: mail.headers && Object.keys(mail.headers).length ? mail.headers : undefined,
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

export interface ResolvedSender {
  /** "Nguyễn Văn Dung <dung@veximtrade.com>" – giá trị đưa vào header From */
  header: string;
  /** "dung@veximtrade.com" – dùng cho Reply-To và dòng liên hệ trong chữ ký */
  address: string;
  name: string | null;
}

/**
 * Tìm địa chỉ gửi cá nhân của một người (theo email đăng nhập hoặc theo họ tên),
 * tính trên toàn đội ngũ để xử lý trùng tên. Không khớp ai (buyer chưa gán phụ
 * trách, tên không có tài khoản) thì trả null -> transport dùng địa chỉ chức năng.
 */
export async function resolveSender(opts: {
  byEmail?: string | null;
  byName?: string | null;
}): Promise<ResolvedSender | null> {
  const store = getStore();
  const users = await store.listUsers().catch(() => []);
  if (!users.length) return null;
  const byEmail = (opts.byEmail ?? "").trim().toLowerCase();
  const byName = (opts.byName ?? "").trim().toLowerCase();
  const user =
    (byEmail
      ? users.find((u) => u.email.trim().toLowerCase() === byEmail)
      : undefined) ??
    (byName ? users.find((u) => (u.name ?? "").trim().toLowerCase() === byName) : undefined);
  if (!user) return null;
  const address = senderAddressFor(user, users);
  if (!address) return null;
  return { header: formatFrom(user.name, address), address, name: user.name ?? null };
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
  // Nội dung giai đoạn: bản ghi đè từ trang Templates (nếu có) đè lên mặc định
  const content = mergeOverrides(
    await store.listTemplateOverrides().catch(() => []),
  )[stage];
  // Mã tham chiếu + mạch thư: cả đơn dùng một mã RFQ, và các thư nối nhau bằng
  // In-Reply-To/References để Gmail/Outlook gom thành một chuỗi.
  const refCode = await rfqCodeForBuyer(buyer.id);
  const mailThread = await openThread(mailTopic({ rfqCode: refCode, buyerId: buyer.id }));
  const messages: string[] = [];
  let buyerSent = false;
  let supplierSent = false;
  let simulated = false;
  let failed = false;

  if (stageDef.silent && !force) {
    messages.push(
      `Trạng thái "${stageDef.label}" không gửi email tự động, chỉ ghi nhận nội bộ.`,
    );
    return { sent: false, buyerSent, supplierSent, simulated, failed, messages };
  }

  // ---------- 1. Email cho buyer (tiếng Anh) ----------
  if (params.skipBuyer) {
    messages.push("Bỏ qua email người mua theo lựa chọn của người gửi.");
  } else if (buyer.email && buyer.email.trim()) {
    // From là địa chỉ cá nhân của người phụ trách đơn (buyer.owner); thư NCC vẫn
    // đi từ địa chỉ chức năng vì đó là thông báo của hệ thống, không phải thư tay.
    const sender = await resolveSender({ byName: buyer.owner });
    const payload = buildBuyerEmail({
      buyer,
      stage,
      refCode,
      note: params.messageToBuyer ?? params.note ?? null,
      content,
      senderEmail: sender?.address ?? null,
    });
    const cc = (buyer.cc_emails ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await transport({
      to: [buyer.email.trim()],
      cc,
      from: sender?.header ?? null,
      replyTo: sender?.address ?? null,
      ...payload,
      headers: mailThread.headers,
    });
    buyerSent = res.ok;
    simulated = simulated || res.status === "simulated";
    failed = failed || !res.ok;
    messages.push(
      res.ok
        ? `${res.status === "simulated" ? "[DEMO] Đã tạo" : "Đã gửi"} email người mua tới ${buyer.email}${cc.length ? ` (cc: ${cc.join(", ")})` : ""}`
        : `Gửi email người mua thất bại: ${res.error}`,
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
      rfcMessageId: mailThread.messageId,
    });
  } else {
    messages.push("Người mua chưa có email, bỏ qua email người mua.");
  }

  // ---------- 2. Email cho NCC (tiếng Việt) ----------
  if (params.skipSupplier) {
    messages.push("Bỏ qua email nhà cung cấp theo lựa chọn của người gửi.");
  } else if (!supplier) {
    messages.push("Chưa gắn nhà cung cấp cho khách này, email chỉ gửi tới người mua.");
  } else if (!supplier.email || !supplier.email.trim()) {
    messages.push(`Nhà cung cấp "${supplier.name}" chưa có email, bỏ qua email nhà cung cấp.`);
  } else {
    const payload = buildSupplierEmail({
      buyer,
      supplier,
      stage,
      refCode,
      note: params.messageToSupplier ?? params.note ?? null,
      content,
    });
    const res = await transport({ to: [supplier.email.trim()], ...payload });
    supplierSent = res.ok;
    simulated = simulated || res.status === "simulated";
    failed = failed || !res.ok;
    messages.push(
      res.ok
        ? `${res.status === "simulated" ? "[DEMO] Đã tạo" : "Đã gửi"} email nhà cung cấp tới ${supplier.email}`
        : `Gửi email nhà cung cấp thất bại: ${res.error}`,
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
  /** Message-ID của thư trong mạch, để thư sau nối In-Reply-To/References */
  rfcMessageId?: string | null;
}) {
  await getStore()
    .addMessage({
      buyer_id: opts.buyer.id,
      supplier_id: opts.supplierId,
      kind: "auto",
      stage: opts.stage,
      direction: opts.direction,
      thread_id: threadId(opts.direction, opts.to[0] ?? ""),
      rfc_message_id: opts.rfcMessageId ?? null,
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
  prospectId?: string | null;
  direction: "buyer" | "supplier";
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** nội dung HTML do trình soạn thảo tạo ra */
  bodyHtml: string;
  bodyText?: string;
  /** các dòng metadata tệp đính kèm (nội dung thật nằm trong Storage, không ở DB) */
  attachments?: EmailAttachment[];
  author?: string | null;
  /** Email đăng nhập của người soạn — dùng để suy ra địa chỉ gửi cá nhân */
  authorEmail?: string | null;
  /** RFC Message-ID của thư đang trả lời — để Gmail/Outlook gom chung thread */
  inReplyTo?: string | null;
  /** Chuỗi References (các Message-ID trước đó trong thread) */
  references?: string | null;
}

export interface ManualMailResult {
  ok: boolean;
  status: "sent" | "simulated" | "failed";
  error: string | null;
  messageId: string | null;
}

export async function sendManualMail(input: ManualMailInput): Promise<ManualMailResult> {
  // Email tự soạn => khung trơn giống email thường (không banner/card/footer).
  const html = wrapPlainEmail({
    title: input.subject,
    body: input.bodyHtml,
  });

  // Đọc nội dung tệp từ kho lưu trữ (base64 chỉ để chuyển cho Resend, không ghi DB).
  // Không đọc được tệp thì DỪNG trước khi gửi để không gửi thiếu tệp.
  let forSend: { filename: string; content: string; contentType: string }[] | undefined;
  if (input.attachments?.length) {
    forSend = await loadForSend(input.attachments);
  }

  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references) headers["References"] = input.references;
  // Người thật soạn thư thì gửi từ địa chỉ mang tên người đó (cả thư buyer lẫn thư NCC).
  const sender = await resolveSender({ byEmail: input.authorEmail ?? null, byName: input.author ?? null });
  const res = await transport({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    from: sender?.header ?? null,
    replyTo: sender?.address ?? null,
    subject: input.subject,
    html,
    text: input.bodyText,
    attachments: forSend,
    headers,
  });
  const store = getStore();
  const saved = await store
    .addMessage({
      buyer_id: input.buyerId ?? null,
      supplier_id: input.supplierId ?? null,
      ...(input.prospectId ? { prospect_id: input.prospectId } : {}),
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
      attachments: (input.attachments ?? []).map(toRef),
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
  const html = wrapPlainEmail({ title: input.subject || "(bản nháp)", body: input.bodyHtml });
  const saved = await getStore()
    .addMessage({
      buyer_id: input.buyerId ?? null,
      supplier_id: input.supplierId ?? null,
      ...(input.prospectId ? { prospect_id: input.prospectId } : {}),
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
      attachments: (input.attachments ?? []).map(toRef),
      status: "draft",
      provider: "local",
      error: null,
      created_by: input.author ?? null,
      sent_at: null,
    })
    .catch(() => null);
  return saved?.id ?? null;
}

/**
 * Lưu đè lên chính bản nháp đang mở. Gmail chỉ giữ MỘT bản nháp cho một lần soạn;
 * nếu mỗi lần bấm "Lưu nháp" lại thêm một dòng thì Hộp thư ngập bản nháp trùng nhau,
 * nên bản nháp đã mở ra là bản được ghi lại (id giữ nguyên, liên kết ?draft= không đổi).
 */
export async function updateDraft(id: string, input: ManualMailInput): Promise<boolean> {
  const html = wrapPlainEmail({ title: input.subject || "(bản nháp)", body: input.bodyHtml });
  try {
    await getStore().updateMessage(id, {
      buyer_id: input.buyerId ?? null,
      supplier_id: input.supplierId ?? null,
      ...(input.prospectId ? { prospect_id: input.prospectId } : {}),
      // direction/thread_id giữ nguyên của lần lưu đầu: bản nháp vẫn là cùng một mạch thư
      kind: "manual",
      stage: null,
      subject: input.subject || "(không có tiêu đề)",
      to_emails: input.to,
      cc_emails: input.cc ?? [],
      bcc_emails: input.bcc ?? [],
      body_html: html,
      attachments: (input.attachments ?? []).map(toRef),
      status: "draft",
      error: null,
      sent_at: null,
    });
    return true;
  } catch (err) {
    console.error("[draft] không cập nhật được bản nháp", id, err);
    return false;
  }
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
