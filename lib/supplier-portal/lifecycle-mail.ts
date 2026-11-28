import "server-only";

import { SERVICE_FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";
import type { EmailMessage, Supplier, SupplierProduct } from "@/lib/types";

import { inactivityRunsToday } from "./inactivity-core";
import { notificationOrigin } from "./notify";
import { portalApproved } from "./onboarding";
import { SUPPLIER_REMINDER_KIND } from "./reminders";

/**
 * Hai thư theo mốc của nhà cung cấp (chủ dự án duyệt 28/11/2026):
 *  - Nhắc đăng sản phẩm đầu tiên: cổng đã mở mà chưa có sản phẩm nào đang hiển thị hay chờ duyệt.
 *    Thư 1 sau 3 ngày kể từ ngày mở cổng, thư 2 sau 10 ngày (cách thư 1 ít nhất 5 ngày), rồi thôi hẳn.
 *  - Hồ sơ đã lên sàn: gửi một lần duy nhất khi hồ sơ chuyển sang công khai lần đầu.
 * Cả hai ghi vào `email_messages` cùng kind `supplier_reminder` với thread riêng, nên không cần migration
 * và không gửi trùng.
 */
export const FIRST_PRODUCT_THREAD_PREFIX = "supplier-first-product-";
export const PUBLISHED_THREAD_PREFIX = "supplier-published-";
export const FIRST_PRODUCT_DAYS = [3, 10] as const;
const FIRST_PRODUCT_MIN_GAP_DAYS = 5;
/** Không gửi sát ngay sau một thư nhắc khác của Vexim. */
const GAP_AFTER_OTHER_REMINDER_DAYS = 2;
const MAX_PER_RUN = 40;
const DAY = 86_400_000;

export const FIRST_PRODUCT_GUIDE_PATH = "/supplier/portal/huong-dan/cach-dang-san-pham-dau-tien";
export const PHOTO_GUIDE_PATH = "/supplier/portal/huong-dan/chup-anh-san-pham-bang-dien-thoai";

type Named = Pick<Supplier, "name" | "display_name" | "trade_name" | "contact_name">;
type Mail = { subject: string; html: string; text: string };

const companyOf = (s: Named) => (s.display_name || s.trade_name || s.name || "").trim() || "doanh nghiệp của bạn";
const greetingOf = (s: Named) => (s.contact_name?.trim() ? `Chào ${s.contact_name.trim()},` : "Chào bạn,");

/** Ghép thư từ các đoạn: HTML có escape, bản chữ thuần giữ nguyên. Không dùng ký tự máy. */
function compose(input: { subject: string; greeting: string; paragraphs: string[]; list?: string[]; after?: string[]; links: { label: string; href: string }[] }): Mail {
  const htmlParts = [
    `<p>${escapeHtml(input.greeting)}</p>`,
    ...input.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...(input.list?.length ? [`<ul>${input.list.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`] : []),
    ...(input.after ?? []).map((p) => `<p>${escapeHtml(p)}</p>`),
    ...input.links.map((l) => `<p><a href="${escapeHtml(l.href)}"><strong>${escapeHtml(l.label)}</strong></a></p>`),
    "<p>Vexim Trade</p>",
  ];
  const text = [
    input.greeting, "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.list?.length ? [...input.list.map((li) => `- ${li}`), ""] : []),
    ...(input.after ?? []).flatMap((p) => [p, ""]),
    ...input.links.flatMap((l) => [`${l.label}: ${l.href}`]), "",
    "Vexim Trade",
  ].join("\n");
  return { subject: input.subject, html: wrapPlainEmail({ title: input.subject, body: htmlParts.join("\n") }), text };
}

/* ---------------- Nhắc đăng sản phẩm đầu tiên ---------------- */

export interface FirstProductState {
  /** Có sản phẩm đang hiển thị, đang chờ Vexim duyệt hoặc tạm ẩn: không cần nhắc. */
  live: number;
  /** Bản nháp hoặc sản phẩm Vexim trả lại để sửa, chưa gửi duyệt. */
  unfinished: number;
}

export function firstProductState(products: readonly Pick<SupplierProduct, "supplier_review_status">[]): FirstProductState {
  let live = 0;
  let unfinished = 0;
  for (const p of products) {
    const status = p.supplier_review_status ?? "approved";
    // Sản phẩm tạm ẩn cũng là đã từng đăng: không nhắc "chưa có sản phẩm".
    if (status === "approved" || status === "pending" || status === "paused") live += 1;
    else if (status === "draft" || status === "changes_requested") unfinished += 1;
  }
  return { live, unfinished };
}

/** Thư thứ mấy cần gửi bây giờ (0 hoặc 1), hoặc null. */
export function firstProductReminderDue(input: {
  approvedAt: string | null | undefined;
  state: FirstProductState;
  sentAt: readonly string[];
  otherReminderAt?: string | null;
  nowMs?: number;
}): number | null {
  const now = input.nowMs ?? Date.now();
  if (input.state.live > 0) return null;
  const approved = input.approvedAt ? Date.parse(input.approvedAt) : NaN;
  if (!Number.isFinite(approved)) return null;
  const sent = input.sentAt.map((at) => Date.parse(at)).filter(Number.isFinite);
  const step = sent.length;
  if (step >= FIRST_PRODUCT_DAYS.length) return null;
  if (now - approved < FIRST_PRODUCT_DAYS[step] * DAY) return null;
  if (step > 0 && now - Math.max(...sent) < FIRST_PRODUCT_MIN_GAP_DAYS * DAY) return null;
  const other = input.otherReminderAt ? Date.parse(input.otherReminderAt) : NaN;
  if (Number.isFinite(other) && now - other < GAP_AFTER_OTHER_REMINDER_DAYS * DAY) return null;
  return step;
}

export function buildFirstProductEmail(input: { supplier: Named; step: number; days: number; state: FirstProductState; origin: string }): Mail {
  const company = companyOf(input.supplier);
  const { origin, state } = input;
  const guide = { label: "Bài hướng dẫn cách đăng sản phẩm đầu tiên", href: `${origin}${FIRST_PRODUCT_GUIDE_PATH}` };
  const hasDrafts = state.unfinished > 0;
  const cta = hasDrafts
    ? { label: "Mở danh sách sản phẩm", href: `${origin}/supplier/portal/products` }
    : { label: "Đăng sản phẩm", href: `${origin}/supplier/portal/products/new` };

  const opening = hasDrafts
    ? `Cổng nhà cung cấp của ${company} đã mở được ${input.days} ngày. Bạn đã bắt đầu soạn ${state.unfinished} sản phẩm nhưng chưa gửi duyệt, nên người mua chưa thấy sản phẩm nào của bạn.`
    : `Cổng nhà cung cấp của ${company} đã mở được ${input.days} ngày nhưng chưa có sản phẩm nào.`;
  const why = "Người mua trên Vexim tìm hàng theo sản phẩm. Khi chưa có sản phẩm, hồ sơ của bạn gần như không xuất hiện trong kết quả tìm kiếm và trong các thư Vexim gửi người mua.";

  if (input.step === 0) {
    return compose({
      subject: hasDrafts ? `Sản phẩm của ${company} chưa được gửi duyệt` : `Đăng sản phẩm đầu tiên của ${company} lên Vexim Trade`,
      greeting: greetingOf(input.supplier),
      paragraphs: [opening, why, hasDrafts
        ? "Bạn chỉ cần mở bản nháp, điền nốt các ô còn thiếu rồi bấm gửi duyệt. Nếu Vexim đã ghi chú cần sửa, phần ghi chú nằm ngay trong sản phẩm."
        : "Đăng một sản phẩm mất khoảng 15 phút. Bạn nên chuẩn bị sẵn:"],
      list: hasDrafts ? undefined : [
        "Tên hàng và quy cách, ví dụ grade, kích cỡ, độ ẩm",
        "Vài ảnh chụp thật của hàng và bao bì",
        "Giá tham khảo FOB hoặc CIF và số lượng đặt tối thiểu",
      ],
      after: ["Sau khi bạn gửi, Vexim xem lại sản phẩm rồi mới hiển thị cho người mua. Nếu cần Vexim hỗ trợ, cứ trả lời thư này."],
      links: [cta, guide],
    });
  }
  return compose({
    subject: hasDrafts ? `${company} còn ${state.unfinished} sản phẩm chưa gửi duyệt` : `${company} chưa có sản phẩm nào trên Vexim Trade`,
    greeting: greetingOf(input.supplier),
    paragraphs: [
      opening,
      "Người mua đang tìm nguồn hàng mỗi ngày, nhưng họ chỉ liên hệ được với nhà cung cấp có sản phẩm để xem giá và quy cách.",
      "Nếu bạn chưa có thời gian, cứ trả lời thư này kèm danh sách mặt hàng và vài tấm ảnh, Vexim sẽ liên hệ để hỗ trợ bạn đăng.",
      "Đây là thư nhắc cuối về việc này.",
    ],
    links: [cta, guide, { label: "Bài hướng dẫn chụp ảnh sản phẩm bằng điện thoại", href: `${origin}${PHOTO_GUIDE_PATH}` }],
  });
}

/* ---------------- Hồ sơ đã lên sàn ---------------- */

export function buildPublishedEmail(input: { supplier: Named & Pick<Supplier, "id" | "slug">; liveProducts: number; origin: string }): Mail {
  const company = companyOf(input.supplier);
  const publicUrl = `${SITE_URL}/suppliers/${encodeURIComponent((input.supplier.slug ?? "").trim() || input.supplier.id)}`;
  const list = [
    "Gửi đường dẫn hồ sơ cho khách hàng quen, hoặc gắn vào chữ ký email và website của công ty.",
    ...(input.liveProducts === 0 ? ["Đăng sản phẩm để người mua tìm thấy bạn theo mặt hàng. Hồ sơ chưa có sản phẩm sẽ rất khó được tìm thấy."] : []),
    "Vào cổng mỗi ngày một lần để trả lời tin nhắn và yêu cầu báo giá sớm. Người mua thấy nhãn hoạt động ngay cạnh tên doanh nghiệp.",
  ];
  return compose({
    subject: `Hồ sơ ${company} đã lên Vexim Trade`,
    greeting: greetingOf(input.supplier),
    paragraphs: [
      `Hồ sơ doanh nghiệp của ${company} đã được công khai trên Vexim Trade. Từ hôm nay người mua có thể tìm thấy và xem hồ sơ của bạn tại:`,
      publicUrl,
      "Một vài việc nên làm ngay:",
    ],
    list,
    after: ["Các dấu xác minh trên hồ sơ chỉ hiện theo từng bước Vexim đã duyệt. Muốn có thêm dấu, bạn có thể bổ sung hồ sơ xác minh trong cổng."],
    links: [
      { label: "Xem hồ sơ công khai", href: publicUrl },
      ...(input.liveProducts === 0 ? [{ label: "Đăng sản phẩm", href: `${input.origin}/supplier/portal/products/new` }] : []),
      { label: "Mở cổng nhà cung cấp", href: `${input.origin}/supplier/portal` },
    ],
  });
}

/* ---------------- Gửi và ghi nhật ký ---------------- */

function recipientsOf(users: Awaited<ReturnType<DataStore["listUsers"]>>, supplierId: string): string[] {
  const list: string[] = [];
  for (const user of users) {
    if (!user.is_active || user.role !== "supplier" || user.supplier_id !== supplierId) continue;
    const email = user.email?.trim().toLowerCase();
    if (email && email.includes("@") && !list.includes(email)) list.push(email);
  }
  return list;
}

const delivered = (m: EmailMessage) => m.status === "sent" || m.status === "simulated";

async function deliver(store: DataStore, send: typeof transport, input: { supplierId: string; thread: string; to: string[]; mail: Mail; now: Date }) {
  let status: "sent" | "simulated" | "failed" = "failed";
  let provider: EmailMessage["provider"] = "local";
  let error: string | null = null;
  try {
    const result = await send({ to: input.to, from: SERVICE_FROM_ADDRESS, subject: input.mail.subject, html: input.mail.html, text: input.mail.text });
    provider = result.provider;
    error = result.error;
    if (result.ok && (result.status === "sent" || result.status === "simulated")) status = result.status;
    else error = result.error ?? "Chưa được Resend nhận.";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  try {
    await store.addMessage({
      buyer_id: null, supplier_id: input.supplierId, prospect_id: null, rfq_id: null, rfq_match_id: null,
      kind: SUPPLIER_REMINDER_KIND, stage: null, direction: "supplier", thread_id: input.thread,
      subject: input.mail.subject, to_emails: input.to, cc_emails: [], bcc_emails: [],
      body_html: input.mail.html, body_text: input.mail.text, attachments: [], rfc_message_id: null, read_at: null,
      status, provider, error, created_by: null, sent_at: status === "failed" ? null : input.now.toISOString(),
    } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
  } catch (err) {
    console.error("[supplier-lifecycle-mail] cannot log email_messages", input.supplierId, err);
  }
  return status;
}

export interface FirstProductReport { checked: number; sent: number; failed: number; error: string | null }

/** Lượt quét hằng ngày (gộp trong cron rfq-sla và supplier-reminders). Chạy lại nhiều lần không gửi trùng. */
export async function sendFirstProductReminders(opts: { store?: DataStore; send?: typeof transport; now?: Date; origin?: string } = {}): Promise<FirstProductReport> {
  const store = opts.store ?? getStore();
  const send = opts.send ?? transport;
  const now = opts.now ?? new Date();
  const origin = opts.origin ?? notificationOrigin();
  const report: FirstProductReport = { checked: 0, sent: 0, failed: 0, error: null };
  if (!inactivityRunsToday(now.getTime())) return report; // thứ Hai: đã có email báo cáo tuần

  let suppliers: Supplier[];
  let users: Awaited<ReturnType<DataStore["listUsers"]>>;
  let messages: EmailMessage[];
  let decisions: Awaited<ReturnType<DataStore["listSupplierOnboardingDecisions"]>>;
  try {
    [suppliers, users, messages, decisions] = await Promise.all([
      store.listSuppliers(), store.listUsers(), store.listMessagesOfKind(SUPPLIER_REMINDER_KIND), store.listSupplierOnboardingDecisions(),
    ]);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    console.error("[supplier-first-product] cannot read source data:", report.error);
    return report;
  }

  // Ngày mở cổng: lần duyệt mở cổng gần nhất trong nhật ký. Không có thì không đoán, không gửi.
  const approvedAt = new Map<string, string>();
  for (const d of decisions) {
    if (d.action !== "supplier.portal_access_approved") continue;
    if (!approvedAt.has(d.entity_id) || d.created_at > approvedAt.get(d.entity_id)!) approvedAt.set(d.entity_id, d.created_at);
  }
  const sentBy = new Map<string, string[]>();
  const otherLast = new Map<string, string>();
  for (const m of messages) {
    if (!m.supplier_id || !delivered(m)) continue;
    const at = m.sent_at ?? m.created_at;
    if (m.thread_id?.startsWith(FIRST_PRODUCT_THREAD_PREFIX)) sentBy.set(m.supplier_id, [...(sentBy.get(m.supplier_id) ?? []), at]);
    else if (!m.thread_id?.startsWith(PUBLISHED_THREAD_PREFIX) && (!otherLast.has(m.supplier_id) || at > otherLast.get(m.supplier_id)!)) otherLast.set(m.supplier_id, at);
  }

  for (const supplier of suppliers) {
    if (!portalApproved(supplier) || isSyntheticSupplier(supplier) || !approvedAt.has(supplier.id)) continue;
    if ((sentBy.get(supplier.id)?.length ?? 0) >= FIRST_PRODUCT_DAYS.length) continue;
    let state: FirstProductState;
    try { state = firstProductState(await store.listProductsBySupplier(supplier.id)); } catch { continue; }
    const step = firstProductReminderDue({
      approvedAt: approvedAt.get(supplier.id), state, sentAt: sentBy.get(supplier.id) ?? [], otherReminderAt: otherLast.get(supplier.id) ?? null, nowMs: now.getTime(),
    });
    if (step === null) continue;
    report.checked += 1;
    const to = recipientsOf(users, supplier.id);
    if (!to.length) continue;
    if (report.sent + report.failed >= MAX_PER_RUN) break;
    const days = Math.floor((now.getTime() - Date.parse(approvedAt.get(supplier.id)!)) / DAY);
    const mail = buildFirstProductEmail({ supplier, step, days, state, origin });
    const status = await deliver(store, send, { supplierId: supplier.id, thread: `${FIRST_PRODUCT_THREAD_PREFIX}${supplier.id}`, to, mail, now });
    if (status === "failed") report.failed += 1; else report.sent += 1;
  }
  return report;
}

/**
 * Báo hồ sơ đã lên sàn. Gọi ngay sau khi hồ sơ chuyển sang công khai (nút công khai trong CRM, hoặc
 * tự công khai khi duyệt L1). Chỉ gửi một lần cho mỗi nhà cung cấp; lỗi không làm hỏng việc công khai.
 */
export async function notifySupplierPublished(supplierId: string, opts: { store?: DataStore; send?: typeof transport; now?: Date; origin?: string } = {}): Promise<"sent" | "simulated" | "failed" | "skipped"> {
  const store = opts.store ?? getStore();
  const send = opts.send ?? transport;
  try {
    const supplier = await store.getSupplier(supplierId);
    if (!supplier || supplier.status !== "published" || isSyntheticSupplier(supplier)) return "skipped";
    const messages = await store.listMessagesOfKind(SUPPLIER_REMINDER_KIND);
    if (messages.some((m) => m.supplier_id === supplierId && m.thread_id?.startsWith(PUBLISHED_THREAD_PREFIX) && delivered(m))) return "skipped";
    const to = recipientsOf(await store.listUsers(), supplierId);
    if (!to.length) return "skipped";
    const products = await store.listProductsBySupplier(supplierId).catch(() => [] as SupplierProduct[]);
    const liveProducts = products.filter((p) => (p.supplier_review_status ?? "approved") === "approved").length;
    const mail = buildPublishedEmail({ supplier, liveProducts, origin: opts.origin ?? notificationOrigin() });
    return await deliver(store, send, { supplierId, thread: `${PUBLISHED_THREAD_PREFIX}${supplierId}`, to, mail, now: opts.now ?? new Date() });
  } catch (err) {
    console.error("[supplier-published-mail] failed", supplierId, err);
    return "failed";
  }
}
