import "server-only";

import { after } from "next/server";
import brandColors from "@/lib/brand/colors.json";
import { FROM_ADDRESS, SERVICE_FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { notificationOrigin } from "@/lib/supplier-portal/notify";
import { SITE_URL } from "@/lib/site";
import type { ChatConversation, SupportConversation } from "@/lib/types";
import { notificationDue, unansweredEscalationDue, type NotifyKind } from "./core";
import { isOnline, presenceKey, readPresence } from "./presence";
import { buyerLabel, supplierName } from "./service";
import { deskInbox } from "./support";

/**
 * Email báo tin nhắn, chạy theo đợt thay vì gửi ngay từng tin:
 *  1. Chỉ báo tin còn chưa đọc sau 10 phút, và người nhận không đang mở Vexim.
 *  2. Mỗi người nhận một thư cho mọi cuộc trò chuyện đang chờ (chat nhà cung cấp lẫn chat Vexim).
 *  3. Chưa đọc sau 24 giờ thì nhắc đúng một lần, rồi dừng tới khi người nhận đọc.
 * Trước khi gửi, mỗi cuộc được "nhận việc" bằng cập nhật có điều kiện, nên hai lần quét chạy
 * cùng lúc không gửi trùng. Gửi lỗi thì trả lại mốc cũ để lần quét sau thử lại.
 */

type Audience = "buyer" | "supplier" | "staff";
type Column = "buyer_notified_at" | "supplier_notified_at" | "staff_notified_at" | "buyer_reminded_at" | "supplier_reminded_at" | "staff_reminded_at";

interface Due {
  kind: NotifyKind;
  table: "chat_conversations" | "support_conversations";
  id: string;
  column: Column;
  expected: string | null;
  audience: Audience;
  /** Người nhận: email người mua, id nhà cung cấp, hoặc null với đội Vexim (tính theo người phụ trách). */
  recipient: string | null;
  chat?: ChatConversation;
  support?: SupportConversation;
}

interface Entry { from: string; product: string | null; preview: string | null; href: string; kind: NotifyKind }

export interface NotifyRunResult { claimed: number; emails: number; failed: number }

function dueFor(table: Due["table"], id: string, kind: NotifyKind | null, side: "buyer" | "supplier" | "staff",
  notified: string | null, reminded: string | null | undefined): Pick<Due, "kind" | "table" | "id" | "column" | "expected"> | null {
  if (!kind) return null;
  return kind === "first"
    ? { kind, table, id, column: `${side}_notified_at` as Column, expected: notified }
    : { kind, table, id, column: `${side}_reminded_at` as Column, expected: reminded ?? null };
}

export async function runChatNotifications(store: DataStore, nowMs = Date.now()): Promise<NotifyRunResult> {
  const [chats, supports] = await Promise.all([
    store.listChatConversations({ limit: 1000 }).catch(() => [] as ChatConversation[]),
    store.listSupportConversations({ limit: 1000 }).catch(() => [] as SupportConversation[]),
  ]);
  const seen = await readPresence(store, [
    ...chats.flatMap((c) => [presenceKey.buyer(c.buyer_email), presenceKey.supplier(c.supplier_id)]),
    ...supports.map((c) => presenceKey.buyer(c.buyer_email)), presenceKey.staff(),
  ]);
  const online = (key: string) => isOnline(seen[key], nowMs);

  const due: Due[] = [];
  for (const c of chats) {
    const toSupplier = notificationDue({ lastMessageAt: c.last_message_at, fromOtherSide: c.last_sender === "buyer", readAt: c.supplier_last_read_at,
      notifiedAt: c.supplier_notified_at, remindedAt: c.supplier_reminded_at }, online(presenceKey.supplier(c.supplier_id)), nowMs);
    const s = dueFor("chat_conversations", c.id, toSupplier, "supplier", c.supplier_notified_at, c.supplier_reminded_at);
    if (s) due.push({ ...s, audience: "supplier", recipient: c.supplier_id, chat: c });
    const toBuyer = notificationDue({ lastMessageAt: c.last_message_at, fromOtherSide: c.last_sender === "supplier", readAt: c.buyer_last_read_at,
      notifiedAt: c.buyer_notified_at, remindedAt: c.buyer_reminded_at }, online(presenceKey.buyer(c.buyer_email)), nowMs);
    const b = dueFor("chat_conversations", c.id, toBuyer, "buyer", c.buyer_notified_at, c.buyer_reminded_at);
    if (b) due.push({ ...b, audience: "buyer", recipient: c.buyer_email, chat: c });
  }
  for (const c of supports) {
    const toStaff = notificationDue({ lastMessageAt: c.last_message_at, fromOtherSide: c.last_sender === "buyer", readAt: c.staff_last_read_at,
      notifiedAt: c.staff_notified_at, remindedAt: c.staff_reminded_at }, online(presenceKey.staff()), nowMs);
    const s = dueFor("support_conversations", c.id, toStaff, "staff", c.staff_notified_at, c.staff_reminded_at);
    if (s) due.push({ ...s, audience: "staff", recipient: null, support: c });
    const toBuyer = notificationDue({ lastMessageAt: c.last_message_at, fromOtherSide: c.last_sender === "staff", readAt: c.buyer_last_read_at,
      notifiedAt: c.buyer_notified_at, remindedAt: c.buyer_reminded_at }, online(presenceKey.buyer(c.buyer_email)), nowMs);
    const b = dueFor("support_conversations", c.id, toBuyer, "buyer", c.buyer_notified_at, c.buyer_reminded_at);
    if (b) due.push({ ...b, audience: "buyer", recipient: c.buyer_email, support: c });
  }
  if (!due.length) return { claimed: 0, emails: 0, failed: 0 };

  const stamp = new Date(nowMs).toISOString();
  const claimed: Due[] = [];
  for (const d of due) {
    // Thiếu cột nhắc (chưa chạy migration) thì cập nhật lỗi: bỏ qua lần nhắc, email đầu vẫn chạy.
    const ok = await store.claimChatNotification(d.table, d.id, d.column, d.expected, stamp).catch(() => false);
    if (ok) claimed.push(d);
  }

  // Gộp theo người nhận thật (địa chỉ email), mỗi người một thư.
  const users = claimed.some((d) => d.audience !== "buyer") ? await store.listUsers().catch(() => []) : [];
  const groups = new Map<string, { audience: Audience; to: string[]; items: { due: Due; entry: Entry }[] }>();
  for (const d of claimed) {
    let key: string; let to: string[]; let entry: Entry;
    if (d.audience === "supplier" && d.chat) {
      const supplier = await store.getSupplier(d.chat.supplier_id).catch(() => null);
      const portal = users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id === d.chat!.supplier_id).map((u) => u.email.trim().toLowerCase());
      to = [...new Set(portal.length ? portal : supplier?.email ? [supplier.email.trim().toLowerCase()] : [])].filter(Boolean);
      key = `supplier:${d.chat.supplier_id}`;
      entry = { from: await buyerLabel(store, d.chat.buyer_email), product: d.chat.product_name, preview: d.chat.last_message_preview,
        href: `${notificationOrigin()}/supplier/portal/messages?c=${encodeURIComponent(d.id)}`, kind: d.kind };
    } else if (d.audience === "staff" && d.support) {
      const assignee = d.support.assigned_to ? users.find((u) => u.id === d.support!.assigned_to) : null;
      to = [assignee?.is_active && assignee.email ? assignee.email.trim().toLowerCase() : deskInbox()];
      key = `staff:${to[0]}`;
      entry = { from: await buyerLabel(store, d.support.buyer_email).then((l) => l === "Người mua" ? d.support!.buyer_email : l), product: null,
        preview: d.support.last_message_preview, href: `${notificationOrigin()}/crm/support?c=${encodeURIComponent(d.id)}`, kind: d.kind };
    } else {
      const email = d.recipient!.trim().toLowerCase();
      to = [email]; key = `buyer:${email}`;
      if (d.chat) {
        const supplier = await store.getSupplier(d.chat.supplier_id).catch(() => null);
        entry = { from: supplier ? supplierName(supplier) : "Supplier", product: d.chat.product_name, preview: d.chat.last_message_preview,
          href: `${SITE_URL}/buyer/account/messages?c=${encodeURIComponent(d.id)}`, kind: d.kind };
      } else {
        entry = { from: "Support team", product: null, preview: d.support!.last_message_preview, href: `${SITE_URL}/?support=1`, kind: d.kind };
      }
    }
    if (!to.length) { await release(store, d, stamp); continue; }
    const group = groups.get(key) ?? { audience: d.audience, to, items: [] };
    group.items.push({ due: d, entry });
    groups.set(key, group);
  }

  let emails = 0; let failed = 0;
  for (const group of groups.values()) {
    const ok = await sendDigest(group.audience, group.to, group.items.map((i) => i.entry))
      .catch((error) => { console.error("[chat-notify] digest failed", error); return false; });
    if (ok) emails++;
    else { failed++; for (const i of group.items) await release(store, i.due, stamp); }
  }
  return { claimed: claimed.length, emails, failed };
}

