import "server-only";

import { FROM_ADDRESS } from "@/lib/config";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import type { DataStore } from "@/lib/db/types";
import { SITE_URL } from "@/lib/site";
import { rfqChannel } from "./channel";
import { rfqEventAfter } from "./portal-core";
import type { RfqPortalAlert } from "@/lib/types";

/** Portal first, email second: the transactional outbox is independent of publication.
 * Messages wait 10 minutes so someone reading in-app does not receive a redundant mail.
 * A run groups all due events for one RFQ/recipient into a single link-only notice.
 */
export async function runRfqPortalAlerts(store: DataStore, options: { matchIds?: string[]; nowMs?: number } = {}) {
  const now = new Date(options.nowMs ?? Date.now()).toISOString();
  const due = await store.listDueRfqPortalAlerts(now, 50, options.matchIds);
  const claimed: RfqPortalAlert[] = [];
  for (const alert of due) {
    if (await store.claimRfqPortalAlert(alert, now)) claimed.push(alert);
  }
  const groups = new Map<string, RfqPortalAlert[]>();
  for (const alert of claimed) {
    const key = `${alert.match_id}:${alert.recipient}`;
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  let sent = 0, skipped = 0, failed = 0;
  const finish = async (rows: RfqPortalAlert[], status: "sent" | "skipped" | "failed", error: string | null = null) => {
    for (const row of rows) {
      const attempts = row.attempts + 1;
      const backoff = Math.min(24 * 60, 5 * 2 ** Math.min(attempts, 8));
      await store.finishRfqPortalAlert(row.id, now, {
        status, last_error: error?.slice(0, 500) ?? null,
        sent_at: status === "sent" ? now : null,
        not_before: status === "failed" ? new Date(Date.parse(now) + backoff * 60_000).toISOString() : row.not_before,
      });
    }
    if (status === "sent") sent++;
    else if (status === "skipped") skipped++;
    else failed++;
  };

  for (const rows of groups.values()) {
    try {
      const match = await store.getRfqMatch(rows[0].match_id);
      const rfq = match && await store.getRfq(match.rfq_id);
      if (!match || !rfq || ["lost", "spam"].includes(rfq.status)) { await finish(rows, "skipped"); continue; }
      // Existing direct-message alerts for old sourcing threads must not invite
      // either party back into a buyer/supplier conversation that is now archived.
      if (rfqChannel(rfq) === "sourcing") {
        const archived = rows.filter((r) => !!r.message_id);
        if (archived.length) await finish(archived, "skipped");
        rows.splice(0, rows.length, ...rows.filter((r) => !!r.version_id));
        if (!rows.length) continue;
      }
      const readAt = rows[0].recipient === "buyer" ? match.buyer_last_read_at : match.supplier_last_read_at;
      const unread = rows.filter((r) => !readAt || rfqEventAfter(r.event_at, readAt));
      const read = rows.filter((r) => !unread.includes(r));
      if (read.length) await finish(read, "skipped");
      if (!unread.length) continue;
      let to: string | null = null;
      if (rows[0].recipient === "buyer") {
        const buyer = await store.getBuyer(rfq.buyer_id);
        to = buyer?.email?.trim() || null;
      } else {
        const account = await store.getUserBySupplierId(match.supplier_id);
        to = account?.role === "supplier" && account.is_active ? account.email.trim() : null;
      }
      if (!to) { await finish(unread, "skipped"); continue; }
      const quote = unread.some((r) => !!r.version_id);
      const buyerSide = rows[0].recipient === "buyer";
      const link = buyerSide
        ? `${SITE_URL}/buyer/account/requests/${encodeURIComponent(rfq.id)}/offers/${encodeURIComponent(match.id)}`
        : `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(match.id)}`;
      const sourced = rfqChannel(rfq) === "sourcing";
      const subject = buyerSide
        ? `${sourced || quote ? "New quote" : "New message"} for your request (Ref ${rfq.code})`
        : `[${rfq.code}] ${quote ? "Báo giá đã được công bố" : "Có tin nhắn mới"}`;
      const body = buyerSide
        ? `<p>${sourced ? "A supplier quote is ready for you to review" : quote ? "A supplier has published a quote" : "A supplier replied to your request"} on Vexim Trade.</p>`
        : `<p>${quote ? "Báo giá đã được công bố" : "Có cập nhật mới"} trong yêu cầu của bạn trên Vexim Trade.</p>`;
      const html = wrapPlainEmail({ title: escapeHtml(subject), body: `${body}<p><a href="${escapeHtml(link)}">${buyerSide ? "View quote and conversation" : "Xem yêu cầu và trao đổi"}</a></p><p>${buyerSide ? "This email is a notification; the quote and conversation are saved in your account." : "Email chỉ để thông báo; báo giá và trao đổi được lưu trong tài khoản."}</p>` });
      const result = await transport({ to: [to], from: FROM_ADDRESS,
        subject, html, text: `${subject}\n${link}\n${buyerSide ? "Sign in to view your quote and conversation." : "Đăng nhập để xem báo giá và trao đổi."}`,
      });
      if (result.ok && result.status === "sent") await finish(unread, "sent");
      else await finish(unread, "failed", result.error ?? "Email chưa gửi thật");
    } catch (error) {
      console.error("[rfq-portal] email alert failed; portal update remains available", error);
      await finish(rows, "failed", error instanceof Error ? error.message : String(error));
    }
  }
  return { claimed: claimed.length, sent, skipped, failed };
}
