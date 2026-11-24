import { getStore } from "@/lib/db";
import type { CategoryCertificateData } from "@/lib/public/category-certificate-data";
import { publicProductCertificates, type PublicSupplierCertificate } from "@/lib/public/certificates";

/**
 * Chứng nhận hiển thị riêng cho một sản phẩm.
 *
 * Dùng chung cho trang sản phẩm và form RFQ (thẻ "You're asking about"), để hai nơi
 * không bao giờ hiện hai danh sách chứng nhận khác nhau. Không đọc thêm gì khi nhà
 * cung cấp chưa có chứng nhận nào được duyệt gắn; mọi bộ lọc công bố vẫn nằm trong
 * `publicProductCertificates`.
 */
export async function productCertificatesFor(
  productId: string,
  supplierId: string,
  categoryPath: readonly string[],
  /** Dữ liệu chứng nhận của danh mục đã đọc trong cùng lượt tải trang (có nhà cung cấp này). */
  preloaded?: Promise<CategoryCertificateData>,
): Promise<PublicSupplierCertificate[]> {
  if (preloaded) {
    const data = await preloaded.catch(() => null);
    if (data) {
      const own = data.certificates.filter((certificate) => certificate.supplier_id === supplierId);
      if (own.length === 0) return [];
      const ownIds = new Set(own.map((certificate) => certificate.id));
      return publicProductCertificates(supplierId, productId, own,
        data.media.filter((asset) => asset.owner_type === "supplier" && asset.supplier_id === supplierId), undefined, {
          scopes: data.scopes.filter((scope) => ownIds.has(scope.certificate_id)),
          optouts: data.optouts.filter((optout) => optout.supplier_id === supplierId),
          categoryId: categoryPath[0] ?? null,
          categoryPath,
        });
    }
  }
  const store = getStore();
  if (typeof store.listCertificates !== "function") return [];
  const raw = await store.listCertificates(supplierId).catch(() => []);
  if (raw.length === 0) return [];
  // Phạm vi đã xác nhận (theo danh mục hoặc theo sản phẩm) + lựa chọn bỏ nhận của
  // nhà cung cấp quyết định giấy nào áp cho sản phẩm này.
  const scopes = typeof store.listCertificateScopes === "function"
    ? await store.listCertificateScopes(raw.map((certificate) => certificate.id)).catch(() => [])
    : [];
  const optouts = typeof store.listCertificateOptouts === "function"
    ? await store.listCertificateOptouts(supplierId).catch(() => [])
    : [];
  const media = typeof store.listMedia === "function" ? await store.listMedia("supplier", supplierId).catch(() => []) : [];
  return publicProductCertificates(supplierId, productId, raw, media, undefined, {
    scopes,
    optouts,
    categoryId: categoryPath[0] ?? null,
    categoryPath,
  });
}
