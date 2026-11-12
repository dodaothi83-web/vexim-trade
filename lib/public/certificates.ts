import type { Certificate, MediaAsset } from "@/lib/types";
import { isExpired } from "@/lib/media/readiness";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { certificateSchemeLabel, certificateShortName, isCertificateChipScheme, isCertificateScheme, type CertificateScheme } from "@/lib/certificate-scheme";
import {
  certificateAppliesToProduct,
  optoutKeys,
  type CertificateOptoutRow,
  type CertificateScopeRow,
} from "@/lib/certificate-scope";

export interface PublicSupplierCertificate {
  id: string;
  name: string;
  /** Tên ngắn để hiển thị cho người mua ("HACCP", "ISO 22000"); bằng `name` khi không nhận ra chuẩn. */
  shortName: string;
  issuer: string | null;
  number: string | null;
  holderMatch: "owner" | "partner";
  holderName: string | null;
  validUntil: string;
  /** Loại chứng nhận cho bộ lọc; null khi chưa phân loại (hoặc loại không lên chip). */
  scheme: CertificateScheme | null;
  schemeLabel: string | null;
  /**
   * Ảnh chứng nhận để trưng bày công khai (xem `certificateImageUrl`). Chỉ có khi
   * tệp gốc là ảnh đã đăng ký trong kho media; null cho giấy scan PDF nên thẻ
   * trưng bày rơi về dạng bìa tài liệu. Đường dẫn vẫn phải đi qua route kiểm tra
   * lại điều kiện công khai, không phải đường dẫn tệp thật.
   */
  imageUrl: string | null;
}

/** Ảnh chứng nhận công khai: đuôi tệp và MIME đều phải là ảnh (không nhận PDF). */
const PUBLIC_CERTIFICATE_IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

export function isCertificateImageAsset(
  media: Pick<MediaAsset, "storage_path" | "mime"> | null | undefined,
): boolean {
  if (!media?.storage_path || !PUBLIC_CERTIFICATE_IMAGE_EXT.test(media.storage_path)) return false;
  return !media.mime || media.mime.startsWith("image/");
}

/**
 * Đường dẫn ảnh chứng nhận công khai. Route chỉ trả byte khi chứng nhận vẫn đang
 * được duyệt + công khai + còn hạn, nên đổi quyết định trong CRM là ảnh tự đóng.
 */
export function certificateImageUrl(mediaId: string): string {
  return `/public-media/certificate/${encodeURIComponent(mediaId)}`;
}

/** Phạm vi + lựa chọn của nhà cung cấp để biết giấy có áp cho sản phẩm này không. */
export interface ProductScopeContext {
  /** Toàn bộ dòng phạm vi của các giấy đang xét (hàm tự lọc theo certificate_id). */
  scopes?: readonly CertificateScopeRow[];
  /** Nhà cung cấp đã bỏ tick giấy nào cho sản phẩm nào. */
  optouts?: readonly CertificateOptoutRow[];
  /** Danh mục hiện tại của sản phẩm. */
  categoryId?: string | null;
  /** Danh mục của sản phẩm + danh mục cha. */
  categoryPath?: readonly string[];
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
        Boolean(c.superseded_by_certificate_id) ||
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
      shortName: withoutDirectContacts(certificateShortName(c.name, c.certificate_scheme)).slice(0, 120),
      issuer: c.issuer ? withoutDirectContacts(c.issuer).slice(0, 120) : null,
      number: c.number ? withoutDirectContacts(c.number).slice(0, 80) : null,
      holderMatch: (c.holder_match === "partner" ? "partner" : "owner") as "owner" | "partner",
      holderName: c.holder_name ? withoutDirectContacts(c.holder_name).slice(0, 140) : null,
      validUntil: c.valid_until!,
      scheme: isCertificateChipScheme(c.certificate_scheme) && isCertificateScheme(c.certificate_scheme)
        ? c.certificate_scheme : null,
      schemeLabel: isCertificateScheme(c.certificate_scheme) ? certificateSchemeLabel(c.certificate_scheme, "en") : null,
      imageUrl: isCertificateImageAsset(byId.get(c.file_media_id!)) ? certificateImageUrl(c.file_media_id!) : null,
    }))
    .slice(0, 16);
}

/**
 * Tệp nào được phép phục vụ như *ảnh* chứng nhận công khai (route
 * `/public-media/certificate/<mediaId>`).
 *
 * Điều kiện không chép lại ở route: chạy đúng bộ lọc hồ sơ nhà cung cấp
 * (`publicSupplierCertificates`) rồi mới so đường dẫn ảnh. Nhờ vậy ảnh chỉ mở khi
 * giấy đã duyệt, đang công khai, không bị ẩn/thay thế, còn hạn và đúng đơn vị
 * đứng tên — rút một trong các điều kiện đó trong CRM là ảnh đóng ngay, kể cả khi
 * người mua còn giữ URL cũ.
 *
 * PDF không bao giờ đi qua đây: nhận diện theo đuôi tệp lẫn MIME nên giấy scan PDF
 * vẫn chỉ nằm trong kho nội bộ.
 */
export function publicCertificateImage(
  media: MediaAsset | null | undefined,
  certificates: Certificate[] | readonly Certificate[],
  today = new Date().toISOString().slice(0, 10),
): MediaAsset | null {
  if (!media || !media.supplier_id || media.kind !== "certificate") return null;
  if (!isCertificateImageAsset(media)) return null;
  const visible = publicSupplierCertificates(media.supplier_id, [...certificates], [media], today);
  const url = certificateImageUrl(media.id);
  return visible.some((certificate) => certificate.imageUrl === url) ? media : null;
}

/**
 * Chứng nhận hiển thị riêng trên trang một sản phẩm: giao của danh sách đã công
 * khai ở trên với phạm vi đã xác nhận cho sản phẩm (hoặc danh mục của nó), trừ
 * những giấy nhà cung cấp đã bỏ tick cho sản phẩm đó.
 *
 * Giấy pháp lý (GPKD, phép xuất khẩu, ATTP cơ sở) và giấy theo lô (C/O, kiểm dịch,
 * phiếu kiểm nghiệm) không bao giờ áp cho sản phẩm, kể cả khi dữ liệu cũ có gắn.
 *
 * Dùng đúng bộ lọc của hồ sơ nhà cung cấp trước rồi mới lọc theo phạm vi, nên
 * không thể lộ chứng nhận chưa duyệt/chưa công khai/đã hết hạn.
 */
export function publicProductCertificates(
  supplierId: string,
  productId: string,
  certificates: Certificate[] | readonly Certificate[],
  media: MediaAsset[] | readonly MediaAsset[] = [],
  today = new Date().toISOString().slice(0, 10),
  context: ProductScopeContext = {},
): PublicSupplierCertificate[] {
  const own = certificates.filter((certificate) => certificate.supplier_id === supplierId);
  if (own.length === 0) return [];
  const product = {
    id: productId,
    categoryId: context.categoryId ?? null,
    categoryPath: context.categoryPath ?? [],
  };
  const optedOut = optoutKeys(context.optouts ?? []);
  const scopes = context.scopes ?? [];
  const visible = publicSupplierCertificates(supplierId, [...own], [...media], today);
  return visible.filter((certificate) => {
    const record = own.find((item) => item.id === certificate.id);
    if (!record) return false;
    return certificateAppliesToProduct(record, scopes, product, optedOut);
  });
}
