/**
 * Chuỗi phần "Nội dung hình ảnh" trên trang "Trang của tôi" (gói Premium/Pro).
 */
const en = {
  title: "Image content",
  sub: "Tell buyers about your raw material areas, production line and team. Write in English; shown on your public page.",
  lockedTitle: "Image content and the premium page layout come with Premium and Pro",
  lockedBody: "Your current plan is Basic. Ask Vexim about upgrading to add image content and use the premium layout.",
  lockedCta: "Ask about upgrading",
  count: "{count}/{max} blocks",
  add: "Add a block",
  image: "Photo",
  imageHint: "JPG, PNG or WebP, up to 3 MB. Landscape photos look best.",
  titleLabel: "Title",
  titlePlaceholder: "For example: Raw cashew sourcing in Binh Phuoc",
  bodyLabel: "Description (optional)",
  bodyPlaceholder: "One or two sentences buyers can read quickly.",
  save: "Save block",
  saving: "Saving…",
  cancel: "Cancel",
  edit: "Edit",
  delete: "Remove",
  confirmDelete: "Remove this block from your page?",
  moveUp: "Move up",
  moveDown: "Move down",
  empty: "No blocks yet. Add the first one to make your page stand out.",
  noContactNote: "Do not include email, phone numbers or links. Buyers contact you through Vexim.",
  errors: {
    signIn: "Sign in again to continue.",
    plan: "Image content is available on Premium and Pro plans.",
    full: "You can add up to {max} blocks.",
    image: "Choose a photo for this block.",
    imageInvalid: "This photo could not be used. Choose a JPG, PNG or WebP under 3 MB.",
    titleRequired: "Add a title.",
    titleTooLong: "Keep the title under {max} characters.",
    bodyTooLong: "Keep the description under {max} characters.",
    contact: "Remove email addresses, phone numbers and links.",
    language: "Write the title and description in English. Buyers on Vexim Trade read English.",
    notFound: "This block no longer exists. Reload the page.",
    failed: "Could not save. Try again in a moment.",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]>;
};

export type ShowcaseMessages = DeepStrings<typeof en>;

const vi: ShowcaseMessages = {
  title: "Nội dung hình ảnh",
  sub: "Giới thiệu vùng nguyên liệu, dây chuyền, đội ngũ. Viết bằng tiếng Anh vì người mua là khách quốc tế.",
  lockedTitle: "Nội dung hình ảnh và giao diện trang cao cấp có ở gói Premium và Pro",
  lockedBody: "Bạn đang dùng gói Basic. Hỏi Vexim về việc nâng gói để thêm nội dung hình ảnh và dùng giao diện cao cấp.",
  lockedCta: "Hỏi về nâng gói",
  count: "{count}/{max} khối",
  add: "Thêm khối",
  image: "Ảnh",
  imageHint: "JPG, PNG hoặc WebP, tối đa 3 MB. Ảnh ngang hiển thị đẹp nhất.",
  titleLabel: "Tiêu đề",
  titlePlaceholder: "Ví dụ: Raw cashew sourcing in Binh Phuoc",
  bodyLabel: "Mô tả (không bắt buộc)",
  bodyPlaceholder: "Một hai câu tiếng Anh để người mua đọc nhanh.",
  save: "Lưu khối",
  saving: "Đang lưu…",
  cancel: "Huỷ",
  edit: "Sửa",
  delete: "Gỡ",
  confirmDelete: "Gỡ khối này khỏi trang của bạn?",
  moveUp: "Lên trên",
  moveDown: "Xuống dưới",
  empty: "Chưa có khối nào. Thêm khối đầu tiên để trang của bạn nổi bật hơn.",
  noContactNote: "Không ghi email, số điện thoại hay đường dẫn. Người mua liên hệ bạn qua Vexim.",
  errors: {
    signIn: "Hãy đăng nhập lại để tiếp tục.",
    plan: "Nội dung hình ảnh có ở gói Premium và Pro.",
    full: "Bạn thêm được tối đa {max} khối.",
    image: "Chọn một ảnh cho khối này.",
    imageInvalid: "Không dùng được ảnh này. Chọn ảnh JPG, PNG hoặc WebP dưới 3 MB.",
    titleRequired: "Thêm tiêu đề.",
    titleTooLong: "Tiêu đề tối đa {max} ký tự.",
    bodyTooLong: "Mô tả tối đa {max} ký tự.",
    contact: "Bỏ email, số điện thoại và đường dẫn ra khỏi nội dung.",
    language: "Viết tiêu đề và mô tả bằng tiếng Anh. Người mua trên Vexim Trade đọc tiếng Anh.",
    notFound: "Khối này không còn. Tải lại trang.",
    failed: "Chưa lưu được. Thử lại sau ít phút.",
  },
};

export const showcaseMessages = { en, vi };
