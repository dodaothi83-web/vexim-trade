/**
 * Cách viết giá cho **người mua** trên toàn sàn: ký hiệu ngắn ($, €, ₫) thay cho mã
 * tiền tệ, số bỏ phần lẻ để thẻ sản phẩm không xuống dòng.
 *
 * Không dùng hàm ở đây cho câu nội bộ của nhân viên, email hay hoá đơn: ở đó mã tiền tệ
 * viết đầy đủ (USD) và số lẻ có ý nghĩa đối chiếu.
 *
 * Số tiền vẫn được làm tròn **chỉ khi hiển thị**; mọi phép tính, xếp hạng và khoảng giá
 * tham khảo vẫn dùng số gốc.
 */

/** Mã tiền tệ → ký hiệu. CNY và JPY cùng dùng ¥ nên phải phân biệt bằng tiền tố. */
const PRICE_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  VND: "₫",
  CNY: "CN¥",
  JPY: "JP¥",
};

/**
 * Giá dưới ngưỡng này cần phần lẻ, vì bỏ hết sẽ sai giá: 9,40–9,60 mà làm tròn thành
 * "9–10" là một khoảng giá khác. Giá từ 10 trở lên (kể cả giá theo tấn) hiện số nguyên
 * để một dòng không bị xuống hàng.
 */
const SMALL_PRICE = 10;

/** "USD" → "$". Mã lạ giữ nguyên để không đoán sai tiền tệ. */
export function priceCurrencySymbol(code: string | null | undefined): string {
  const value = (code ?? "").trim().toUpperCase();
  if (!value) return "";
  return PRICE_SYMBOLS[value] ?? value;
}

/** Số chữ số thập phân cho một nhóm giá (một giá hoặc hai đầu của một khoảng). */
function decimalsForValues(values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  return finite.every((value) => Math.abs(value) >= SMALL_PRICE) ? 0 : 2;
}

/**
 * Số tiền gọn: dấu phẩy ngăn nghìn, bỏ số 0 thừa ("8", "6.4", "150,000").
 *
 * Giá nhỏ hơn 1 (ví dụ 0,85 USD/kg) cũng giữ hai chữ số, vì làm tròn sẽ thành "$0" — một
 * con số sai hẳn chứ không phải gọn hơn.
 */
export function priceAmountText(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return "";
  const digits = Math.max(0, decimals ?? decimalsForValues([value]));
  // Dưới 1 đô luôn đủ hai chữ số: "$0.40" đọc được, "$0.4" thì như gõ dở.
  const floor = value > 0 && value < 1 ? 2 : 0;
  return value.toLocaleString("en-US", { minimumFractionDigits: floor, maximumFractionDigits: Math.max(floor, digits) });
}

/** "$1,500" — ký hiệu đứng sát số, không có khoảng trắng. */
export function formatMoney(value: number, currency = "USD", decimals?: number): string {
  return `${priceCurrencySymbol(currency)}${priceAmountText(value, decimals)}`;
}

/**
 * "$1,500–2,000". Hai đầu bằng nhau thì ghi một mức.
 *
 * Nếu làm tròn tới đơn vị khiến hai đầu trùng nhau trong khi giá thật khác nhau
 * (150,000 và 150,400 cùng thành 150,000), in thêm một rồi hai chữ số thập phân để không
 * biến một khoảng giá thành một mức giá phẳng không có thật.
 */
export function priceRangeText(low: number, high: number, currency = "USD", separator = "–"): string {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "";
  if (Math.abs(high - low) < 1e-9) return formatMoney(low, currency);
  const base = decimalsForValues([low, high]);
  for (const decimals of base === 0 ? [0, 1, 2] : [base]) {
    const from = priceAmountText(low, decimals);
    const to = priceAmountText(high, decimals);
    if (from !== to) return `${priceCurrencySymbol(currency)}${from}${separator}${to}`;
  }
  return `${formatMoney(low, currency)}${separator}${priceAmountText(high, base)}`;
}
