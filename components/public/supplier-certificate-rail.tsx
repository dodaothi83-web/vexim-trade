"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Maximize2, X } from "lucide-react";

import type { PublicSupplierCertificate } from "@/lib/public/certificates";

/**
 * Danh sách chứng nhận trưng bày ngang trên hồ sơ nhà cung cấp.
 *
 * Mỗi thẻ là ảnh chứng nhận thật (mở bản đầy đủ ngay trên trang), bên dưới là tên giấy và
 * ngày hết hạn — đúng thứ người mua cần đối chiếu trước khi hỏi giá. Giấy scan PDF
 * không có bản ảnh công khai nên thẻ rơi về dạng bìa tài liệu; vẫn giữ chỗ trong
 * danh sách để không ai hiểu là nhà cung cấp thiếu giấy.
 *
 * Danh sách trượt ngang theo từng thẻ (snap), có nút mũi tên cho người dùng chuột và
 * bàn phím; điện thoại vuốt tay như bình thường.
 */
const CARD_GAP_PX = 12;

export function SupplierCertificateRail({ certificates }: { certificates: PublicSupplierCertificate[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<PublicSupplierCertificate | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  const syncEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setScrollable(max > 4);
    setCanBack(rail.scrollLeft > 4);
    setCanForward(rail.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    syncEdges();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", syncEdges, { passive: true });
    window.addEventListener("resize", syncEdges);
    return () => {
      rail.removeEventListener("scroll", syncEdges);
      window.removeEventListener("resize", syncEdges);
    };
  }, [syncEdges]);

  const step = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild as HTMLElement | null;
    const distance = (card?.offsetWidth ?? 240) + CARD_GAP_PX;
    rail.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          <span className="sm:hidden">Swipe to see every certificate · tap one to open it</span>
          <span className="hidden sm:inline">Select a certificate to open the full image.</span>
        </p>
        {scrollable && (
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <button type="button" onClick={() => step(-1)} disabled={!canBack} aria-label="Previous certificates"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-35 disabled:hover:border-ink-200 disabled:hover:text-ink-700">
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => step(1)} disabled={!canForward} aria-label="Next certificates"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-35 disabled:hover:border-ink-200 disabled:hover:text-ink-700">
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div ref={railRef} tabIndex={0} role="region"
        aria-label={`Certificates on file (${certificates.length})`}
        className="-mx-5 mt-3 snap-x snap-mandatory overflow-x-auto scroll-smooth px-5 pb-2 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:-mx-6 sm:px-6 [scrollbar-width:thin]">
        <ul className="flex items-stretch gap-3">
          {certificates.map((certificate) => (
            <li key={certificate.id} className="w-[228px] shrink-0 snap-start sm:w-[252px]">
              <CertificateCard certificate={certificate} onOpen={() => setSelected(certificate)} />
            </li>
          ))}
        </ul>
      </div>
      <CertificatePreviewDialog certificate={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * Cửa sổ xem ảnh chứng nhận ngay trên trang. Dùng chung cho hồ sơ nhà cung cấp và
 * thẻ chứng nhận trên trang sản phẩm để hai nơi mở ảnh giống hệt nhau.
 */
export function CertificatePreviewDialog({ certificate, onClose }: { certificate: PublicSupplierCertificate | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (certificate && dialog && !dialog.open) dialog.showModal();
  }, [certificate]);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="certificate-preview-title"
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      className="m-auto max-h-[95dvh] w-[min(94vw,900px)] max-w-none rounded-xl bg-white p-4 text-ink-900 shadow-xl backdrop:bg-black/75 sm:p-6">
      {certificate?.imageUrl && (
        <div className="flex max-h-[calc(95dvh-2rem)] flex-col gap-3">
          <div className="flex shrink-0 items-center justify-between gap-4">
            <h2 id="certificate-preview-title" className="text-base font-bold">{certificate.shortName}</h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close certificate preview"
              className="rounded-full p-2 text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={certificate.imageUrl} alt={`${certificate.shortName} certificate${certificate.issuer ? ` issued by ${certificate.issuer}` : ""}`}
              className="mx-auto h-auto max-h-[75dvh] max-w-full object-contain" />
          </div>
        </div>
      )}
    </dialog>
  );
}

function CertificateCard({ certificate, onOpen }: { certificate: PublicSupplierCertificate; onOpen: () => void }) {
  const imageUrl = certificate.imageUrl;
  const alt = `${certificate.shortName} certificate${certificate.issuer ? ` issued by ${certificate.issuer}` : ""}`;

  return (
    <div className="flex h-full flex-col">
      {imageUrl ? (
        <button type="button" onClick={onOpen} aria-label={`View ${certificate.shortName} certificate`}
          className="group relative block aspect-[4/3] overflow-hidden rounded-xl border border-ink-200 bg-ink-50 transition hover:border-brand-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={alt} loading="lazy" decoding="async"
            className="h-full w-full object-contain p-1.5" />
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink-600 shadow-2xs ring-1 ring-ink-200 transition group-hover:text-brand-700 group-hover:ring-brand-300">
            <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
          </span>
          </button>
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 text-center">
          <FileText aria-hidden="true" strokeWidth={1.6} className="h-9 w-9 text-ink-400" />
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 ring-1 ring-ink-200">PDF on file</span>
          <p className="text-[11px] leading-4 text-ink-500">Ask Vexim for a copy</p>
        </div>
      )}
      <h3 title={certificate.name} className="mt-3 line-clamp-2 break-words text-sm font-bold leading-5 text-ink-900">{certificate.shortName}</h3>
      <p className="mt-1 text-xs leading-5 text-ink-600">
        Valid until <strong className="font-bold tabular-nums text-ink-900">{certificate.validUntil}</strong>
      </p>
      {certificate.holderMatch === "partner" ? (
        <p title={certificate.holderName ?? undefined} className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-amber-900">
          Third-party holder · {certificate.holderName}
        </p>
      ) : certificate.issuer ? (
        <p title={certificate.issuer} className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-ink-500">Issuer: {certificate.issuer}</p>
      ) : null}
    </div>
  );
}
