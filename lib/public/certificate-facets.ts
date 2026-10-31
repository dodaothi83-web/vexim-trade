import type { Certificate, MediaAsset } from "@/lib/types";
import { CERTIFICATE_SCHEMES, isCertificateChipScheme, type CertificateScheme } from "@/lib/certificate-scheme";
import { type CertificateOptoutRow, type CertificateScopeRow } from "@/lib/certificate-scope";
import { publicProductCertificates } from "@/lib/public/certificates";

/**
 * Bộ lọc chứng nhận cho danh sách sản phẩm.
 *
 * Nguồn duy nhất là bảng `certificates` sau khi đi qua đúng cổng công khai của trang
 * sản phẩm (`publicProductCertificates`): đã duyệt, đang công khai, không bị nhân viên
 * ẩn, còn hạn, có tệp nội bộ, và nhân viên đã gắn cho **đúng sản phẩm** đó. Sản phẩm
 * tự khai "HACCP" trong mô tả không bao giờ vào bộ lọc.
 *
 * Loại chứng nhận lấy từ `certificate_scheme` (đọc từ tên/tổ chức cấp trên giấy, nhân
 * viên sửa được), không lấy từ ô checklist L1 vốn gộp HACCP/ISO/BRC/Halal.
 */

export const CERTIFICATE_FILTER_PARAM = "cert";

export interface CertificateFacet {
  code: CertificateScheme;
  label: string;
  /** Số sản phẩm trong danh sách đang xem có chứng nhận loại này. */
  count: number;
}

export interface FacetProduct {
  id: string;
  supplierId: string;
  /** Danh mục hiện tại của sản phẩm (để khớp phạm vi giấy duyệt theo danh mục). */
  categoryId?: string | null;
  /** Danh mục của sản phẩm + danh mục cha. */
  categoryPath?: readonly string[];
}

export interface FacetContext {
  scopes?: readonly CertificateScopeRow[];
  optouts?: readonly CertificateOptoutRow[];
}

/** Loại chứng nhận theo từng sản phẩm, đã qua mọi cổng công khai. */
export function certificateSchemesByProduct(
  products: ReadonlyArray<FacetProduct>,
  certificates: readonly Certificate[],
  media: readonly MediaAsset[] = [],
  today = new Date().toISOString().slice(0, 10),
  context: FacetContext = {},
): Map<string, Set<CertificateScheme>> {
  const result = new Map<string, Set<CertificateScheme>>();
  if (products.length === 0) return result;

  const certificatesArray: Certificate[] = [...certificates];
  const mediaArray: MediaAsset[] = [...media];
  const certificatesBySupplier = new Map<string, Certificate[]>();
  for (const certificate of certificatesArray) {
    if (!certificate.supplier_id) continue;
    const list = certificatesBySupplier.get(certificate.supplier_id) ?? [];
    list.push(certificate);
    certificatesBySupplier.set(certificate.supplier_id, list);
  }
  const mediaBySupplier = new Map<string, MediaAsset[]>();
  for (const asset of mediaArray) {
    if (!asset.supplier_id) continue;
    const list = mediaBySupplier.get(asset.supplier_id) ?? [];
    list.push(asset);
    mediaBySupplier.set(asset.supplier_id, list);
  }

  for (const product of products) {
    const own = certificatesBySupplier.get(product.supplierId);
    if (!own?.length) continue;
    const visible = publicProductCertificates(
      product.supplierId,
      product.id,
      own,
      mediaBySupplier.get(product.supplierId) ?? [],
      today,
      {
        scopes: context.scopes ?? [],
        optouts: context.optouts ?? [],
        categoryId: product.categoryId ?? null,
        categoryPath: product.categoryPath ?? [],
      },
    );
    const schemes = new Set<CertificateScheme>();
    for (const certificate of visible) if (certificate.scheme) schemes.add(certificate.scheme);
    if (schemes.size > 0) result.set(product.id, schemes);
  }
  return result;
}

/** Các lựa chọn bộ lọc, chỉ hiện loại đang thật sự có trong danh sách sản phẩm. */
export function buildCertificateFacets(
  schemesByProduct: ReadonlyMap<string, Set<CertificateScheme>>,
): CertificateFacet[] {
  const counts = new Map<CertificateScheme, number>();
  for (const schemes of schemesByProduct.values()) {
    for (const code of schemes) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // Chỉ loại nằm trong danh sách được lên chip; giấy pháp lý và giấy theo lô không bao
  // giờ thành chip dù có phạm vi.
  return CERTIFICATE_SCHEMES
    .filter((item) => isCertificateChipScheme(item.code) && (counts.get(item.code) ?? 0) > 0)
    .map((item) => ({ code: item.code as CertificateScheme, label: item.label, count: counts.get(item.code) ?? 0 }));
}

/** Đọc `?cert=haccp,halal`; bỏ mã lạ, bỏ trùng, giữ thứ tự chuẩn để URL ổn định. */
export function parseCertificateSchemeQuery(
  raw: string | string[] | null | undefined,
): CertificateScheme[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const wanted = new Set<string>(text.split(",").map((value) => value.trim().toLowerCase()));
  return CERTIFICATE_SCHEMES.map((item) => item.code).filter(
    (code): code is CertificateScheme => isCertificateChipScheme(code) && wanted.has(code),
  );
}

/** Bật/tắt một loại trong lựa chọn hiện tại. */
export function toggleCertificateScheme(
  selected: readonly CertificateScheme[],
  code: CertificateScheme,
): CertificateScheme[] {
  const next = new Set(selected);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return CERTIFICATE_SCHEMES.map((item) => item.code).filter(
    (item): item is CertificateScheme => next.has(item) && isCertificateChipScheme(item),
  );
}

/** Link của một lựa chọn; rỗng thì trả về đúng trang danh mục, không kèm query. */
export function certificateFilterHref(slug: string, selected: readonly CertificateScheme[]): string {
  const base = `/products/${encodeURIComponent(slug)}`;
  return selected.length === 0 ? base : `${base}?${CERTIFICATE_FILTER_PARAM}=${selected.join(",")}`;
}

/** Sản phẩm có ít nhất một chứng nhận nằm trong lựa chọn (rỗng = không lọc). */
export function productMatchesCertificateSchemes(
  schemesByProduct: ReadonlyMap<string, Set<CertificateScheme>>,
  productId: string,
  selected: readonly CertificateScheme[],
): boolean {
  if (selected.length === 0) return true;
  const schemes = schemesByProduct.get(productId);
  if (!schemes) return false;
  return selected.some((code) => schemes.has(code));
}
