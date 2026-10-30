/**
 * Câu mô tả tìm kiếm dùng chung.
 *
 * Trước đây cùng một câu được viết lại ở bốn file (metadata trang chủ, metadata
 * gốc, trang danh mục, llms.txt) nên sửa một chỗ là ba chỗ còn lại lệch. Nay
 * mọi nơi đọc từ đây.
 *
 * Hai nguyên tắc viết:
 *   1. Nêu đường buyer tự chọn nhà cung cấp trước, đường nhờ Vexim tìm là dự phòng.
 *   2. Giữ dưới 155 ký tự để Google không cắt giữa câu.
 */

/** Mô tả trang chủ, dùng cho metadata trang chủ và metadata gốc. */
export const HOME_META_DESCRIPTION =
  "Verified Vietnamese food and agricultural suppliers across core export categories. Request a quote from the supplier you choose, or ask us to look for one.";

/** Câu dưới tiêu đề lớn ở trang chủ. Ngắn hơn mô tả tìm kiếm, cùng một thông điệp. */
export const HOME_HERO_LINE =
  "Browse verified Vietnamese suppliers and request a quote from the one you choose. Haven’t found the right fit? Send us your requirements and we look for suppliers that match.";

/** Đuôi ghép vào mô tả danh mục đã lưu trong CMS khi mô tả đó còn thiếu một trong hai đường. */
export const CATEGORY_META_SUFFIX =
  "Request a quote from a supplier you choose, or send your requirements and we look for suppliers that match.";

/** Câu bổ sung khi mô tả đã lưu chỉ nêu một trong hai đường. */
export const CATEGORY_OPEN_REQUEST_COMPLEMENT =
  "If you have not found the right fit, send your requirements and we look for suppliers that match.";

export const CATEGORY_CHOSEN_SUPPLIER_COMPLEMENT =
  "You can also request a quote from a supplier you choose.";

/**
 * Mô tả mặc định khi danh mục chưa có seo_desc_i18n.
 * Dẫn bằng tên hàng để khớp truy vấn, kết bằng điểm khác biệt so với các sàn khác.
 */
export function categoryMetaFallback(name: string): string {
  const label = name.trim();
  const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
  return `${capitalised} from Vietnam: verified suppliers, specs and buying terms. Send your request straight to the supplier.`;
}

/**
 * Mô tả đã lưu có nêu đường buyer tự chọn nhà cung cấp hay chưa.
 */
export function hasChosenSupplierPath(text: string): boolean {
  return /supplier you choose|your chosen supplier|chosen supplier/i.test(text);
}

/**
 * Mô tả đã lưu có nêu đường gửi yêu cầu mở hay chưa.
 *
 * Vẫn nhận diện chữ "shortlist" vì nhiều danh mục trong database còn câu cũ.
 * Nhận diện để không ghép thêm câu trùng, không phải để dùng lại từ đó trong
 * câu mới.
 */
export function hasOpenRequestPath(text: string): boolean {
  return /shortlist|we look for suppliers|suppliers that match|matched on your requirements/i.test(text);
}
