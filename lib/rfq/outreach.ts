/** Staff invites suppliers for sourcing in the portal. Email is link-only notification. */
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { canInviteSupplier } from "@/lib/supplier-portal/onboarding";
import type { Rfq, RfqMatch, Supplier } from "@/lib/types";
import { sourcingInviteConsent } from "./buyer-contact";
import { rfqChannel } from "./channel";

/** No RFQ contents, buyer identity or Reply-To route ever leave in a notification. */
export function buildRfqSupplierEmail(input: { rfq: Rfq; supplier: Supplier; deadline: Date; portalUrl: string }) {
  const { rfq, portalUrl } = input;
  const subject = `[${rfq.code}] Có yêu cầu báo giá trong cổng nhà cung cấp`;
  const body = `<p>Một yêu cầu báo giá mới đã được lưu trong cổng nhà cung cấp Vexim Trade.</p>
    <p><a href="${escapeHtml(portalUrl)}">Đăng nhập để xem yêu cầu và gửi báo giá</a></p>
    <p>Chỉ báo giá và tin nhắn gửi trên cổng mới được ghi nhận. Email này chỉ để thông báo, không nhận báo giá hay trả lời.</p>`;
  return { subject, html: wrapPlainEmail({ title: escapeHtml(subject), body }),
    text: `${subject}\n${portalUrl}\nĐăng nhập để xem và gửi báo giá. Email này chỉ thông báo.` };
}

/** Commit the invitation before the optional email. Only published suppliers with
 * approved active accounts can be invited; direct RFQs never enter this staff path.
 */
export async function dispatchRfqToSuppliers(input: { rfqId: string; matchIds: string[];
  deadlineDays?: number; actorId: string }): Promise<{ sent: number; skipped: number }> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq || rfqChannel(rfq) !== "sourcing" || ["won", "lost", "spam"].includes(rfq.status)) {
    throw new Error("Chỉ Vexim mới mời nhà cung cấp cho RFQ tìm nguồn còn hiệu lực.");
  }
  const matches = await store.listRfqMatches(rfq.id);
  const chosen = new Set(input.matchIds);
  const pending = matches.filter((m) => chosen.has(m.id) && m.status === "proposed" && !m.sent_to_supplier_at);
  if (pending.some((m) => !sourcingInviteConsent(rfq, m.supplier_id))) {
    throw new Error("RFQ chưa có đồng ý riêng cho việc tìm nguồn; không được mời nhà cung cấp.");
  }
  const deadline = new Date(Date.now() + Math.max(1, Math.min(30, input.deadlineDays ?? 3)) * 86400_000);
  let sent = 0, skipped = 0;
  for (const id of chosen) {
    const match = matches.find((m) => m.id === id);
    if (!match || match.status !== "proposed" || match.sent_to_supplier_at) { skipped++; continue; }
    const supplier = await store.getSupplier(match.supplier_id);
    if (!supplier || !(await canInviteSupplier(supplier, store))) { skipped++; continue; }
    // Fail before marking sent if this supplier's portal migration is unavailable.
    await store.listSupplierRfqInvitations(supplier.id);
    await store.listSupplierNoticeReads(supplier.id);
    await store.updateRfqMatch(match.id, { status: "sent_to_supplier",
      sent_to_supplier_at: new Date().toISOString(), response_due_at: deadline.toISOString() });
    sent++;
    try {
      const user = await store.getUserBySupplierId(supplier.id);
      if (user?.is_active && user.supplier_id === supplier.id && user.role === "supplier") {
        const email = buildRfqSupplierEmail({ rfq, supplier, deadline,
          portalUrl: `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(match.id)}` });
        await transport({ to: [user.email], from: FROM_ADDRESS, ...email });
      }
    } catch (error) { console.error("[rfq] supplier invitation saved; notification failed", error); }
  }
  if (sent && !["matching", "quoted", "sampling"].includes(rfq.status)) await store.updateRfq(rfq.id, { status: "matching" });
  return { sent, skipped };
}

