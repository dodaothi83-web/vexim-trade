/**
 * Chuỗi cụm 3b của giai đoạn 2: trang sản phẩm trong cổng nhà cung cấp.
 *
 * Ba phần: khung hai trang (`new`, `[id]`), khối chứng nhận áp cho sản phẩm, và biểu mẫu
 * sản phẩm. `en` là bản gốc; `vi` khai theo kiểu suy ra từ nó.
 */
const en = {
  newPage: {
    title: "Add a product",
    sub: "Fill it in from top to bottom. Fields marked * are required before you can send it for review; you can save a draft at any time.",
    breadcrumb: "Add new",
    products: "Products",
    breadcrumbAria: "Breadcrumb",
  },
  productPage: {
    sub: "Complete the details, check the files you uploaded and follow the review feedback.",
    breadcrumbAria: "Breadcrumb",
    products: "Products",
    previewNotice: "Open the quantity pricing preview",
    previewNoticeAfter: " The preview does not change what buyers see."
  },
  certificates: {
    aria: "Certificates for this product",
    title: "Certificates that apply",
    subBlocked: "Certificates of a partner factory need partner factory verification before they can be attached to a product.",
    sub: "Certificates approved for this category apply automatically. Untick any certificate that does not match the product.",
    none: "No quality certificate applies to this product yet.",
    noneHint: "Upload one below; staff classify it and set the scope after review.",
    othersTitle: "Other certificates on your profile",
    othersExpired: "Expired, so not applied to this category.",
    othersPending: "Not applied to this category yet.",
    requestScope: "Request wider scope",
    requestedScope: "Wider scope requested",
    pendingUpload: "just uploaded, waiting for staff to check and set the scope.",
    othersCount: "{count} other certificates on your profile are not attached to this product (legal documents, batch documents or waiting to be classified).",
    lockedTitle: "Certificates cannot be uploaded yet",
    lockedNext: "Finish partner factory verification in Factory verification.",
    lockedKeep: "Your product still saves, sends for review and goes live as usual.",
    uploadTitle: "Upload or renew a certificate",
    uploadSub: "Uploading the file is all you do. Staff classify the certificate type and set the category scope before buyers see it.",
    renewLabel: "Renew an existing certificate",
    renewNew: "+ New certificate",
    renewOption: "Renew: {name}",
    renewOptionExpiry: "Renew: {name} (expires {date})",
    labelLabel: "Name on the certificate (optional)",
    labelPlaceholder: "e.g. ISO 22000:2018",
    fileTitle: "PDF or image file",
    fileHint: "Up to 15 MB. Buyers only see the file once it is approved.",
    upload: "Upload",
    uploading: "Uploading…",
    saveChoice: "Save selection",
    saving: "Saving…",
    uploaded: "Certificate received. Staff classify it and set the scope before buyers see it.",
    uploadFailed: "The file could not be saved.",
    networkError: "Could not connect to the server. Please try again.",
    confirmedForProduct: "Staff confirmed this certificate for this product.",
    confirmedScope: "Staff confirmed the scope for this product.",
    inheritedFrom: "Applied through the {category} category.",
    expiredNote: " The certificate has expired, so it is not applied.",
    holderPartner: "The certificate must be in the name of your partner factory: {factory}.",
    holderPartnerPending: "Certificates in the name of the partner factory are matched against the contract before publishing.",
    holderBlocked: "Partner factory not verified yet: certificates in another factory's name cannot be used.",
    holderOwn: "The certificate must be in the name of your own factory.",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]>;
};

export type ProductEditorMessages = DeepStrings<typeof en>;

