import type { MediaAsset } from "@/lib/types";

/**
 * Quy tắc "sẵn sàng gửi người mua" của một hồ sơ sản phẩm.
 *
 * Chốt với Vexim: KHÔNG bắt buộc ảnh/video khi mới tạo hồ sơ NCC, nhưng trước
 * khi đánh dấu sản phẩm *sẵn sàng gửi buyer* thì phải có ít nhất một ảnh sản
 * phẩm HOẶC catalogue chia sẻ được cho buyer. Video luôn là tuỳ chọn.
 */

export const READY_REQUIREMENT =
  "cần ít nhất 1 ảnh sản phẩm hoặc catalogue đã chia sẻ cho người mua";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Chứng nhận/tài liệu quá ngày hết hạn thì coi như hết hạn dù trạng thái lưu là gì. */
export function isExpired(asset: Pick<MediaAsset, "expires_on" | "status">): boolean {
  if (asset.status === "expired") return true;
  return Boolean(asset.expires_on && asset.expires_on < todayISO());
}

export interface ReadinessResult {
  ready: boolean;
  /** Số tệp đủ điều kiện được gửi buyer (ảnh + catalogue chưa hết hạn) */
  shareable: number;
  /** Câu giải thích ngắn để hiển thị trong giao diện / thông báo lỗi */
  message: string;
}

export interface ProductPublicationMediaState {
  /** Ảnh đang chia sẻ cho người mua (còn hạn, có tệp thật). */
  buyerImages: number;
  /** Tệp bất kỳ (ảnh hoặc catalogue) đang chia sẻ cho người mua. */
  buyerFiles: number;
  ready: boolean;
}

/**
 * Cổng duy nhất trước khi duyệt và đăng sản phẩm NCC: phải có ít nhất một ảnh người mua thấy được.
 *
 * Chốt 31/10/2026: bỏ bước "đã kiểm tra" từng ảnh. Ảnh nhà cung cấp tải lên được chia sẻ cho
 * người mua ngay, nên không còn khái niệm ảnh chờ xác minh và không có cổng thứ hai nào ở đây.
 */
export function productPublicationMediaState(
  media: Pick<MediaAsset, "owner_type" | "product_id" | "supplier_id" | "kind" | "audience" | "status" | "expires_on" | "storage_path">[],
  productId: string,
  supplierId: string,
): ProductPublicationMediaState {
  const files = media.filter((asset) => asset.owner_type === "product" && asset.product_id === productId &&
    asset.supplier_id === supplierId && (asset.kind === "image" || asset.kind === "catalogue") &&
    !!asset.storage_path && !isExpired(asset) && asset.audience === "buyer");
  const buyerImages = files.filter((asset) => asset.kind === "image").length;
  return { buyerImages, buyerFiles: files.length, ready: buyerImages > 0 };
}

export function productReadiness(
  media: Pick<MediaAsset, "kind" | "audience" | "status" | "expires_on">[],
): ReadinessResult {
  const shareable = media.filter(
    (m) =>
      (m.kind === "image" || m.kind === "catalogue") &&
      m.audience === "buyer" &&
      !isExpired(m),
  ).length;

  if (shareable > 0) {
    return {
      ready: true,
      shareable,
      message: `Đủ điều kiện: ${shareable} tệp chia sẻ được cho người mua.`,
    };
  }

  const hasShareableButExpired = media.some(
    (m) =>
      (m.kind === "image" || m.kind === "catalogue") &&
      m.audience === "buyer" &&
      isExpired(m),
  );

  return {
    ready: false,
    shareable: 0,
    message: hasShareableButExpired
      ? `Ảnh/catalogue đã hết hạn — ${READY_REQUIREMENT}.`
      : `Chưa đủ điều kiện — ${READY_REQUIREMENT}.`,
  };
}
