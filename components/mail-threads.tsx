"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerUpLeft,
  CornerUpRight,
  Inbox,
  Loader2,
  Mail,
  Minus,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { deleteMessageAction, markThreadReadAction, sendMailAction } from "@/app/actions";
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

interface ComposePrefill {
  to?: string;
  subject?: string;
  body?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name, inbound, small }: { name: string; inbound?: boolean; small?: boolean }) {
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        small ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]",
        inbound ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Hộp thư phẳng kiểu Gmail:
 * - Trái: danh sách hội thoại.
 * - Phải: mạch thư KHÔNG đóng khung từng thư — mỗi thư gồm dòng đầu (avatar, tên,
 *   người nhận, badge, giờ) + nội dung LUÔN hiển thị đầy đủ; không còn cơ chế
 *   đóng/mở hay mũi tên — nội dung dài đã có thanh cuộn của khung.
 * - Đáy mạch thư: hai nút pill [Trả lời] / [Chuyển tiếp]; bấm Trả lời mới mở khung soạn.
 * - Soạn thư mới / chuyển tiếp: cửa sổ nổi góc phải dưới giống Gmail.
 */
export function MailThreads({
  threads,
  canSend,
  contacts = [],
  signature = "",
}: {
  threads: ThreadSummary[];
  canSend: boolean;
  contacts?: QuickContact[];
  /** Chữ ký của người đang đăng nhập — chèn sẵn vào khung trả lời / thư chuyển tiếp */
  signature?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(threads[0]?.threadId ?? null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMin, setComposeMin] = useState(false);
  const [composePrefill, setComposePrefill] = useState<ComposePrefill | undefined>(undefined);
  const [composeKey, setComposeKey] = useState(0);
  const marked = useRef<Set<string>>(new Set());
  const lastThread = useRef<string | null>(threads[0]?.threadId ?? null);

  const current = useMemo(
    () => threads.find((t) => t.threadId === selected) ?? null,
    [threads, selected],
  );

  // Đổi hội thoại => đánh dấu đã đọc (một lần mỗi mạch) + đóng khung trả lời.
  // Chỉ chạy khi đổi threadId — router.refresh() sau khi gửi không ảnh hưởng UI.
  useEffect(() => {
    if (!current) return;
    if (lastThread.current !== current.threadId) {
      lastThread.current = current.threadId;
      setReplyOpen(false);
    }
    if (current.unread === 0) return;
    if (marked.current.has(current.threadId)) return;
    marked.current.add(current.threadId);
    void markThreadReadAction(current.threadId).then((res) => {
      if (res.ok) router.refresh();
    });
  }, [current, router]);

  // Mở khung trả lời: chưa gõ gì thì chèn sẵn một dòng trống + chữ ký (như soạn đầy đủ)
  function openReply() {
    if (!reply.trim() && signature) setReply(`<p><br/></p>${signature}`);
    setReplyOpen(true);
  }

  async function removeMessage(id: string) {
    if (!window.confirm("Xoá email này khỏi hộp thư?")) return;
    setDeleting(id);
    const res = await deleteMessageAction(id);
    setDeleting(null);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) router.refresh();
  }

  function openCompose(prefill?: ComposePrefill) {
    setComposePrefill(prefill);
    setComposeKey((k) => k + 1);
    setComposeOpen(true);
    setComposeMin(false);
  }

  function openForward() {
    if (!current) return;
    const last = current.messages[current.messages.length - 1];
    const quote = `
      <p style="margin:14px 0 4px;color:#64748b;font-size:12.5px;">---------- Thư chuyển tiếp ----------</p>
      <p style="margin:0 0 8px;color:#64748b;font-size:12.5px;">
        Từ: ${last.fromLabel}<br/>Ngày: ${formatDateTime(last.at)}<br/>Tiêu đề: ${last.subject}
      </p>
      <blockquote style="margin:0;padding:8px 12px;border-left:3px solid #e2e8f0;color:#475569;">${last.bodyHtml}</blockquote>`;
    const subject = /^fwd?:/i.test(current.lastSubject.trim())
      ? current.lastSubject
      : `Fw: ${current.lastSubject}`;
    // Chữ ký nằm trên khối trích dẫn, đúng thứ tự Gmail hay xếp
    const body = `${signature ? `${signature}<p><br/></p>` : ""}${quote}`;
    openCompose({ subject, body });
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
      setReplyOpen(false);
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
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-4 overflow-hidden lg:grid-cols-[340px_1fr] lg:grid-rows-1">
      {/* ------- Cột trái: danh sách hội thoại kiểu Gmail ------- */}
      <div className="min-h-0 overflow-y-auto rounded-2xl border border-ink-200 bg-white">
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

      {/* ------- Cột phải: header/footer ghim cố định, vùng thư cuộn độc lập ------- */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        {current && (
          <>
            {/* Card mạch thư: header ghim trên cùng, vùng thư tự cuộn ở giữa */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
            {/* Đầu mạch thư: ghim cố định, không trôi theo nội dung */}
            <div className="flex shrink-0 flex-wrap items-baseline gap-2 border-b border-ink-100 px-3 pb-2.5 pt-3">
              <h2 className="text-[16px] font-bold text-ink-900">{current.lastSubject}</h2>
              <Badge className={current.direction === "buyer" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"}>
                {current.direction === "buyer" ? "Buyer" : "Nhà cung cấp"}
              </Badge>
              <span className="text-[12px] text-ink-400">
                {current.label} · {current.email} · {current.messages.length} thư
              </span>
              {canSend && (
                <Link href="/mail/compose" className="btn btn-ghost ml-auto px-2.5" title="Trình soạn đầy đủ: đính kèm tệp, kiểm tra rò rỉ">
                  <Pencil className="h-3.5 w-3.5" />
                  Soạn đầy đủ
                </Link>
              )}
            </div>

            {/* Danh sách thư phẳng: ngăn cách bằng đường kẻ mờ, không khung riêng */}
            <div className="min-h-0 flex-1 divide-y divide-ink-100 overflow-y-auto px-2">
              {current.messages.map((m) => (
                <div key={m.id}>
                  {/* Dòng đầu mỗi thư: phẳng, không mũi tên thu/gập */}
                  <div className="group flex w-full items-center gap-3 px-2 py-2.5">
                    <Avatar name={m.fromLabel} inbound={m.kind === "inbound"} small />
                    <span
                      className={cx(
                        "w-40 shrink-0 truncate text-[13px]",
                        m.unread ? "font-bold text-ink-900" : "font-semibold text-ink-800",
                      )}
                    >
                      {m.fromLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-400">
                      tới {m.toLabel}
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
                    {m.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
                    <span className="shrink-0 text-[11px] text-ink-400">{formatDateTime(m.at)}</span>
                    {canSend && (
                      <button
                        type="button"
                        title="Xoá email này"
                        onClick={() => void removeMessage(m.id)}
                        className="shrink-0 rounded p-1 text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        {deleting === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {/* Thân thư luôn hiển thị đầy đủ — dài thì thanh cuộn của khung lo */}
                  <div className="px-4 pb-5 pl-12">
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
                </div>
              ))}
            </div>

            {/* Chân khung trắng: cụm nút pill ghim sát đáy card */}
            {canSend && !replyOpen && (
              <div className="flex shrink-0 items-center gap-2 border-t border-ink-100 px-3 pb-3 pt-2.5">
                <button
                  type="button"
                  onClick={openReply}
                  className="flex items-center gap-2 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition hover:bg-ink-50"
                >
                  <CornerUpLeft className="h-4 w-4" />
                  Trả lời
                </button>
                <button
                  type="button"
                  onClick={openForward}
                  className="flex items-center gap-2 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition hover:bg-ink-50"
                >
                  <CornerUpRight className="h-4 w-4" />
                  Chuyển tiếp
                </button>
              </div>
            )}
            {canSend && replyOpen && (
              <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-ink-100 px-3 pb-3 pt-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar name="Vexim Trade" small />
                  <span className="text-[12.5px] text-ink-500">
                    Trả lời <strong className="text-ink-800">{current.label}</strong> ({current.email})
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyOpen(false)}
                    className="ml-auto rounded p-1 text-ink-400 hover:bg-ink-50"
                    title="Đóng khung trả lời"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <RichEditor value={reply} onChange={setReply} minHeight={120} placeholder="Nhập nội dung trả lời…" />
                <div className="mt-2.5 flex items-center gap-2">
                  <Button disabled={busy} onClick={() => void sendReply()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Gửi
                  </Button>
                  <span className="ml-auto text-[11px] text-ink-400">
                    Tiêu đề tự động <code className="rounded bg-ink-50 px-1">Re: …</code> — Gmail hai bên gom chung mạch.
                  </span>
                </div>
              </div>
            )}
            </div>
          </>
        )}
      </div>

      {/* ------- Cửa sổ soạn nổi góc phải dưới kiểu Gmail ------- */}
      {canSend && (
        <QuickCompose
          key={composeKey}
          open={composeOpen}
          min={composeMin}
          initial={composePrefill}
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
  initial,
  onClose,
  onMin,
  contacts,
}: {
  open: boolean;
  min: boolean;
  initial?: ComposePrefill;
  onClose: () => void;
  onMin: () => void;
  contacts: QuickContact[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [to, setTo] = useState(initial?.to ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
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
      onClose();
      router.refresh();
    }
  }

  // Không còn nút FAB nổi — cửa sổ này chỉ mở khi [Chuyển tiếp] được bấm
  if (!open) return null;

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
