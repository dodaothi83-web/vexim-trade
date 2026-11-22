/**
 * Nhãn tiếng Việt cho thông số theo nhóm hàng — CHỈ để hiển thị trong form nhập liệu
 * (cổng nhà cung cấp tiếng Việt và CRM).
 *
 * Giá trị lưu vào `specs` vẫn là chuỗi gốc tiếng Anh do Vexim cấu hình trong CRM
 * (ví dụ "Green beans"), vì bộ lọc và thẻ sản phẩm cho người mua đọc đúng chuỗi đó.
 * Lựa chọn chưa có trong bảng thì hiện nguyên văn.
 */
const OPTION_LABELS_VI: Record<string, string> = {
  // Cà phê · Product form
  "Green beans": "Cà phê nhân (chưa rang)",
  "Roasted beans": "Cà phê hạt rang",
  "Ground coffee": "Cà phê bột (rang xay)",
  "Instant coffee": "Cà phê hoà tan",
  // Trà
  "Green Tea": "Trà xanh",
  "Black Tea": "Trà đen",
  // Trái cây sấy · Drying method
  "Freeze-dried": "Sấy thăng hoa",
  "Vacuum-fried": "Sấy chân không",
  "Soft-dried": "Sấy dẻo",
  "Hot-air dried": "Sấy khô (khí nóng)",
};

const FIELD_LABELS_VI: Record<string, string> = {
  "Product form": "Dạng sản phẩm",
  "Drying method": "Cách sấy",
  "Tea type": "Loại trà",
  "Product type": "Loại sản phẩm",
};

export function attributeOptionLabel(value: string, lang: "vi" | "en" = "vi"): string {
  return lang === "vi" ? OPTION_LABELS_VI[value] ?? value : value;
}

export function attributeFieldLabel(label: string, lang: "vi" | "en" = "vi"): string {
  return lang === "vi" ? FIELD_LABELS_VI[label] ?? label : label;
}
