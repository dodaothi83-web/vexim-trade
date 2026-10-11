"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

import { cx } from "@/components/ui";

export interface GalleryImage {
  id: string;
  src: string;
  thumb: string;
  alt: string;
  audience: "buyer" | "internal";
}

/** Ảnh lớn xem từng ảnh một, các ảnh nhỏ nằm bên dưới để chuyển ảnh. */
export function ProductImageGallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const current = images[Math.min(index, Math.max(count - 1, 0))];

  if (count === 0) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-200 bg-ink-50 text-ink-400">
        <ImageIcon className="h-8 w-8" />
        <span className="text-[12px]">Chưa có ảnh sản phẩm</span>
      </div>
    );
  }

  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <div className="space-y-2.5">
      <div className="group relative overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={current.alt}
          className="aspect-[4/3] w-full object-contain"
        />
        {current.audience === "internal" && (
          <span className="absolute left-2 top-2 rounded-md bg-ink-900/70 px-2 py-0.5 text-[10.5px] font-semibold text-white">
            Nội bộ — không gửi buyer
          </span>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Ảnh trước"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Ảnh sau"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow hover:bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-md bg-ink-900/70 px-2 py-0.5 text-[11px] font-semibold text-white">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === index}
                className={cx(
                  "block w-full overflow-hidden rounded-lg border-2 bg-ink-50 transition",
                  i === index ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb} alt="" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
