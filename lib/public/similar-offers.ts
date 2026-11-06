import { compareRankedProducts, SPEC_RANKING_WEIGHTS, type RankableProductCard } from "./ranking";

/**
 * "Similar offers": cùng mặt hàng từ nhà cung cấp KHÁC, để người mua so giá, MOQ, thời gian
 * giao và cấp xác minh. Không dùng ảnh: hàng nông sản cùng loại nhìn gần như giống nhau, nên
 * khớp theo danh mục và grade mới đúng.
 *
 * - Bỏ chính sản phẩm đang xem, sản phẩm mẫu và mọi sản phẩm của cùng nhà cung cấp.
 * - Mỗi nhà cung cấp tối đa một sản phẩm (lấy sản phẩm khớp grade và xếp hạng tốt nhất).
 * - Cùng grade lên trước; sau đó theo đúng thứ tự xếp hạng của trang danh mục (cấp xác minh,
 *   điểm hồ sơ, rồi luân phiên theo khung giờ cho các sản phẩm ngang điểm).
 */
export interface SimilarOfferCard extends RankableProductCard {
  supplierId: string;
  isDemo?: boolean;
  grades?: string[];
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function offerGrades(card: Pick<SimilarOfferCard, "grade" | "grades">): Set<string> {
  return new Set([...(card.grades ?? []), ...(card.grade ? [card.grade] : [])].map(norm).filter(Boolean));
}

/** Grade chung đầu tiên giữa hai sản phẩm (để ghi "Same grade W320"), null nếu không có. */
export function sharedGrade(current: Pick<SimilarOfferCard, "grade" | "grades">, other: Pick<SimilarOfferCard, "grade" | "grades">): string | null {
  const mine = offerGrades(current);
  const label = [...(other.grades ?? []), ...(other.grade ? [other.grade] : [])].find((g) => mine.has(norm(g)));
  return label?.trim() || null;
}

export function similarOffers<T extends SimilarOfferCard>(current: T, all: T[], options: { limit?: number; window: number }): { offer: T; sameGrade: string | null }[] {
  const tieBreak = { window: options.window };
  const candidates = all
    .filter((item) => item.id !== current.id && !item.isDemo && item.supplierId !== current.supplierId)
    .map((offer) => ({ offer, sameGrade: sharedGrade(current, offer) }))
    .sort((a, b) => Number(Boolean(b.sameGrade)) - Number(Boolean(a.sameGrade))
      || compareRankedProducts(a.offer, b.offer, SPEC_RANKING_WEIGHTS, undefined, tieBreak));
  const seen = new Set<string>();
  const picked: { offer: T; sameGrade: string | null }[] = [];
  for (const item of candidates) {
    if (seen.has(item.offer.supplierId)) continue;
    seen.add(item.offer.supplierId);
    picked.push(item);
    if (picked.length >= (options.limit ?? 4)) break;
  }
  return picked;
}
