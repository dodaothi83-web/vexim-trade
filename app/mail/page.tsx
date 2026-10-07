import { getStore } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { getStage } from "@/lib/pipeline";
import { PageHeader } from "@/components/page-header";
import { Mailbox, MailboxHint, type MailRow } from "@/components/mailbox";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hộp thư" };

export default async function MailPage() {
  const store = getStore();
  const [messages, buyers, suppliers] = await Promise.all([
    store.listMessages(400),
    store.listBuyers(),
    store.listSuppliers(),
  ]);

  const buyerName = new Map(buyers.map((b) => [b.id, b.company]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const rows: MailRow[] = messages.map((m) => ({
    ...m,
    label:
      (m.direction === "buyer"
        ? (m.buyer_id && buyerName.get(m.buyer_id)) || null
        : (m.supplier_id && supplierName.get(m.supplier_id)) || null) ??
      m.to_emails[0] ??
      "Không rõ người nhận",
    stageLabel: m.stage ? getStage(m.stage).label : undefined,
  }));

  return (
    <>
      <PageHeader
        title="Hộp thư"
        sub="Toàn bộ email gửi đi: email tự động theo từng giai đoạn pipeline và email do đội ngũ tự soạn."
      />

      {emailMode() === "local" && (
        <MailboxHint>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Chưa cấu hình <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code> — email được
          tạo và lưu lại ở trạng thái <strong>demo</strong>, chưa gửi ra ngoài. Có key rồi thì bấm
          “Gửi lại” là đi thật.
        </MailboxHint>
      )}

      <Mailbox rows={rows} />
    </>
  );
}
