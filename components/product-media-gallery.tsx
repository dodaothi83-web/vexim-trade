"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImageIcon, PlayCircle, X, ZoomIn } from "lucide-react";
import type { PublicProductVideo } from "@/lib/public/product-video";

/** Only buyer-shareable URLs projected by the server may reach this component. */
export function ProductMediaGallery({ name, images, thumbnails, video }: {
  name: string; images: string[]; thumbnails?: string[]; video: PublicProductVideo | null;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [zoomPoint, setZoomPoint] = useState("50% 50%");
  const heroRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selected = images[index] ?? images[0];
  const hasThumbnails = images.length > 1;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
      if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (!buttons.length) return;
        if (event.shiftKey && at <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        if (!event.shiftKey && at === buttons.length - 1) { event.preventDefault(); buttons[0].focus(); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; heroRef.current?.focus(); };
  }, [open, images.length]);

  const photo = (path: string) => `/public-media/${path}`;
  return <div className="min-w-0">
    <div className={hasThumbnails ? "grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-3" : ""}>
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 sm:order-2">
        {selected ? <button ref={heroRef} type="button" onClick={() => setOpen(true)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setZoomPoint(`${Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))}% ${Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))}%`);
          }}
          onMouseLeave={() => setZoomPoint("50% 50%")}
          className="group relative h-full w-full cursor-zoom-in overflow-hidden text-left" aria-label={`Enlarge photo of ${name} on this page`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo(selected)} alt={`${name}, photo ${index + 1} of ${images.length}`}
            style={{ transformOrigin: zoomPoint }}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-150 motion-reduce:transition-none" />
          <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-ink-900/80 px-3 py-1.5 text-xs font-semibold text-white"><ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Hover to zoom · Click to enlarge</span><span className="sm:hidden">Tap to enlarge</span></span>
        </button> : <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-400"><ImageIcon className="h-9 w-9" aria-hidden="true" />No product photo available</div>}
      </div>

      {hasThumbnails && <section className="relative min-w-0 sm:order-1" aria-label="Product photos">
        <h2 className="sr-only">Product photos ({images.length})</h2>
        <div className="overflow-x-auto pb-1 sm:absolute sm:inset-0 sm:overflow-x-hidden sm:overflow-y-auto sm:overscroll-contain sm:pb-0 sm:pr-1" role="group" aria-label="Choose a product photo">
          <div className="flex gap-2 sm:flex-col">
            {images.map((path, photoIndex) => <button key={path} type="button" onClick={() => { setIndex(photoIndex); setZoomPoint("50% 50%"); }}
              aria-label={`Show photo ${photoIndex + 1} of ${name}`} aria-pressed={index === photoIndex}
              className={`aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:w-full ${index === photoIndex ? "border-brand-700" : "border-ink-200 hover:border-brand-400"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(thumbnails?.[photoIndex] ?? path)} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>)}
          </div>
        </div>
      </section>}
    </div>

    {video && <section className="mt-3 min-w-0 rounded-xl border border-ink-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-700">Product video</h2>
      {playing ? <iframe src={video.embedUrl} title={video.title} loading="lazy" referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
        className="aspect-video w-full rounded-lg border-0 bg-ink-900" />
        : <button type="button" onClick={() => setPlaying(true)} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-ink-900 px-3 text-center text-sm font-semibold text-white transition hover:bg-brand-800">
          <PlayCircle className="h-9 w-9" aria-hidden="true" />Play video<span className="text-[11px] font-normal text-white/75">Loads from YouTube or Google Drive only when played</span>
        </button>}
    </section>}

    {open && selected && typeof document !== "undefined" && createPortal(
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${name} product photos`} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950/95 p-4 text-white sm:p-8">
        <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close enlarged photo" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"><X className="h-6 w-6" aria-hidden="true" /></button>
        <div className="flex w-full max-w-6xl items-center justify-center gap-2 sm:gap-4">
          {images.length > 1 && <button type="button" onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)} aria-label="Previous photo" className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"><ChevronLeft className="h-6 w-6" aria-hidden="true" /></button>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo(selected)} alt={`${name}, enlarged photo ${index + 1} of ${images.length}`} className="max-h-[80vh] min-w-0 max-w-full rounded-lg object-contain" />
          {images.length > 1 && <button type="button" onClick={() => setIndex((i) => (i + 1) % images.length)} aria-label="Next photo" className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"><ChevronRight className="h-6 w-6" aria-hidden="true" /></button>}
        </div>
        <p className="mt-3 text-xs text-white/80">Photo {index + 1} / {images.length} · Escape to close · Arrow keys to browse</p>
      </div>, document.body,
    )}
  </div>;
}
