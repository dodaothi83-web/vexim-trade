"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { markVerificationRequestContactedAction } from "./request-actions";

export function ContactRequestButton({ supplierId, level }: { supplierId: string; level: 2 | 3 }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function contact() {
    if (!window.confirm("Đã liên hệ NCC để trao đổi và lên kế hoạch đánh giá bước này?")) return;
    setBusy(true); setFeedback("");
    try {
      const form = new FormData(); form.set("supplier_id", supplierId); form.set("target_level", String(level));
      const result = await markVerificationRequestContactedAction(form);
      setFeedback(result.message);
      if (result.ok) router.refresh();
    } catch { setFeedback("Không ghi nhận được liên hệ. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col items-end gap-1">
    <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void contact()}>{busy ? "Đang lưu..." : "Đã liên hệ NCC"}</button>
    {feedback && <span role="status" className="max-w-xs text-xs text-ink-600">{feedback}</span>}
  </span>;
}
