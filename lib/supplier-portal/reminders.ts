import "server-only";

import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { effectiveL2Scope, l2ScopeForSupplier } from "@/lib/l2-scope";
import type {
  EmailMessage,
  Supplier,
  SupplierSubmission,
  SupplierVerificationRequest,
  Verification,
} from "@/lib/types";

import { notificationOrigin } from "./notify";
import { portalApproved } from "./onboarding";

/**
 * Thư nhắc hoàn thiện hồ sơ xác minh cho tài khoản nhà cung cấp.
 *
 * Đây là **thư dịch vụ theo sự kiện**, không phải email quảng cáo: chỉ nhắc đúng
 * bước nhà cung cấp đã tự bắt đầu hoặc đã tự yêu cầu, không mời chào thêm cấp,
 * không bán vị trí. Mỗi lần nhắc được ghi vào `email_messages` với kind
 * `supplier_reminder` để chống gửi trùng và để đếm tần suất.
 *
 * Giới hạn cứng:
 *  - 14 ngày giữa hai thư nhắc của cùng một nhà cung cấp;
 *  - tối đa 6 thư nhắc cho một nhà cung cấp (sau đó để nhân viên liên hệ tay);
 *  - tối đa 40 thư trong một lượt cron.
 *
 * Xem docs/email-lifecycle-plan.md.
 */

export const SUPPLIER_REMINDER_KIND = "supplier_reminder" as const;
export const REMINDER_COOLDOWN_DAYS = 14;
export const REMINDER_LIFETIME_CAP = 6;
export const REMINDER_MAX_PER_RUN = 40;

