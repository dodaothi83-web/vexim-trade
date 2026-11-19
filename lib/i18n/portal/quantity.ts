/**
 * Câu trả về của server action duyệt lại bảng giá theo số lượng.
 *
 * Server action không nhận được `copy` từ client nên tự đọc locale bằng
 * `getPortalMessages()`. Câu kiểm tra chi tiết của `lib/products/quantity-pricing.ts`
 * dùng chung với CRM nên vẫn giữ nguyên tiếng Việt.
 */
const en = {
  dataChanged: "This data changed in another session. Reload before saving.",
  notOwned: "This product does not belong to your account.",
  priceNotSaved: "Could not save the price. Please try again.",
  noAccess: "You cannot manage this product or category.",
  consentRequired: "Confirm the price commitment before making it public.",
  invalidTableVersion: "Invalid price table version.",
  newUnitUnavailable: "The new unit is not ready to use yet.",
  invalidTable: "Invalid price table.",
  submitted: "Price updated. Buyers now see the new price.",
  saveFailed: "Could not save the price. Check the connection and the price settings, then try again.",
  englishNameBlocked: "Suppliers do not enter an English name. An administrator checks the translation at review.",
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type QuantityMessages = DeepStrings<typeof en>;

const vi: QuantityMessages = {
  dataChanged: "Dữ liệu đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.",
  notOwned: "Sản phẩm không thuộc tài khoản của bạn.",
  priceNotSaved: "Không lưu được giá. Vui lòng thử lại.",
  noAccess: "Không thể quản lý sản phẩm hoặc danh mục này.",
  consentRequired: "Hãy xác nhận cam kết giá trước khi công khai.",
  invalidTableVersion: "Phiên bản bảng giá không hợp lệ.",
  newUnitUnavailable: "Đơn vị mới chưa sẵn sàng để sử dụng.",
  invalidTable: "Bảng giá không hợp lệ.",
  submitted: "Đã cập nhật giá. Người mua thấy giá mới ngay.",
  saveFailed: "Không lưu được giá. Kiểm tra kết nối và cấu hình giá trước khi thử lại.",
  englishNameBlocked: "Nhà cung cấp không nhập tên tiếng Anh. Quản trị viên sẽ kiểm tra bản dịch khi duyệt.",
};

export const quantityMessages = { en, vi };
