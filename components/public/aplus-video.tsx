"use client";

import { useState } from "react";
import { Play } from "lucide-react";

import { aplusVideoEmbedUrl, aplusVideoThumbnailUrl } from "@/lib/products/aplus";

/**
 * Video Cloudflare Stream trên trang người mua (video sản phẩm và video A+): chỉ hiện ảnh bìa tĩnh; trình phát Cloudflare (vài trăm KB
 * JavaScript) chỉ nạp khi người mua bấm phát, nên trang sản phẩm không chậm đi.
 */
export function AplusVideo({ uid, title, autoStart = false, className = "rounded-xl" }: {
  uid: string; title: string;
  /** Người mua đã chủ động chọn video (bấm ô video trong dãy ảnh): phát luôn, không cần bấm lần hai. */
  autoStart?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(autoStart);
  return <div className={`relative aspect-video overflow-hidden bg-black ${className}`}>
    {playing
      ? <iframe src={aplusVideoEmbedUrl(uid, { autoplay: true })} title={title}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
      : <button type="button" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`} className="group absolute inset-0 h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aplusVideoThumbnailUrl(uid)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
          <span className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-white/90 text-brand-800 shadow-lg transition group-hover:scale-105">
            <Play className="ml-1 size-7 fill-current" aria-hidden="true" />
          </span>
        </button>}
  </div>;
}
