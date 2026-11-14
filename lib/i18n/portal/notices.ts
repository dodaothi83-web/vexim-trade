/**
 * Chuỗi thông báo của cổng nhà cung cấp (chuông ở thanh trên).
 *
 * Thông báo được dựng ở `lib/supplier-portal/dashboard.ts` từ dữ liệu thật, nên câu chữ
 * phải đi theo ngôn ngữ đang chọn giống phần khung. Hàm dựng nhận `language` với mặc định
 * `vi`; API `/api/supplier-portal/notifications` truyền locale đọc từ cookie.
 *
 * Ghi chú do nhân viên viết (`review_note`, `supplier_review_note`) là dữ liệu, không dịch.
 */
const en = {
  levels: {
    documents: "Document check",
    factory: "Factory verification",
    delivery: "Delivery history",
  },
  submissions: {
    factory: "Factory verification (L3)",
    export: "Export history (L2)",
  },
  onboardingApproved: {
    title: "Your supplier account is open",
    detail: "You can use the supplier portal. Approving verification and publishing your profile are separate decisions.",
  },
  rfqSent: {
    title: "Quote request {code} was sent to you",
    detail: "Open this RFQ in your portal to see the deadline and reply or submit your quote there. Email is only a notice.",
  },
  rfqSelected: {
    title: "Quote {code} was selected",
    detail: "Open your RFQ to discuss next steps with Vexim. Sourcing buyer contact remains private.",
  },
  rfqReply: {
    title: "The buyer replied to RFQ {code}",
    detail: "Read the conversation in this RFQ. Other suppliers cannot see it.",
  },
  reviewReturned: {
    title: "{label} needs more evidence",
    detail: "Open that step to see the reason and upload the missing documents again.",
  },
  reviewApproved: {
    title: "{label} approved",
    detail: "Only this review is confirmed; publishing your profile is a separate decision.",
  },
  product: {
    live: "Product is live: {name}",
    pending: "Product approved, waiting to publish: {name}",
    liveDetail: "The product is visible to buyers. You can manage its details and photos.",
    pendingDetail: "The product is approved. An administrator will finish publishing it.",
    changes: "Product needs changes: {name}",
    changesFallback: "Open the product to see the feedback.",
  },
  certificate: {
    published: "Certificate cleared for display: {name}",
    publishedDetail: "A badge only appears on products in the right scope when eligible; the internal file stays private.",
    approved: "Copy reviewed: {name}",
    approvedDetail: "Not published yet. Showing it on the buyer page needs a separate decision.",
    changes: "Certificate needs more evidence: {name}",
    changesFallback: "Open Documents and certificates to upload an updated copy.",
    rejected: "Certificate not accepted: {name}",
    rejectedFallback: "Open Documents and certificates to upload another copy, or contact support.",
    expiring: "Certificate expiring in {days} days: {name}",
    expiringDetail: "Expires on {date}. Upload the renewal in Documents and certificates.",
    expired: "Certificate expired: {name}",
    expiredDetail: "Expired on {date} and hidden from buyers for now. Upload the renewal in Documents and certificates.",
  },
  submission: {
    queued: "Self-submitted evidence waiting for review: {label}",
    queuedDetail: "An officer still has to check it; the evidence is locked while it is under review.",
    returned: "Self-submitted evidence needs more: {label}",
    returnedFallback: "Open the self-verification step to see why and upload new evidence.",
    accepted: "Evidence accepted into the review round: {label}",
    acceptedDetail: "This is not a verification result yet; an officer with approval rights still has to sign it off.",
  },
  contacted: {
    title: "Contact logged: {label}",
    detail: "This is a planning contact, not a review result.",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type NoticesMessages = DeepStrings<typeof en>;

const vi: NoticesMessages = {
  levels: {
    documents: "Kiểm tra giấy tờ",
    factory: "Xác thực nhà máy",
    delivery: "Lịch sử giao hàng",
  },
  submissions: {
    factory: "Xác thực nhà máy (L3)",
    export: "Lịch sử xuất khẩu (L2)",
  },
  onboardingApproved: {
    title: "Tài khoản nhà cung cấp đã được mở quyền",
    detail: "Bạn có thể dùng cổng nhà cung cấp. Việc duyệt xác minh và công khai hồ sơ là quyết định riêng.",
  },
  rfqSent: {
    title: "Yêu cầu báo giá {code} đã được chuyển tới",
    detail: "Mở RFQ trong cổng để xem hạn phản hồi và trao đổi hoặc nộp báo giá tại đó. Email chỉ để thông báo.",
  },
  rfqSelected: {
    title: "Hồ sơ {code} đã được chọn",
    detail: "Mở RFQ để trao đổi bước tiếp theo với Vexim. Liên hệ người mua trong RFQ tìm nguồn vẫn riêng tư.",
  },
  rfqReply: {
    title: "Người mua đã trả lời RFQ {code}",
    detail: "Xem mạch trao đổi của RFQ này. Nhà cung cấp khác không thấy nội dung.",
  },
  reviewReturned: {
    title: "{label} cần bổ sung",
    detail: "Mở đúng bước để xem lý do và tải lại giấy tờ còn thiếu.",
  },
  reviewApproved: {
    title: "{label} đã được duyệt",
    detail: "Chỉ đánh giá này được xác nhận; việc công khai hồ sơ là quyết định riêng.",
  },
  product: {
    live: "Sản phẩm đã đăng: {name}",
    pending: "Sản phẩm đã duyệt, chờ đăng: {name}",
    liveDetail: "Sản phẩm đang hiển thị với người mua. Bạn có thể quản lý thông tin và hình ảnh.",
    pendingDetail: "Sản phẩm đã duyệt. Quản trị viên sẽ hoàn tất đăng sản phẩm.",
    changes: "Sản phẩm cần chỉnh sửa: {name}",
    changesFallback: "Mở sản phẩm để xem phản hồi.",
  },
  certificate: {
    published: "Chứng nhận được phép hiển thị: {name}",
    publishedDetail: "Chỉ hiện nhãn trên sản phẩm đúng phạm vi nếu đủ điều kiện; tệp nội bộ vẫn riêng tư.",
    approved: "Đã xét duyệt bản sao: {name}",
    approvedDetail: "Chưa công bố. Việc hiển thị trên trang người mua cần được quyết định riêng.",
    changes: "Chứng nhận cần bổ sung: {name}",
    changesFallback: "Mở mục Giấy tờ và chứng nhận để tải bản cập nhật.",
    rejected: "Chứng nhận không được chấp thuận: {name}",
    rejectedFallback: "Mở mục Giấy tờ và chứng nhận để tải bản khác hoặc liên hệ hỗ trợ.",
    expiring: "Chứng nhận sắp hết hạn (còn {days} ngày): {name}",
    expiringDetail: "Hết hạn ngày {date}. Tải bản gia hạn ở mục Giấy tờ và chứng nhận.",
    expired: "Chứng nhận đã hết hạn: {name}",
    expiredDetail: "Hết hạn ngày {date}, tạm không hiện với người mua. Tải bản gia hạn ở mục Giấy tờ và chứng nhận.",
  },
  submission: {
    queued: "Hồ sơ tự gửi đang chờ duyệt: {label}",
    queuedDetail: "Hồ sơ đang chờ đối chiếu; bằng chứng tạm khóa trong khi xét.",
    returned: "Hồ sơ tự gửi cần bổ sung: {label}",
    returnedFallback: "Mở cổng tự xác thực để xem lý do và tải bằng chứng mới.",
    accepted: "Hồ sơ đã được nhận vào đợt kiểm: {label}",
    acceptedDetail: "Đây chưa phải kết quả duyệt huy hiệu; đợt kiểm vẫn cần người có quyền duyệt phê.",
  },
  contacted: {
    title: "Đã ghi nhận liên hệ: {label}",
    detail: "Đây là liên hệ lên kế hoạch, chưa phải kết quả duyệt.",
  },
};

export const noticesMessages = { en, vi };
