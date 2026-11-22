import Link from "next/link";

import {
  certificateFilterHref,
  toggleCertificateScheme,
  type CertificateFacet,
} from "@/lib/public/certificate-facets";
import type { CertificateScheme } from "@/lib/certificate-scheme";

/**
 * Bộ lọc chứng nhận trên danh sách sản phẩm.
 *
 * Chỉ hiện loại thật sự có trong danh sách đang xem, kèm số sản phẩm — số đếm tính từ
 * đúng cổng công khai của chứng nhận (đã duyệt, còn hạn, đã gắn sản phẩm), không phải
 * từ chữ nhà cung cấp tự khai. Bấm một chip là bật/tắt loại đó, giữ nguyên các loại khác.
 */
export function CertificateFacetChips({ slug, facets, selected }: {
  slug: string;
  facets: CertificateFacet[];
  selected: CertificateScheme[];
}) {
  if (facets.length === 0) return null;
  // Cùng kiểu hàng "Related searches" ngay trên: nhãn + chip trên một dòng, ghi chú nhỏ bên dưới.
  return (
    <nav aria-label="Filter products by certificate" className="mt-3 text-[12.5px]">
      <ul className="flex flex-wrap items-center gap-2">
        <li className="font-semibold text-ink-500">Certificates:</li>
        {facets.map((facet) => {
          const active = selected.includes(facet.code);
          return (
            <li key={facet.code}>
              <Link
                href={certificateFilterHref(slug, toggleCertificateScheme(selected, facet.code))}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition ${
                  active
                    ? "border border-brand-800 bg-brand-800 text-white"
                    : "border border-ink-200 bg-white text-ink-700 hover:border-brand-400 hover:text-brand-800"
                }`}
              >
                {facet.label}
                <span className={`tabular-nums ${active ? "text-white/70" : "text-ink-500"}`}>{facet.count}</span>
              </Link>
            </li>
          );
        })}
        {selected.length > 0 && (
          <li>
            <Link href={certificateFilterHref(slug, [])} className="font-semibold text-brand-700 underline">
              Clear filter
            </Link>
          </li>
        )}
      </ul>
      <p className="mt-1.5 text-[11.5px] leading-4 text-ink-500">
        Certificates verified by Vexim, currently valid and applicable to the product.
      </p>
    </nav>
  );
}
