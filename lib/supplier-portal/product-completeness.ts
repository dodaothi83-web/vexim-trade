import { productTranslationState } from "@/lib/ai/translate-content";
import { isExpired } from "@/lib/media/readiness";
import { productReview } from "@/lib/supplier-portal/product-view";
import type { MediaAsset, SupplierProduct } from "@/lib/types";

/**
 * Điểm hoàn thiện hồ sơ sản phẩm — bản "chấm điểm SEO" của sàn B2B, đổi tên cho
 * trung thực: điểm đo mức độ sẵn sàng của hồ sơ ĐỐI VỚI BUYER (thông tin mua
 * hàng, ảnh, bản tiếng Anh, độ tươi của bản dịch), không phải điểm xếp hạng
 * Google. Google đã được lo ở tầng kỹ thuật (JSON-LD, sitemap, canonical).
 *
 * Công bố với NCC: trọng số 40/40/20 —
 *   gate  (40đ): điều kiện để hồ sơ hiện đúng trên sàn;
 *   buyer (40đ): thông tin mua hàng buyer cần để tự tin gửi RFQ;
 *   fresh (20đ): độ tươi và chiều sâu (bản dịch còn khớp nội dung gốc, nhiều
 *                ảnh, video, ảnh đại diện chủ đích).
 *
 * Điểm CHỈ dành cho NCC trong cổng và staff trong CRM — không hiển thị cho
 * buyer (buyer đã có tầng xác minh L1/L2/L3 đáng tin hơn). Trong catalog công
 * khai, điểm là tín hiệu xếp thứ tự PHỤ sau tầng xác minh.
 */

export type CompletenessGroup = "gate" | "buyer" | "fresh";

export interface CompletenessCheck {
  key: string;
  /** Mô tả việc còn thiếu, hiển thị cho NCC. */
  label: string;
  done: boolean;
  points: number;
  group: CompletenessGroup;
  /** Bước trong editor sản phẩm để điền ngay việc này. */
  step: 1 | 2 | 3;
}

export interface ProductCompleteness {
  /** 0–100, tổng điểm các check đạt được. */
  score: number;
  label: string;
  tone: string;
  checks: CompletenessCheck[];
  /** Việc còn thiếu, sắp theo điểm giảm dần — dùng cho gợi ý "làm gì tiếp". */
  missing: CompletenessCheck[];
}

export const COMPLETENESS_GROUPS: Record<CompletenessGroup, { label: string; max: number }> = {
  gate: { label: "Điều kiện hiển thị", max: 40 },
  buyer: { label: "Thông tin mua hàng", max: 40 },
  fresh: { label: "Độ tươi & chiều sâu", max: 20 },
};

function shareableImages(media: MediaAsset[]): MediaAsset[] {
  return media.filter((m) => m.kind === "image" && m.audience === "buyer" && !isExpired(m) && !!m.storage_path);
}

function shareableCatalogues(media: MediaAsset[]): MediaAsset[] {
  return media.filter((m) => m.kind === "catalogue" && m.audience === "buyer" && !isExpired(m) && !!m.storage_path);
}

function shareableVideos(media: MediaAsset[]): MediaAsset[] {
  return media.filter((m) => m.kind === "video" && m.audience === "buyer" && !isExpired(m));
}

/**
 * @param media danh sách media assets của CHÍNH sản phẩm này (caller đã lọc theo
 * product_id). Hàm chỉ lo lọc theo kind/audience/hạn dùng.
 */
