"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Inbox,
  Loader2,
  Mail,
  Minus,
  Pencil,
  Send,
  X,
} from "lucide-react";

import { markThreadReadAction, sendMailAction } from "@/app/actions";
import { htmlToText } from "@/lib/email/privacy";
import { RichEditor } from "@/components/rich-editor";
import { SafeHtml } from "@/components/safe-html";
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
  snippet: string;
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

export interface QuickContact {
  id: string;
  name: string;
  email: string;
  kind: "buyer" | "supplier";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name, inbound }: { name: string; inbound?: boolean }) {
  return (
    <span
      className={cx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        inbound ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Hộp thư kiểu Gmail: trái là danh sách hội thoại, phải là mạch thư xếp chồng —
 * mỗi thư một hàng có thể thu gọn/mở rộng, nội dung render inline (đã sanitize).
 * Soạn thư mới bằng cửa sổ nổi góc phải dưới giống "New Message" của Gmail.
 */
export function MailThreads({
  threads,
  canSend,
  contacts = [],
}: {
  threads: ThreadSummary[];
  canSend: boolean;
  contacts?: QuickContact[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(threads[0]?.threadId ?? null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMin, setComposeMin] = useState(false);
  const marked = useRef<Set<string>>(new Set());

  const current = useMemo(
    () => threads.find((t) => t.threadId === selected) ?? null,
    [threads, selected],
  );

  // Mở hội thoại => đánh dấu đã đọc (một lần mỗi mạch) + mở sẵn thư cuối cùng
  useEffect(() => {
    if (!current) return;
    setExpanded(new Set([current.messages[current.messages.length - 1]?.id].filter(Boolean) as string[]));
    if (current.unread === 0) return;
    if (marked.current.has(current.threadId)) return;
    marked.current.add(current.threadId);
    void markThreadReadAction(current.threadId).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [current, router]);

  useEffect(() => {
    setReply("");
  }, [selected]);

  function toggleMsg(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* ------- Cột trái: danh sách hội thoại kiểu Gmail ------- */}
      <div className="max-h-[78vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white">
        {threads.map((t) => (
          <button
            key={t.threadId}
            type="button"
            onClick={() => setSelected(t.threadId)}
            className={cx(
              "flex w-full items-start gap-2.5 border-b border-ink-100 px-3 py-2.5 text-left transition last:border-b-0",
              t.threadId === selected ? "bg-brand-50" : "hover:bg-ink-50",
            )}
          >
            <Avatar name={t.label} inbound={t.unread > 0} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={cx(
                    "flex-1 truncate text-[13px]",
                    t.unread > 0 ? "font-bold text-ink-900" : "font-medium text-ink-700",
                  )}
                >
                  {t.label}
                </span>
                <span className="shrink-0 text-[10.5px] text-ink-400">{formatDateTime(t.lastAt)}</span>
              </span>
              <span
                className={cx(
                  "mt-0.5 block truncate text-[12px]",
                  t.unread > 0 ? "font-semibold text-ink-800" : "text-ink-500",
                )}
              >
                {t.lastSubject}
              </span>
              <span className="mt-0.5 block truncate text-[10.5px] text-ink-400">{t.email}</span>
            </span>
            {t.unread > 0 && (
              <span className="mt-1 shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                {t.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ------- Cột phải: mạch thư xếp chồng kiểu Gmail ------- */}
      <div className="space-y-2.5">
        {current && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3">
              <Mail className="h-4 w-4 text-brand-600" />
              <h2 className="text-[15px] font-bold text-ink-900">{current.lastSubject}</h2>
              <Badge className={current.direction === "buyer" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}>
                {current.direction === "buyer" ? "Buyer" : "Nhà cung cấp"}
              </Badge>
              <span className="text-[12px] text-ink-500">
                {current.label} · {current.email} · {current.messages.length} thư
              </span>
            </div>

            {current.messages.map((m) => {
              const open = expanded.has(m.id);
              return (
                <div
                  key={m.id}
                  className={cx(
                    "overflow-hidden rounded-xl border bg-white",
                    m.unread ? "border-amber-300 ring-1 ring-amber-200" : "border-ink-200",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleMsg(m.id)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-ink-50"
                  >
                    <Avatar name={m.fromLabel} inbound={m.kind === "inbound"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="shrink-0 text-[13px] font-semibold text-ink-900">
                          {m.fromLabel}
                        </span>
                        <Badge
                          className={
                            m.kind === "inbound"
                              ? "bg-amber-50 text-amber-700"
                              : m.status === "draft"
                                ? "bg-ink-100 text-ink-600"
                                : "bg-brand-50 text-brand-700"
                          }
                        >
                          {m.kind === "inbound" ? "Thư đến" : m.status === "draft" ? "Nháp" : "Đã gửi"}
                        </Badge>
                        {!open && (
                          <span className="truncate text-[12px] text-ink-500">{m.snippet}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                        tới {m.toLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-400">{formatDateTime(m.at)}</span>
                    <ChevronDown
                      className={cx("h-4 w-4 shrink-0 text-ink-400 transition", !open && "rotate-180")}
                    />
                  </button>
                  {open && (
                    <div className="border-t border-ink-100 px-4 py-3">
                      {m.status === "draft" ? (
                        <Link href={`/mail/compose?draft=${m.id}`} className="btn btn-ghost px-2.5">
                          <Pencil className="h-3.5 w-3.5" /> Mở bản nháp
                        </Link>
                      ) : (
                        <SafeHtml
                          html={m.bodyHtml}
                          className="vxt-mail-body text-[13.5px] leading-6 text-ink-800"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {canSend && (
              <div className="rounded-2xl border border-ink-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar name="Vexim Trade" />
                  <span className="text-[12.5px] text-ink-500">
                    Trả lời <strong className="text-ink-800">{current.label}</strong> ({current.email})
                  </span>
                </div>
                <RichEditor value={reply} onChange={setReply} minHeight={120} placeholder="Nhập nội dung trả lời…" />
                <div className="mt-2.5 flex items-center gap-2">
                  <Button disabled={busy} onClick={() => void sendReply()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Gửi
                  </Button>
                  <span className="ml-auto text-[11px] text-ink-400">
                    Tiêu đề tự động <code className="rounded bg-ink-50 px-1">Re: …</code> — Gmail hai bên gom chung mạch thư.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ------- Cửa sổ soạn thư nổi kiểu Gmail ------- */}
      {canSend && (
        <QuickCompose
          open={composeOpen}
          min={composeMin}
          onOpen={() => {
            setComposeOpen(true);
            setComposeMin(false);
          }}
          onClose={() => setComposeOpen(false)}
          onMin={() => setComposeMin((v) => !v)}
          contacts={contacts}
        />
      )}
    </div>
  );
}

function QuickCompose({
  open,
  min,
  onOpen,
  onClose,
  onMin,
  contacts,
}: {
  open: boolean;
  min: boolean;
  onOpen: () => void;
  onClose: () => void;
  onMin: () => void;
  contacts: QuickContact[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const emails = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) {
      toast.push({ kind: "error", title: "Chưa có người nhận." });
      return;
    }
    if (!body.trim()) {
      toast.push({ kind: "error", title: "Chưa có nội dung thư." });
      return;
    }
    const match = contacts.find((c) => c.email.toLowerCase() === emails[0].toLowerCase());
    setBusy(true);
    const res = await sendMailAction({
      buyerId: match?.kind === "buyer" ? match.id : null,
      supplierId: match?.kind === "supplier" ? match.id : null,
      direction: match?.kind === "supplier" ? "supplier" : "buyer",
      to: emails,
      subject: subject.trim() || "(không có tiêu đề)",
      bodyHtml: body,
      bodyText: htmlToText(body),
    });
    setBusy(false);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      setTo("");
      setSubject("");
      setBody("");
      onClose();
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed bottom-5 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg transition hover:bg-brand-700"
      >
        <Pencil className="h-4 w-4" />
        Soạn thư
      </button>
    );
  }

  return (
    <div
      className={cx(
        "fixed bottom-0 right-6 z-40 overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-ink-200",
        min ? "w-64" : "w-[460px] max-w-[calc(100vw-2rem)]",
      )}
    >
      <div className="flex items-center justify-between bg-ink-800 px-3 py-2 text-white">
        <span className="text-[12.5px] font-semibold">Thư mới</span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={onMin} title={min ? "Mở rộng" : "Thu nhỏ"} className="rounded p-1 hover:bg-white/10">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} title="Đóng" className="rounded p-1 hover:bg-white/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {!min && (
        <>
          <div className="space-y-1.5 border-b border-ink-100 px-3 py-2">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              list="vxt-quick-contacts"
              placeholder="Tới (email, phân cách bởi dấu phẩy)"
              className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand-400"
            />
            <datalist id="vxt-quick-contacts">
              {contacts.map((c) => (
                <option key={c.id} value={c.email ?? ""}>
                  {c.name}
                </option>
              ))}
            </datalist>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Tiêu đề"
              className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand-400"
            />
          </div>
          <div className="px-3 py-2">
            <RichEditor value={body} onChange={setBody} minHeight={170} placeholder="Nội dung thư…" />
          </div>
          <div className="flex items-center gap-2 border-t border-ink-100 px-3 py-2">
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gửi
            </Button>
            <Link href="/mail/compose" className="btn btn-ghost px-2.5" title="Trình soạn đầy đủ: đính kèm tệp, kiểm tra rò rỉ thông tin">
              <Pencil className="h-3.5 w-3.5" />
              Bản đầy đủ
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
