"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendIntroInvitesAction } from "./actions";

/** Nút gửi đợt thư mời, hỏi xác nhận kèm số người nhận. */
export function SendInvitesButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" className="btn btn-primary btn-sm" disabled={pending || count === 0} onClick={() => {
      if (!window.confirm(`Gửi thư mời chọn ngành hàng tới ${count} người mua? Mỗi người chỉ nhận một lần.`)) return;
      start(async () => {
        const result = await sendIntroInvitesAction().catch(() => ({ ok: false, message: "Chưa gửi được thư mời. Thử lại sau." }));
        setNote({ ok: result.ok, text: result.message });
        router.refresh();
      });
    }}>{pending ? "Đang gửi…" : `Gửi thư mời (${count} người)`}</button>
    {note && <span role={note.ok ? "status" : "alert"} className={`text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</span>}
  </div>;
}