/** Gửi lỗi: trả mốc về như cũ để lần quét sau thử lại. */
async function release(store: DataStore, d: Due, stamp: string) {
  await store.claimChatNotification(d.table, d.id, d.column, stamp, d.expected).catch(() => false);
}

const button = (href: string, label: string) => `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${brandColors.primary};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${escapeHtml(label)}</a></p>`;

function rows(entries: Entry[], open: string): string {
  return entries.map((e) => `<div style="margin:12px 0;padding:12px 16px;border-left:4px solid ${brandColors.primary};background:${brandColors.surface};">
    <div style="font-weight:700;">${escapeHtml(e.from)}${e.product ? ` <span style="font-weight:400;color:${brandColors.muted};">(${escapeHtml(e.product)})</span>` : ""}</div>
    ${e.preview ? `<div style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(e.preview)}</div>` : ""}
    <div style="margin-top:6px;"><a href="${escapeHtml(e.href)}">${escapeHtml(open)}</a></div></div>`).join("");
}

function textRows(entries: Entry[]): string {
  return entries.map((e) => `- ${e.from}${e.product ? ` (${e.product})` : ""}: ${e.preview ?? ""}\n  ${e.href}`).join("\n");
}

async function sendDigest(audience: Audience, to: string[], entries: Entry[]): Promise<boolean> {
  const n = entries.length;
  const reminder = entries.every((e) => e.kind === "reminder");
  if (audience === "buyer") {
    const subject = reminder ? `Reminder: ${n === 1 ? "a message is" : `${n} conversations are`} waiting for your reply on Vexim Trade`
      : n === 1 ? `New message from ${entries[0].from} on Vexim Trade` : `You have unread messages in ${n} conversations on Vexim Trade`;
    const intro = reminder ? "These messages are still unread." : "You have new messages on Vexim Trade.";
    const html = `<p>${escapeHtml(intro)}</p>${rows(entries, "Open conversation")}${button(n === 1 ? entries[0].href : `${SITE_URL}/buyer/account/messages`, "Reply to messages")}
      <p style="color:${brandColors.muted};font-size:12.5px;">Please do not reply to this email. Messages are only delivered when you reply in your account, and your email address stays private.</p>`;
    const res = await transport({ to, from: FROM_ADDRESS, subject, html: wrapPlainEmail({ title: escapeHtml(subject), body: html }),
      text: `${intro}\n\n${textRows(entries)}\n\nPlease do not reply to this email. Reply in your account.` });
    return res.ok;
  }
  if (audience === "supplier") {
    const subject = reminder ? `Nhắc: ${n} cuộc trò chuyện với người mua vẫn chờ bạn trả lời`
      : n === 1 ? `Tin nhắn mới từ ${entries[0].from}` : `Bạn có tin nhắn chưa đọc trong ${n} cuộc trò chuyện với người mua`;
    const intro = reminder ? "Các tin nhắn dưới đây vẫn chưa được đọc. Trả lời sớm giúp hồ sơ của bạn được tin cậy hơn." : "Bạn có tin nhắn mới từ người mua trên Vexim Trade.";
    const html = `<p>${escapeHtml(intro)}</p>${rows(entries, "Mở cuộc trò chuyện")}${button(`${notificationOrigin()}/supplier/portal/messages`, "Trả lời tin nhắn")}
      <p style="color:${brandColors.muted};font-size:12.5px;">Vui lòng không trả lời email này: người mua chỉ nhận được tin gửi trong mục Tin nhắn của cổng nhà cung cấp.</p>`;
    const res = await transport({ to, from: SERVICE_FROM_ADDRESS, subject, html: wrapPlainEmail({ title: escapeHtml(subject), body: html }),
      text: `${intro}\n\n${textRows(entries)}\n\nVui lòng trả lời trong cổng nhà cung cấp.` });
    return res.ok;
  }
  const subject = reminder ? `Nhắc: ${n} người mua vẫn chờ trả lời chat` : `Người mua đang chờ trả lời chat (${n})`;
  const intro = reminder ? "Các cuộc chat dưới đây đã quá 24 giờ mà chưa ai đọc." : "Có tin nhắn mới từ người mua trong mục Chat với người mua.";
  const html = `<p>${escapeHtml(intro)}</p>${rows(entries, "Trả lời trong CRM")}${button(`${notificationOrigin()}/crm/support`, "Mở Chat với người mua")}`;
  const res = await transport({ to, from: SERVICE_FROM_ADDRESS, subject, html: wrapPlainEmail({ title: escapeHtml(subject), body: html }),
    text: `${intro}\n\n${textRows(entries)}` });
  return res.ok;
}

