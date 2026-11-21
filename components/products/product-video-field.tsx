"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import { checkVideoFile, uploadStreamVideo } from "@/lib/media/stream-upload-client";
import { aplusVideoEmbedUrl } from "@/lib/products/aplus";
import { saveProductVideoAction } from "@/app/supplier/portal/aplus-actions";

const ACCEPT = "video/mp4,video/quicktime,video/webm";

/**
 * Ô video sản phẩm (Premium/Pro) đặt dưới 6 ô ảnh. Chọn tệp là tải thẳng lên Cloudflare rồi lưu
 * ngay; Basic không dựng ô này. Sản phẩm mới chưa lưu: video tải vào khu chờ, mã video đi theo
 * form qua ô ẩn `pending_video_uid` và được gắn khi lưu sản phẩm.
 */
export function ProductVideoField({ productId, videoUid, editable, canUpload, copy }: {
  productId: string | null;
  videoUid: string | null;
  editable: boolean;
  /** Gói còn quyền video; hết quyền thì chỉ xoá được video cũ. */
  canUpload: boolean;
  copy: AplusMessages;
}) {
  const router = useRouter();
  const t = copy.productVideo;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const pending = !productId;
  const shownUid = pending ? pendingUid : videoUid;
  const disabled = !editable || busy;

  async function choose(file: File) {
    const problem = await checkVideoFile(file, copy.errors, fill, "product");
    if (problem) { setMessage({ ok: false, text: problem }); return; }
    setBusy(true); setProgress(0); setMessage(null);
    try {
      const uid = await uploadStreamVideo(productId, file, setProgress, copy.errors.upload, "product");
      setProgress(null);
      if (!productId) { setPendingUid(uid); setMessage({ ok: true, text: t.savedWithProduct }); return; }
      const result = await saveProductVideoAction(productId, uid);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
    } finally { setBusy(false); setProgress(null); }
  }

  async function remove() {
    if (!window.confirm(t.confirmRemove)) return;
    // Video chờ chưa gắn sản phẩm: bỏ khỏi form, tác vụ định kỳ xoá tệp trên Cloudflare.
    if (!productId) { setPendingUid(null); setMessage(null); return; }
    setBusy(true); setMessage(null);
    const result = await saveProductVideoAction(productId, null).catch(() => ({ ok: false, message: copy.errors.failed }));
    setMessage({ ok: result.ok, text: result.message }); setBusy(false);
    if (result.ok) router.refresh();
  }

  const picker = (label: string, icon: ReactNode, className: string) =>
    <label className={`${className} ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
      {busy && progress !== null ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {busy && progress !== null ? fill(copy.uploadingPct, { pct: progress }) : busy ? copy.saving : label}
      <input type="file" accept={ACCEPT} disabled={disabled} className="sr-only" aria-label={label}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void choose(file); }} />
    </label>;

  return <div>
    {pending && pendingUid && <input type="hidden" name="pending_video_uid" value={pendingUid} />}
    {shownUid
      ? <div className="flex flex-wrap items-start gap-3">
          <div className="aspect-video w-full max-w-[240px] overflow-hidden rounded-md border border-ink-200 bg-black">
            <iframe src={aplusVideoEmbedUrl(shownUid)} title={t.label} allow="accelerometer; gyroscope; encrypted-media; picture-in-picture"
              allowFullScreen className="h-full w-full border-0" />
          </div>
          {editable && <div className="flex flex-col gap-1.5">
            {canUpload && picker(t.replace, <RefreshCw className="size-3.5" aria-hidden="true" />,
              "inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-ink-800 hover:bg-ink-50")}
            <button type="button" disabled={disabled} onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              <Trash2 className="size-3.5" aria-hidden="true" />{t.remove}
            </button>
          </div>}
        </div>
      : editable && canUpload && picker(t.add, <Plus className="size-5" aria-hidden="true" />,
          "flex aspect-video w-[168px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-300 bg-white text-[12px] font-semibold text-ink-500 transition hover:border-brand-400 hover:text-brand-700")}
    <p className="mt-1.5 text-[11.5px] text-ink-500">{t.hint}</p>
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-1 text-[12px] font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </div>;
}
