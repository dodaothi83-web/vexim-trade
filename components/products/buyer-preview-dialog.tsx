"use client";

import { useEffect, useRef } from "react";
import { Eye, ImageIcon, X } from "lucide-react";

import { ProductDescriptionPreview } from "@/components/products/product-description-preview";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { QuantityPriceTable } from "@/components/public/quantity-price-table";
import type { PublicQuantityOffer } from "@/lib/products/quantity-public-projection";

export type BuyerPreviewFact = { label: string; value: string };
export type BuyerPreviewCertificate = { id: string; name: string; validUntil?: string | null };

export type BuyerPreviewData = {
  /** Tiêu đề người mua thấy: tên tiếng Anh; chưa có thì tạm dùng tên tiếng Việt. */
  title: string;
  hasEnglishTitle: boolean;
  categoryLabel: string;
  description: string;
  detail: string;
  images: string[];
  /** Bảng giá dựng đúng định dạng của bản đã duyệt; `null` khi chưa đủ dữ liệu. */
  offer: PublicQuantityOffer | null;
  pricePubliclyVisible: boolean;
  trade: { oem: boolean; odm: boolean; samples: boolean };
  /** Thông số đã khai, nhãn lấy đúng nhãn trang người mua dùng. */
  details: BuyerPreviewFact[];
  /** Đóng gói và giao hàng, cùng nhóm với trang người mua. */
  shipping: BuyerPreviewFact[];
  certificates: BuyerPreviewCertificate[];
  supplierName: string;
  supplierProvince: string;
  /** Còn thay đổi chưa lưu: bản xem trước đang dùng nội dung vừa nhập, chưa phải bản đã lưu. */
  dirty: boolean;
};

function formatValidUntil(value?: string | null): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(parsed));
}

/**
 * Bản xem trước đúng những gì người mua thấy trên trang sản phẩm công khai.
 *
 * Dựng từ cùng bộ component với trang thật (`QuantityPriceTable`, `ProductTradeLabels`,
 * `ProductDescriptionPreview`) để nhà cung cấp không phải đoán: bảng giá ở đây dùng
 * chung cách định dạng với bản đã duyệt. Khung ngoài giữ tiếng Việt cho các ghi chú
 * của cổng; phần nội dung giữ nguyên nhãn tiếng Anh như trang người mua.
 */