/** Selection is an audited sourcing business event, not consent to reveal buyer contact. */
export async function recordSupplierSelection(rfq: Rfq, match: RfqMatch): Promise<void> {
  if (rfqChannel(rfq) !== "sourcing" || match.rfq_id !== rfq.id || !match.sent_to_buyer_at ||
      !["presented_to_buyer", "selected"].includes(match.status)) {
    throw new Error("Chỉ chọn nhà cung cấp có báo giá tìm nguồn đã công bố trong tài khoản người mua.");
  }
  const store = getStore();
  if (!(await store.listRfqQuoteVersions([match.id])).some((v) => v.match_id === match.id)) {
    throw new Error("Chỉ chọn nhà cung cấp có phiên bản báo giá đã công bố trong tài khoản người mua.");
  }
  await store.updateRfqMatch(match.id, { status: "selected" });
  const others = (await store.listRfqMatches(rfq.id)).filter((m) => m.id !== match.id);
  for (const m of others) if (m.status !== "selected" && m.status !== "declined") {
    await store.updateRfqMatch(m.id, { status: "not_selected" });
  }
  const existing = await store.findIntroduction(rfq.buyer_id, match.supplier_id);
  if (!existing) {
    const now = new Date();
    const until = new Date(now); until.setFullYear(until.getFullYear() + 1);
    await store.createIntroduction({ buyer_id: rfq.buyer_id, supplier_id: match.supplier_id,
      first_rfq_id: rfq.id, introduced_at: now.toISOString(), protected_until: until.toISOString() });
  }
}

export async function selectSupplier(input: { rfqId: string; matchId: string; actorId: string }): Promise<{ selected: boolean; email: "sent" | "failed" | "skipped" }> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq || rfqChannel(rfq) !== "sourcing") throw new Error("Chỉ Vexim chọn nhà cung cấp cho RFQ tìm nguồn.");
  const match = await store.getRfqMatch(input.matchId);
  if (!match || match.rfq_id !== rfq.id) return { selected: false, email: "skipped" };
  if (rfq.status === "lost" || rfq.status === "spam") throw new Error("RFQ đã đóng; không thể chốt nhà cung cấp.");
  if (!match.sent_to_buyer_at || !["presented_to_buyer", "selected"].includes(match.status)) {
    throw new Error("Chỉ chốt nhà cung cấp có báo giá đã công bố trong tài khoản người mua.");
  }
  const newlySelected = match.status !== "selected";
  await recordSupplierSelection(rfq, match);
  await store.updateRfq(rfq.id, { status: "won" });
  const email = newlySelected ? await notifySelectedSupplier(rfq, match, input.actorId) : "skipped";
  return { selected: true, email };
}

/** Optional link-only milestone notice; a missing email cannot undo the portal selection. */
export async function notifySelectedSupplier(rfq: Rfq, match: RfqMatch, _actorId: string): Promise<"sent" | "failed" | "skipped"> {
  if (rfqChannel(rfq) !== "sourcing" || !match.sent_to_supplier_at ||
      !sourcingInviteConsent(rfq, match.supplier_id)) return "skipped";
  try {
    const store = getStore();
    const supplier = await store.getSupplier(match.supplier_id);
    if (!supplier || !(await canInviteSupplier(supplier, store))) return "skipped";
    const user = await store.getUserBySupplierId(supplier.id);
    if (!user?.is_active || user.role !== "supplier" || user.supplier_id !== supplier.id) return "skipped";
    const subject = `[${rfq.code}] Trạng thái báo giá đã cập nhật`;
    const link = `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(match.id)}`;
    const html = wrapPlainEmail({ title: escapeHtml(subject), body:
      `<p>Trạng thái báo giá của bạn đã cập nhật trong cổng nhà cung cấp.</p><p><a href="${escapeHtml(link)}">Đăng nhập để xem</a></p><p>Email chỉ để thông báo.</p>` });
    const result = await transport({ to: [user.email], from: FROM_ADDRESS, subject, html, text: `${subject}\n${link}` });
    return result.ok && result.status === "sent" ? "sent" : "failed";
  } catch (error) { console.error("[rfq] supplier selection notice failed; portal status saved", error); return "failed"; }
}
