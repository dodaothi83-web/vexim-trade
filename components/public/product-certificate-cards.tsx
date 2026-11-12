"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";

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
 * Biểu tượng tài liệu dùng bản trung tính của bộ Vexim: thẻ chỉ nói "có giấy này",
 * không khẳng định đã xác thực tổ chức cấp.
 */
export function ProductCertificateCards({ certificates }: { certificates: PublicSupplierCertificate[] }) {
  const [selected, setSelected] = useState<PublicSupplierCertificate | null>(null);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {certificates.map((certificate) => (
          <li key={certificate.id} className="flex">
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
