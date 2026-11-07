import { certificateSchemesByProduct } from "@/lib/public/certificate-facets";
import { readCategoryCertificateData, type CategoryCertificateData, type CertificateFacetStore } from "@/lib/public/category-certificate-data";
import { CERTIFICATE_SCHEMES, certificateSchemeLabel } from "@/lib/certificate-scheme";

/**
 * Tên chứng nhận hiện trên thẻ sản phẩm (ví dụ "HACCP", "ISO 22000"), chủ dự án yêu cầu 11/2026.
 *
 * Dùng đúng cổng công khai của bộ lọc chứng nhận: giấy đã duyệt, đang công khai, còn hạn,
 * có phạm vi phủ sản phẩm (theo danh mục hoặc gắn thẳng) và nhà cung cấp không bỏ nhận.
 * Thứ tự theo danh sách loại giấy chuẩn để thẻ nào cũng xếp giống nhau.
 */
export async function certificateLabelsForProducts(
  store: CertificateFacetStore,
  products: ReadonlyArray<{ id: string; supplierId: string; categoryPath: readonly string[] }>,
  /** Dữ liệu đã đọc sẵn cho cả lượt tải trang (trang chủ, tìm kiếm gọi nhiều danh mục). */
  preloaded?: Promise<CategoryCertificateData>,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!products.length) return result;
  const data = await (preloaded ?? readCategoryCertificateData(store, products.map((product) => product.supplierId)));
  if (!data.certificates.length) return result;
  const schemes = certificateSchemesByProduct(
    products.map((product) => ({ id: product.id, supplierId: product.supplierId, categoryId: product.categoryPath[0] ?? null, categoryPath: product.categoryPath })),
    data.certificates, data.media, undefined, { scopes: data.scopes, optouts: data.optouts },
  );
  const order = new Map(CERTIFICATE_SCHEMES.map((scheme, index) => [scheme.code, index]));
  for (const [productId, set] of schemes) {
    const labels = [...set].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
      .map((code) => certificateSchemeLabel(code, "en")).filter((label): label is string => Boolean(label));
    if (labels.length) result.set(productId, labels);
  }
  return result;
}

/** Danh mục của sản phẩm + các danh mục cha, để khớp giấy duyệt theo danh mục cha. */
export function categoryPathOf(categoryId: string, categories: ReadonlyArray<{ id: string; parent_id?: string | null }>): string[] {
  const parentOf = new Map(categories.map((category) => [category.id, category.parent_id ?? null]));
  const path: string[] = [];
  let current: string | null = categoryId;
  while (current && !path.includes(current) && path.length < 6) { path.push(current); current = parentOf.get(current) ?? null; }
  return path;
}
