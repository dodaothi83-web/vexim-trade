import { getStore } from "@/lib/db";
import { emailMode, FROM_ADDRESS } from "@/lib/config";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { MailboxHint } from "@/components/mailbox";
import { MailThreads, type ThreadSummary } from "@/components/mail-threads";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hộp thư" };

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function MailPage() {
  const session = await requireSession();
  const canSend = hasPermission(session.role, "mail.send");

  const store = getStore();
  const [messages, buyers, suppliers] = await Promise.all([
    store.listMessages(500),
    store.listBuyers(),
    store.listSuppliers(),
  ]);

  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  // Nhóm theo mạch thư (thread_id): gồm cả thư gửi đi lẫn thư đến Resend Inbound
  const grouped = new Map<string, typeof messages>();
  for (const m of messages) {
    const key = m.thread_id || `msg:${m.id}`;
    const arr = grouped.get(key);
    if (arr) arr.push(m);
    else grouped.set(key, [m]);
  }

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
      const label =
        (direction === "buyer" ? buyer?.company : supplier?.name) ||
        (counterpart ? counterpart.split("@")[0] : "Không rõ người nhận");
      const nonDraft = sorted.filter((m) => m.status !== "draft");
      return {
        threadId,
        label,
        email: counterpart,
        direction,
        buyerId: first.buyer_id ?? null,
        supplierId: first.supplier_id ?? null,
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
    <>
      <PageHeader
        title="Hộp thư"
        sub="Hội thoại theo từng buyer/NCC: thư tự động, thư đội ngũ soạn và thư trả lời gửi vào hệ thống (Resend Inbound)."
      />

      {emailMode() === "local" && (
        <MailboxHint>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Chưa cấu hình <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> — email gửi đi ở
          trạng thái <strong>demo</strong> và webhook thư đến chỉ lưu metadata.
        </MailboxHint>
      )}

      <MailThreads threads={threads} canSend={canSend} />
    </>
  );
}
