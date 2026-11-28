import "server-only";

import { presenceKey, readPresence } from "@/lib/chat/presence";
import { hasUnread } from "@/lib/chat/core";
import { SERVICE_FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { supplierActivity, SUPPLIER_ACTIVITY_LABELS } from "@/lib/public/supplier-activity";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import type { EmailMessage, Supplier } from "@/lib/types";

import { daysSinceSeen, inactivityReminderDue, inactivityRunsToday } from "./inactivity-core";
import { notificationOrigin } from "./notify";
import { portalApproved } from "./onboarding";
import { SUPPLIER_REMINDER_KIND } from "./reminders";

/**
 * Thư nhắc nhà cung cấp lâu không vào cổng (chủ dự án duyệt 28/11/2026).
 *
 * Thư 1 khi đủ 5 ngày không vào, thư 2 khi đủ 14 ngày, rồi thôi cho tới khi họ vào lại
 * (lịch ở inactivity-core.ts). Thư nói việc thật đang chờ họ: tin nhắn người mua chưa đọc,
 * lượt xem hồ sơ, nhãn hoạt động người mua đang thấy. Ghi vào `email_messages` cùng kind
 * `supplier_reminder` với thread riêng `supplier-inactivity-<id>`, nên không cần migration;
 * thư nhắc hoàn thiện hồ sơ bỏ qua thread này khi tính thời gian chờ của nó.
 */
export const INACTIVITY_THREAD_PREFIX = "supplier-inactivity-";
export const INACTIVITY_MAX_PER_RUN = 40;

export interface InactivityFacts {
  days: number;
  step: number;
  unreadChats: number;
  views7d: number | null;
  /** Nhãn người mua đang thấy trên hồ sơ công khai; null khi hồ sơ chưa công khai hoặc nhãn đã ẩn. */
  publicLabel: string | null;
  published: boolean;
}

export function buildInactivityEmail(input: {
  supplier: Pick<Supplier, "name" | "display_name" | "trade_name" | "contact_name">;
  facts: InactivityFacts;
  origin: string;
}): { subject: string; html: string; text: string } {
  const { facts, origin } = input;
  const company = (input.supplier.display_name || input.supplier.trade_name || input.supplier.name || "").trim() || "doanh nghiệp của bạn";
  const contact = input.supplier.contact_name?.trim();
  const greeting = contact ? `Chào ${contact},` : "Chào bạn,";
  const views = facts.views7d ?? 0;

  const subject = facts.unreadChats > 0
    ? `${facts.unreadChats} người mua đang chờ bạn trả lời trên Vexim Trade`
    : facts.step === 0 && views > 0
      ? `Hồ sơ ${company} có ${views} lượt xem trong 7 ngày qua`
      : facts.step === 0
        ? `Đã ${facts.days} ngày bạn chưa vào Vexim Trade`
        : `${company} đã ${facts.days} ngày chưa cập nhật trên Vexim Trade`;

  const paragraphs: string[] = [];
  paragraphs.push(`Đã ${facts.days} ngày bạn chưa vào cổng nhà cung cấp của ${company} trên Vexim Trade.`);
  if (facts.unreadChats > 0) {
    paragraphs.push(facts.unreadChats === 1
      ? "Có 1 người mua đã nhắn tin và đang chờ bạn trả lời. Người mua thường làm việc với bên trả lời trước, nên trả lời sớm sẽ có lợi cho bạn."
      : `Có ${facts.unreadChats} người mua đã nhắn tin và đang chờ bạn trả lời. Người mua thường làm việc với bên trả lời trước, nên trả lời sớm sẽ có lợi cho bạn.`);
  }
  if (views > 0) paragraphs.push(`Hồ sơ và sản phẩm của bạn có ${views} lượt xem trong 7 ngày qua.`);
  if (facts.published) {
    paragraphs.push(facts.publicLabel
      ? `Trên hồ sơ công khai, người mua thấy lần cuối bạn hoạt động. Hiện hồ sơ đang ghi "${facts.publicLabel}". Chỉ cần mở cổng là nhãn đổi lại thành "${SUPPLIER_ACTIVITY_LABELS.day}".`
      : `Trên hồ sơ công khai, nhãn hoạt động đã ẩn vì quá 30 ngày không có lần truy cập nào. Mở cổng là nhãn hiện lại.`);
  }
  paragraphs.push(facts.step === 0
    ? "Mỗi lần vào chỉ mất vài phút: xem tin nhắn, kiểm tra yêu cầu báo giá mới và cập nhật giá nếu có thay đổi."
    : "Nếu giá hoặc lượng hàng có sẵn đã thay đổi, bạn nên cập nhật để người mua không hỏi theo thông tin cũ. Đây là thư nhắc cuối của đợt này, Vexim sẽ không gửi thêm cho tới khi bạn vào lại.");

  const cta = facts.unreadChats > 0
    ? { label: "Đọc tin nhắn", href: `${origin}/supplier/portal/messages` }
    : { label: "Mở cổng nhà cung cấp", href: `${origin}/supplier/portal` };
  const closing = "Nếu bạn không muốn nhận thư nhắc này, cứ trả lời thư để Vexim biết.";

  const html = wrapPlainEmail({
    title: subject,
    body: [
      `<p>${escapeHtml(greeting)}</p>`,
      ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
      `<p><a href="${escapeHtml(cta.href)}"><strong>${escapeHtml(cta.label)}</strong></a></p>`,
      `<p>${escapeHtml(closing)}</p>`,
      "<p>Vexim Trade</p>",
    ].join("\n"),
  });
  const text = [greeting, "", ...paragraphs.flatMap((p) => [p, ""]), `${cta.label}: ${cta.href}`, "", closing, "", "Vexim Trade"].join("\n");
  return { subject, html, text };
}

export interface InactivityReport {
  checked: number;
  sent: number;
  failed: number;
  details: { supplierId: string; step: number; days: number; status: "sent" | "simulated" | "failed" | "no_recipient" }[];
  error: string | null;
}

function isDelivered(message: EmailMessage): boolean {
  return message.status === "sent" || message.status === "simulated";
}

/**
 * Một lượt quét. Gọi từ cron hằng ngày (gộp trong `/api/cron/rfq-sla` và `/api/cron/supplier-reminders`).
 * Chạy lại bao nhiêu lần cũng được: lịch gửi dựa trên các thư đã ghi trong `email_messages`.
 */
export async function sendSupplierInactivityReminders(opts: {
  store?: DataStore;
  send?: typeof transport;
  now?: Date;
  origin?: string;
  /** Lượt xem 7 ngày; mặc định đọc bảng lượt xem của Supabase, lỗi thì bỏ câu lượt xem. */
  readViews?: (supplierId: string) => Promise<number | null>;
} = {}): Promise<InactivityReport> {
  const store = opts.store ?? getStore();
  const send = opts.send ?? transport;
  const now = opts.now ?? new Date();
  const origin = opts.origin ?? notificationOrigin();
  const readViews = opts.readViews ?? defaultViews;
  const report: InactivityReport = { checked: 0, sent: 0, failed: 0, details: [], error: null };
  if (!inactivityRunsToday(now.getTime())) return report;

  let suppliers: Supplier[];
  let users: Awaited<ReturnType<DataStore["listUsers"]>>;
  let messages: EmailMessage[];
  try {
    [suppliers, users, messages] = await Promise.all([
      store.listSuppliers(),
      store.listUsers(),
      store.listMessagesOfKind(SUPPLIER_REMINDER_KIND),
    ]);
  } catch (err) {
    // Không đọc được nhật ký thư thì không biết đã gửi chưa: bỏ cả lượt thay vì gửi trùng.
    report.error = err instanceof Error ? err.message : String(err);
    console.error("[supplier-inactivity] cannot read source data:", report.error);
    return report;
  }

  const candidates = suppliers.filter((s) => portalApproved(s) && !isSyntheticSupplier(s));
  const presence = await readPresence(store, candidates.map((s) => presenceKey.supplier(s.id)));

  const recipients = new Map<string, string[]>();
  for (const user of users) {
    if (!user.is_active || user.role !== "supplier" || !user.supplier_id) continue;
    const email = user.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const list = recipients.get(user.supplier_id) ?? [];
    if (!list.includes(email)) list.push(email);
    recipients.set(user.supplier_id, list);
  }

  const inactivitySent = new Map<string, string[]>();
  const otherLast = new Map<string, string>();
  for (const message of messages) {
    if (!message.supplier_id || !isDelivered(message)) continue;
    const at = message.sent_at ?? message.created_at;
    if (message.thread_id?.startsWith(INACTIVITY_THREAD_PREFIX)) {
      inactivitySent.set(message.supplier_id, [...(inactivitySent.get(message.supplier_id) ?? []), at]);
    } else if (!otherLast.has(message.supplier_id) || at > otherLast.get(message.supplier_id)!) {
      otherLast.set(message.supplier_id, at);
    }
  }

  for (const supplier of [...candidates].sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
    const lastSeenAt = presence[presenceKey.supplier(supplier.id)] ?? null;
    const step = inactivityReminderDue({
      lastSeenAt, sentAt: inactivitySent.get(supplier.id) ?? [], otherReminderAt: otherLast.get(supplier.id) ?? null, nowMs: now.getTime(),
    });
    if (step === null) continue;
    report.checked += 1;
    const days = daysSinceSeen(lastSeenAt, now.getTime()) ?? 0;
    const to = recipients.get(supplier.id) ?? [];
    if (!to.length) { report.details.push({ supplierId: supplier.id, step, days, status: "no_recipient" }); continue; }
    if (report.sent + report.failed >= INACTIVITY_MAX_PER_RUN) break;

    const [unreadChats, views7d] = await Promise.all([
      store.listChatConversations({ supplierId: supplier.id, limit: 200 })
        .then((rows) => rows.filter((c) => hasUnread(c, "supplier")).length).catch(() => 0),
      readViews(supplier.id).catch(() => null),
    ]);
    const published = supplier.status === "published";
    const activity = published ? supplierActivity(lastSeenAt, now.getTime()) : null;
    const email = buildInactivityEmail({
      supplier,
      facts: { days, step, unreadChats, views7d, published, publicLabel: activity ? SUPPLIER_ACTIVITY_LABELS[activity] : null },
      origin,
    });

    let status: "sent" | "simulated" | "failed" = "failed";
    let provider: EmailMessage["provider"] = "local";
    let error: string | null = null;
    try {
      const result = await send({ to, from: SERVICE_FROM_ADDRESS, subject: email.subject, html: email.html, text: email.text });
      provider = result.provider;
      error = result.error;
      if (result.ok && (result.status === "sent" || result.status === "simulated")) { status = result.status; report.sent += 1; }
      else { report.failed += 1; error = result.error ?? "Chưa được Resend nhận."; }
    } catch (err) {
      report.failed += 1;
      error = err instanceof Error ? err.message : String(err);
    }

    try {
      await store.addMessage({
        buyer_id: null, supplier_id: supplier.id, prospect_id: null, rfq_id: null, rfq_match_id: null,
        kind: SUPPLIER_REMINDER_KIND, stage: null, direction: "supplier",
        thread_id: `${INACTIVITY_THREAD_PREFIX}${supplier.id}`,
        subject: email.subject, to_emails: to, cc_emails: [], bcc_emails: [],
        body_html: email.html, body_text: email.text, attachments: [], rfc_message_id: null, read_at: null,
        status, provider, error, created_by: null,
        sent_at: status === "failed" ? null : now.toISOString(),
      } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
    } catch (err) {
      console.error("[supplier-inactivity] cannot log email_messages", supplier.id, err);
    }
    report.details.push({ supplierId: supplier.id, step, days, status });
  }
  return report;
}

async function defaultViews(supplierId: string): Promise<number | null> {
  const { readSupplierTraffic } = await import("@/lib/traffic/server");
  const rows = await readSupplierTraffic(supplierId, 7);
  return rows ? rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0) : null;
}
