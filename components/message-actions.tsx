"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CornerUpLeft, Download, Loader2, RotateCw, Trash2 } from "lucide-react";

import { deleteMessageAction, resendMessageAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export function MessageActions({
  messageId,
  replyHref,
}: {
  messageId: string;
  replyHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"resend" | "delete" | null>(null);

  async function resend() {
    setBusy("resend");
    const res = await resendMessageAction(messageId);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(null);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Xoá email này khỏi hộp thư?")) return;
    setBusy("delete");
    const res = await deleteMessageAction(messageId);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      router.push("/mail");
      router.refresh();
    } else {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={replyHref} className="btn btn-primary">
        <CornerUpLeft className="h-4 w-4" />
        Viết tiếp / Trả lời
      </Link>
      <Button variant="ghost" disabled={busy === "resend"} onClick={() => void resend()}>
        {busy === "resend" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="h-4 w-4" />
        )}
        Gửi lại
      </Button>
      <Button variant="danger" disabled={busy === "delete"} onClick={() => void remove()}>
        {busy === "delete" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Xoá
      </Button>
    </div>
  );
}

export function DownloadHtml({ subject, html }: { subject: string; html: string }) {
  const safe = subject.replace(/[^\w\s-]/g, "").trim().slice(0, 40) || "email";
  return (
    <a
      className="btn btn-ghost"
      href={`data:text/html;charset=utf-8,${encodeURIComponent(html)}`}
      download={`${safe}.html`}
    >
      <Download className="h-4 w-4" />
      Tải HTML
    </a>
  );
}