export function productCompleteness(
  product: SupplierProduct,
  media: MediaAsset[],
): ProductCompleteness {
  const translation = productTranslationState(product);
  const images = shareableImages(media);
  const catalogues = shareableCatalogues(media);
  const videos = shareableVideos(media);

  const checks: CompletenessCheck[] = [
    // ---- gate (40): điều kiện hiện đúng trên sàn ----
    { key: "gate_image", label: "Thêm ít nhất 1 ảnh sản phẩm chia sẻ buyer", done: images.length > 0, points: 15, group: "gate", step: 2 },
    { key: "gate_catalogue", label: "Đính kèm catalogue PDF chia sẻ buyer", done: catalogues.length > 0, points: 8, group: "gate", step: 2 },
    { key: "gate_approved", label: "Gửi sản phẩm để Vexim duyệt", done: productReview(product) === "approved", points: 9, group: "gate", step: 3 },
    { key: "gate_ready", label: "Bật sẵn sàng hiển thị cho buyer", done: product.ready_for_buyer === true, points: 8, group: "gate", step: 3 },

    // ---- buyer (40): thông tin mua hàng ----
    { key: "buyer_price", label: "Nhập giá tham khảo và đơn vị tiền", done: product.ref_price != null && !!product.currency, points: 7, group: "buyer", step: 1 },
    { key: "buyer_price_public", label: "Cho phép hiện giá tham khảo công khai", done: product.ref_price != null && product.price_publicly_visible === true, points: 3, group: "buyer", step: 1 },
    { key: "buyer_moq", label: "Khai số lượng đặt tối thiểu (MOQ)", done: !!(product.moq && product.moq.trim()) || product.moq_qty != null, points: 8, group: "buyer", step: 1 },
    { key: "buyer_english", label: "Dịch tên/mô tả sang tiếng Anh cho buyer", done: translation.hasEnglish, points: 8, group: "buyer", step: 1 },
    { key: "buyer_display_name", label: "Soạn tên hiển thị chuẩn cho buyer", done: !!(product.display_name && product.display_name.trim()), points: 5, group: "buyer", step: 1 },
    { key: "buyer_capacity", label: "Khai năng lực mỗi tháng", done: !!(product.monthly_capacity && product.monthly_capacity.trim()), points: 5, group: "buyer", step: 1 },
    { key: "buyer_leadtime", label: "Khai thời gian giao hàng", done: product.lead_time_days != null && product.lead_time_days > 0, points: 2, group: "buyer", step: 1 },
    { key: "buyer_incoterm", label: "Khai điều kiện Incoterm", done: !!(product.incoterm && product.incoterm.trim()), points: 2, group: "buyer", step: 1 },

    // ---- fresh (20): độ tươi & chiều sâu ----
    // Chưa có bản dịch nào thì không thể "cũ" — việc thiếu EN đã bị trừ ở buyer_english.
    { key: "fresh_translation", label: "Cập nhật lại bản dịch tiếng Anh (nội dung gốc đã thay đổi)", done: translation.hasEnglish ? translation.current : true, points: 7, group: "fresh", step: 1 },
    { key: "fresh_images3", label: "Thêm đủ 3 ảnh trở lên cho buyer xem kỹ", done: images.length >= 3, points: 5, group: "fresh", step: 2 },
    { key: "fresh_video", label: "Đính kèm video sản phẩm", done: videos.length > 0, points: 4, group: "fresh", step: 2 },
    { key: "fresh_featured", label: "Chọn ảnh đại diện cho sản phẩm", done: !!product.featured_media_id && images.some((m) => m.id === product.featured_media_id), points: 4, group: "fresh", step: 2 },
  ];

  const score = Math.round(checks.reduce((sum, c) => sum + (c.done ? c.points : 0), 0));
  const missing = checks.filter((c) => !c.done).sort((a, b) => b.points - a.points || a.step - b.step);
  return {
    score,
    ...completenessLabel(score),
    checks,
    missing,
  };
}

export function completenessLabel(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "Xuất sắc", tone: "bg-emerald-100 text-emerald-800" };
  if (score >= 65) return { label: "Tốt", tone: "bg-sky-100 text-sky-800" };
  if (score >= 40) return { label: "Cơ bản", tone: "bg-amber-100 text-amber-900" };
  return { label: "Cần bổ sung", tone: "bg-rose-100 text-rose-800" };
}

/** Badge điểm gọn dùng chung ở cổng NCC và CRM. class màu do tone trả về. */
export function completenessBadgeClass(c: ProductCompleteness): string {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${c.tone}`;
}
