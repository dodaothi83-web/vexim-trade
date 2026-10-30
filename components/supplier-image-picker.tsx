"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";

import { prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";

interface Props {
  supplierId: string;
  kind: "profile" | "cover";
  current?: string | null;
  label: string;
  hint: string;
  ratioClass?: string;
}

/**
 * Upload trực tiếp ảnh đại diện / ảnh bìa cho NCC.
 * Nén ở client (prepareImage) rồi POST /api/suppliers/:id/profile-image.
 */
export function SupplierImagePicker({ supplierId, kind, current, label, hint, ratioClass }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(current ?? null);

  const publicUrl = (p: string) => {
    if (!p) return "";
    if (p.startsWith("http")) return p;
    return `/public-media/${p.replace(/^\//, "")}`;
  };

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    start(async () => {
      try {
        const prepared = await prepareImage(f);
        if (prepared.main.size > 3 * 1024 * 1024) {
          throw new Error("Ảnh sau khi nén vẫn vượt 3 MB. Vui lòng chọn ảnh nhỏ hơn.");
        }
        const fd = new FormData();
        fd.append("file", new File([prepared.main], f.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        fd.append("kind", kind);
        fd.append("thumb:" + f.name, new File([prepared.thumb], "thumb.jpg", { type: "image/jpeg" }));
        fd.append("width:" + f.name, String(prepared.width));
        fd.append("height:" + f.name, String(prepared.height));
        const res = await fetch(`/api/suppliers/${supplierId}/profile-image`, { method: "POST", body: fd });
        const j = await readUploadResponse<{ ok?: boolean; path?: string; message?: string }>(res);
        if (!res.ok || !j.ok || !j.path) { setErr(j.message ?? `Không tải được ảnh (HTTP ${res.status}).`); return; }
        setPreview(j.path);
        router.refresh();
      } catch (err) {
        setErr(err instanceof Error ? err.message : "Lỗi");
      }
    });
    e.target.value = "";
  }

  async function remove() {
    setErr(null);
    start(async () => {
      try {
        const res = await fetch(`/api/suppliers/${supplierId}/profile-image?kind=${kind}`, { method: "DELETE" });
        const j = await readUploadResponse<{ ok?: boolean; message?: string }>(res);
        if (!res.ok || !j.ok) { setErr(j.message ?? `Không xoá được ảnh (HTTP ${res.status}).`); return; }
        setPreview(null);
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Lỗi khi xoá ảnh.");
      }
    });
  }

  return (
    <div>
      <p className="mb-1 text-[12.5px] font-semibold text-ink-700">{label}</p>
      <div
        className={
          "group relative flex items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-ink-200 bg-ink-50/40 " +
          (ratioClass ?? (kind === "cover" ? "aspect-[3/1]" : "aspect-square max-w-[180px]"))
        }
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicUrl(preview)} alt="" className="h-full w-full object-cover" />
        ) : (
          <p className="px-4 text-center text-[12px] text-ink-400">{hint}</p>
        )}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink-900/0 opacity-0 transition group-hover:bg-ink-900/40 group-hover:opacity-100">
          <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-sm bg-white text-ink-800">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Tải lên
          </button>
          {preview && (
            <button type="button" onClick={remove} className="btn btn-sm bg-white text-rose-700">
              <Trash2 className="h-3.5 w-3.5" /> Xoá
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {err && <p className="mt-1 text-[12px] text-rose-700">{err}</p>}
    </div>
  );
}
