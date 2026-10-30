/**
 * Luân phiên vùng đẩy sản phẩm.
 *
 * Không phụ thuộc React, không đọc dữ liệu, không dùng `Math.random`. Cùng một
 * cửa sổ thời gian và cùng danh sách gói thì luôn ra cùng một kết quả, nên kiểm
 * được bằng số và không lệch giữa HTML dựng ở máy chủ với phần chạy trên trình
 * duyệt.
 *
 * Vì sao chia cửa sổ thay vì đảo theo từng lượt tải: xem docs/sponsored-listing-spec.md
 * mục 4. Tóm tắt: người xem trong cùng mười phút thấy cùng một bố cục, không có
 * cảm giác thẻ nhảy khi mở lại trang, và cân bằng hiển thị kiểm chứng được.
 *
 * Cách chọn: xếp các gói theo một thứ tự gốc cố định, rồi mỗi cửa sổ xoay vòng
 * danh sách đó đi một bậc. Nếu tập gói hợp lệ và số suất không đổi, số cửa sổ
 * được chọn giữa các gói gần bằng nhau. Một cửa sổ được chọn không phải một lượt
 * xem: còn phụ thuộc khách truy cập, bộ lọc và điều kiện hiển thị.
 */

/** Độ dài một cửa sổ luân phiên, tính bằng phút. */
export const ROTATION_WINDOW_MINUTES = 10;

/** Số thẻ tài trợ hiển thị đồng thời trên mỗi bề mặt. */
export const SPONSORED_SLOTS = { category: 3, home: 2 } as const;

/** Mã cửa sổ hiện tại. Mốc thời gian là UTC nên không phụ thuộc múi giờ máy chủ. */
export function rotationWindow(nowMs: number, windowMinutes: number = ROTATION_WINDOW_MINUTES): number {
  const size = Math.max(1, Math.trunc(windowMinutes)) * 60_000;
  return Math.floor(nowMs / size);
}

/**
 * Băm FNV-1a 32 bit. Chọn hàm băm đơn giản, có sẵn trong mọi môi trường, và đủ
 * tản cho vài chục gói mỗi danh mục.
 */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Thứ tự gốc, cố định giữa các máy chủ và các lần khởi động. Băm id gói một lần
 * để thứ tự này không phụ thuộc thứ tự dữ liệu trả về từ cơ sở dữ liệu.
 */
export function stableOrder<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => hash(a.id) - hash(b.id) || (a.id < b.id ? -1 : 1));
}

/**
 * Xếp thứ tự trong một cửa sổ: xoay thứ tự gốc đi `window` bậc.
 *
 * Với 12 gói hợp lệ và 3 suất không đổi, mỗi gói được chọn 3 lần trong 12
 * cửa sổ đầy đủ. Đó là số cửa sổ, không phải số lượt hiển thị thực tế.
 */
export function rankForWindow<T extends { id: string }>(items: readonly T[], window: number): T[] {
  const base = stableOrder(items);
  if (base.length === 0) return [];
  const shift = ((window % base.length) + base.length) % base.length;
  return [...base.slice(shift), ...base.slice(0, shift)];
}

/**
 * Chọn các gói được hiện ở cửa sổ hiện tại. Trả về tối đa `slots` phần tử, đã
 * xếp theo thứ tự hiển thị.
 */
export function selectSponsored<T extends { id: string }>(
  items: readonly T[],
  slots: number,
  nowMs: number,
  windowMinutes: number = ROTATION_WINDOW_MINUTES,
): T[] {
  const take = Math.max(0, Math.trunc(slots));
  if (take === 0 || items.length === 0) return [];
  return rankForWindow(items, rotationWindow(nowMs, windowMinutes)).slice(0, take);
}

/**
 * Gói còn hiệu lực hay không, xét theo đồng hồ máy chủ.
 *
 * Chỉ nhận gói đã duyệt và đang trong khoảng thời gian đã lưu. Gói mới được
 * duyệt có thời hạn 168 giờ; thời hạn gói cũ có thể khác và không tự sửa. Gói đã
 * hết hạn hoặc bị tạm dừng không vào vùng đẩy, kể cả khi dữ liệu còn sót lại.
 */
export function pushIsLive(
  push: { status: string; starts_at: string; ends_at: string },
  nowMs: number,
): boolean {
  if (push.status !== "approved") return false;
  const start = Date.parse(push.starts_at);
  const end = Date.parse(push.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= nowMs && end > nowMs;
}
