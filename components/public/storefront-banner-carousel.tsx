"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Banner 1–3 ảnh trên trang nhà cung cấp; tự chuyển ảnh mỗi 6 giây, dừng khi rê chuột. */
export function StorefrontBannerCarousel({ images, eyebrow, headline }: { images: string[]; eyebrow: string; headline: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;
  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(timer);
  }, [count, paused]);
  if (!count) return null;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);
  return <section aria-roledescription="carousel" aria-label="Supplier banner" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    className="relative h-56 overflow-hidden rounded-2xl bg-ink-900 @2xl:h-[380px]">
    {images.map((src, i) => (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img key={src} src={src} alt="" loading={i === 0 ? "eager" : "lazy"} decoding="async" aria-hidden={i !== index}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${i === index ? "opacity-100" : "opacity-0"}`} />
    ))}
    {(eyebrow || headline) && <div className="absolute inset-0 bg-gradient-to-r from-[#0A0E16]/70 via-[#0A0E16]/30 to-transparent" aria-hidden="true" />}
    {(eyebrow || headline) && <div className="absolute bottom-6 left-6 right-6 max-w-xl text-white @2xl:bottom-10 @2xl:left-10">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">{eyebrow}</p>}
      {headline && <h2 className="mt-2 text-2xl font-light leading-snug @2xl:text-4xl">{headline}</h2>}
    </div>}
    {count > 1 && <>
      <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 text-ink-900 shadow hover:bg-white"><ChevronLeft className="size-5" aria-hidden="true" /></button>
      <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1.5 text-ink-900 shadow hover:bg-white"><ChevronRight className="size-5" aria-hidden="true" /></button>
      <div className="absolute bottom-3 right-4 flex gap-1.5">
        {images.map((src, i) => <button key={src} type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} aria-current={i === index}
          className={`size-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />)}
      </div>
    </>}
  </section>;
}
