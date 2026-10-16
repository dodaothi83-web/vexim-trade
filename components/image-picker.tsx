"use client";

import { useRef, useState, useTransition } from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";

import { prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";

/**
 * Upload ảnh cho resource (vd category hero), có ô alt text riêng.
 * Luồng: chọn file → client-side nén 1600px/JPEG 0.85 → POST /api/<endpoint> →
 * trả về publicUrl (vd /public-media/categories/<uuid>.jpg).
 */
export function ImagePicker({
  value,
  altValue,
  onAltChange,
  onChange,
  uploadUrl,
  disabled,
  aspect = "aspect-[21/9]",
  hint,
}: {
  value: string | null;
  altValue: string;
  onAltChange: (v: string) => void;
  onChange: (url: string | null) => void;
  uploadUrl: string;
  disabled?: boolean;
  aspect?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<"idle" | "preparing" | "uploading" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleFile(file: File) {
    setErr(null);
    setProgress("preparing");
    try {
      const prepared = await prepareImage(file);
      setProgress("uploading");
      const fd = new FormData();
      fd.append("file", prepared.main, "image.jpg");
      if (prepared.thumb) fd.append("thumb", prepared.thumb, "thumb.jpg");
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const data = await readUploadResponse<{ ok?: boolean; url?: string; publicUrl?: string; error?: string; message?: string }>(res);
      if (!res.ok || !data.ok || !(data.url ?? data.publicUrl)) {
        throw new Error(data.error || data.message || `Không tải được ảnh (HTTP ${res.status}).`);
      }
      startTransition(() => onChange(data.url ?? data.publicUrl ?? null));
      setProgress("idle");
    } catch (e) {
      setProgress("error");
      setErr(e instanceof Error ? e.message : "Lỗi upload");
    }
  }

  return (
    <div>
      <div className={"relative overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-50/60 " + aspect}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={altValue || ""} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-400">
            <ImageIcon className="h-6 w-6" />
            <p className="text-[12px]">Chưa có ảnh — chọn file để upload.</p>
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            type="button"
            disabled={disabled || progress !== "idle"}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[11.5px] font-semibold text-ink-700 shadow ring-1 ring-ink-200 hover:bg-white"
          >
            {progress === "preparing" || progress === "uploading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {progress === "preparing" ? "Đang nén…" : progress === "uploading" ? "Đang tải…" : value ? "Thay ảnh" : "Chọn ảnh"}
          </button>
          {value && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-ink-600 shadow ring-1 ring-ink-200 hover:text-ink-900"
              aria-label="Xoá ảnh"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wider text-ink-500">Alt text (cho SEO & screen reader) <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-amber-700">Admin: ô tiếng Anh — mô tả ảnh</span></span>
          <input
            type="text"
            value={altValue}
            onChange={(e) => onAltChange(e.target.value)}
            className="input w-full text-[13px]"
            placeholder="Vietnamese cashew kernels graded WW240"
          />
        </label>
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          {hint || "Ảnh sẽ tự nén về chiều rộng tối đa 1600px, định dạng JPEG 0.85. File gốc không được dùng trên trang public — upload sẽ đi qua kho media."}
        </p>
      </div>
      {err && <p className="mt-1 text-[12px] text-red-600">{err}</p>}
      {/* hidden input chứa path để form gửi đi */}
      <input type="hidden" name="hero_image" value={value ?? ""} />
    </div>
  );
}
