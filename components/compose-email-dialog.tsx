"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MailPlus, Send, X } from "lucide-react";
import { ActionStatus, PendingProvider, actionErrorText, useActionSubmit, usePending } from "@/components/action-form";

const MAX_WORDS = 2000;
const countWords = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;

/**
 * Soạn email cho nhà cung cấp trong một hộp thoại đủ rộng để đọc và sửa thư.
 * Esc hoặc nút đóng chỉ ẩn hộp thoại, chữ đang soạn vẫn còn. Gửi xong thì đóng và
 * báo "Đã gửi email" cạnh nút; lỗi thì giữ hộp thoại mở để sửa và gửi lại.
 */
export function ComposeEmailDialog({ action, hidden, recipientName, recipientEmail, defaultSubject, defaultBody }: {
  action: (fd: FormData) => Promise<unknown>;
  hidden: Record<string, string>;
  recipientName: string;
  recipientEmail: string | null;
  defaultSubject: string;
  defaultBody: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [words, setWords] = useState(() => countWords(defaultBody));
  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), 4000);
    return () => window.clearTimeout(timer);
  }, [sent]);
  const tooLong = words > MAX_WORDS;
  const { pending, onSubmit } = useActionSubmit(action, {
    onSuccess: (form) => {
      form.reset();
      setWords(countWords(defaultBody));
      dialogRef.current?.close();
      setSent(true);
    },
    onError: (err) => setError(actionErrorText(err, "Chưa gửi được email. Hãy thử lại.")),
  });

  return <>
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(null); dialogRef.current?.showModal(); }}>
      <MailPlus className="h-3.5 w-3.5" aria-hidden="true" /> Soạn email
    </button>
    <ActionStatus status={sent ? { kind: "ok", text: "Đã gửi email" } : null} />
    <dialog ref={dialogRef} aria-labelledby="compose-email-title"
      className="m-auto w-[min(760px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-xl border border-ink-200 bg-white p-0 text-left shadow-2xl backdrop:bg-ink-900/40">
      <form className="flex max-h-[calc(100dvh-2rem)] flex-col" aria-busy={pending}
        onSubmit={(event) => { setError(null); onSubmit(event); }}>
        {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="compose-email-title" className="text-[15px] font-bold text-ink-900">Soạn email cho nhà cung cấp</h2>
            <p className="mt-0.5 truncate text-[13px] text-ink-600">
              Gửi tới <strong className="font-semibold text-ink-800">{recipientName}</strong>{recipientEmail ? ` · ${recipientEmail}` : ""}
            </p>
          </div>
          <button type="button" aria-label="Đóng" className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800" onClick={() => dialogRef.current?.close()}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-[12px] font-medium text-ink-600">
            Tiêu đề
            <input name="subject" required defaultValue={defaultSubject} className="input mt-1 text-[14px]" />
          </label>
          <label className="block text-[12px] font-medium text-ink-600">
            Nội dung
            <textarea name="body" required rows={14} defaultValue={defaultBody} onChange={(e) => setWords(countWords(e.target.value))}
              className="input mt-1 min-h-[280px] resize-y text-[14px] leading-6" />
          </label>
          <p className="flex flex-wrap justify-between gap-2 text-[12px] text-ink-500">
            <span>Thư trả lời sẽ tự gắn vào timeline của nhà cung cấp này.</span>
            <span className={tooLong ? "font-semibold text-red-700" : ""}>{words.toLocaleString("vi-VN")} / {MAX_WORDS.toLocaleString("vi-VN")} từ</span>
          </p>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialogRef.current?.close()}>Huỷ</button>
          <PendingProvider pending={pending}><SendButton disabled={tooLong} /></PendingProvider>
        </div>
      </form>
    </dialog>
  </>;
}

function SendButton({ disabled }: { disabled: boolean }) {
  const pending = usePending();
  return <button type="submit" disabled={pending || disabled} aria-busy={pending} className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-70">
    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
    {pending ? "Đang gửi…" : "Gửi email"}
  </button>;
}
