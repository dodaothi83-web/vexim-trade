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
  return (
    <nav aria-label="Filter products by certificate" className="mt-5 rounded-xl border border-ink-200 bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold tracking-[0.12em] text-ink-500 uppercase">Certificates</p>
        {selected.length > 0 && (
          <Link href={certificateFilterHref(slug, [])} className="text-[12px] font-semibold text-brand-700 underline">
            Clear filter
          </Link>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {facets.map((facet) => {
          const active = selected.includes(facet.code);
          return (
            <li key={facet.code}>
              <Link
                href={certificateFilterHref(slug, toggleCertificateScheme(selected, facet.code))}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold transition ${
                  active
                    ? "bg-brand-800 text-white"
                    : "border border-ink-200 bg-white text-ink-700 hover:border-brand-400 hover:text-brand-800"
                }`}
              >
                {facet.label}
                <span className={`tabular-nums ${active ? "text-white/70" : "text-ink-500"}`}>{facet.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-ink-500">
        Counted from certificates Vexim has checked, still valid and linked to the product. Self-declared standards are not counted.
      </p>
    </nav>
  );
}