export interface ReminderItem {
  level: 1 | 2 | 3;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export type ReminderSkipReason = "cooldown" | "capped" | "no_recipient";
export type ReminderStatus = "sent" | "simulated" | "failed" | ReminderSkipReason;

export interface ReminderReport {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  details: { supplierId: string; status: ReminderStatus; items: string[] }[];
  /** Bảng nguồn không đọc được (ví dụ thiếu migration) → bỏ cả lượt thay vì nhắc sai. */
  error: string | null;
}

type ReviewRow = Pick<Verification, "target_level" | "status" | "l2_scope">;
type SubmissionRow = Pick<SupplierSubmission, "target_level" | "status" | "l2_scope">;
type RequestRow = Pick<SupplierVerificationRequest, "target_level">;

/**
 * Việc còn dở mà **chính nhà cung cấp** phải làm.
 *
 * Chỉ tính một cấp khi họ đã tự bắt đầu (có hồ sơ nháp/đợt kiểm, hoặc hồ sơ bị trả)
 * hoặc đã tự gửi yêu cầu kiểm định. Cấp chưa ai đụng tới thì không nhắc — đó là
 * việc bán hàng, không phải thư dịch vụ.
 *
 * Bước đang chờ Vexim (`submitted` / `pending_review`) không bao giờ bị nhắc lại.
 */
export function outstandingVerificationItems(input: {
  supplier: Pick<Supplier, "supplier_type">;
  reviews: readonly ReviewRow[];
  submissions: readonly SubmissionRow[];
  requests: readonly RequestRow[];
}): ReminderItem[] {
  const items: ReminderItem[] = [];

  const l1 = input.reviews.filter((row) => row.target_level === 1);
  const l1Approved = l1.some((row) => row.status === "approved");
  const l1Waiting = l1.some((row) => row.status === "submitted");
  if (!l1Approved && !l1Waiting) {
    const returned = l1.some((row) => row.status === "returned");
    items.push({
      level: 1,
      title: "Giấy tờ doanh nghiệp",
      detail: returned
        ? "Hồ sơ giấy tờ đã được trả lại để bổ sung."
        : "Chưa có giấy đăng ký doanh nghiệp nào được duyệt.",
      href: "/supplier/portal/documents",
      cta: returned ? "Bổ sung giấy tờ" : "Tải giấy tờ",
    });
  }

  const scope = l2ScopeForSupplier(input.supplier.supplier_type);
  if (scope) {
    const inScope = (row: ReviewRow | SubmissionRow) =>
      row.target_level === 2 && effectiveL2Scope(row.l2_scope) === scope;
    const reviews2 = input.reviews.filter(inScope);
    const submissions2 = input.submissions.filter((row) => inScope(row));
    const approved2 = reviews2.some((row) => row.status === "approved");
    const waiting2 =
      reviews2.some((row) => row.status === "submitted") ||
      submissions2.some((row) => row.status === "pending_review");
    const requested2 = input.requests.some((row) => row.target_level === 2);
    const started2 =
      reviews2.length > 0 || submissions2.some((row) => row.status === "draft" || row.status === "returned");
    if (!approved2 && !waiting2 && (requested2 || started2)) {
      const partner = scope === "partner_contract";
      items.push({
        level: 2,
        title: partner ? "Nhà máy đối tác" : "Xác thực nhà máy",
        detail: partner
          ? "Cần hợp đồng với nhà máy đối tác để Vexim đối chiếu; ảnh là tùy chọn."
          : "Cần đủ 9 ảnh nhà máy theo danh mục chung, gồm tờ mã xác minh trong ba ảnh 🔖.",
        href: "/supplier/portal/verification/factory",
        cta: partner ? "Tải hợp đồng đối tác" : "Tải ảnh nhà máy",
      });
    }
  }

  const reviews3 = input.reviews.filter((row) => row.target_level === 3);
  const submissions3 = input.submissions.filter((row) => row.target_level === 3);
  const approved3 = reviews3.some((row) => row.status === "approved");
  const waiting3 =
    reviews3.some((row) => row.status === "submitted") ||
    submissions3.some((row) => row.status === "pending_review");
  const requested3 = input.requests.some((row) => row.target_level === 3);
  const started3 =
    reviews3.length > 0 || submissions3.some((row) => row.status === "draft" || row.status === "returned");
  if (!approved3 && !waiting3 && (requested3 || started3)) {
    items.push({
      level: 3,
      title: "Lịch sử giao hàng",
      detail: "Cần ít nhất một chứng từ xuất khẩu phù hợp (ảnh hoặc PDF).",
      href: "/supplier/portal/verification/export",
      cta: "Tải chứng từ xuất khẩu",
    });
  }

  return items;
}

/** Nội dung thư — tách riêng để kiểm thử offline không cần gửi thật. */
export function buildSupplierReminderEmail(input: {
  supplier: Pick<Supplier, "name" | "contact_name" | "email">;
  items: readonly ReminderItem[];
  origin: string;
}): { subject: string; html: string; text: string } {
  const company = input.supplier.name?.trim() || "doanh nghiệp của bạn";
  const greeting = input.supplier.contact_name?.trim() ? `Xin chào ${escapeHtml(input.supplier.contact_name.trim())},` : "Xin chào,";
  const subject = `Nhắc hoàn thiện hồ sơ xác minh: ${input.items.map((item) => item.title).join(", ")}`;
  const rows = input.items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.detail)}<br/><a href="${escapeHtml(input.origin + item.href)}">${escapeHtml(item.cta)} →</a></li>`,
    )
    .join("");
  const body = `<p>${greeting}</p>
    <p>Hồ sơ xác minh của <strong>${escapeHtml(company)}</strong> trên Vexim Trade còn ${input.items.length} bước cần bạn bổ sung. Đây là thư nhắc việc dịch vụ cho tài khoản nhà cung cấp, không phải thư quảng cáo.</p>
    <ul>${rows}</ul>
    <p>Tải tệp lên không tự động cấp huy hiệu.</p>
    <p>Nhân viên Vexim phải mở bằng chứng và duyệt từng bước; huy hiệu chỉ hiện sau bước duyệt đó.</p>
    <p>Nếu bạn đã cập nhật hồ sơ hoặc không muốn nhận thư nhắc, hãy trả lời thư này.</p>
    <p><a href="${escapeHtml(`${input.origin}/supplier/portal`)}">Mở cổng nhà cung cấp →</a></p>`;
  const text = [
    greeting,
    "",
    `Hồ sơ xác minh của ${company} trên Vexim Trade còn ${input.items.length} bước cần bạn bổ sung. Đây là thư nhắc việc dịch vụ cho tài khoản nhà cung cấp, không phải thư quảng cáo.`,
    "",
    ...input.items.map((item) => `- ${item.title}: ${item.detail} ${input.origin}${item.href}`),
    "",
    "Tải tệp lên không tự động cấp huy hiệu: nhân viên Vexim phải mở bằng chứng và duyệt từng bước.",
    "Nếu bạn đã cập nhật hồ sơ hoặc không muốn nhận thư nhắc, hãy trả lời thư này.",
    "",
    `${input.origin}/supplier/portal`,
  ].join("\n");
  return { subject, html: wrapPlainEmail({ title: subject, body }), text };
}

function daysBetween(later: Date, earlierIso: string): number {
  const earlier = new Date(earlierIso).getTime();
  if (Number.isNaN(earlier)) return Number.POSITIVE_INFINITY;
  return (later.getTime() - earlier) / 86_400_000;
}

function isDelivered(status: EmailMessage["status"]): boolean {
  return status === "sent" || status === "simulated";
}

/**
 * Chạy một lượt nhắc việc. Gọi từ `/api/cron/supplier-reminders` (và gộp trong
 * `/api/cron/rfq-sla`). Chạy lại bao nhiêu lần cũng được: mỗi nhà cung cấp chỉ nhận
 * thêm thư sau khi hết thời gian chờ 14 ngày tính từ lần gửi thành công gần nhất.
 */
export async function sendSupplierProgressReminders(opts: {
  store?: DataStore;
  send?: typeof transport;
  now?: Date;
  origin?: string;
} = {}): Promise<ReminderReport> {
  const store = opts.store ?? getStore();
  const send = opts.send ?? transport;
  const now = opts.now ?? new Date();
  const origin = opts.origin ?? notificationOrigin();

  const report: ReminderReport = { checked: 0, sent: 0, skipped: 0, failed: 0, details: [], error: null };

  let suppliers: Supplier[];
  let users: Awaited<ReturnType<DataStore["listUsers"]>>;
  let reviews: Verification[];
  let submissions: SupplierSubmission[];
  let requests: SupplierVerificationRequest[];
  let reminders: EmailMessage[];
  try {
    [suppliers, users, reviews, submissions, requests, reminders] = await Promise.all([
      store.listSuppliers(),
      store.listUsers(),
      store.listVerifications(),
      store.listSubmissions(),
      // Yêu cầu kiểm định chỉ làm tăng số việc cần nhắc; đọc lỗi thì bỏ qua, không nhắc sai.
      store.listSupplierVerificationRequests().catch(() => [] as SupplierVerificationRequest[]),
      store.listMessagesOfKind(SUPPLIER_REMINDER_KIND).catch(() => [] as EmailMessage[]),
    ]);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    console.error("[supplier-reminder] không đọc được dữ liệu nguồn:", report.error);
    return report;
  }

  const emailsBySupplier = new Map<string, string[]>();
  for (const user of users) {
    if (!user.is_active || user.role !== "supplier" || !user.supplier_id) continue;
    const email = user.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    const list = emailsBySupplier.get(user.supplier_id) ?? [];
    if (!list.includes(email)) list.push(email);
    emailsBySupplier.set(user.supplier_id, list);
  }

  const group = <T extends { supplier_id: string }>(rows: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.supplier_id) ?? [];
      list.push(row);
      map.set(row.supplier_id, list);
    }
    return map;
  };
  const reviewsBySupplier = group(reviews);
  const submissionsBySupplier = group(submissions);
  const requestsBySupplier = group(requests);

  const deliveredReminders = new Map<string, EmailMessage[]>();
  for (const message of reminders) {
    if (!message.supplier_id || !isDelivered(message.status)) continue;
    const list = deliveredReminders.get(message.supplier_id) ?? [];
    list.push(message);
    deliveredReminders.set(message.supplier_id, list);
  }

  for (const supplier of [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
    if (!portalApproved(supplier)) continue;

    const items = outstandingVerificationItems({
      supplier,
      reviews: reviewsBySupplier.get(supplier.id) ?? [],
      submissions: submissionsBySupplier.get(supplier.id) ?? [],
      requests: requestsBySupplier.get(supplier.id) ?? [],
    });
    if (!items.length) continue;
    report.checked += 1;
    const itemTitles = items.map((item) => item.title);

    const previous = deliveredReminders.get(supplier.id) ?? [];
    const lastSent = previous
      .map((message) => message.sent_at ?? message.created_at)
      .sort()
      .pop();
    if (lastSent && daysBetween(now, lastSent) < REMINDER_COOLDOWN_DAYS) {
      report.skipped += 1;
      report.details.push({ supplierId: supplier.id, status: "cooldown", items: itemTitles });
      continue;
    }
    if (previous.length >= REMINDER_LIFETIME_CAP) {
      report.skipped += 1;
      report.details.push({ supplierId: supplier.id, status: "capped", items: itemTitles });
      continue;
    }
    const recipients = emailsBySupplier.get(supplier.id) ?? [];
    if (!recipients.length) {
      report.skipped += 1;
      report.details.push({ supplierId: supplier.id, status: "no_recipient", items: itemTitles });
      continue;
    }
    // Đếm cả lần gửi lỗi: giới hạn là số lần thử trong một lượt cron, không phải số thư thành công.
    if (report.sent + report.failed >= REMINDER_MAX_PER_RUN) break;

    const email = buildSupplierReminderEmail({ supplier, items, origin });
    let status: ReminderStatus = "failed";
    let provider: EmailMessage["provider"] = "local";
    let error: string | null = null;
    try {
      const result = await send({ to: recipients, subject: email.subject, html: email.html, text: email.text });
      provider = result.provider;
      error = result.error;
      if (result.ok && (result.status === "sent" || result.status === "simulated")) {
        status = result.status;
        report.sent += 1;
      } else {
        report.failed += 1;
        error = result.error ?? "Chưa được Resend nhận.";
      }
    } catch (err) {
      report.failed += 1;
      error = err instanceof Error ? err.message : String(err);
    }

    try {
      await store.addMessage({
        buyer_id: null,
        supplier_id: supplier.id,
        prospect_id: null,
        rfq_id: null,
        rfq_match_id: null,
        kind: SUPPLIER_REMINDER_KIND,
        stage: null,
        direction: "supplier",
        thread_id: `supplier-reminder-${supplier.id}`,
        subject: email.subject,
        to_emails: recipients,
        cc_emails: [],
        bcc_emails: [],
        body_html: email.html,
        body_text: email.text,
        attachments: [],
        rfc_message_id: null,
        read_at: null,
        status: status === "sent" || status === "simulated" ? status : "failed",
        provider,
        error,
        created_by: null,
        sent_at: status === "sent" || status === "simulated" ? now.toISOString() : null,
      } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
    } catch (err) {
      // Không ghi được nhật ký thì thư vẫn đã đi; lần sau có thể nhắc lại (chấp nhận được
      // hơn là làm hỏng cả lượt cron).
      console.error("[supplier-reminder] không ghi được email_messages", supplier.id, err);
    }

    report.details.push({
      supplierId: supplier.id,
      status,
      items: itemTitles,
    });
  }

  return report;
}
