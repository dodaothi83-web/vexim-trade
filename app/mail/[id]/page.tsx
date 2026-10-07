import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Mail, Users, Zap } from "lucide-react";

import { getStore } from "@/lib/db";
import { getStage } from "@/lib/pipeline";
import { Breadcrumbs, Badge, Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { DownloadHtml, MessageActions } from "@/components/message-actions";

export const dynamic = "force-dynamic";

export default async function MessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const msg = await store.getMessage(id);
  if (!msg) notFound();

  const buyer = msg.buyer_id ? await store.getBuyer(msg.buyer_id) : null;
  const supplier = msg.supplier_id ? await store.getSupplier(msg.supplier_id) : null;
  const who = msg.direction === "buyer" ? (buyer?.company ?? "Buyer") : (supplier?.name ?? "NCC");

  const replyHref =
    msg.direction === "buyer"
      ? `/mail/compose?to=${msg.buyer_id ?? ""}&dir=buyer`
      : `/mail/compose?supplier=${msg.supplier_id ?? ""}&dir=supplier`;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Hộp thư", href: "/mail" }, { label: msg.subject }]} />
        }
        title={msg.subject}
        sub={`${who} · ${new Date(msg.created_at).toLocaleString("vi-VN")}${
          msg.created_by ? ` · người gửi: ${msg.created_by}` : ""
        }`}
        actions={<MessageActions messageId={msg.id} replyHref={replyHref} />}
      />

      <Card className="mb-4">
        <div className="grid gap-px bg-ink-100 sm:grid-cols-2 lg:grid-cols-4">
          <Cell label="Trạng thái">
            <Badge
              className={
                msg.status === "sent"
                  ? "bg-emerald-50 text-emerald-700"
                  : msg.status === "failed"
                    ? "bg-red-50 text-red-700"
                    : msg.status === "draft"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-amber-50 text-amber-700"
              }
            >
              {msg.status === "sent"
                ? "đã gửi"
                : msg.status === "failed"
                  ? "gửi lỗi"
                  : msg.status === "draft"
                    ? "bản nháp"
                    : "demo (chưa gửi thật)"}
            </Badge>
          </Cell>
          <Cell label="Loại">
            {msg.kind === "auto" ? (
              <Badge className="bg-brand-50 text-brand-700">
                <Zap className="h-3 w-3" />
                tự động theo giai đoạn
                {msg.stage ? ` · ${getStage(msg.stage).label}` : ""}
              </Badge>
            ) : (
              <Badge className="bg-ink-100 text-ink-600">đội ngũ tự soạn</Badge>
            )}
          </Cell>
          <Cell label="Người nhận">
            <span className="flex items-start gap-1.5">
              {msg.direction === "buyer" ? (
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
              ) : (
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <span className="break-all">{msg.to_emails.join(", ") || "—"}</span>
            </span>
          </Cell>
          <Cell label="Cc / Bcc">
            <span className="break-all">
              {[
                msg.cc_emails.length ? `cc: ${msg.cc_emails.join(", ")}` : null,
                msg.bcc_emails.length ? `bcc: ${msg.bcc_emails.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </Cell>
        </div>

        {msg.error && (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
            Lỗi: {msg.error}
          </p>
        )}

        {msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-ink-200 px-4 py-2.5">
            {msg.attachments.map((a, i) => (
              <a
                key={i}
                href={`data:${a.type || "application/octet-stream"};base64,${a.content}`}
                download={a.name}
                className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-[12px] transition hover:border-brand-300 hover:bg-brand-50"
              >
                <FileText className="h-3.5 w-3.5 text-ink-500" />
                <span className="max-w-[200px] truncate font-medium text-ink-800">{a.name}</span>
                <span className="text-ink-400">{(a.size / 1024).toFixed(0)}KB</span>
              </a>
            ))}
          </div>
        )}

        {(buyer || supplier) && (
          <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-2 text-[12px] text-ink-600">
            {buyer && (
              <Link href={`/buyers/${buyer.id}`} className="font-semibold text-brand-700 hover:underline">
                {buyer.company}
              </Link>
            )}
            {buyer && supplier && <span className="mx-1.5 text-ink-300">·</span>}
            {supplier && (
              <Link href={`/suppliers/${supplier.id}`} className="font-semibold text-brand-700 hover:underline">
                {supplier.name}
              </Link>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2">
          <span className="text-[12px] font-bold tracking-wide text-ink-500 uppercase">
            Nội dung email
          </span>
          <DownloadHtml subject={msg.subject} html={msg.body_html} />
        </div>
        <iframe
          title={msg.subject}
          srcDoc={msg.body_html}
          sandbox=""
          className="h-[640px] w-full border-0 bg-white"
        />
      </Card>

      <p className={cx("mt-4 text-center text-[11.5px] text-ink-400")}>
        Gửi qua {msg.provider === "resend" ? "Resend" : "chế độ demo (chưa cấu hình Resend)"}
        {msg.sent_at ? ` · ${new Date(msg.sent_at).toLocaleString("vi-VN")}` : ""}
      </p>
    </>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="mt-1 text-[13px] text-ink-800">{children}</div>
    </div>
  );
}
