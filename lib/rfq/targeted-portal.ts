import { buildRfqSupplierEmail } from "./outreach";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS } from "@/lib/config";
import type { DataStore } from "@/lib/db/types";
import { canInviteSupplier } from "@/lib/supplier-portal/onboarding";
import { SITE_URL } from "@/lib/site";
import type { EmailMessage, Rfq } from "@/lib/types";
import { rfqBuyerContact } from "./buyer-contact";
import { rfqChannel } from "./channel";

/** Email log stage of the invitation notice for one match. */
export const directInviteStage = (matchId: string) => `direct_invite:${matchId}`;

/** Direct RFQs are delivered inside each named supplier's portal without staff review.
 * Email is a link-only optional notice after the match is persisted, never a fallback.
 * This also supports a buyer naming several suppliers: each gets its own match/thread.
 */
export async function releaseTargetedQuoteToPortal(store: DataStore, rfq: Rfq): Promise<number> {
  if (!["new", "matching", "quoted"].includes(rfq.status) || rfqChannel(rfq) !== "direct") return 0;
  const supplierIds = [...new Set(rfq.preferred_supplier_ids ?? [])];
  if (!supplierIds.length) return 0;
  // Fail closed before releasing any match if a supplier loses portal access.
  const suppliers = await Promise.all(supplierIds.map((id) => store.getSupplier(id)));
  if (suppliers.some((s) => !s) || !(await Promise.all(suppliers.map((s) => canInviteSupplier(s!, store)))).every(Boolean) ||
      supplierIds.some((id) => !rfqBuyerContact(rfq, id))) return 0;
  // Missing portal migration must not create a sent invitation.
  await Promise.all(supplierIds.map(async (id) => {
    await store.listSupplierRfqInvitations(id);
    await store.listSupplierNoticeReads(id);
  }));
  const matches = await store.listRfqMatches(rfq.id);
  const now = new Date();
  const deadline = new Date(now.getTime() + 3 * 86400_000);
  let sent = 0;
  for (const [index, supplier] of suppliers.entries()) {
    if (!supplier) continue;
    const match = matches.find((m) => m.supplier_id === supplier.id);
    if (!match || match.status !== "proposed" || match.sent_to_supplier_at) continue;
    await store.updateRfqMatch(match.id, { status: "sent_to_supplier", sent_to_supplier_at: now.toISOString(),
      response_due_at: deadline.toISOString() });
    sent++;
    // The only notification target is the active portal account, not an arbitrary
    // email on a legacy supplier record. Delivery errors cannot revoke the invite.
    const account = await store.getUserBySupplierId(supplierIds[index]);
    if (!account?.is_active || account.role !== "supplier" || account.supplier_id !== supplier.id) continue;
    try {
      const email = buildRfqSupplierEmail({ rfq, supplier, deadline,
        portalUrl: `${SITE_URL}/supplier/portal/rfqs/${encodeURIComponent(match.id)}` });
      const result = await transport({ to: [account.email], from: FROM_ADDRESS, subject: email.subject,
        html: email.html, text: email.text }).catch((error) => {
        console.error("[rfq] direct portal invitation saved; notification failed", error);
        return null;
      });
      // Log the outcome: the follow-up sweep resends an invitation whose notice failed.
      await store.addMessage({
        buyer_id: null, supplier_id: supplier.id, rfq_id: rfq.id, rfq_match_id: match.id,
        kind: "rfq_outreach", stage: directInviteStage(match.id), direction: "supplier",
        thread_id: `rfq-${rfq.id}-match-${match.id}`, subject: email.subject, to_emails: [account.email],
        cc_emails: [], bcc_emails: [], body_html: email.html, body_text: email.text, attachments: [],
        rfc_message_id: null, read_at: null, status: result?.status ?? "failed",
        provider: result?.provider ?? "resend", error: result?.error ?? (result ? null : "Lỗi khi gọi dịch vụ gửi email"),
        created_by: null, sent_at: result?.ok ? new Date().toISOString() : null,
      } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
    } catch (error) { console.error("[rfq] direct portal invitation saved; notification not logged", error); }
  }
  if (sent > 0 && rfq.status === "new") await store.updateRfq(rfq.id, { status: "matching" });
  return sent;
}
