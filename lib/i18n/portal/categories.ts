import type { Locale } from "../config";

/**
 * Từ điển cụm 5b — trang "Danh mục kinh doanh".
 *
 * Nhãn danh mục (`label`, `intro`, `group`) là dữ liệu CMS nên vẫn đọc từ danh mục;
 * ở đây chỉ là khung trang, thống kê phạm vi và câu báo của server action.
 */
export const en = {
  metaTitle: "Business categories",
  eyebrow: "Supplier portal · private",
  title: "Business categories",
  sub: "Pick the groups your company sells in, from the list Vexim has opened. The scope tells staff what to review; picking a category does not publish anything.",
  backToProducts: "My products",
  emptyTitle: "No category to pick yet",
  emptyBody: "You cannot create a category yourself. Contact support if your industry is not listed; once it is opened it will show here so you can pick your sales scope.",
  emptyFoot: "Products, RFQs and other sections keep working as usual.",
  backToDashboard: "Back to dashboard",
  summary: {
    aria: "Business scope summary",
    picked: "Picked",
    pickedNote: "Up to 5 categories",
    open: "Categories open",
    openNote: "Only pick from this list",
    inside: "Products in scope",
    insideNote: "Already in a picked category",
    outside: "Products out of scope",
    outsideNote: "Move them before removing a category",
    outsideNone: "None",
  },
  catalog: {
    title: "Categories open",
    sub: "Tap a row to add or remove it. The number on the right is how many products use that category.",
    search: "Search categories",
    placeholder: "Search categories…",
    noMatch: "No category matches “{query}”.",
    rootGroup: "Main categories",
    groupPicked: "{count} picked · ",
    groupCount: "{count} categories",
    blockedTitle: "Already at 5 categories; remove one to add another",
    picked: "Picked",
    unpicked: "Not picked",
    shown: "Showing {shown}/{total} categories",
    perCategory: "{count} products",
  },
  products: {
    title: "Products by category",
    sub: "You cannot remove a category while your products are still in it.",
    manage: "Manage products",
    empty: "No products yet. After saving a category, add a product to send for review.",
    addFirst: "Add your first product",
    pendingPublish: "Approved, waiting to publish",
    noCategory: "No category yet",
    outside: "Out of scope",
    more: "and {count} more products - see them all under Products.",
    unassigned: "{count} products have no category - open each product to pick a published category.",
  },
  scope: {
    title: "Scope picked",
    aria: "Categories picked",
    empty: "No category picked yet. Pick at least one so you can create products.",
    removeAria: "Remove {name}",
    outside: "{count} products are outside the scope. To remove that category, move the products to a category you keep first.",
    save: "Save categories",
    saving: "Saving...",
    saveNote: "Only the sales scope is saved. Publishing a product happens at review.",
  },
  know: {
    title: "Good to know",
    items: [
      "You can only pick categories Vexim has opened; you cannot create a new one.",
      "The scope is context for staff when they review your products.",
      "Saving categories does not approve products or publish your storefront.",
      "Removing a category that still has products is blocked until you move them.",
    ],
  },
  shop: {
    count: "{count} products in your storefront",
    link: "Go to Products",
  },
  mobile: {
    picked: "Picked {count}/{max} categories",
  },
  errors: {
    offline: "Cannot reach the server.",
    noAccess: "This supplier account cannot use the portal yet.",
    productOutside: "Product “{name}” is still in a category you are removing. Contact support to move the product before removing the category.",
    saveFailed: "Could not save the categories.",
    saved: "Categories saved for your scope. Nothing is approved or published automatically.",
  },
};

export type CategoriesMessages = typeof en;

