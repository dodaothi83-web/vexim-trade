import { getStore } from "@/lib/db";
import { buildSignature } from "@/lib/email/signature";
import { emailMode, FROM_ADDRESS } from "@/lib/config";
import { requireSession } from "@/lib/auth/session";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { MailboxHint } from "@/components/mailbox";
import { MailThreads, type QuickContact, type ThreadSummary } from "@/components/mail-threads";
import { MailLiveSync } from "@/components/mail-live-sync";
import { mailSyncVersion } from "@/lib/mail/sync-version";
import { isBuyerMailMessage } from "@/lib/mail/buyer-only";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hộp thư" };

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function MailPage() {
  const session = await requireSession();
  const canSend = hasPermission(session.role, "mail.send");
  const canManageProspects = hasPermission(session.role, "prospects.manage");

  const store = getStore();
  const [messages, buyers, suppliers, me, prospects] = await Promise.all([
    store.listMessages(500),
    store.listBuyers(),
    store.listSuppliers(),
    store.getUserByEmail(session.email),
    canManageProspects ? store.listProspects().catch(() => []) : Promise.resolve([]),
  ]);

  // Chữ ký cá nhân kiểu Gmail/Zoho (chữ ký tuỳ chỉnh hoặc chữ ký tự động) —
  // chèn sẵn vào khung trả lời nhanh và cửa sổ chuyển tiếp ngay trong Hộp thư
  const mySigHtml = me?.signature_html ?? null;
  const mySig = mySigHtml !== null ? mySigHtml : buildSignature(session.name, me?.phone);

  // Phạm vi: nhân viên kinh doanh chỉ thấy thư của buyer/prospect mình phụ trách và thư do chính mình gửi
  const scope = ownerScopeOf(session);
  const ownedBuyers = buyers.filter((b) => isOwnedBy(b.owner, scope));
  const ownedBuyerIds = new Set(ownedBuyers.map((b) => b.id));
  const visibleProspects = prospects.filter((p) => isOwnedBy(p.owner, scope));
  const ownedProspectIds = new Set(visibleProspects.map((p) => p.id));
  // Thư đến từ prospect được lưu với buyer_id = null, nên phải lọc theo prospect_id
  const visibleMessages =
    scope === null
      ? messages
      : messages.filter(
          (m) =>
            (m.buyer_id !== null && ownedBuyerIds.has(m.buyer_id)) ||
            (!!m.prospect_id && ownedProspectIds.has(m.prospect_id)) ||
            (m.created_by ?? "").toLowerCase() === session.email.toLowerCase(),
        );

  // Tạm thời chỉ hiển thị thư của buyer: loại thư NCC và thư prospect
  const buyerMessages = visibleMessages.filter(isBuyerMailMessage);

  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const prospectById = new Map(prospects.map((p) => [p.id, p]));

  // Nhóm theo mạch thư (thread_id): gồm cả thư gửi đi lẫn thư đến Resend Inbound
  const grouped = new Map<string, typeof messages>();
  for (const m of buyerMessages) {
    const key = m.thread_id || `msg:${m.id}`;
    const arr = grouped.get(key);
    if (arr) arr.push(m);
    else grouped.set(key, [m]);
  }

  const contacts: QuickContact[] = [
    ...ownedBuyers
      .filter((b) => b.email)
      .map((b) => ({ id: b.id, name: b.company, email: b.email as string, kind: "buyer" as const })),
  ];

  const threads: ThreadSummary[] = [...grouped.entries()]
    .map(([threadId, msgs]) => {
      const sorted = [...msgs].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const inbound = sorted.filter((m) => m.kind === "inbound");
      const direction = first.direction;
      // Người đối diện: thư đến => người gửi; thư đi => người nhận đầu tiên
      const counterpart =
        direction === "buyer"
          ? (inbound[inbound.length - 1]?.created_by ?? first.to_emails[0] ?? "")
          : (inbound[inbound.length - 1]?.created_by ?? first.to_emails[0] ?? "");
      const buyer = direction === "buyer" ? (buyerById.get(first.buyer_id ?? "") ?? null) : null;
      const supplier = direction === "supplier" ? (supplierById.get(first.supplier_id ?? "") ?? null) : null;
      const prospect = first.prospect_id ? (prospectById.get(first.prospect_id) ?? null) : null;
      const label =
        (direction === "buyer" ? buyer?.company : supplier?.name) || prospect?.company ||
        (counterpart ? counterpart.split("@")[0] : "Không rõ người nhận");
      const nonDraft = sorted.filter((m) => m.status !== "draft");
      return {
        threadId,
        label,
        email: counterpart,
        direction,
        buyerId: first.buyer_id ?? null,
        supplierId: first.supplier_id ?? null,
        prospectId: canManageProspects ? first.prospect_id ?? null : null,
        lastSubject: (nonDraft[nonDraft.length - 1] ?? last).subject,
        lastAt: last.created_at,
        unread: sorted.filter((m) => m.kind === "inbound" && !m.read_at).length,
        messages: sorted.map((m) => ({
          id: m.id,
          kind: m.kind,
          status: m.status,
          subject: m.subject,
          fromLabel:
            m.kind === "inbound"
              ? (m.created_by ?? "Người gửi")
              : m.status === "draft"
                ? "Nháp của bạn"
                : `Vexim Trade (${m.created_by ?? FROM_ADDRESS})`,
          toLabel: m.kind === "inbound" ? (m.to_emails.join(", ") || FROM_ADDRESS) : (m.to_emails.join(", ") || "—"),
          at: m.sent_at ?? m.created_at,
          bodyHtml: m.body_html,
          unread: m.kind === "inbound" && !m.read_at,
          rfcMessageId: m.rfc_message_id ?? null,
        })),
      } satisfies ThreadSummary;
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  // Ưu tiên mở mạch có thư chưa đọc
  const firstUnread = threads.find((t) => t.unread > 0);
  if (firstUnread) {
    const i = threads.indexOf(firstUnread);
    threads.splice(i, 1);
    threads.unshift(firstUnread);
  }

  return (
    // Khung cố định theo chiều cao màn hình: header trang ghim trên cùng,
    // phần Hộp thư chiếm trọn phần còn lại và tự cuộn bên trong (không cuộn trang)
    <div className="-mb-16 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden lg:h-[calc(100dvh-2rem)]">
      <div className="shrink-0">
      <PageHeader
        title="Hộp thư"
        sub="Hội thoại với buyer: thư tự động, thư đội ngũ soạn và thư trả lời gửi vào hệ thống (Resend Inbound)."
      />

      {emailMode() === "local" && (
        <MailboxHint>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Chưa cấu hình <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> — email gửi đi ở
          trạng thái <strong>demo</strong> và webhook thư đến chỉ lưu metadata.
        </MailboxHint>
      )}
      </div>

      <div className="min-h-0 flex-1">
        <MailThreads threads={threads} canSend={canSend} contacts={contacts} signature={mySig} />
      <MailLiveSync version={mailSyncVersion(buyerMessages)} />
      </div>
    </div>
  );
}
