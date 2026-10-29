/**
 * Xếp hạng lưới tự nhiên của marketplace — GĐ2: nối evidence + bật trọng số đặc tả.
 *
 * Trước GĐ1 (lib/public/product-catalog.ts) chỉ sort:
 *   verificationCount DESC → tên A-Z (localeCompare mặc định) → thứ tự vào (sort ổn định).
 * docs/sponsored-listing-spec.md mục 5 giữ nguyên: lưới tự nhiên không luân phiên ngẫu
 * nhiên, không bán vị trí, mức xác minh trước, KHÔNG xếp theo giờ cập nhật.
 *
 * Đường ống 6 bậc của đặc tả xếp hạng:
 *   B0 cổng công khai  → loại cứng, giữ trong product-catalog (không phải xếp hạng)
 *   B1 bộ lọc buyer    → loại cứng, giữ ở tầng trang (grade/tỉnh/danh mục/từ khoá tìm kiếm)
 *   B2 tầng xác minh   → nhóm 3/2/1/0 — CỨNG: NCC 2/3 có dữ liệu đẹp đến mấy cũng
 *                        không vượt NCC 3/3. Không cộng dồn điểm qua tầng.
 *   B3 điểm chất lượng → 0-100, chỉ so SÁU TRONG CÙNG TÀNG. GĐ2: trang danh mục
 *                        truyền SPEC_RANKING_WEIGHTS (30/30/15/15/10).
 *   B4 xử lý hoà       → giữ nguyên thứ tự vào (sort ổn định). Băm fnv1a(product.id)
 *                        vẫn để dự phòng, KHÔNG dùng — không bật ngầm.
 *   B5 xen kẽ NCC      → arrangeSupplierProducts (lib/public/supplier-product-order.ts).
 *
 * LỜI HỨA VẪN CÒN: với ZERO_RANKING_WEIGHTS, rankPublicCategoryProducts cho ra đúng
 * thứ tự của bộ so sánh cũ — scripts/check-marketplace-ranking.mjs chứng minh bằng
 * property test trên hoán vị ngẫu nhiên có hạt giống. Từ GĐ2 trang danh mục truyền
 * trọng số đặc tả một cách tường minh; hàm thuần vẫn tái tạo được xác thực cũ.
 *
 * Nguyên tắc chống gaming (đúng hạn của đặc tả):
 *   - Không dùng updated_at / độ mới của bản ghi để xếp hạng.
 *   - Không đếm ký tự, không điểm theo độ dài mô tả.
 *   - Mọi tín hiệu là boolean/tỷ lệ từ dữ liệu server đã có sẵn trên thẻ công khai.
 *   - Tiền chỉ mua vùng đẩy riêng; không tín hiệu nào ở đây đọc gói tài trợ.
 *   - Chứng nhận hết hạn chỉ TRỪ ĐIỂM trong tầng, không hạ tầng, không cổng ẩn —
 *     NCC thấy đường khắc phục (gia hạn giấy tờ) chứ không bị giấu khỏi kết quả.
 *
 * Module thuần: không import, không trạng thái, không đọc đồng hồ — "hôm nay" là
 * tham số do caller (server) truyền vào, giữ module deterministic giữa mọi lần dựng.
 */

/** Chỉ những trường thẻ công khai cần cho xếp hạng; PublicCategoryProduct thoả mãn cấu trúc này. */
export interface RankableProductCard {
  id: string;
  name: string;
  grade: string | null;
  attributes: Record<string, string>;
  moq: string;
  /** null khi giá đang bị cổng ẩn (hết hạn / mất consent / chưa opt-in). */
  price: string | null;
  /** Explicitly false for an old but still displayed quantity-price offer. */
  priceRankingEligible?: boolean;
  pricePoint: { value: number; unit: string | null; currency: string | null; updatedAt: string | null } | null;
  province: string;
  leadTimeDays: number | null;
  incoterm: string | null;
  oem: boolean;
  odm: boolean;
  samples: boolean;
  verificationCount: number;
  /**
   * Số bước xác minh CÒN HIỆU LỰC (0-3) — do caller tính từ evidence của NCC bằng
   * evidenceValidVerificationSteps. Thiếu/undefined (đường dẫn không xếp hạng) thì
   * tín hiệu tin cậy = 0: không tự suy "đã từng duyệt = còn hiệu lực".
   */
  evidenceValidSteps?: number | null;
  imagePaths: string[];
}

/**
 * Chỉ những trường chứng nhận cần cho việc đếm evidence còn hiệu lực; Certificate
 * thật (lib/types.ts) thoả mãn cấu trúc này. Dạng structural để module giữ tính thuần.
 */
