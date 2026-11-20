"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

import { AplusVideo } from "@/components/public/aplus-video";

/**
 * Nút "Watch factory video" ở đầu trang nhà cung cấp gói cao cấp: bấm mới mở khung phát (chủ sàn
 * chốt 2026-11-20), trang không tải trình phát hay tự phát video.
 */
export function HeroVideoButton({ uid, title }: { uid: string; title: string }) {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/60 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">
      <span className="flex size-6 items-center justify-center rounded-full bg-white text-[var(--sf-dark)]"><Play className="ml-0.5 size-3.5 fill-current" aria-hidden="true" /></span>
      Watch factory video
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
      <div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
        <button ref={close} type="button" onClick={() => setOpen(false)} aria-label="Close video"
          className="absolute -top-11 right-0 flex size-9 items-center justify-center rounded-full bg-white/90 text-ink-900 hover:bg-white"><X className="size-4" aria-hidden="true" /></button>
        <AplusVideo uid={uid} title={title} autoStart className="rounded-2xl" />
      </div>
    </div>}
  </>;
}