/** Trần mỗi lượt quét, để một lần chạy không gửi ồ ạt. */
export const UNANSWERED_MAX_PER_RUN = 40;
/** Nơi người mua gửi yêu cầu tìm nguồn chung cho Vexim. */
const SOURCING_URL = `${SITE_URL}/buyer/account?tab=vexim`;

export interface UnansweredRunResult { escalated: number; buyerEmails: number; failed: number }

/**
 * Nhà cung cấp không trả lời người mua sau 48 giờ (thường là không còn vào tài khoản):
 *  1. Người mua nhận một thư nói rõ chưa có trả lời, Vexim đang liên hệ nhà cung cấp, và có thể
 *     gửi yêu cầu tìm nguồn chung nếu cần gấp. Không tự chuyển tin sang nhà cung cấp khác.
 *  2. Đội Vexim nhận một thư gộp; việc cũng hiện ở "Việc cần làm" cho tới khi nhà cung cấp
 *     trả lời hoặc nhân viên ghi đã liên hệ.
 * Mỗi tin của người mua chỉ chuyển một lần (nhận việc bằng cập nhật có điều kiện). Thư cho
 * người mua lỗi thì trả mốc để lần quét sau thử lại. Chưa chạy migration thì bỏ qua, không lỗi.
 */
export async function runUnansweredEscalations(store: DataStore, nowMs = Date.now()): Promise<UnansweredRunResult> {
  const chats = await store.listChatConversations({ limit: 1000 }).catch(() => [] as ChatConversation[]);
  const due = chats.filter((c) => unansweredEscalationDue(c, nowMs))
    .sort((a, b) => (a.last_message_at ?? "").localeCompare(b.last_message_at ?? "")).slice(0, UNANSWERED_MAX_PER_RUN);
  if (!due.length) return { escalated: 0, buyerEmails: 0, failed: 0 };

  const stamp = new Date(nowMs).toISOString();
  type Item = { chat: ChatConversation; expected: string | null; supplier: string };
  const byBuyer = new Map<string, Item[]>();
  for (const chat of due) {
    const expected = chat.unanswered_escalated_at ?? null;
    const ok = await store.claimChatNotification("chat_conversations", chat.id, "unanswered_escalated_at", expected, stamp).catch(() => false);
    if (!ok) continue;
    const supplier = await store.getSupplier(chat.supplier_id).catch(() => null);
    const email = chat.buyer_email.trim().toLowerCase();
    byBuyer.set(email, [...(byBuyer.get(email) ?? []), { chat, expected, supplier: supplier ? supplierName(supplier) : "Supplier" }]);
  }

  let buyerEmails = 0; let failed = 0;
  const escalated: Item[] = [];
  for (const [email, items] of byBuyer) {
    const ok = await sendUnansweredBuyerNotice(email, items).catch((error) => { console.error("[chat-notify] unanswered buyer notice failed", error); return false; });
    if (ok) { buyerEmails++; escalated.push(...items); continue; }
    failed++;
    for (const i of items) await store.claimChatNotification("chat_conversations", i.chat.id, "unanswered_escalated_at", stamp, i.expected).catch(() => false);
  }
  if (escalated.length) {
    // Thư nội bộ chỉ là lời báo thêm: việc đã nằm trong CRM, nên gửi lỗi không trả mốc.
    await sendUnansweredStaffDigest(store, escalated).catch((error) => { console.error("[chat-notify] unanswered staff digest failed", error); });
  }
  return { escalated: escalated.length, buyerEmails, failed };
}

