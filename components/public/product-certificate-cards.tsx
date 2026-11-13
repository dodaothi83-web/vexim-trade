"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

import { VeximDocumentIcon } from "@/components/brand/vexim-icons";
import { CertificatePreviewDialog } from "@/components/public/supplier-certificate-rail";
import type { PublicSupplierCertificate } from "@/lib/public/certificates";

/**
 * Thẻ chứng nhận trên trang sản phẩm.
 *
 * Trang sản phẩm không trưng ảnh như hồ sơ nhà cung cấp: mỗi giấy là một thẻ gọn (tên
 * chuẩn, hạn, tổ chức cấp, đơn vị đứng tên). Nhấn thẻ mở ảnh giấy ngay trên trang, cùng
 * cửa sổ với hồ sơ nhà cung cấp. Giấy scan PDF không có ảnh công khai nên thẻ đứng yên
 * và ghi rõ có bản PDF trong kho.
 *
 * Từ 3 giấy trở lên, thẻ nằm trên một hàng trượt ngang: thẻ hẹp hơn nửa khung nên thẻ
 * kế tiếp luôn ló ra một phần — người mua thấy ngay còn giấy phía sau mà không cần đọc
 * chú thích. Điện thoại vuốt tay; chuột và bàn phím có nút mũi tên.
 *
 * Biểu tượng tài liệu dùng bản trung tính của bộ Vexim: thẻ chỉ nói "có giấy này",
 * không khẳng định đã xác thực tổ chức cấp.
 */
const CARD_GAP_PX = 12;

export function ProductCertificateCards({ certificates }: { certificates: PublicSupplierCertificate[] }) {
  const [selected, setSelected] = useState<PublicSupplierCertificate | null>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const sliding = certificates.length > 2;

  const syncEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
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
  }, [syncEdges, certificates.length]);

  const step = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild as HTMLElement | null;
    rail.scrollBy({ left: direction * ((card?.offsetWidth ?? 280) + CARD_GAP_PX), behavior: "smooth" });
  };

  const arrow = "hidden h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-default disabled:opacity-35 disabled:hover:border-ink-200 disabled:hover:text-ink-700 sm:flex";

  return (
    <>
      {sliding && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {certificates.length} certificates<span className="sm:hidden"> · swipe to see all</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => step(-1)} disabled={!canBack} aria-label="Previous certificates" className={arrow}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => step(1)} disabled={!canForward} aria-label="Next certificates" className={arrow}>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <ul ref={railRef} tabIndex={sliding ? 0 : undefined} aria-label={sliding ? `Product certificates (${certificates.length})` : undefined}
        className={sliding
          ? "-mx-5 flex snap-x snap-mandatory scroll-px-5 items-stretch gap-3 overflow-x-auto scroll-smooth px-5 pb-2 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-300 [scrollbar-width:thin]"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
        {certificates.map((certificate) => (
          // min-w-0 + grid-cols-1 (minmax(0,1fr)): tên tổ chức cấp dài chỉ bị cắt "…",
          // không được nới ô lưới rộng hơn màn hình điện thoại.
          <li key={certificate.id} className={sliding ? "flex w-[80%] min-w-0 shrink-0 snap-start sm:w-[41%]" : "flex min-w-0"}>
            {certificate.imageUrl ? (
              <button type="button" onClick={() => setSelected(certificate)} aria-haspopup="dialog"
                aria-label={`View ${certificate.shortName} certificate`}
                className="group flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5 text-left transition hover:border-brand-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                <CardBody certificate={certificate} />
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-500 ring-1 ring-ink-200 transition group-hover:text-brand-700 group-hover:ring-brand-300">
                  <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
                </span>
              </button>
            ) : (
              <div className="flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5">
                <CardBody certificate={certificate} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <CertificatePreviewDialog certificate={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CardBody({ certificate }: { certificate: PublicSupplierCertificate }) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <VeximDocumentIcon size={24} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <strong title={certificate.name} className="block break-words text-sm font-bold leading-5 text-ink-900">{certificate.shortName}</strong>
        <span className="mt-0.5 block text-xs leading-5 text-ink-600">
          Valid until <strong className="font-bold tabular-nums text-ink-900">{certificate.validUntil}</strong>
        </span>
        {certificate.issuer && (
          <span title={certificate.issuer} className="block truncate text-[11px] leading-4 text-ink-500">Issuer: {certificate.issuer}</span>
        )}
        {certificate.holderMatch === "owner" ? (
          <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-emerald-800">Registered to supplier</span>
        ) : (
          <span title={certificate.holderName ?? undefined} className="mt-1.5 block truncate text-[11px] font-semibold leading-4 text-amber-900">
            Third-party holder · {certificate.holderName}
          </span>
        )}
        <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-brand-700">
          {certificate.imageUrl ? "View certificate" : "PDF on file · ask Vexim for a copy"}
        </span>
      </span>
    </>
  );
}
