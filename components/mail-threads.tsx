"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Mail, Pencil, Send, Loader2 } from "lucide-react";

import { markThreadReadAction, sendMailAction } from "@/app/actions";
import { htmlToText } from "@/lib/email/privacy";
import { withPreviewPadding } from "@/lib/email/templates";
import { RichEditor } from "@/components/rich-editor";
import { Badge, Button, cx, formatDateTime } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface ThreadMessage {
  id: string;
  kind: "auto" | "manual" | "inbound";
  status: string;
  subject: string;
  fromLabel: string;
  toLabel: string;
  at: string;
  bodyHtml: string;
  unread: boolean;
  rfcMessageId: string | null;
}

export interface ThreadSummary {
  threadId: string;
  label: string;
  email: string;
  direction: "buyer" | "supplier";
  buyerId: string | null;
  supplierId: string | null;
  lastSubject: string;
  lastAt: string;
  unread: number;
  messages: ThreadMessage[];
}

/**
 * Hộp thư hai khung kiểu Gmail: trái là danh sách hội thoại (gồm thư buyer/NCC
 * gửi đến), phải là toàn bộ mạch thư kèm ô trả lời ngay cuối.
 */
export function MailThreads({
  threads,
  canSend,
}: {
  threads: ThreadSummary[];
  canSend: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(threads[0]?.threadId ?? null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const marked = useRef<Set<string>>(new Set());

  const current = useMemo(
    () => threads.find((t) => t.threadId === selected) ?? null,
    [threads, selected],
  );

  // Mở hội thoại => đánh dấu đã đọc (một lần mỗi mạch)
  useEffect(() => {
    if (!current || current.unread === 0) return;
    if (marked.current.has(current.threadId)) return;
    marked.current.add(current.threadId);
    void markThreadReadAction(current.threadId).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [current, router]);

  useEffect(() => {
    setReply("");
  }, [selected]);

  async function sendReply() {
    if (!current) return;
    if (!reply.trim()) {
      toast.push({ kind: "error", title: "Chưa có nội dung trả lời." });
      return;
    }
    const inboundRfc = current.messages
      .filter((m) => m.kind === "inbound" && m.rfcMessageId)
      .map((m) => m.rfcMessageId as string);
    const lastSubject = current.lastSubject || "";
    const subject = /^re:/i.test(lastSubject.trim()) ? lastSubject : `Re: ${lastSubject}`;
    setBusy(true);
    const res = await sendMailAction({
      buyerId: current.buyerId,
      supplierId: current.supplierId,
      direction: current.direction,
      to: [current.email],
      subject,
      bodyHtml: reply,
      bodyText: htmlToText(reply),
      inReplyTo: inboundRfc[inboundRfc.length - 1] ?? null,
      references: inboundRfc.join(" ") || null,
    });
    setBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      setReply("");
      router.refresh();
    }
  }

  if (!threads.length) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-10 text-center text-[13px] text-ink-500">
        <Inbox className="mx-auto mb-2 h-6 w-6 text-ink-300" />
        Chưa có hội thoại nào. Thư gửi đi và thư buyer/NCC trả lời (qua Resend Inbound)
        sẽ xuất hiện ở đây.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* ------- Cột trái: danh sách hội thoại ------- */}
      <div className="max-h-[75vh] space-y-1 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-2">
        {threads.map((t) => (
          <button
            key={t.threadId}
            type="button"
            onClick={() => setSelected(t.threadId)}
            className={cx(
              "w-full rounded-xl px-3 py-2.5 text-left transition",
              t.threadId === selected ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-ink-50",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  "flex-1 truncate text-[13px]",
                  t.unread > 0 ? "font-bold text-ink-900" : "font-medium text-ink-700",
                )}
              >
                {t.label}
              </span>
              {t.unread > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                  {t.unread}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-500">{t.lastSubject}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-400">
              <span className="truncate">{t.email}</span>
              <span className="ml-auto shrink-0">{formatDateTime(t.lastAt)}</span>
            </p>
          </button>
        ))}
      </div>

      {/* ------- Cột phải: mạch thư + ô trả lời ------- */}
      <div className="space-y-3">
        {current && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3">
              <Mail className="h-4 w-4 text-brand-600" />
              <span className="text-[14px] font-bold text-ink-900">{current.label}</span>
              <Badge className={current.direction === "buyer" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}>
                {current.direction === "buyer" ? "Buyer" : "Nhà cung cấp"}
              </Badge>
              <span className="text-[12px] text-ink-500">{current.email}</span>
              {canSend && (
                <Link
                  href={`/mail/compose?${current.direction === "supplier" ? `supplier=${current.supplierId ?? ""}` : `to=${current.buyerId ?? ""}`}`}
                  className="btn btn-ghost px-2.5 ml-auto"
                  title="Soạn thư đầy đủ cho người này"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Soạn đầy đủ
                </Link>
              )}
            </div>

            {current.messages.map((m) => (
              <div
                key={m.id}
                className={cx(
                  "rounded-2xl border bg-white px-4 py-3",
                  m.unread ? "border-amber-300 ring-1 ring-amber-200" : "border-ink-200",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
                  <Badge className={m.kind === "inbound" ? "bg-amber-50 text-amber-700" : m.status === "draft" ? "bg-ink-100 text-ink-600" : "bg-brand-50 text-brand-700"}>
                    {m.kind === "inbound" ? "Thư đến" : m.status === "draft" ? "Nháp" : "Đã gửi"}
                  </Badge>
                  <span className="font-semibold text-ink-800">{m.fromLabel}</span>
                  <span>→</span>
                  <span className="truncate">{m.toLabel}</span>
                  <span className="ml-auto shrink-0">{formatDateTime(m.at)}</span>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-ink-900">{m.subject}</p>
                {m.status === "draft" ? (
                  <Link href={`/mail/compose?draft=${m.id}`} className="btn btn-ghost mt-2 px-2.5">
                    <Pencil className="h-3.5 w-3.5" /> Mở bản nháp
                  </Link>
                ) : (
                  <iframe
                    title={m.subject}
                    sandbox=""
                    srcDoc={withPreviewPadding(m.bodyHtml)}
                    className="mt-2 h-[220px] w-full rounded-xl border border-ink-100 bg-white"
                  />
                )}
              </div>
            ))}

            {canSend && (
              <div className="rounded-2xl border border-ink-200 bg-white p-4">
                <p className="mb-2 text-[12px] font-bold tracking-wide text-ink-500 uppercase">
                  Trả lời {current.label}
                </p>
                <RichEditor value={reply} onChange={setReply} minHeight={140} placeholder="Nhập nội dung trả lời…" />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ink-400">
                    Gửi tới <strong>{current.email}</strong> · tiêu đề tự động{" "}
                    <code className="rounded bg-ink-50 px-1">Re: …</code> để Gmail gom đúng mạch thư.
                  </p>
                  <Button disabled={busy} onClick={() => void sendReply()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Gửi trả lời
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