async function sendUnansweredBuyerNotice(to: string, items: { chat: ChatConversation; supplier: string }[]): Promise<boolean> {
  const n = items.length;
  const subject = n === 1 ? `No reply yet from ${items[0].supplier} on Vexim Trade` : `No reply yet from ${n} suppliers on Vexim Trade`;
  const intro = n === 1
    ? `${items[0].supplier} has not replied to your message in the last 2 days.`
    : "These suppliers have not replied to your messages in the last 2 days.";
  const entries: Entry[] = items.map((i) => ({ from: i.supplier, product: i.chat.product_name, preview: null, kind: "first",
    href: `${SITE_URL}/buyer/account/messages?c=${encodeURIComponent(i.chat.id)}` }));
  const next = "Our team is now contacting the supplier for you. Your message stays in the conversation and you will get an email as soon as they reply.";
  const alt = "Need an answer sooner? Send a sourcing request and Vexim will look for matching suppliers. We will not pass your message to another supplier without asking you.";
  const html = `<p>${escapeHtml(intro)}</p>${rows(entries, "Open conversation")}<p>${escapeHtml(next)}</p><p>${escapeHtml(alt)}</p>${button(SOURCING_URL, "Send a sourcing request")}
    <p style="color:${brandColors.muted};font-size:12.5px;">Please do not reply to this email. Your email address stays private.</p>`;
  const res = await transport({ to: [to], from: FROM_ADDRESS, subject, html: wrapPlainEmail({ title: escapeHtml(subject), body: html }),
    text: `${intro}\n\n${textRows(entries)}\n\n${next}\n\n${alt}\n${SOURCING_URL}\n\nPlease do not reply to this email.` });
  return res.ok;
}

