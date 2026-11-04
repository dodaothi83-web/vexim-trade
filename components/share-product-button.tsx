"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

export function ShareProductButton({ title, href, isVi = false }: { title: string; href: string; isVi?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const label = isVi ? "Chia sẻ sản phẩm" : "Share product";
  async function share() {
    setBusy(true);
    setStatus("idle");
    const url = new URL(href, window.location.origin).href;
    setLink(url);
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      } catch {
        setStatus("manual");
      }
    } finally { setBusy(false); }
  }
  return <div className="relative">
    <button type="button" aria-label={label} title={label} disabled={busy} onClick={share} className="inline-flex cursor-pointer h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-brand-700 shadow-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-wait disabled:opacity-60">
      {status === "copied" ? <Check className="h-5 w-5" aria-hidden /> : <Share2 className="h-5 w-5" aria-hidden />}
    </button>
    {status !== "idle" && <div className="absolute right-14 top-0 w-60 rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-700 shadow-sm">
      <p role="status">{status === "copied" ? (isVi ? "Đã sao chép liên kết." : "Link copied.") : (isVi ? "Chọn và sao chép liên kết bên dưới." : "Select and copy the link below.")}</p>
      {status === "manual" && <input aria-label={isVi ? "Liên kết sản phẩm" : "Product link"} value={link} readOnly onFocus={(event) => event.currentTarget.select()} className="mt-2 w-full rounded border border-ink-300 p-2 text-xs" />}
      <button type="button" onClick={() => setStatus("idle")} className="mt-2 cursor-pointer text-xs font-semibold text-brand-700 underline">{isVi ? "Đóng" : "Close"}</button>
    </div>}
  </div>;
}