export const vi: CategoriesMessages = {
  metaTitle: "Danh mục kinh doanh",
  eyebrow: "Cổng nhà cung cấp · riêng tư",
  title: "Danh mục kinh doanh",
  sub: "Chọn nhóm hàng trong danh sách đang mở. Phạm vi giúp nhân viên xem xét sản phẩm; thêm danh mục không đăng gian hàng hay duyệt sản phẩm.", // copy-allow — câu gốc, giữ nguyên
  backToProducts: "Sản phẩm của tôi",
  emptyTitle: "Chưa có danh mục nào để chọn",
  emptyBody: "Bạn không tự tạo được danh mục mới. Liên hệ bộ phận hỗ trợ nếu ngành hàng của bạn chưa có trong danh sách; khi được mở, danh mục sẽ hiện ở đây để bạn chọn phạm vi bán hàng.", // copy-allow — câu gốc, giữ nguyên
  emptyFoot: "Sản phẩm, RFQ và thông báo ở các mục khác vẫn dùng bình thường.",
  backToDashboard: "Về bảng điều khiển",
  summary: {
    aria: "Tổng quan phạm vi kinh doanh",
    picked: "Đã chọn",
    pickedNote: "Tối đa 5 danh mục",
    open: "Danh mục đang mở",
    openNote: "Chỉ chọn trong danh sách này",
    inside: "Sản phẩm trong phạm vi",
    insideNote: "Đang thuộc danh mục đã chọn",
    outside: "Sản phẩm ngoài phạm vi",
    outsideNote: "Cần chuyển trước khi bỏ danh mục",
    outsideNone: "Không có",
  },
  catalog: {
    title: "Danh mục đang mở",
    sub: "Bấm vào một dòng để thêm hoặc bỏ. Số bên phải là sản phẩm đang dùng danh mục đó.",
    search: "Tìm danh mục",
    placeholder: "Tìm danh mục…",
    noMatch: "Không có danh mục nào khớp “{query}”.",
    rootGroup: "Danh mục chính",
    groupPicked: "{count} đã chọn · ",
    groupCount: "{count} danh mục",
    blockedTitle: "Đã chọn đủ 5 danh mục - bỏ một danh mục để thêm",
    picked: "Đã chọn",
    unpicked: "Chưa chọn",
    shown: "Hiển thị {shown}/{total} danh mục",
    perCategory: "{count} sản phẩm",
  },
  products: {
    title: "Sản phẩm theo danh mục",
    sub: "Không bỏ được danh mục khi sản phẩm của bạn còn nằm trong đó.",
    manage: "Quản lý sản phẩm",
    empty: "Chưa có sản phẩm nào. Sau khi lưu danh mục, thêm sản phẩm để gửi duyệt.",
    addFirst: "Thêm sản phẩm đầu tiên",
    pendingPublish: "Đã duyệt, chờ đăng",
    noCategory: "Chưa gắn danh mục",
    outside: "Ngoài phạm vi",
    more: "và {count} sản phẩm khác - xem đầy đủ ở mục Sản phẩm.",
    unassigned: "{count} sản phẩm chưa gắn danh mục - mở từng sản phẩm để chọn danh mục đang xuất bản.",
  },
  scope: {
    title: "Phạm vi đang chọn",
    aria: "Số danh mục đã chọn",
    empty: "Chưa chọn danh mục nào. Chọn ít nhất một danh mục để tạo được sản phẩm.",
    removeAria: "Bỏ {name}",
    outside: "{count} sản phẩm đang nằm ngoài phạm vi. Muốn bỏ danh mục đó, hãy chuyển sản phẩm sang danh mục còn chọn trước.",
    save: "Lưu danh mục",
    saving: "Đang lưu...",
    saveNote: "Chỉ lưu phạm vi bán hàng. Việc đăng sản phẩm diễn ra ở bước duyệt.",
  },
  know: {
    title: "Cần biết",
    items: [
      "Chỉ chọn được danh mục đang mở; bạn không tự tạo danh mục mới.",
      "Phạm vi này là thông tin tham khảo khi nhân viên duyệt sản phẩm.",
      "Lưu danh mục không duyệt sản phẩm, không công khai gian hàng.",
      "Bỏ danh mục còn sản phẩm sẽ bị chặn cho tới khi chuyển sản phẩm.",
    ],
  },
  shop: {
    count: "{count} sản phẩm trong gian hàng",
    link: "Sang trang Sản phẩm",
  },
  mobile: {
    picked: "Đã chọn {count}/{max} danh mục",
  },
  errors: {
    offline: "Không kết nối được máy chủ.",
    noAccess: "Tài khoản nhà cung cấp chưa được mở quyền sử dụng cổng.",
    productOutside: "Sản phẩm “{name}” còn thuộc danh mục sẽ bỏ. Liên hệ bộ phận hỗ trợ để xử lý sản phẩm trước khi bỏ danh mục.",
    saveFailed: "Không lưu được danh mục.",
    saved: "Đã lưu danh mục được phép chọn. Không tự duyệt hoặc công khai sản phẩm.",
  },
};

export const categoriesMessages: Record<Locale, CategoriesMessages> = { en, vi };
