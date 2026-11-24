"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { getImageProps } from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon, Play, PlayCircle, X, ZoomIn } from "lucide-react";
import { AplusVideo } from "@/components/public/aplus-video";
import { preconnectStream, streamIntentHandlers } from "@/components/public/stream-warmup";
import { aplusVideoThumbnailUrl } from "@/lib/products/aplus";
import type { PublicProductVideo } from "@/lib/public/product-video";
import { cdnImageSrcSet, isCdnImagePath, publicMediaUrlAt } from "@/lib/media/public-url";

/**
 * Ảnh đã chép lên CDN (`p/<id>/<khoá>/<cỡ>.webp`) đọc thẳng từ media.veximtrade.com với đủ 3 cỡ
 * 400/1024/1600, không qua trình tối ưu ảnh Next.js. Ảnh chưa chép vẫn qua /public-media.
 */
const legacyPhotoUrl = (path: string) => `/public-media/${path}`;

/** URL ảnh cỡ lớn nhất (xem phóng to). */
export const publicPhotoUrl = (path: string) => isCdnImagePath(path) ? publicMediaUrlAt(path, 1600) : legacyPhotoUrl(path);

/**
 * Bề rộng thật của khung ảnh chính: cả khung trừ lề trang (mobile), trừ thêm cột thumbnail 4rem
 * (từ sm), và ~2/5 của khung 6xl trên desktop. Trình duyệt dựa vào đây để chọn bản thu nhỏ vừa
 * khung thay vì tải ảnh gốc 1000–1600px cho một ô 350–650px.
 */
export const PRODUCT_HERO_SIZES = "(min-width: 1024px) 440px, (min-width: 640px) calc(100vw - 124px), calc(100vw - 40px)";

/**
 * Khung ảnh chính rộng ~340–650 CSS px; màn hình mật độ 1–3x cần bản 384–1920px. Bỏ các bản
 * 32–256px và 2048–3840px Next.js sinh sẵn: không bao giờ được chọn mà làm HTML nặng thêm.
 */
const HERO_MIN_WIDTH = 384;
const HERO_MAX_WIDTH = 1920;
const HERO_FALLBACK_WIDTH = 1080;

/** src/srcSet/sizes của ảnh chính qua trình tối ưu ảnh Next.js (bản WebP đúng bề rộng khung). */
export function productHeroImage(path: string): { src: string; srcSet?: string; sizes?: string } {
  if (isCdnImagePath(path)) return { src: publicMediaUrlAt(path, 1024), srcSet: cdnImageSrcSet(path)!, sizes: PRODUCT_HERO_SIZES };
  const { props } = getImageProps({ src: legacyPhotoUrl(path), alt: "", fill: true, sizes: PRODUCT_HERO_SIZES });
  const candidates = (props.srcSet ?? "").split(", ").map((entry) => {
    const [url, descriptor] = entry.split(" ");
    return { url, width: Number.parseInt(descriptor ?? "", 10) };
  }).filter((c) => c.url && c.width >= HERO_MIN_WIDTH && c.width <= HERO_MAX_WIDTH);
  if (!candidates.length) return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
  const fallback = candidates.find((c) => c.width >= HERO_FALLBACK_WIDTH) ?? candidates[candidates.length - 1];
  return { src: fallback.url, srcSet: candidates.map((c) => `${c.url} ${c.width}w`).join(", "), sizes: props.sizes };
}

/** Thumbnail 64px: bản 64/128px (1x/2x) thay vì ảnh nhỏ 640px của kho ảnh; ảnh CDN dùng bản 400px. */
export function productThumbImage(path: string): { src: string; srcSet?: string } {
  if (isCdnImagePath(path)) return { src: publicMediaUrlAt(path, 400) };
  const { props } = getImageProps({ src: legacyPhotoUrl(path), alt: "", width: 64, height: 64 });
  return { src: props.src, srcSet: props.srcSet };
}

