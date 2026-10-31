"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  CircleAlert,
  Eye,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Lock,
  PlayCircle,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { addMediaLinkAction, deleteMediaAction, updateMediaAction } from "@/app/actions";
import { setFeaturedProductImageAction } from "@/app/crm/products/[slug]/edit/featured-image-action";
import { MEDIA_ACCEPT, prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";
import { formatBytes, MEDIA_KINDS } from "@/lib/media/limits";
import { isExpired } from "@/lib/media/readiness";
import type { MediaAsset, MediaAudience, MediaKind, MediaOwnerType, MediaStatus } from "@/lib/types";
import { Badge, Button, cx, formatDate } from "@/components/ui";
import { useToast } from "@/components/toast";

// Không còn trạng thái "chờ kiểm tra / đã kiểm tra": ảnh nhà cung cấp tải lên là chia sẻ
// cho người mua ngay. Chỉ còn hết hạn theo ngày.
const EXPIRED_META = { label: "Hết hạn", className: "bg-red-50 text-red-700" };

const KIND_ICON: Record<MediaKind, typeof ImageIcon> = {
  image: ImageIcon,
  catalogue: FileText,
  certificate: ShieldCheck,
  document: Lock,
  video: PlayCircle,
};

export function MediaManager({
  ownerType,
  ownerId,
  supplierId,
  items,
  featuredMediaId,
  allowInternal = true,
  readOnly = false,
  title,
  note,
  scopeHint,
  defaultKind,
}: {
  ownerType: MediaOwnerType;
  ownerId: string;
  /** Chỉ dùng khi ownerType = product: NCC chứa sản phẩm (để server kiểm tra) */
  supplierId?: string;
  items: MediaAsset[];
  /** Product-only: staff-chosen buyer-facing cover image. */
  featuredMediaId?: string | null;
  allowInternal?: boolean;
  readOnly?: boolean;
  title?: string;
  note?: string;
  /** Prominent scope explanation, separate from the compact file-count header. */
  scopeHint?: string;
  /** Start with the evidence type expected by this audit step. */
  defaultKind?: MediaKind;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<MediaKind>(defaultKind ?? "image");
  const [audience, setAudience] = useState<MediaAudience>(
    ownerType === "verification" ? "internal" : ownerType === "supplier" ? "buyer" : "buyer",
  );
  const [caption, setCaption] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const effectiveAudience: MediaAudience = ownerType === "verification" || kind === "document" ? "internal" : audience;
  const accept = kind === "image" ? MEDIA_ACCEPT.split(",").slice(0, 3).join(",") : MEDIA_ACCEPT;

  function feedback(results: { name: string; ok: boolean; message: string }[]) {
    for (const r of results) {
      toast.push({ kind: r.ok ? "success" : "error", title: `${r.name}: ${r.message}` });
    }
  }

  /** Tải một tệp: ảnh được nén + tạo ảnh nhỏ ngay tại trình duyệt. */
  async function uploadOne(file: File) {
    const form = new FormData();
    form.set("ownerType", ownerType);
    form.set("ownerId", ownerId);
    if (supplierId) form.set("supplierId", supplierId);
    form.set("kind", kind);
    form.set("audience", effectiveAudience);
    if (caption.trim()) form.set("caption", caption.trim());
    if (expiresOn) form.set("expiresOn", expiresOn);

    let upload: File = file;
    if (kind === "image") {
      try {
        const prepared = await prepareImage(file);
        upload = new File([prepared.main], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
        });
        form.set(`thumb:${upload.name}`, new File([prepared.thumb], "thumb.jpg", { type: "image/jpeg" }), "thumb.jpg");
        form.set(`width:${upload.name}`, String(prepared.width));
        form.set(`height:${upload.name}`, String(prepared.height));
      } catch {
        // Không nén được (ảnh lạ/trình duyệt cũ) thì gửi nguyên tệp, server vẫn kiểm tra
      }
    }
    form.set("files", upload, upload.name);

    const res = await fetch("/api/media/upload", { method: "POST", body: form });
    const data = await readUploadResponse<{
      results?: { name: string; ok: boolean; message: string }[];
      message?: string;
    }>(res);

    if (data.results?.length) return data.results;
    return [{ name: file.name, ok: false, message: data.message ?? `Tải lên thất bại (HTTP ${res.status}).` }];
  }

  async function onFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setBusy(true);
    const collected: { name: string; ok: boolean; message: string }[] = [];
    for (const file of list) {
      try {
        collected.push(...(await uploadOne(file)));
      } catch (err) {
        collected.push({
          name: file.name,
          ok: false,
          message: err instanceof Error ? err.message : "Lỗi không xác định",
        });
      }
    }
    feedback(collected);
    setBusy(false);
    setCaption("");
    setExpiresOn("");
    router.refresh();
  }

  async function addVideo() {
    if (!videoUrl.trim()) {
      toast.push({ kind: "error", title: "Chưa dán link video." });
      return;
    }
    setBusy(true);
    const res = await addMediaLinkAction({
      ownerType,
      ownerId,
      url: videoUrl,
      caption: caption.trim() || null,
      audience: effectiveAudience,
    });
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    if (res.ok) {
      setVideoUrl("");
      setCaption("");
      router.refresh();
    }
  }

  async function patch(id: string, next: Parameters<typeof updateMediaAction>[1]) {
    const res = await updateMediaAction(id, next);
    toast.push({ kind: res.ok ? "success" : "error", title: res.ok ? "Đã lưu thay đổi tệp." : res.message });
    router.refresh();
  }

  async function chooseCover(mediaId: string | null) {
    setBusy(true);
    try {
      const res = await setFeaturedProductImageAction(ownerId, mediaId);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) router.refresh();
    } catch { toast.push({ kind: "error", title: "Không lưu được ảnh đại diện." }); }
    finally { setBusy(false); }
  }

  async function remove(asset: MediaAsset) {
    const label = asset.caption || asset.external_url || "tệp này";
    if (!window.confirm(`Xoá "${label}"? Tệp sẽ bị xoá khỏi kho lưu trữ.`)) return;
    const res = await deleteMediaAction(asset.id);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
        <ImageIcon className="h-4 w-4 text-brand-700" />
        <h2 className="text-[15px] font-bold text-ink-900">{title ?? (ownerType === "verification" ? "Bằng chứng riêng của đợt kiểm" : ownerType === "supplier" ? "Kho ảnh & tài liệu chung của nhà cung cấp" : "Ảnh & tài liệu sản phẩm")}</h2>
        <span className="text-[12px] text-ink-500">
          {items.length ? `${items.length} tệp` : "chưa có tệp nào"}
        </span>
        {note && <span className="ml-auto text-[11.5px] text-ink-400">{note}</span>}
      </div>
      {scopeHint && <p className="border-b border-brand-100 bg-brand-50/60 px-4 py-3 text-[12.5px] leading-relaxed text-brand-900">{scopeHint}</p>}
      {ownerType === "product" && !readOnly && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 bg-brand-50/50 px-4 py-3 text-[12.5px] text-brand-900">
        <p>Ảnh đại diện sản phẩm: chọn trong các ảnh đã <strong>chia sẻ người mua</strong> bên dưới. Nếu chưa chọn, dùng ảnh hợp lệ đầu tiên. Chọn ảnh không tự công khai sản phẩm.</p>
        {featuredMediaId && <button type="button" disabled={busy} onClick={() => void chooseCover(null)} className="shrink-0 font-semibold underline disabled:opacity-50">Dùng ảnh đầu tiên</button>}
      </div>}

      {/* Khu tải lên */}
      {!readOnly && <div className="border-b border-ink-200 bg-ink-50/60 px-4 py-3">
        <p className="mb-2.5 text-[11.5px] text-ink-500">Tệp và các thay đổi trong khu này được lưu ngay, tách biệt với nút Lưu thay đổi của hồ sơ.</p>
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {MEDIA_KINDS.filter((k) => ownerType !== "verification" || ["image", "document", "certificate", "video"].includes(k.value)).map((k) => (
            <button
              key={k.value}
              type="button"
              title={k.hint}
              onClick={() => setKind(k.value)}
              className={cx(
                "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition",
                kind === k.value
                  ? "bg-white text-ink-900 shadow-card"
                  : "text-ink-500 hover:bg-white/70 hover:text-ink-800",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowInternal && ownerType !== "verification" && (
            <div className="flex overflow-hidden rounded-lg border border-ink-200 bg-white">
              <button
                type="button"
                disabled={kind === "document"}
                onClick={() => setAudience("buyer")}
                className={cx(
                  "flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold transition",
                  effectiveAudience === "buyer" ? "bg-brand-600 text-white" : "text-ink-600",
                  kind === "document" && "opacity-40",
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Chia sẻ buyer
              </button>
              <button
                type="button"
                disabled={kind === "document"}
                onClick={() => setAudience("internal")}
                className={cx(
                  "flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold transition",
                  effectiveAudience === "internal" ? "bg-ink-900 text-white" : "text-ink-600",
                )}
              >
                <Lock className="h-3.5 w-3.5" />
                Nội bộ
              </button>
            </div>
          )}
          <input
            className="input w-56 flex-1 py-1.5 text-[12.5px]"
            placeholder="Chú thích (VD: ảnh bao bì 25kg)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          {(kind === "certificate" || kind === "document") && (
            <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
              Hết hạn
              <input
                type="date"
                className="input py-1.5 text-[12.5px]"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </label>
          )}
        </div>

        {kind === "video" ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 py-1.5 text-[12.5px]"
              placeholder={ownerType === "verification" ? "Dán link video YouTube / Drive (quyền xem phụ thuộc nền tảng lưu video)" : "Dán link YouTube / Drive mô tả sản phẩm, dây chuyền, nhà máy…"}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <Button variant="soft" size="sm" disabled={busy} onClick={() => void addVideo()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Thêm link
            </Button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFiles(e.dataTransfer.files);
            }}
            className={cx(
              "mt-2.5 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition",
              dragging ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white",
            )}
          >
            <Upload className="h-4 w-4 text-ink-400" />
            <p className="text-[12.5px] text-ink-600">
              Kéo-thả tệp vào đây hoặc
              <button
                type="button"
                className="ml-1 font-semibold text-brand-700 hover:underline"
                onClick={() => fileRef.current?.click()}
              >
                chọn tệp
              </button>
              <span className="ml-1 text-ink-400">
                — {kind === "image" ? "JPG/PNG/WebP, ảnh được nén tự động" : kind === "document" || kind === "certificate" ? "PDF hoặc ảnh JPG/PNG/WebP tối đa 15MB (ảnh lớn chọn tab Ảnh để nén)" : "PDF tối đa 15MB"}
              </span>
            </p>
            {busy && (
              <span className="flex items-center gap-1.5 text-[12px] text-ink-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang xử lý…
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>}

      {/* Danh sách tệp */}
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-ink-500">
          {ownerType === "verification" ? "Chưa có bằng chứng. Hãy tải ảnh, chứng từ hoặc thêm link video trước khi nộp duyệt." : "Chưa có hình ảnh hay tài liệu nào."}
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {items.map((m) => (
            <MediaRow
              key={m.id}
              asset={m}
              readOnly={readOnly}
              busy={busy}
              featured={ownerType === "product" && m.id === featuredMediaId}
              canChooseCover={ownerType === "product" && !readOnly && !busy && m.kind === "image" && m.audience === "buyer" && !!m.storage_path && !isExpired(m)}
              onChooseCover={() => void chooseCover(m.id)}
              onPatch={(next) => void patch(m.id, next)}
              onRemove={() => void remove(m)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaRow({
  asset,
  readOnly,
  busy,
  featured,
  canChooseCover,
  onChooseCover,
  onPatch,
  onRemove,
}: {
  asset: MediaAsset;
  readOnly: boolean;
  busy: boolean;
  featured: boolean;
  canChooseCover: boolean;
  onChooseCover: () => void;
  onPatch: (patch: {
    caption?: string | null;
    status?: MediaStatus;
    audience?: MediaAudience;
    expires_on?: string | null;
  }) => void;
  onRemove: () => void;
}) {
  const [caption, setCaption] = useState(asset.caption ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const expired = isExpired(asset);
  const status: MediaStatus = expired ? "expired" : asset.status;
  const Icon = KIND_ICON[asset.kind];
  const thumbUrl = asset.thumb_path
    ? `/api/media/file/${asset.thumb_path}`
    : asset.storage_path
      ? `/api/media/file/${asset.storage_path}`
      : null;
  const fileUrl = asset.storage_path ? `/api/media/file/${asset.storage_path}` : null;
  const canPreview = asset.kind === "image" && !!fileUrl;
  const previewName = asset.caption?.trim() || (asset.owner_type === "product" ? "Ảnh sản phẩm" : "Ảnh đính kèm");

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
        {canPreview ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            aria-label={`Xem ${previewName} ngay trên trang`}
            title="Xem ảnh ngay trên trang"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl ?? fileUrl ?? ""} alt={previewName} className="h-full w-full object-cover" />
          </button>
        ) : asset.kind === "video" ? (
          <PlayCircle className="h-6 w-6 text-ink-400" />
        ) : (
          <Icon className="h-6 w-6 text-ink-400" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="bg-ink-100 text-ink-600">
            {MEDIA_KINDS.find((k) => k.value === asset.kind)?.label ?? asset.kind}
          </Badge>
          {status === "expired" && <Badge className={EXPIRED_META.className}>{EXPIRED_META.label}</Badge>}
          {asset.audience === "internal" ? (
            <Badge className="bg-ink-900 text-white">Ẩn với người mua</Badge>
          ) : (
            <Badge className="bg-brand-50 text-brand-700">Hiện với người mua</Badge>
          )}
          {featured && <Badge className="bg-amber-50 font-semibold text-amber-800">Ảnh đại diện</Badge>}
          {canChooseCover && !featured && <button type="button" onClick={onChooseCover} className="rounded-full border border-brand-200 px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-800 hover:border-brand-500 hover:bg-brand-50">Chọn làm ảnh đại diện</button>}
          {asset.expires_on && (
            <span className="text-[11.5px] text-ink-500">HSD {formatDate(asset.expires_on)}</span>
          )}
          {asset.bytes ? <span className="text-[11.5px] text-ink-400">{formatBytes(asset.bytes)}</span> : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            className="input w-64 flex-1 py-1 text-[12.5px]"
            value={caption}
            readOnly={readOnly || busy}
            placeholder="Chú thích"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => {
              if (!readOnly && (asset.caption ?? "") !== caption) onPatch({ caption: caption || null });
            }}
          />
          {asset.owner_type !== "verification" && asset.kind !== "document" && (
            <select
              className="input w-auto py-1 text-[12px]"
              value={asset.audience}
              disabled={readOnly || busy}
              onChange={(e) => onPatch({ audience: e.target.value as MediaAudience })}
            >
              <option value="buyer">Hiện với người mua</option>
              <option value="internal">Ẩn (nội bộ)</option>
            </select>
          )}
          {asset.kind === "video" && asset.external_url && (
            <a
              className="text-[12px] font-semibold text-brand-700 hover:underline"
              href={asset.external_url}
              target="_blank"
              rel="noreferrer"
            >
              Mở link
            </a>
          )}
          {fileUrl && (canPreview ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="text-[12px] font-semibold text-brand-700 hover:underline"
            >
              Xem ảnh
            </button>
          ) : (
            <a
              className="text-[12px] font-semibold text-brand-700 hover:underline"
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
            >
              Xem tệp
            </a>
          ))}
          {!readOnly && <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-red-600 hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xoá
          </button>}
        </div>
      </div>
      {previewOpen && fileUrl && <MediaImageLightbox src={fileUrl} name={previewName} onClose={closePreview} />}
    </li>
  );
}

function MediaImageLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return typeof document === "undefined" ? null : createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 p-4 sm:p-8"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Đóng ảnh"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <figure className="flex min-h-0 max-w-full flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="max-h-[82vh] max-w-full rounded-lg object-contain" />
        <figcaption className="mt-3 max-w-prose text-center text-sm text-white/85">{name}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}

/** Nhắc nhở dùng ở trang sản phẩm: còn thiếu gì để được đánh dấu sẵn sàng. */
export function ReadyHint({ ready, shareable }: { ready: boolean; shareable: number }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2 rounded-xl border p-3 text-[12.5px]",
        ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {ready ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>
        {ready ? (
          <>
            Đủ điều kiện gửi buyer ({shareable} tệp chia sẻ được). Video vẫn là tuỳ chọn.
          </>
        ) : (
          <>
            Chưa thể đánh dấu <strong>“Sẵn sàng gửi người mua”</strong>: cần ít nhất 1 ảnh sản phẩm
            hoặc catalogue ở chế độ <strong>Chia sẻ người mua</strong> và chưa hết hạn.
          </>
        )}
      </span>
    </div>
  );
}
