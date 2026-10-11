import type { MediaAsset } from "@/lib/types";

/**
 * Quy tắc "sẵn sàng gửi buyer" của một hồ sơ sản phẩm.
 *
 * Chốt với Vexim: KHÔNG bắt buộc ảnh/video khi mới tạo hồ sơ NCC, nhưng trước
 * khi đánh dấu sản phẩm *sẵn sàng gửi buyer* thì phải có ít nhất một ảnh sản
 * phẩm HOẶC catalogue chia sẻ được cho buyer. Video luôn là tuỳ chọn.
 */

export const READY_REQUIREMENT =
  "cần ít nhất 1 ảnh sản phẩm hoặc catalogue đã chia sẻ cho buyer";

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
      message: `Đủ điều kiện: ${shareable} tệp chia sẻ được cho buyer.`,
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
