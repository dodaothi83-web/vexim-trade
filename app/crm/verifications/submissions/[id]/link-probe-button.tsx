"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar } from "lucide-react";

/** Thử đọc link nguồn công khai; chỉ domain trong allowlist mới được máy chủ truy cập. */
export function LinkProbeButton({ submissionId, linkId }: { submissionId: string; linkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function probe() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/submission-review/${encodeURIComponent(submissionId)}/probe-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      const data = await response.json() as { ok?: boolean; message?: string };
      setMessage(data.message ?? (response.ok ? "Đã đọc link." : "Không đọc được link."));
      router.refresh();
    } catch {
      setMessage("Không kết nối được máy chủ.");
    } finally { setBusy(false); }
  }

  return <div className="mt-2">
    <button type="button" onClick={() => void probe()} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-700 hover:border-brand-400 disabled:opacity-50">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />} Thử đọc link nguồn
    </button>
    {message && <p className="mt-1 text-[11px] text-ink-600">{message}</p>}
  </div>;
}
