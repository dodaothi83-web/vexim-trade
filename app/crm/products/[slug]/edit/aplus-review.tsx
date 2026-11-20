"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { aplusVideoThumbnailUrl, type AplusModule, type ProductGalleryVideo } from "@/lib/products/aplus";
import { removeAplusModuleAction, removeGalleryVideoAction } from "./aplus-actions";

const TYPE_LABEL: Record<AplusModule["type"], string> = { image: "Ảnh lớn", image_text: "Ảnh kèm chữ", gallery: "Lưới ảnh", text: "Đoạn chữ", video: "Video" };

/**
 * Video sản phẩm và nội dung A+ nhà cung cấp đã lưu (hiện ngay cho người mua). Nhân viên gỡ được
 * video hoặc từng khối A+ vi phạm.
 */
export function CrmAplusReview({ productId, modules, galleryVideo = null, visible, canManage }: {
  productId: string; modules: AplusModule[]; galleryVideo?: ProductGalleryVideo | null; visible: boolean; canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const img = (path: string) => `/api/crm/aplus?path=${encodeURIComponent(path)}`;
  if (!modules.length && !galleryVideo) return null;
  return <section id="product-aplus" className="card scroll-mt-24 p-5" aria-label="Video và nội dung A+">
    <h2 className="text-sm font-bold text-ink-900">Video và nội dung A+</h2>
    <p className="mt-0.5 text-xs text-ink-500">{visible ? "Đang hiện cho người mua: video trong dãy ảnh, A+ thay cho mô tả chi tiết bằng chữ." : "Gói nhà cung cấp không còn quyền video và A+: đang ẩn, người mua thấy lại mô tả chi tiết bằng chữ."} Gỡ phần có liên hệ trực tiếp hoặc nội dung sai.</p>
    {galleryVideo && <div className="mt-3 flex flex-wrap items-start gap-3 rounded-lg border border-ink-200 p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={aplusVideoThumbnailUrl(galleryVideo.video_uid, 160)} alt="" className="h-14 w-20 rounded bg-ink-900 object-cover ring-1 ring-ink-200" />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-ink-900">Video sản phẩm</p>
        <a href={`https://iframe.videodelivery.net/${galleryVideo.video_uid}`} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-brand-700 underline">Xem video</a>
      </div>
      {canManage && <button type="button" disabled={!!busy} className="btn btn-soft btn-sm"
        onClick={async () => {
          if (!window.confirm("Gỡ video này khỏi sản phẩm?")) return;
          setBusy("video"); setMessage(null);
          const result = await removeGalleryVideoAction(productId);
          setMessage({ ok: result.ok, text: result.message }); setBusy(null);
          if (result.ok) router.refresh();
        }}>{busy === "video" ? "Đang gỡ…" : "Gỡ video"}</button>}
    </div>}
    {modules.length > 0 && <p className="mt-3 text-xs font-semibold text-ink-700">Nội dung A+ ({modules.length} khối)</p>}
    <ul className="mt-2 space-y-2">
      {modules.map((m, index) => {
        const paths = m.type === "image" || m.type === "image_text" ? [m.image_path] : m.type === "gallery" ? m.items.map((i) => i.image_path) : [];
        const text = m.type === "image" ? m.caption : m.type === "gallery" ? m.items.map((i) => i.caption).filter(Boolean).join(" · ") : m.type === "video" ? m.title : `${m.title}${m.body ? ` — ${m.body}` : ""}`;
        return <li key={m.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-ink-200 p-2.5">
          <div className="flex shrink-0 gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {paths.slice(0, 4).map((p) => <img key={p} src={img(p)} alt="" className="h-14 w-20 rounded object-cover ring-1 ring-ink-200" />)}
            {m.type === "video" && <span className="flex h-14 w-20 items-center justify-center rounded bg-ink-900 text-[10px] font-mono text-white">{m.video_uid.slice(0, 8)}…</span>}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-ink-900">{index + 1}. {TYPE_LABEL[m.type]}</p>
            {text && <p className="mt-0.5 line-clamp-3 break-words text-ink-600">{text}</p>}
          </div>
          {canManage && <button type="button" disabled={!!busy} className="btn btn-soft btn-sm"
            onClick={async () => {
              if (!window.confirm("Gỡ khối này khỏi trang sản phẩm?")) return;
              setBusy(m.id); setMessage(null);
              const result = await removeAplusModuleAction(productId, m.id);
              setMessage({ ok: result.ok, text: result.message }); setBusy(null);
              if (result.ok) router.refresh();
            }}>{busy === m.id ? "Đang gỡ…" : "Gỡ khối"}</button>}
        </li>;
      })}
    </ul>
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;
}
