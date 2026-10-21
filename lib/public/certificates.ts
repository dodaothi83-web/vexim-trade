import type { Certificate, MediaAsset } from "@/lib/types";
import { isExpired } from "@/lib/media/readiness";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export interface PublicSupplierCertificate {
  id: string;
  name: string;
  issuer: string | null;
  number: string | null;
  holderMatch: "owner" | "partner";
  holderName: string | null;
  validUntil: string;
}

/**
 * Lọc danh sách chứng nhận L1 đủ điều kiện hiển thị công khai trên trang hồ sơ nhà cung cấp:
 * - Đã được AI quét (review_status === "approved" && publicly_visible === true)
 * - Không bị nhân viên ẩn (staff_hidden !== true)
 * - Xác định rõ đơn vị đứng tên: "owner" (chính chủ) hoặc "partner" (đơn vị đối tác có tên cụ thể)
 * - Còn hiệu lực (valid_until >= today) và có tệp nội bộ đi kèm.
 */
export function publicSupplierCertificates(
  supplierId: string,
  certificates: Certificate[],
  media: MediaAsset[] = [],
  today = new Date().toISOString().slice(0, 10),
): PublicSupplierCertificate[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return certificates
    .filter((c) => {
      if (
        c.supplier_id !== supplierId ||
        c.review_status !== "approved" ||
        c.publicly_visible !== true ||
        c.staff_hidden === true ||
        !c.file_media_id ||
        !c.valid_until ||
        !/^\d{4}-\d{2}-\d{2}$/.test(c.valid_until) ||
        c.valid_until < today
      ) {
        return false;
      }
      const match = c.holder_match;
      if (match !== "owner" && !(match === "partner" && c.holder_name?.trim())) {
        return false;
      }
      const file = byId.get(c.file_media_id);
      if (file) {
        if (
          file.supplier_id !== supplierId ||
          file.audience !== "internal" ||
          !file.storage_path ||
          isExpired(file) ||
          (file.expires_on && file.expires_on < today)
        ) {
          return false;
        }
      }
      return true;
    })
    .map((c) => ({
      id: c.id,
      name: withoutDirectContacts(c.name).slice(0, 120),
      issuer: c.issuer ? withoutDirectContacts(c.issuer).slice(0, 120) : null,
      number: c.number ? withoutDirectContacts(c.number).slice(0, 80) : null,
      holderMatch: (c.holder_match === "partner" ? "partner" : "owner") as "owner" | "partner",
      holderName: c.holder_name ? withoutDirectContacts(c.holder_name).slice(0, 140) : null,
      validUntil: c.valid_until!,
    }))
    .slice(0, 16);
}
