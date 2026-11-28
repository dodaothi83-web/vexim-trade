import "server-only";

import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { presenceKey, readPresence } from "@/lib/chat/presence";
import { unansweredNeedsStaff } from "@/lib/chat/core";
import { supportHasUnread } from "@/lib/chat/support-core";
import { SERVICE_FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { wrapPlainEmail } from "@/lib/email/templates";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { rfqChannel, UNCLAIMED_RFQ_STATUSES } from "@/lib/rfq/channel";
import { daysSinceSeen } from "@/lib/supplier-portal/inactivity-core";
import { notificationOrigin } from "@/lib/supplier-portal/notify";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import type { AppUser, Supplier } from "@/lib/types";

import {
  buildDigestEmail, digestHasContent, digestKey, digestWindowOpen, vnDate, vnYesterdayRange,
  type DigestContent, type DigestLine, type DigestStat,
} from "./staff-digest-core";

const DAY = 86_400_000;
/** Nhà cung cấp chừng này ngày không vào cổng thì đưa vào mục "Cần để ý". */
const INACTIVE_WATCH_DAYS = 7;
/** Giá hết hiệu lực trong chừng này ngày (hoặc đã hết) thì nhắc. */
const PRICE_WATCH_DAYS = 7;

type Safe = <T>(label: string, fallback: T, run: () => Promise<T>) => Promise<T>;
const safe: Safe = async (label, fallback, run) => {
  try { return await run(); } catch (error) { console.error(`[staff-digest] ${label}`, error); return fallback; }
};

/** Dữ liệu dùng chung cho mọi người nhận trong một lượt, đọc một lần. */
interface Shared {
  suppliers: Supplier[];
  presence: Record<string, string>;
}

async function supplierWatch(store: DataStore, shared: Shared, scope: Supplier[], now: number): Promise<DigestLine[]> {
  const lines: DigestLine[] = [];
  const active = scope.filter((s) => portalApproved(s) && !isSyntheticSupplier(s));
  const inactive = active
    .map((s) => ({ s, days: daysSinceSeen(shared.presence[presenceKey.supplier(s.id)], now) }))
    .filter((x) => x.days === null || x.days >= INACTIVE_WATCH_DAYS)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  if (inactive.length) {
    const names = inactive.slice(0, 3).map((x) => `${x.s.display_name || x.s.name} (${x.days === null ? "chưa vào lần nào" : `${x.days} ngày`})`);
    lines.push({ label: `Nhà cung cấp từ ${INACTIVE_WATCH_DAYS} ngày không vào cổng`, count: inactive.length, href: "/crm/suppliers",
      detail: names.join(", ") + (inactive.length > 3 ? ` và ${inactive.length - 3} nhà cung cấp khác` : "") });
  }
  const ids = new Set(active.map((s) => s.id));
  const products = await safe("products", [], () => store.listProducts());
  const limit = now + PRICE_WATCH_DAYS * DAY;
  const expiring = products.filter((p) => ids.has(p.supplier_id) && (p.supplier_review_status ?? "approved") === "approved" &&
    p.price_valid_until && Date.parse(p.price_valid_until) <= limit);
  if (expiring.length) {
    const expired = expiring.filter((p) => Date.parse(p.price_valid_until!) < now).length;
    lines.push({ label: "Sản phẩm có giá sắp hết hoặc đã hết hiệu lực", count: expiring.length, href: "/crm/products",
      detail: expired ? `${expired} sản phẩm đã quá hạn giá` : `hết hạn trong ${PRICE_WATCH_DAYS} ngày tới` });
  }
  return lines;
}

/** Bản admin: toàn bộ hàng chờ, cùng nguồn số với huy hiệu ở menu CRM. */
async function adminContent(store: DataStore, shared: Shared, now: number): Promise<Omit<DigestContent, "recipientName" | "origin">> {
  const count = (label: string, run: () => Promise<number>) => safe(label, 0, run);
  const [suppliers, products, reviews, submissions, certificates] = await Promise.all([
    count("suppliers pending", () => store.countSupplierAccountsPending(null)),
    count("products pending", () => store.countProductsPendingReview(null)),
    count("reviews pending", () => store.countReviewsAwaitingApproval(null)),
    count("submissions pending", () => store.countSubmissionsPendingReview(null)),
    count("certificates pending", () => store.countCertificatesPendingReview(null)),
  ]);
  const routing = await safe("rfq routing", [], () => store.listPendingRfqRouting());
  const sourcingRfqs = routing.filter((r) => rfqChannel(r) === "sourcing" && UNCLAIMED_RFQ_STATUSES.includes(r.status)).length;
  const sourcingRequests = await safe("sourcing requests", 0, async () => {
    const { sourcingStore } = await import("@/lib/sourcing/store");
    return sourcingStore().countNewSourcingRequests();
  });
  const support = await safe("support chats", 0, async () =>
    (await store.listSupportConversations({ limit: 500 })).filter((c) => supportHasUnread(c, "staff")).length);
  const unanswered = await safe("unanswered chats", 0, async () =>
    (await store.listChatConversations({ limit: 500 })).filter(unansweredNeedsStaff).length);
  const services = await safe("service requests", [], () => store.listSupplierServiceRequests({ status: "submitted", limit: 500 }));
  const upgrades = services.filter((r) => r.service_key === "plan_upgrade").length;

  const todo: DigestLine[] = [
    { label: "Nhà cung cấp chờ xác nhận quyền cổng", count: suppliers, href: "/crm/suppliers" },
    { label: "Sản phẩm chờ kiểm nội dung", count: products, href: "/crm/products?view=pending" },
    { label: "Đợt kiểm chờ duyệt", count: reviews, href: "/crm/verifications" },
    { label: "Hồ sơ xác minh nhà cung cấp tự gửi", count: submissions, href: "/crm/verifications/submissions" },
    { label: "Giấy chứng nhận chờ duyệt", count: certificates, href: "/crm/certificates" },
    { label: "Yêu cầu tìm nguồn chờ tiếp nhận", count: sourcingRfqs + sourcingRequests, href: "/crm/sourcing" },
    { label: "Người mua đang chờ trả lời chat", count: support, href: "/crm/support" },
    { label: "Người mua chờ nhà cung cấp trả lời quá 48 giờ", count: unanswered, href: "/crm/tasks" },
    { label: "Nhà cung cấp xin nâng gói", count: upgrades, href: "/crm/suppliers?plan=upgrade" },
    { label: "Yêu cầu dịch vụ mới", count: services.length - upgrades, href: "/crm/service-requests" },
  ];

  const watch = await supplierWatch(store, shared, shared.suppliers, now);
  const failed = await safe("failed emails", 0, async () =>
    (await store.listMessages(500)).filter((m) => m.status === "failed" && Date.parse(m.created_at) >= now - DAY).length);
  if (failed) watch.push({ label: "Email gửi lỗi trong 24 giờ qua", count: failed, href: "/crm/mail" });

  const y = vnYesterdayRange(now);
  const inY = (iso: string | null | undefined) => !!iso && iso >= y.from && iso < y.to;
  const views = await safe<number | null>("site traffic", null, async () => {
    const { readSiteTraffic } = await import("@/lib/traffic/site");
    const rows = await readSiteTraffic(7);
    return rows ? rows.filter((r) => r.day === y.day).reduce((sum, r) => sum + (Number(r.views) || 0), 0) : null;
  });
  const rfqs = await safe<number | null>("rfqs", null, async () => (await store.listRfqs()).filter((r) => inY(r.created_at)).length);
  const chats = await safe<number | null>("chats", null, async () =>
    (await store.listChatConversations({ limit: 500 })).filter((c) => inY(c.last_message_at)).length);
  const supplierMails = await safe<number | null>("supplier reminders", null, async () =>
    (await store.listMessagesOfKind("supplier_reminder")).filter((m) => (m.status === "sent" || m.status === "simulated") && inY(m.sent_at ?? m.created_at)).length);
  const yesterday: DigestStat[] = [
    { label: "Lượt xem trang công khai", value: views },
    { label: "Nhà cung cấp mới đăng ký", value: shared.suppliers.filter((s) => inY(s.created_at)).length },
    { label: "RFQ mới", value: rfqs },
    { label: "Cuộc chat có tin mới", value: chats },
    { label: "Email tự động đã gửi cho nhà cung cấp", value: supplierMails },
  ];
  return { scope: "admin", todo, watch, yesterday };
}

/** Bản kinh doanh: chỉ nhà cung cấp và người mua người này phụ trách. */
async function saleContent(store: DataStore, shared: Shared, user: AppUser, now: number): Promise<Omit<DigestContent, "recipientName" | "origin"> | null> {
  const mine = shared.suppliers.filter((s) => s.owner_user_id === user.id);
  const scope = ownerScopeOf({ role: user.role, name: user.name });
  const buyers = (await safe("buyers", [], () => store.listBuyers())).filter((b) => isOwnedBy(b.owner, scope));
  if (!mine.length && !buyers.length) return null; // chưa được giao ai: không gửi
  const ids = mine.map((s) => s.id);
  const count = (label: string, run: () => Promise<number>) => safe(label, 0, run);
  const [suppliers, products] = ids.length ? await Promise.all([
    count("suppliers pending", () => store.countSupplierAccountsPending(ids)),
    count("products pending", () => store.countProductsPendingReview(ids)),
  ]) : [0, 0];
  const unanswered = ids.length ? await safe("unanswered chats", 0, async () =>
    (await store.listChatConversations({ limit: 500 })).filter((c) => ids.includes(c.supplier_id) && unansweredNeedsStaff(c)).length) : 0;
  const today = vnDate(now);
  const due = buyers.filter((b) => b.next_action_date && b.next_action_date.slice(0, 10) <= today && !["completed", "lost"].includes(b.stage)).length;
  const leads = buyers.filter((b) => (b.stage ?? "lead") === "lead").length;
  const todo: DigestLine[] = [
    { label: "Việc hẹn với người mua đến hạn", count: due, href: "/crm/pipeline" },
    { label: "Người mua mới chưa xử lý", count: leads, href: "/crm/buyers" },
    { label: "Người mua chờ nhà cung cấp của bạn trả lời quá 48 giờ", count: unanswered, href: "/crm/tasks" },
    { label: "Nhà cung cấp của bạn chờ xác nhận quyền cổng", count: suppliers, href: "/crm/suppliers" },
    { label: "Sản phẩm của bạn chờ kiểm nội dung", count: products, href: "/crm/products?view=pending" },
  ];
  const watch = await supplierWatch(store, shared, mine, now);
  return { scope: "sale", todo, watch, yesterday: [] };
}

export interface StaffDigestReport { sent: number; skipped: number; failed: number; error: string | null }

/**
 * Một lượt gửi. Gọi từ cron hằng ngày (`/api/cron/rfq-sla`); chạy mỗi giờ cũng chỉ gửi một thư
 * mỗi người mỗi ngày nhờ khoá trong audit_log. Ngoài khung giờ thì không làm gì.
 */
export async function runStaffDigest(opts: { store?: DataStore; send?: typeof transport; now?: Date; origin?: string } = {}): Promise<StaffDigestReport> {
  const store = opts.store ?? getStore();
  const send = opts.send ?? transport;
  const now = (opts.now ?? new Date()).getTime();
  const origin = opts.origin ?? notificationOrigin();
  const report: StaffDigestReport = { sent: 0, skipped: 0, failed: 0, error: null };
  if (!digestWindowOpen(now)) return report;

  let users: AppUser[];
  let sentKeys: Set<string>;
  let suppliers: Supplier[];
  try {
    const [u, sends, s] = await Promise.all([
      store.listUsers(), store.listStaffDigestSends(new Date(now - 3 * DAY).toISOString()), store.listSuppliers(),
    ]);
    users = u; suppliers = s;
    sentKeys = new Set(sends.map((row) => row.entity_id));
  } catch (err) {
    // Không đọc được dấu đã gửi thì không biết đã gửi chưa: bỏ cả lượt thay vì gửi trùng.
    report.error = err instanceof Error ? err.message : String(err);
    console.error("[staff-digest] cannot read source data:", report.error);
    return report;
  }
  const presence = await readPresence(store, suppliers.map((s) => presenceKey.supplier(s.id)));
  const shared: Shared = { suppliers, presence };

  const recipients = users.filter((u) => u.is_active && (u.role === "admin" || u.role === "sale") && u.email?.includes("@"));
  let adminCache: Awaited<ReturnType<typeof adminContent>> | null = null;
  for (const user of recipients) {
    const key = digestKey(user.id, now);
    if (sentKeys.has(key)) { report.skipped += 1; continue; }
    const body = user.role === "admin"
      ? (adminCache ??= await adminContent(store, shared, now))
      : await saleContent(store, shared, user, now);
    if (!body || !digestHasContent(body)) { report.skipped += 1; continue; }
    const mail = buildDigestEmail({ ...body, recipientName: user.name ?? null, origin });
    try {
      const result = await send({ to: [user.email.trim().toLowerCase()], from: SERVICE_FROM_ADDRESS, subject: mail.subject,
        html: wrapPlainEmail({ title: mail.subject, body: mail.html }), text: mail.text });
      if (!result.ok || (result.status !== "sent" && result.status !== "simulated")) { report.failed += 1; continue; }
    } catch (err) {
      console.error("[staff-digest] send failed", user.id, err);
      report.failed += 1;
      continue;
    }
    report.sent += 1;
    await store.addAuditLog({ entity: "staff_digest", entity_id: key, action: "staff_digest.sent", after: { role: user.role, subject: mail.subject } })
      .catch((err) => console.error("[staff-digest] cannot record send", user.id, err));
  }
  return report;
}
