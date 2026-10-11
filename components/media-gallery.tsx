import Link from "next/link";
import { FileText, ImageIcon, Lock, PlayCircle, ShieldCheck } from "lucide-react";

import { formatBytes } from "@/lib/media/limits";
import { isExpired } from "@/lib/media/readiness";
import type { MediaAsset } from "@/lib/types";
import { Badge, cx, formatDate } from "@/components/ui";

/**
 * Khối chỉ-để-xem cho trang chi tiết: ảnh/tài liệu chia sẻ được với buyer, và
 * phần riêng "Nội bộ" cho giấy tờ xác minh NCC. Tệp nội bộ luôn nằm ở khối riêng
 * để không ai nhầm là tài liệu gửi khách.
 */
export function MediaGallery({
  items,
  title,
  manageHref,
  emptyHint,
  showInternal = true,
}: {
  items: MediaAsset[];
  title: string;
  manageHref?: string;
  emptyHint?: string;
  /** Ẩn hoàn toàn tệp nội bộ với người không có quyền media.internal */
  showInternal?: boolean;
}) {
  const visible = showInternal ? items : items.filter((m) => m.audience !== "internal");
  const shareable = visible.filter((m) => m.audience === "buyer");
  const internal = visible.filter((m) => m.audience === "internal");

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
        <ImageIcon className="h-4 w-4 text-brand-700" />
        <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
        <span className="text-[12px] text-ink-500">
          {shareable.length} chia sẻ buyer · {internal.length} nội bộ
        </span>
        {manageHref && (
          <Link
            href={manageHref}
            className="ml-auto text-[12px] font-semibold text-brand-700 hover:underline"
          >
            Quản lý tệp
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-ink-500">
          {emptyHint ?? "Chưa có hình ảnh hay tài liệu nào."}
        </p>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {shareable.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-400 uppercase">
                Chia sẻ được cho buyer
              </p>
              <ThumbGrid items={shareable} />
            </section>
          )}

          {internal.length > 0 && (
            <section className="rounded-xl border border-ink-200 bg-ink-50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                <Lock className="h-3 w-3" />
                Nội bộ — không gửi buyer
              </p>
              <ul className="space-y-1.5">
                {internal.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    {m.storage_path ? (
                      <a
                        href={`/api/media/file/${m.storage_path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-ink-800 hover:text-brand-700 hover:underline"
                      >
                        {m.caption || "Tài liệu"}
                      </a>
                    ) : (
                      <span className="font-medium text-ink-800">{m.caption || "Tài liệu"}</span>
                    )}
                    <StatusBadge asset={m} />
                    {m.expires_on && (
                      <span className="text-[11.5px] text-ink-500">HSD {formatDate(m.expires_on)}</span>
                    )}
                    {m.bytes ? <span className="text-[11px] text-ink-400">{formatBytes(m.bytes)}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ThumbGrid({ items }: { items: MediaAsset[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((m) => {
        const thumb = m.thumb_path
          ? `/api/media/file/${m.thumb_path}`
          : m.storage_path
            ? `/api/media/file/${m.storage_path}`
            : null;
        const isImage = Boolean(m.mime?.startsWith("image/"));
        return (
          <li key={m.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            <div className="flex h-28 items-center justify-center bg-ink-50">
              {m.kind === "video" ? (
                <a
                  href={m.external_url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1 text-ink-500 hover:text-brand-700"
                >
                  <PlayCircle className="h-7 w-7" />
                  <span className="text-[11.5px] font-semibold">Xem video</span>
                </a>
              ) : isImage && thumb ? (
                <a href={m.storage_path ? `/api/media/file/${m.storage_path}` : "#"} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt={m.caption ?? ""} className="h-28 w-full object-cover" />
                </a>
              ) : m.storage_path ? (
                <a
                  href={`/api/media/file/${m.storage_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1 text-ink-500 hover:text-brand-700"
                >
                  {m.kind === "certificate" ? (
                    <ShieldCheck className="h-7 w-7" />
                  ) : (
                    <FileText className="h-7 w-7" />
                  )}
                  <span className="text-[11.5px] font-semibold">Mở PDF</span>
                </a>
              ) : (
                <FileText className="h-7 w-7 text-ink-300" />
              )}
            </div>
            <div className="px-2.5 py-2">
              <p className="truncate text-[12px] font-medium text-ink-800">{m.caption || "—"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <StatusBadge asset={m} />
                {m.bytes ? <span className="text-[10.5px] text-ink-400">{formatBytes(m.bytes)}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ asset }: { asset: MediaAsset }) {
  const expired = isExpired(asset);
  if (expired) return <Badge className="bg-red-50 text-red-700">Hết hạn</Badge>;
  if (asset.status === "checked") return <Badge className="bg-emerald-50 text-emerald-700">Đã kiểm tra</Badge>;
  return <Badge className={cx("bg-amber-50 text-amber-700")}>Chưa xác minh</Badge>;
}

/** Ảnh nhỏ hiển thị trong danh sách sản phẩm. */
export function MediaThumb({ asset, size = "h-12 w-12" }: { asset?: MediaAsset | null; size?: string }) {
  if (!asset) {
    return (
      <span
        className={cx(
          "flex shrink-0 items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50",
          size,
        )}
        title="Chưa có ảnh"
      >
        <ImageIcon className="h-4 w-4 text-ink-300" />
      </span>
    );
  }
  const thumb = asset.thumb_path
    ? `/api/media/file/${asset.thumb_path}`
    : asset.storage_path
      ? `/api/media/file/${asset.storage_path}`
      : null;
  if (!thumb || !asset.mime?.startsWith("image/")) {
    return (
      <span className={cx("flex shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-ink-50", size)}>
        <FileText className="h-4 w-4 text-ink-400" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumb}
      alt={asset.caption ?? ""}
      className={cx("shrink-0 rounded-lg border border-ink-200 object-cover", size)}
    />
  );
}