export interface RankableCertificate {
  /** Duyệt trạng thái duyệt của luồng review; chỉ "approved" mới là chứng cứ. */
  review_status?: string | null;
  /** Nhân viên ẩn chứng nhận (đang xét lại/gỡ) — không còn là chứng cứ sống. */
  staff_hidden?: boolean;
  /** Ngày hết hạn YYYY-MM-DD; null = giấy tờ không có hạn. */
  valid_until?: string | null;
}

/** Trọng số 5 nhóm tín hiệu của B3. Tổng mục tiêu trong đặc tả = 100. */
export interface RankingWeights {
  /** Tin cậy còn hiệu lực: số bước xác minh còn chứng cứ sống (evidenceValidSteps trên thẻ). */
  trustAlive: number;
  /** Chào hàng còn giá trị: giá vẫn công khai nghĩa là còn hạn giá + consent ≤ 180 ngày. */
  offerAlive: number;
  /** Độ khớp có cấu trúc với bộ lọc buyer đang áp (grade/tỉnh); không lọc thì tính việc đã khai grade. */
  structuredMatch: number;
  /** Đầy đủ dữ liệu: grade, giá, MOQ, thời gian giao, incoterm, ảnh. */
  dataCompleteness: number;
  /** Dịch vụ: OEM / ODM / mẫu. */
  service: number;
}

/** GĐ1: mọi tín hiệu tắt — dùng để tái tạo thứ tự sort cũ (property test dựa vào đây). */
export const ZERO_RANKING_WEIGHTS: RankingWeights = {
  trustAlive: 0, offerAlive: 0, structuredMatch: 0, dataCompleteness: 0, service: 0,
};

/** Trọng số mục tiêu của đặc tả — GĐ2: trang danh mục truyền vào làm trọng số thật. */
export const SPEC_RANKING_WEIGHTS: RankingWeights = {
  trustAlive: 30, offerAlive: 30, structuredMatch: 15, dataCompleteness: 15, service: 10,
};

/** Bối cảnh optional cho B3; các tín hiệu không cần ngữ cảnh thì tự đọc từ thẻ. */
export interface RankingContext {
  /** Bộ lọc buyer đang áp sau B1. */
  filter?: { grade?: string | null; province?: string | null };
}

export const MAX_VERIFICATION_STEPS = 3;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Đếm số bước xác minh CÒN HIỆU LỰC từ evidence của NCC — thuần, "hôm nay" là tham số.
 *
 * Quy tắc (chốt GĐ2, quyết định 2 — trừ điểm, KHÔNG cổng ẩn):
 *   - L2/L3 là xác minh theo sự kiện (bằng chứng giao hàng, hồ sơ nhà máy đã duyệt):
 *     đã duyệt là còn hiệu lực, dữ liệu không có khái niệm hết hạn.
 *   - L1 là chứng nhận giấy tờ có ngày hết hạn. Chỉ trừ khi NCC ĐÃ duyệt L1, CÓ chứng
 *     nhận đã duyệt (đủ điều kiện đối chiếu) mà TẤT CẢ đều đã quá hạn.
 *   - Fail-open có chủ đích: NCC legacy được duyệt L1 khi chưa có bảng chứng nhận,
 *     hoặc lỗi đọc CSDL ở caller, thì giữ nguyên số bước — hết hạn là việc trừ điểm,
 *     không phải lý do giấu NCC khỏi lưới. Cổng hiển thị công khai vẫn là chuyện của
 *     publicSupplierCertificates (publicly_visible, file media, holder...), còn đây
 *     chỉ đo độ tin cậy.
 *   - valid_until null hoặc sai dạng ISO: coi như còn hạn (không trừ) — không phạt
 *     NCC vì dữ liệu ngày bị thiếu/sai định dạng.
 *   - staff_hidden: chứng nhận bị nhân viên ẩn không còn là chứng cứ sống; nếu ẩn
 *     hết thì rơi về nhánh "không còn chứng nhận nào đếm được" → fail-open.
 */
export function evidenceValidVerificationSteps(
  approvedSteps: readonly number[],
  certificates: readonly RankableCertificate[],
  today: string,
): number {
  const count = approvedSteps.length;
  if (!approvedSteps.includes(1)) return count;
  const countable = certificates.filter((c) =>
    c != null && c.review_status === "approved" && c.staff_hidden !== true);
  if (countable.length === 0) return count;
  const alive = countable.some((c) =>
    !c.valid_until || !ISO_DATE.test(c.valid_until) || c.valid_until >= today);
  return alive ? count : Math.max(0, count - 1);
}

/** B2 — tầng xác minh: cao hơn luôn thắng, bất kể điểm. */
export function rankingTier(card: Pick<RankableProductCard, "verificationCount">): number {
  return card.verificationCount;
}

const clamp01 = (ratio: number) => Math.max(0, Math.min(1, ratio));

/**
 * Tin cậy còn hiệu lực — tính từ evidenceValidSteps của từng thẻ (caller điền theo
 * NCC bằng evidenceValidVerificationSteps). Thẻ không có dữ liệu evidence thì tín
 * hiệu bằng 0 — không tự suy "đã từng duyệt = còn hiệu lực".
 */