/** Chỉ nhận cử chỉ ngang rõ ràng; vuốt dọc hoặc rung nhẹ vẫn để trang cuộn tự nhiên. */
export function productGallerySwipeStep(startX: number, startY: number, endX: number, endY: number): -1 | 0 | 1 {
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/** Only buyer-shareable URLs projected by the server may reach this component. */
export function ProductMediaGallery({ name, images, thumbnails, video, streamVideo = null, actions }: {
  name: string; images: string[]; thumbnails?: string[]; video: PublicProductVideo | null;
  /** Video sản phẩm do nhà cung cấp (gói Premium/Pro) tải lên; nằm cuối dãy ảnh. */
  streamVideo?: { uid: string; title: string } | null;
  actions?: ReactNode;
}) {
  // Video đứng đầu dãy và hiện trước (chưa tự phát, người mua bấm mới phát nên không tốn phút xem).
  // Ảnh giữ chỉ số 0..n-1; ô video dùng chỉ số n để không lẫn với ảnh.
  const videoIndex = streamVideo ? images.length : -1;
  const [index, setIndex] = useState(streamVideo ? images.length : 0);
  const onVideo = index === videoIndex;
  const [videoChosen, setVideoChosen] = useState(false);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [zoomPoint, setZoomPoint] = useState("50% 50%");
  // Crossfade: `shown` là ảnh đã vẽ xong, `incoming` nằm phía trên, mờ dần vào
  // khi tải xong rồi mới thay lớp dưới — không bao giờ nháy trắng khi đổi ảnh.
  const [shown, setShown] = useState<string | null>(images[0] ?? null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [fadedIn, setFadedIn] = useState(false);
  const heroRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const selected = images[index] ?? images[0];
  const hasThumbnails = images.length + (streamVideo ? 1 : 0) > 1;
  // Có video thì mở sẵn kết nối tới Cloudflare Stream ngay lúc tải trang (gần như không tốn gì).
  if (streamVideo) preconnectStream();

  useEffect(() => {
    const target = images[index] ?? images[0] ?? null;
    if (!target || target === shown) {
      setIncoming(null);
      setFadedIn(false);
      return;
    }
    setIncoming(target);
    setFadedIn(false);
  }, [index, images, shown]);

  useEffect(() => {
    if (!incoming) return;
    // Dự phòng khi transitionend không đến (motion-reduce tắt transition, tab ẩn).
    const settle = setTimeout(() => {
      setShown(incoming);
      setIncoming(null);
      setFadedIn(false);
    }, 280);
    return () => clearTimeout(settle);
  }, [incoming]);

  // Preload ảnh trước/sau: bấm mũi tên hay thumbnail kế tiếp là ảnh đã nằm sẵn
  // trong cache trình duyệt → đổi ảnh tức thì thay vì chờ mạng.
  useEffect(() => {
    if (images.length < 2) return;
    for (const path of [images[(index + 1) % images.length], images[(index - 1 + images.length) % images.length]]) {
      if (!path || path === shown) continue;
      const preload = new Image();
      preload.decoding = "async";
      // Cùng srcset/sizes với ảnh chính để trình duyệt tải đúng bản mà hero sẽ dùng.
      const hero = productHeroImage(path);
      if (hero.sizes) preload.sizes = hero.sizes;
      if (hero.srcSet) preload.srcset = hero.srcSet;
      preload.src = hero.src;
    }
  }, [index, images, shown]);


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

  const onTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    suppressClick.current = false;
  };
  const onTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || images.length < 2) return;
    const step = productGallerySwipeStep(start.x, start.y, touch.clientX, touch.clientY);
    if (!step) return;
    suppressClick.current = true;
    setIndex((current) => (current + step + images.length) % images.length);
    setZoomPoint("50% 50%");
  };
  const openHero = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setOpen(true);
  };
  return <div className="min-w-0">
    <div className={hasThumbnails ? "flex flex-col items-stretch gap-2 sm:grid sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-3" : ""}>
      <div className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 sm:order-2">
        {/* A real in-flow square spacer prevents Safari grid rows collapsing when
            all image/zoom children are absolutely positioned. */}
        <div aria-hidden="true" style={{ paddingTop: "100%" }} />
        {actions && <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">{actions}</div>}
        {onVideo && streamVideo ? <div className="absolute inset-0 flex items-center bg-black">
          <AplusVideo key={streamVideo.uid} uid={streamVideo.uid} title={streamVideo.title} autoStart={videoChosen} className="w-full" />
        </div> : selected ? <button ref={heroRef} type="button" onClick={openHero}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          onTouchCancel={() => { touchStart.current = null; suppressClick.current = false; }}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setZoomPoint(`${Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))}% ${Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))}%`);
          }}
          onMouseLeave={() => setZoomPoint("50% 50%")}
          className="group absolute inset-0 h-full w-full cursor-zoom-in touch-pan-y overflow-hidden text-left" aria-label={`Enlarge photo of ${name} on this page`}>
          {/* Hai lớp ảnh: lớp dưới là ảnh đã vẽ xong, lớp trên fade vào khi
              tải xong — đổi ảnh không bao giờ nháy trống. Hover-zoom áp lên
              wrapper để cả hai lớp phóng cùng nhau. */}
          <div className="absolute inset-0 transition-transform duration-200 group-hover:scale-150 motion-reduce:transition-none" style={{ transformOrigin: zoomPoint }}>
            {shown && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img {...productHeroImage(shown)} alt={incoming ? "" : `${name}, photo ${index + 1} of ${images.length}`}
                // Ảnh đầu tiên là LCP của trang: tải ngay với ưu tiên cao, không xếp sau JS.
                loading="eager" fetchPriority={shown === images[0] ? "high" : undefined}
                decoding="async" aria-hidden={incoming ? true : undefined}
                className="absolute inset-0 h-full w-full object-cover" />
            )}
            {incoming && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={incoming}
                {...productHeroImage(incoming)}
                alt={`${name}, photo ${index + 1} of ${images.length}`}
                decoding="async"
                onLoad={() => setFadedIn(true)}
                onError={() => { setIncoming(null); setFadedIn(false); }}
                onTransitionEnd={(event) => {
                  if (event.propertyName !== "opacity" || !fadedIn) return;
                  setShown(incoming);
                  setIncoming(null);
                  setFadedIn(false);
                }}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${fadedIn ? "opacity-100" : "opacity-0"}`} />
            )}
          </div>
          <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-ink-900/80 px-3 py-1.5 text-xs font-semibold text-white"><ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Hover to zoom · Click to enlarge</span><span className="sm:hidden">Tap to enlarge</span></span>
        </button> : <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink-400"><ImageIcon className="h-9 w-9" aria-hidden="true" />No product photo available</div>}
      </div>

      {hasThumbnails && <section className="relative min-w-0 sm:order-1" aria-label="Product photos">
        <h2 className="sr-only">Product photos ({images.length}){streamVideo ? " and video" : ""}</h2>
        <div className="w-full min-w-0 overflow-x-auto pb-1 sm:absolute sm:inset-0 sm:overflow-x-hidden sm:overflow-y-auto sm:overscroll-contain sm:pb-0 sm:pr-1" role="group" aria-label="Choose a product photo">
          <div className="flex w-max gap-2 sm:w-full sm:flex-col">
            {streamVideo && <button type="button" {...streamIntentHandlers(streamVideo.uid)} onClick={() => { setVideoChosen(true); setIndex(videoIndex); }}
              aria-label={`Play product video of ${name}`} aria-pressed={onVideo}
              className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-ink-900 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:w-full ${onVideo ? "border-brand-700" : "border-ink-200 hover:border-brand-400"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aplusVideoThumbnailUrl(streamVideo.uid, 240)} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-7 items-center justify-center rounded-full bg-white/90 text-brand-800 shadow"><Play className="ml-0.5 size-3.5 fill-current" aria-hidden="true" /></span>
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-ink-900/70 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">Video</span>
            </button>}
            {images.map((path, photoIndex) => <button key={path} type="button" onClick={() => { setIndex(photoIndex); setZoomPoint("50% 50%"); }}
              aria-label={`Show photo ${photoIndex + 1} of ${name}`} aria-pressed={index === photoIndex}
              className={`aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:w-full ${index === photoIndex ? "border-brand-700" : "border-ink-200 hover:border-brand-400"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img {...productThumbImage(thumbnails?.[photoIndex] ?? path)} alt="" loading="lazy" width={64} height={64} className="h-full w-full object-cover" />
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
          <img src={publicPhotoUrl(selected)} alt={`${name}, enlarged photo ${index + 1} of ${images.length}`} className="max-h-[80vh] min-w-0 max-w-full rounded-lg object-contain" />
          {images.length > 1 && <button type="button" onClick={() => setIndex((i) => (i + 1) % images.length)} aria-label="Next photo" className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"><ChevronRight className="h-6 w-6" aria-hidden="true" /></button>}
        </div>
        <p className="mt-3 text-xs text-white/80">Photo {index + 1} / {images.length} · Escape to close · Arrow keys to browse</p>
      </div>, document.body,
    )}
  </div>;
}
