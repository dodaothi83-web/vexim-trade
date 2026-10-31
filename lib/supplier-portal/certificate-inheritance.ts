import type { DataStore } from "@/lib/db/types";
import type { Category } from "@/lib/types";
import { certificateAppliesToCategory, isCertificateVersionCurrent } from "@/lib/certificate-scope";
import { certificateSchemeLabel, isScopeableCertificateScheme } from "@/lib/certificate-scheme";

export interface InheritedCertificate {
  id: string;
  name: string;
  scheme: string | null;
  validUntil: string | null;
}

/**
 * Giấy chất lượng mà một danh mục đang thừa hưởng, để form thêm sản phẩm hiện sẵn khối
 * "Chứng nhận áp dụng" ngay khi chọn danh mục.
 *
 * Chỉ tính giấy đã duyệt, đang công khai, còn hạn (hoặc chưa ghi hạn), chưa bị bản gia
 * hạn thay thế, và có phạm vi danh mục **đã xác nhận**. Sản phẩm lưu xong sẽ tự nhận
 * đúng các giấy này; nhà cung cấp bỏ tick ở trang sản phẩm nếu một giấy không đúng.
 */
export async function certificateInheritanceByCategory(
  store: DataStore,
  supplierId: string,
  categories: readonly Pick<Category, "id" | "slug">[],
  today = new Date().toISOString().slice(0, 10),
): Promise<Record<string, InheritedCertificate[]>> {
  const result: Record<string, InheritedCertificate[]> = {};
  if (typeof store.listCertificates !== "function" || categories.length === 0) return result;
  const certificates = await store.listCertificates(supplierId).catch(() => []);
  const live = certificates.filter((certificate) =>
    certificate.review_status === "approved" &&
    certificate.publicly_visible !== false &&
    !certificate.staff_hidden &&
    isCertificateVersionCurrent(certificate) &&
    isScopeableCertificateScheme(certificate.certificate_scheme ?? null) &&
    (!certificate.valid_until || certificate.valid_until >= today));
  if (live.length === 0) return result;
  const scopes = typeof store.listCertificateScopes === "function"
    ? await store.listCertificateScopes(live.map((certificate) => certificate.id)).catch(() => [])
    : [];
  if (scopes.length === 0) return result;
  const all = await store.listCategories({ publishedOnly: false }).catch(() => categories as Category[]);
  const parentOf = new Map(all.map((category) => [category.id, category.parent_id ?? null]));
  for (const category of categories) {
    const path = [category.id];
    const parent = parentOf.get(category.id);
    if (parent) path.push(parent);
    const applicable = live
      .filter((certificate) => certificateAppliesToCategory(certificate, scopes, path))
      .map((certificate) => ({
        id: certificate.id,
        name: certificate.name,
        scheme: certificateSchemeLabel(certificate.certificate_scheme ?? null, "vi"),
        validUntil: certificate.valid_until ?? null,
      }));
    if (applicable.length > 0) result[category.slug] = applicable;
  }
  return result;
}
