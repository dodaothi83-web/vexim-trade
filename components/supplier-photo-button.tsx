"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";

interface Props {
  kind: "profile" | "cover";
  hasImage: boolean;
  className?: string;
}

/**
 * Nút “+” đặt ngay trên ảnh đại diện và ảnh bìa để nhà cung cấp tự thêm hoặc đổi ảnh.
 *
 * Ảnh được nén ở client trước khi gửi; server vẫn kiểm magic bytes và dung lượng.
 * Sau khi lưu xong thì refresh để khung hồ sơ dựng lại ảnh từ dữ liệu thật.
 */
export function SupplierPhotoButton({ kind, hasImage, className }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = kind === "cover" ? "ảnh bìa" : "ảnh đại diện";

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const prepared = await prepareImage(file);
        if (prepared.main.size > 3 * 1024 * 1024) {
          throw new Error("Ảnh sau khi nén vẫn vượt 3 MB. Vui lòng chọn ảnh nhỏ hơn.");
        }
        const form = new FormData();
        form.append("file", new File([prepared.main], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        form.append("kind", kind);
        const res = await fetch("/api/supplier-portal/profile-image", { method: "POST", body: form });
        const data = await readUploadResponse<{ ok?: boolean; message?: string }>(res);
        if (!res.ok || !data.ok) throw new Error(data.message ?? `Không tải được ảnh (HTTP ${res.status}).`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được ảnh.");
      }
    });
  }

  return <>
    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
      aria-label={hasImage ? `Đổi ${label}` : `Thêm ${label}`}
      title={hasImage ? `Đổi ${label}` : `Thêm ${label}`}
      className={className ?? "absolute right-3 bottom-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/95 text-ink-800 shadow-md transition hover:bg-white hover:text-brand-800 disabled:opacity-60"}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
    </button>
    <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
    {error && <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-semibold text-rose-900 shadow-lg">
      {error}
    </div>}
  </>;
}
