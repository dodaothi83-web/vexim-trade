/**
 * Danh sách tháng giao hàng cho form RFQ.
 *
 * Không dùng `<input type="month">`: trình duyệt hiển thị placeholder theo ngôn ngữ của
 * máy người dùng ("---- năm ----" với máy tiếng Việt), trong khi form là tiếng Anh. Một
 * ô chọn cố định vừa đọc được bằng tiếng Anh ở mọi máy, vừa cho ra đúng chuỗi YYYY-MM mà
 * server đang kiểm.
 *
 * Hàm thuần, nhận "hôm nay" từ nơi gọi để server và test luôn ra cùng một danh sách.
 */
export const SHIPMENT_MONTH_COUNT = 24;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildShipmentMonths(today: Date, count = SHIPMENT_MONTH_COUNT): Array<{ value: string; label: string }> {
  const months: Array<{ value: string; label: string }> = [];
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth(); // 0-11
  for (let index = 0; index < count; index += 1) {
    months.push({
      value: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: `${MONTHS[month]} ${year}`,
    });
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return months;
}
