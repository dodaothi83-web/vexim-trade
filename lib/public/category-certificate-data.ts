import type { Certificate, CertificateScope, MediaAsset, ProductCertificateOptout } from "@/lib/types";

/**
 * Dữ liệu cho bộ lọc chứng nhận của một danh sách sản phẩm.
 *
 * Trang danh mục cần giấy, tệp, phạm vi và opt-out của **mọi** nhà cung cấp đang có sản
 * phẩm trong danh mục. Đọc lần lượt từng nhà cung cấp thì một danh mục 50 nhà cung cấp
 * tốn 4 lượt đọc mỗi nhà cung cấp cho mỗi lần tải trang — quá nặng cho một trang công
 * khai. Hàm này gộp lại:
 *
 * - giấy của tất cả nhà cung cấp: 1 luợt (`listCertificatesForSuppliers`);
 * - phạm vi của đúng các giấy đó: 1 lượt (`listCertificateScopes`);
 * - opt-out: 1 lượt (`listCertificateOptoutsForSuppliers`);
 * - tệp: chỉ đọc cho nhà cung cấp **thật sự có giấy** — nhà cung cấp chưa có giấy nào
 *   không tốn lượt đọc nào.
 *
 * Store cũ (hoặc store giả trong script kiểm tra) không có hàm gộp thì tự lùi về cách
 * đọc từng nhà cung cấp. Lỗi đọc chỉ làm dữ liệu đó rỗng, không làm hỏng trang danh mục:
 * bộ lọc mất chip còn hơn cả trang sản phẩm trắng.
 */

export type CertificateFacetStore = {
  listCertificatesForSuppliers?: (supplierIds: string[]) => Promise<Certificate[]>;
  listCertificates?: (supplierId: string) => Promise<Certificate[]>;
  listMedia?: (ownerType: "supplier", ownerId: string) => Promise<MediaAsset[]>;
  listCertificateScopes?: (certificateIds: string[]) => Promise<CertificateScope[]>;
  listCertificateOptoutsForSuppliers?: (supplierIds: string[]) => Promise<ProductCertificateOptout[]>;
  listCertificateOptouts?: (supplierId: string) => Promise<ProductCertificateOptout[]>;
};

export interface CategoryCertificateData {
  certificates: Certificate[];
  media: MediaAsset[];
  scopes: CertificateScope[];
  optouts: ProductCertificateOptout[];
}

function empty(): CategoryCertificateData {
  return { certificates: [], media: [], scopes: [], optouts: [] };
}

/** Đọc một nguồn; hỏng hoặc trả về thứ không phải mảng thì coi như rỗng. */
async function safe<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    const rows = await read();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function readCategoryCertificateData(
  store: CertificateFacetStore,
  supplierIds: readonly string[],
): Promise<CategoryCertificateData> {
  const ids = [...new Set(supplierIds.filter((id) => typeof id === "string" && id.trim() !== ""))];
  if (ids.length === 0) return empty();

  const certificates = typeof store.listCertificatesForSuppliers === "function"
    ? await safe(() => store.listCertificatesForSuppliers!(ids))
    : (await Promise.all(ids.map((supplierId) => (
      typeof store.listCertificates === "function" ? safe(() => store.listCertificates!(supplierId)) : []
    )))).flat();

  // Nhà cung cấp chưa có giấy nào thì không còn gì để đọc thêm cho họ.
  if (certificates.length === 0) return empty();

  const withCertificates = [...new Set(certificates.map((certificate) => certificate.supplier_id).filter(Boolean))];
  const certificateIds = certificates.map((certificate) => certificate.id).filter(Boolean);

  const [media, scopes, optouts] = await Promise.all([
    typeof store.listMedia === "function"
      ? Promise.all(withCertificates.map((supplierId) => safe(() => store.listMedia!("supplier", supplierId))))
        .then((rows) => rows.flat())
      : Promise.resolve([] as MediaAsset[]),
    typeof store.listCertificateScopes === "function"
      ? safe(() => store.listCertificateScopes!(certificateIds))
      : Promise.resolve([] as CertificateScope[]),
    typeof store.listCertificateOptoutsForSuppliers === "function"
      ? safe(() => store.listCertificateOptoutsForSuppliers!(withCertificates))
      : Promise.all(withCertificates.map((supplierId) => (
        typeof store.listCertificateOptouts === "function" ? safe(() => store.listCertificateOptouts!(supplierId)) : []
      ))).then((rows) => rows.flat()),
  ]);

  return { certificates, media, scopes, optouts };
}