export function BuyerPreviewDialog({ open, onClose, data }: {
  open: boolean;
  onClose: () => void;
  data: BuyerPreviewData;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const cover = data.images[0] ?? null;
  const thumbs = data.images.slice(1, 6);

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/60 p-2 sm:p-6"
    onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="buyer-preview-title"
      className="mx-auto w-full max-w-[1060px] overflow-hidden rounded-xl bg-white shadow-2xl"
      onClick={(event) => event.stopPropagation()}>

      {/* Khung của cổng: nói rõ đây là bản xem trước, không phải trang đã đăng. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-brand-800 uppercase">
            <Eye className="size-3.5" aria-hidden="true" /> Bản xem trước
          </p>
          <h2 className="mt-0.5 text-[15px] leading-6 font-black text-ink-900">Người mua thấy sản phẩm như thế này</h2>
          <p className="mt-0.5 text-[11.5px] leading-4 text-ink-500">
            Dựng từ nội dung bạn đang nhập. Người mua chỉ thấy sau khi sản phẩm được duyệt và đăng.
          </p>
          {data.dirty && <p className="mt-1 text-[11.5px] leading-4 text-amber-800">
            Có thay đổi chưa lưu: bản này đang dùng nội dung vừa nhập, chưa phải bản đã lưu.
          </p>}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng bản xem trước"
          className="shrink-0 rounded-md border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50 hover:text-ink-900">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-7 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        {/* Cột ảnh + nhà cung cấp, giống cột trái trang sản phẩm. */}
        <div>
          <div className="aspect-square overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
            {cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={cover} alt="" className="size-full object-cover" />
              : <span className="flex size-full flex-col items-center justify-center gap-2 text-ink-400">
                <ImageIcon className="size-9 stroke-1" aria-hidden="true" />
                <span className="text-[11.5px] font-semibold">Chưa có ảnh sản phẩm</span>
              </span>}
          </div>
          {thumbs.length > 0 && <ul className="mt-2 grid grid-cols-5 gap-2">
            {thumbs.map((url) => <li key={url} className="aspect-square overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
            </li>)}
          </ul>}

          <div className="mt-4 overflow-hidden rounded-xl border border-brand-200 bg-white">
            <div className="border-b border-brand-100 bg-gradient-to-br from-brand-50 to-white px-4 py-3">
              <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">Supplied by</p>
              <p className="mt-1 break-words text-[15px] font-bold text-ink-900">{data.supplierName}</p>
              {data.supplierProvince && <p className="mt-1 text-[11.5px] font-medium text-ink-600">{data.supplierProvince}, Vietnam</p>}
            </div>
            <p className="px-4 py-3 text-[11px] leading-4 text-ink-500">
              Liên hệ và báo giá đi qua Vexim; thông tin liên hệ của bạn không hiện ở đây.
            </p>
          </div>
        </div>

        {/* Cột nội dung: nhãn tiếng Anh đúng như trang người mua. */}
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-widest text-brand-700 uppercase">Vietnam · {data.categoryLabel}</p>
          <h3 id="buyer-preview-title" className="mt-2 text-xl font-semibold leading-snug tracking-tight break-words text-ink-900 sm:text-2xl">
            {data.title || "Product name"}
          </h3>
          {!data.hasEnglishTitle && <p className="mt-1 text-[11.5px] leading-4 text-ink-500">
            Chưa có tên tiếng Anh: người mua sẽ thấy tên này sau khi Vexim dịch và duyệt.
          </p>}
          {data.description.trim() && <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">{data.description}</p>}

          {data.offer
            ? <QuantityPriceTable offer={data.offer} />
            : <div id="reference-price" className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
              <p className="text-[11px] font-bold tracking-wider text-brand-700 uppercase">Reference price</p>
              <p className="mt-0.5 text-lg font-bold text-brand-800">Price on request</p>
              <p className="mt-1 text-[11.5px] leading-4 text-brand-900">
                Chưa có bảng giá để hiện: người mua sẽ thấy “Price on request”.
              </p>
            </div>}

          {!data.pricePubliclyVisible && <p className="mt-2 text-[11.5px] leading-4 text-ink-500">
            Bạn đang tắt chia sẻ giá nên người mua chỉ thấy “Price on request”.
          </p>}

          <div className="mt-4"><ProductTradeLabels oem={data.trade.oem} odm={data.trade.odm} samples={data.trade.samples} /></div>

          {(data.details.length > 0 || data.shipping.length > 0) && <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
              <h4 className="text-sm font-bold text-ink-900">Product details</h4>
              <p className="mt-0.5 text-xs text-ink-500">Khai báo của bạn, người mua đọc đúng những dòng này</p>
            </div>
            {data.details.length > 0 && <dl className="divide-y divide-ink-100">
              {data.details.map((fact) => <div key={`d-${fact.label}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5 text-[13px]">
                <dt className="font-semibold text-ink-600">{fact.label}</dt>
                <dd className="break-words text-ink-900">{fact.value}</dd>
              </div>)}
            </dl>}
            {data.shipping.length > 0 && <>
              <p className="border-t border-ink-100 bg-ink-50/40 px-5 py-2 text-[11px] font-bold tracking-wider text-ink-500 uppercase">Packaging &amp; delivery</p>
              <dl className="divide-y divide-ink-100">
                {data.shipping.map((fact) => <div key={`s-${fact.label}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5 text-[13px]">
                  <dt className="font-semibold text-ink-600">{fact.label}</dt>
                  <dd className="break-words text-ink-900">{fact.value}</dd>
                </div>)}
              </dl>
            </>}
          </div>}

          {data.certificates.length > 0 && <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
              <h4 className="text-sm font-bold text-ink-900">Certificates</h4>
              <p className="mt-0.5 text-xs text-ink-500">Chỉ chứng nhận đã được Vexim duyệt gắn mới hiện ở đây</p>
            </div>
            <ul className="divide-y divide-ink-100">
              {data.certificates.map((certificate) => <li key={certificate.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-[13px]">
                <span className="min-w-0 font-semibold text-ink-900">{certificate.name}</span>
                {formatValidUntil(certificate.validUntil) && <span className="text-[12px] text-ink-500">
                  Valid until {formatValidUntil(certificate.validUntil)}
                </span>}
              </li>)}
            </ul>
          </div>}

          {data.detail.trim() && <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white">
            <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
              <h4 className="text-sm font-bold text-ink-900">Product description</h4>
            </div>
            <div className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-800">
              <ProductDescriptionPreview value={data.detail} />
            </div>
          </div>}
        </div>
      </div>
    </div>
  </div>;
}