async function sendUnansweredStaffDigest(store: DataStore, items: { chat: ChatConversation; supplier: string }[]): Promise<boolean> {
  const entries: Entry[] = await Promise.all(items.map(async (i) => ({
    from: `${i.supplier} ← ${await buyerLabel(store, i.chat.buyer_email).then((l) => l === "Người mua" ? i.chat.buyer_email : l)}`,
    product: i.chat.product_name, preview: i.chat.last_message_preview, kind: "first" as const,
    href: `${notificationOrigin()}/crm/messages/${encodeURIComponent(i.chat.id)}`,
  })));
  const subject = `Nhà cung cấp chưa trả lời người mua sau 48 giờ (${entries.length})`;
  const intro = "Người mua trong các cuộc dưới đây đã chờ quá 48 giờ. Hãy gọi hoặc nhắn Zalo cho nhà cung cấp, rồi ghi \"Đã liên hệ\" trong CRM. Người mua đã được báo là Vexim đang liên hệ.";
  const html = `<p>${escapeHtml(intro)}</p>${rows(entries, "Mở cuộc trò chuyện trong CRM")}${button(`${notificationOrigin()}/crm/tasks`, "Mở Việc cần làm")}`;
  const res = await transport({ to: [deskInbox()], from: SERVICE_FROM_ADDRESS, subject, html: wrapPlainEmail({ title: escapeHtml(subject), body: html }),
    text: `${intro}\n\n${textRows(entries)}` });
  return res.ok;
}

const OPPORTUNISTIC_EVERY_MS = 3 * 60_000;
let lastRun = 0;
let running = false;

/**
 * Chạy bộ quét sau khi trả lời request (các lần tự hỏi tin mới vốn diễn ra liên tục), tối đa
 * 3 phút một lần mỗi máy chủ. Nhờ vậy email vẫn đi khi chưa cài lịch cron; có cron thì đều hơn.
 */
export function scheduleChatNotifications(store: DataStore): void {
  const now = Date.now();
  if (running || now - lastRun < OPPORTUNISTIC_EVERY_MS) return;
  lastRun = now;
  try {
    after(async () => {
      running = true;
      try { await runChatNotifications(store); } catch (error) { console.error("[chat-notify] sweep failed", error); }
      try { await runUnansweredEscalations(store); } catch (error) { console.error("[chat-notify] unanswered sweep failed", error); }
      finally { running = false; }
    });
  } catch { /* ngoài request (test) thì bỏ qua */ }
}