const vi: ProductEditorMessages = {
  newPage: {
    title: "Thêm sản phẩm",
    sub: "Điền theo thứ tự từ trên xuống. Trường có dấu * là bắt buộc để gửi duyệt; bạn lưu nháp bất cứ lúc nào.",
    breadcrumb: "Thêm mới",
    products: "Sản phẩm",
    breadcrumbAria: "Đường dẫn",
  },
  productPage: {
    sub: "Hoàn thiện thông tin, kiểm tra tệp đã tải và theo dõi phản hồi duyệt.",
    breadcrumbAria: "Đường dẫn",
    products: "Sản phẩm",
    previewNotice: "Mở trang thử nghiệm giá theo số lượng",
    previewNoticeAfter: " Trang thử nghiệm chưa thay đổi thông tin người mua đang thấy.",
  },
  certificates: {
    aria: "Chứng nhận cho sản phẩm này",
    title: "Chứng nhận áp dụng",
    subBlocked: "Chứng nhận của nhà máy đối tác cần xác thực nhà máy trước khi gắn vào sản phẩm.",
    sub: "Giấy đã duyệt cho danh mục này tự áp cho sản phẩm. Bỏ tick giấy không đúng với sản phẩm.",
    none: "Sản phẩm chưa có chứng nhận chất lượng nào áp dụng.",
    noneHint: "Tải giấy bên dưới; nhân viên phân loại và chọn phạm vi sau khi duyệt.",
    othersTitle: "Giấy khác trên hồ sơ",
    othersExpired: "Giấy đã hết hạn nên chưa áp dụng cho danh mục này.",
    othersPending: "Chưa áp dụng cho danh mục này.",
    requestScope: "Yêu cầu mở rộng phạm vi",
    requestedScope: "Đã xin mở rộng phạm vi",
    pendingUpload: "vừa tải lên, chờ nhân viên đối chiếu và chọn phạm vi áp dụng.",
    othersCount: "{count} giấy khác trên hồ sơ không gắn vào sản phẩm này (giấy pháp lý, giấy theo lô hoặc chờ phân loại).",
    lockedTitle: "Chưa tải chứng nhận được",
    lockedNext: "Hoàn tất xác thực nhà máy đối tác ở mục Xác thực nhà máy.",
    lockedKeep: "Sản phẩm vẫn lưu, gửi duyệt và đăng bán bình thường.",
    uploadTitle: "Tải lên hoặc gia hạn chứng nhận",
    uploadSub: "Chỉ cần tải tệp. Nhân viên phân loại loại giấy và chọn phạm vi danh mục trước khi hiện cho người mua.",
    renewLabel: "Gia hạn giấy đã có",
    renewNew: "+ Giấy mới",
    renewOption: "Gia hạn: {name}",
    renewOptionExpiry: "Gia hạn: {name} (hạn {date})",
    labelLabel: "Tên trên giấy (không bắt buộc)",
    labelPlaceholder: "VD: ISO 22000:2018",
    fileTitle: "Tệp PDF hoặc ảnh",
    fileHint: "Tối đa 15 MB. Tệp chỉ hiện với người mua sau khi được duyệt.",
    upload: "Tải lên",
    uploading: "Đang tải lên…",
    saveChoice: "Lưu lựa chọn",
    saving: "Đang lưu…",
    uploaded: "Đã nhận chứng nhận. Nhân viên phân loại và chọn phạm vi trước khi hiện cho người mua.",
    uploadFailed: "Không lưu được tệp.",
    networkError: "Không kết nối được máy chủ. Vui lòng thử lại.",
    confirmedForProduct: "Nhân viên đã xác nhận riêng cho sản phẩm này.",
    confirmedScope: "Nhân viên đã xác nhận phạm vi cho sản phẩm này.",
    inheritedFrom: "Áp theo danh mục {category}.",
    expiredNote: " Giấy đã hết hạn nên tạm không áp dụng.",
    holderPartner: "Giấy phải đứng tên nhà máy đối tác: {factory}.",
    holderPartnerPending: "Giấy đứng tên nhà máy đối tác sẽ được đối chiếu hợp đồng trước khi đăng.",
    holderBlocked: "Chưa xác thực nhà máy đối tác: giấy đứng tên nhà máy khác chưa dùng được.",
    holderOwn: "Chứng nhận phải đứng tên nhà máy của bạn.",
  },
};

export const productEditorMessages = { en, vi } as const;
