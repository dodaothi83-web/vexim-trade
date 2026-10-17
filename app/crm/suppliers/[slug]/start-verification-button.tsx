"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

export function StartVerificationButton({ supplierId, level }: { supplierId: string; level: 1 | 2 }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function start() {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/verifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLevel: level }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        setFeedback({
          ok: false,
          message: data?.message ?? `Không tạo được đợt kiểm (HTTP ${res.status}). Vui lòng tải lại trang và thử lại.`,
        });
        return;
      }
      setFeedback({ ok: true, message: data.message ?? "Đã tạo đợt kiểm. Bảng kiểm sẽ xuất hiện ở bên dưới." });
      router.refresh();
    } catch {
      setFeedback({ ok: false, message: "Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={start} disabled={pending} className="btn btn-primary btn-sm disabled:opacity-60">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {level === 1 ? "Bắt đầu kiểm giấy tờ" : "Lên lịch thăm nhà máy"}
      </button>
      {feedback && (
        <p role={feedback.ok ? "status" : "alert"} className={`max-w-xs text-right text-xs ${feedback.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
