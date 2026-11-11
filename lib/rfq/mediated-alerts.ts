import "server-only";

import { FROM_ADDRESS, MAIL_DOMAIN } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import type { RfqMediatedAlert } from "@/lib/types";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { canReadMediatedDesk } from "./mediated";
import { rfqEventAfter } from "./portal-core";

/** Portal is the source of truth. Ten-minute, link-only mail is just a reminder.
 * CAS claims and backoff make retries safe; a read event skips the pending alert.
 */
export async function runRfqMediatedAlerts(store: DataStore, options: { threadIds?: string[]; nowMs?: number } = {}) {
  const now = new Date(options.nowMs ?? Date.now()).toISOString();
  const due = await store.listDueRfqMediatedAlerts(now, 50, options.threadIds);
  const claimed: RfqMediatedAlert[] = [];
  for (const item of due) if (await store.claimRfqMediatedAlert(item, now)) claimed.push(item);
  const groups = new Map<string, RfqMediatedAlert[]>();
  for (const item of claimed) {
    const key = `${item.thread_id}:${item.recipient}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  let sent = 0, skipped = 0, failed = 0;
  const finish = async (rows: RfqMediatedAlert[], status: "sent" | "skipped" | "failed", error: string | null = null) => {
    for (const row of rows) {
      const backoff = Math.min(24 * 60, 5 * 2 ** Math.min(row.attempts + 1, 8));
      await store.finishRfqMediatedAlert(row.id, now, { status, last_error: error?.slice(0, 500) ?? null,
        sent_at: status === "sent" ? now : null,
        not_before: status === "failed" ? new Date(Date.parse(now) + backoff * 60_000).toISOString() : row.not_before });
    }
    if (status === "sent") sent++; else if (status === "skipped") skipped++; else failed++;
  };
  for (const rows of groups.values()) {
    try {
      const alert = rows[0];
      // Derive the audience from the thread, never from an untrusted email address.
      // A missing/withdrawn account means no email, not a leaked conversation.
      const threadMatch = await store.getRfqMatch(alert.thread_id);
      const threads = await store.listRfqMediatedThreads([threadMatch?.rfq_id ?? alert.thread_id]);
      const thread = threads.find((t) => t.id === alert.thread_id);
      const rfq = thread && await store.getRfq(thread.rfq_id);
      const supplierDesk = thread?.audience === "supplier";
      const match = supplierDesk && threadMatch?.id === thread.match_id ? threadMatch : null;
      // Recheck the desk scope and RFQ grant at delivery time. A withdrawn
      // invitation, changed channel or mismatched thread must not trigger mail.
      if (!thread || !rfq || rfq.status === "spam" ||
          (supplierDesk ? !match || !canReadMediatedDesk(rfq, match)
            : thread.audience !== "buyer" || thread.match_id !== null || thread.id !== rfq.id ||
              !canReadMediatedDesk(rfq, null))) {
        await finish(rows, "skipped"); continue;
      }
      const readAt = alert.recipient === "party" ? thread.party_last_read_at : thread.staff_last_read_at;
      const unread = rows.filter((r) => !readAt || rfqEventAfter(r.event_at, readAt));
      const read = rows.filter((r) => !unread.includes(r));
      if (read.length) await finish(read, "skipped");
      if (!unread.length) continue;
      let to: string | null;
      if (alert.recipient === "staff") to = process.env.RFQ_INTERNAL_EMAIL?.trim() || `hello@${MAIL_DOMAIN}`;
      else if (thread.audience === "buyer") {
        const buyer = await store.getBuyer(rfq.buyer_id);
        to = buyer?.email?.trim() || null;
      } else {
        const [user, supplier] = match ? await Promise.all([
          store.getUserBySupplierId(match.supplier_id), store.getSupplier(match.supplier_id),
        ]) : [null, null];
        to = supplier && portalApproved(supplier) && user?.role === "supplier" && user.is_active &&
          user.supplier_id === match?.supplier_id ? user.email.trim() : null;
      }
      if (!to) { await finish(unread, "skipped"); continue; }
      const link = alert.recipient === "staff" ? `${SITE_URL}/crm/rfqs/${encodeURIComponent(rfq.id)}#vexim-conversations`
        : thread.audience === "buyer" ? `${SITE_URL}/buyer/account/requests/${encodeURIComponent(rfq.id)}#vexim-conversation`
          : `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(thread.match_id!)}#vexim-conversation`;
      const subject = alert.recipient === "staff" ? `[${rfq.code}] Có tin nhắn trong RFQ tìm nguồn`
        : thread.audience === "buyer" ? `New message about your request (Ref ${rfq.code})`
          : `[${rfq.code}] Có tin nhắn mới về báo giá`;
      const html = wrapPlainEmail({ title: escapeHtml(subject), body:
        `<p>${alert.recipient === "staff" ? "Có trao đổi mới trong yêu cầu tìm nguồn." : "Có cập nhật mới trong trao đổi tìm nguồn trên Vexim Trade."}</p>
         <p><a href="${escapeHtml(link)}">${alert.recipient === "staff" ? "Mở yêu cầu trong CRM" : "Đăng nhập để xem và trả lời trong tài khoản"}</a></p>
         <p>Email này chỉ thông báo. Nội dung và câu trả lời chỉ được lưu trong hệ thống.</p>` });
      const delivery = await transport({ to: [to], from: FROM_ADDRESS, subject, html,
        text: `${subject}\n${link}\nĐăng nhập để xem và trả lời trong hệ thống. Email này chỉ thông báo.` });
      if (delivery.ok && delivery.status === "sent") await finish(unread, "sent");
      else await finish(unread, "failed", delivery.error ?? "Email chưa gửi thật");
    } catch (error) {
      console.error("[rfq-mediated] notification failed; messages remain available", error);
      await finish(rows, "failed", error instanceof Error ? error.message : String(error));
    }
  }
  return { claimed: claimed.length, sent, skipped, failed };
}