export function trustAliveSignal(card: RankableProductCard): number {
  return clamp01((card.evidenceValidSteps ?? 0) / MAX_VERIFICATION_STEPS);
}

/**
 * Chào hàng còn giá trị. Trường `price` chỉ khác null khi toàn bộ cổng giá đã
 * thoả: opt-in sản phẩm + consent NCC ≤ 180 ngày + price_valid_until còn hạn
 * (xem publicProductPrice trong lib/public/product-selection.ts). Giá theo số lượng
 * có thể vẫn hiển thị sau mốc 90 ngày; caller phải truyền priceRankingEligible=false
 * khi giá đó không còn được tính điểm. Hàm này không tự đọc đồng hồ.
 */
export function offerAliveSignal(card: RankableProductCard): number {
  return card.price != null && card.priceRankingEligible !== false ? 1 : 0;
}

/**
 * Độ khớp có cấu trúc. Có bộ lọc buyer thì khớp theo grade/tỉnh (khớp mới có điểm);
 * không có bộ lọc thì thưởng việc đã khai grade có cấu trúc thay vì tên gõ tay.
 */
export function structuredMatchSignal(card: RankableProductCard, context?: RankingContext): number {
  const grade = context?.filter?.grade ?? null;
  const province = context?.filter?.province ?? null;
  if (grade == null && province == null) return card.grade != null ? 1 : 0;
  const checks: boolean[] = [];
  if (grade != null) checks.push(card.grade === grade);
  if (province != null) checks.push(card.province === province);
  return checks.length ? checks.filter(Boolean).length / checks.length : 0;
}

/**
 * Đầy đủ dữ liệu — đúng nhóm "điểm hồ sơ" trong đặc tả: tính server-side từ các
 * trường có cấu trúc, KHÔNG đếm ký tự mô tả. Thiếu mục nào thì NCC thấy lời nhắc
 * "còn thiếu N mục" ở cổng NCC (GĐ2), không hiện vòng tròn 0-5 hay sao.
 */
export function dataCompletenessSignal(card: RankableProductCard): number {
  const checks = [
    card.grade != null,
    card.price != null && card.priceRankingEligible !== false,
    !!card.moq && card.moq !== "On request",
    card.leadTimeDays != null,
    card.incoterm != null,
    card.imagePaths.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}

/** Dịch vụ: OEM / ODM / cung mẫu. */
export function serviceSignal(card: RankableProductCard): number {
  return (Number(card.oem) + Number(card.odm) + Number(card.samples)) / 3;
}

/** B3 — tổng điểm theo trọng số; chỉ có ý nghĩa so sánh TRONG CÙNG TẦNG (B2 đã chặn trước). */
export function rankingScore(card: RankableProductCard, weights: RankingWeights, context?: RankingContext): number {
  return weights.trustAlive * trustAliveSignal(card) +
    weights.offerAlive * offerAliveSignal(card) +
    weights.structuredMatch * structuredMatchSignal(card, context) +
    weights.dataCompleteness * dataCompletenessSignal(card) +
    weights.service * serviceSignal(card);
}

/**
 * Bộ so sánh đầy đủ: tầng → điểm → tên A-Z → giữ thứ tự vào.
 * Với ZERO_RANKING_WEIGHTS, hai bậc đầu trung hoà (điểm mọi thẻ = 0) nên kết quả
 * rơi về đúng `b.verificationCount - a.verificationCount || a.name.localeCompare(b.name)`
 * của product-catalog hôm nay — kể cả hành vi sort ổn định khi trùng hoàn toàn.
 */
export function compareRankedProducts<T extends RankableProductCard>(
  a: T, b: T, weights: RankingWeights = ZERO_RANKING_WEIGHTS, context?: RankingContext,
): number {
  const tier = rankingTier(b) - rankingTier(a);
  if (tier !== 0) return tier;
  const score = rankingScore(b, weights, context) - rankingScore(a, weights, context);
  if (score !== 0) return score;
  return a.name.localeCompare(b.name);
}

/** Xếp hạng lưới tự nhiên — thuần: không đổi mảng đầu vào. */
export function rankPublicCategoryProducts<T extends RankableProductCard>(
  cards: readonly T[], weights: RankingWeights = ZERO_RANKING_WEIGHTS, context?: RankingContext,
): T[] {
  return [...cards].sort((a, b) => compareRankedProducts(a, b, weights, context));
}

/**
 * B4 (dự phòng, chưa dùng) — băm ổn định FNV-1a 32-bit: cùng id luôn ra cùng số,
 * trên mọi máy. KHÔNG dùng trong bộ so sánh để giữ lời hứa tái tạo thứ tự cũ;
 * bật khi cần thứ tự hoà không phụ thuộc thứ tự đọc từ CSDL.
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
