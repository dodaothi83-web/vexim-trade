"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { DigestKind } from "@/lib/buyer/digest";
import { sendDigestTestAction, setDigestPausedAction } from "./actions";

/** Nút tạm dừng khẩn cấp / chạy lại. */
export function PauseButton({ paused, canManage }: { paused: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!canManage) return null;
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" disabled={pending} className={paused ? "btn btn-primary btn-sm" : "btn btn-danger btn-sm"} onClick={() => {
      if (!paused && !window.confirm("Tạm dừng toàn bộ thư giới thiệu? Chỉ dùng khi có sự cố.")) return;
      start(async () => {
        const result = await setDigestPausedAction(!paused).catch(() => ({ ok: false, message: "Chưa lưu được." }));
        setNote({ ok: result.ok, text: result.message });
        router.refresh();
      });
    }}>{paused ? "Chạy lại" : "Tạm dừng khẩn cấp"}</button>
    {note && <span role={note.ok ? "status" : "alert"} className={`text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</span>}
  </div>;
}

/** Gửi thử thư đang xem về email của nhân viên. */
export function TestSendButton({ kind, categoryId }: { kind: DigestKind; categoryId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return <span className="inline-flex flex-wrap items-center gap-2">
    <button type="button" disabled={pending} className="btn btn-ghost btn-sm" onClick={() => start(async () => {
      const result = await sendDigestTestAction(kind, categoryId).catch(() => ({ ok: false, message: "Chưa gửi được thư thử." }));
      setNote({ ok: result.ok, text: result.message });
    })}>{pending ? "Đang gửi…" : "Gửi thử cho tôi"}</button>
    {note && <span role={note.ok ? "status" : "alert"} className={`text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</span>}
  </span>;
}
