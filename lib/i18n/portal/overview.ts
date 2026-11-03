/**
 * Chuỗi trang tổng quan cổng nhà cung cấp (cụm 1 của giai đoạn 2).
 *
 * Các chuỗi có ngoặc nhọn là mẫu; `fill()` trong `lib/i18n/format.ts` thay giá trị vào.
 * Số và ngày do trang định dạng theo `intlLocale(locale)`, không nhét sẵn vào chuỗi.
 */
const en = {
  eyebrow: "Supplier portal · private",
  title: "Overview",
  actions: {
    addProduct: "Add product",
  },
  changesRequested: {
    title: "Your profile needs more information. Please update it and resubmit for Vexim to review.",
    note: "What to add: {note}",
  },
  pending: {
    title: "Profile awaiting Vexim review",
    body:
      "The profile for {company} has been sent and is waiting for Vexim to review. You can still sign in to check the status; product management, RFQs, notifications and reports open once Vexim reviews the profile.",
    disclaimer:
      "Confirming the account does not approve documents, verify the factory, confirm delivery history or publish the profile.",
    steps: {
      submit: { label: "Submit profile", note: "Sent" },
      review: { label: "Profile review", note: "Waiting for Vexim" },
      open: { label: "Portal opens", note: "When Vexim confirms" },
      products: { label: "Add products and receive RFQs", note: "After the portal opens" },
    },
  },
  degraded: {
    title: "Some portal data did not load",
    body:
      "Everything else still works. If this keeps happening, contact support so they can check the configuration.",
    labels: {
      products: "products",
      invites: "the list of assigned RFQs",
      certificates: "certificates",
      submissions: "self-submitted profiles",
      requests: "verification requests",
      documents: "documents in the check",
      items: "submitted evidence",
    },
  },
  status: {
    aria: "Storefront status",
    published: "Profile is public",
    unpublished: "Profile is not public",
    portalOpen: "Portal open",
    checks: {
      business: "Business verification",
      l2Partner: "L2 · Partner factory",
      l2Factory: "L2 · Factory",
      l2Unknown: "L2 · Supplier type unknown",
      l3: "L3 · Export",
    },
    products: "{count} products",
    certificates: "{count} certificates",
    viewPublic: "View public page",
    publicNote: "The public page only opens once the content is approved and the profile is published.",
  },
  kpi: {
    aria: "Storefront numbers",
    approved: { label: "Products with approved content", note: "Out of {total} products in the storefront" },
    pending: { label: "Awaiting review", note: "{draft} drafts · {changes} need changes · {paused} hidden" },
    rfqs: {
      label: "RFQs waiting for your reply",
      nextDue: "Nearest deadline {date}",
      overdue: "An RFQ is overdue since {date}",
      none: "No open deadlines",
    },
    received: { label: "RFQs received in 30 days", note: "{count} invitations answered" },
  },
  work: {
    title: "Waiting for you",
    sub: "Only items with work to do appear here. Open each page to handle the details.",
    empty: "Nothing is waiting. Products, documents and RFQs are all in good shape.",
    rows: {
      changes: "Products needing changes from feedback",
      pending: "Products awaiting content review",
      rfqs: "RFQs waiting for your reply",
      expiring: "Certificates expiring within 60 days",
      submissions: "Verification profiles awaiting review",
    },
  },
  footer: "Buyer details are shared only after both sides agree to an introduction. All messages go through this portal.",
  levelChip: { approved: "Approved", pending: "Under review", off: "Not approved" },
  pendingRefresh: "The status refreshes on its own while this page stays open.",
  verificationPanel: {
    title: "Business verification",
    sub: "Three independent steps, in order of progress. Each step has its own page to submit evidence and see the result.",
    counter: "{approved}/3 steps approved",
    progressAria: "Number of verification steps approved",
    step: "Step {level}",
    here: "You are here",
    footnote:
      "Uploading evidence does not grant a badge. A step only turns Approved once the profile is checked by hand and someone with approval rights signs off.",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type OverviewMessages = DeepStrings<typeof en>;

const vi: OverviewMessages = {
  eyebrow: "Cổng nhà cung cấp · riêng tư",
  title: "Tổng quan",
  actions: {
    addProduct: "Thêm sản phẩm",
  },
  changesRequested: {
    title: "Hồ sơ cần bổ sung thông tin. Vui lòng cập nhật và gửi lại để Vexim duyệt.",
    note: "Nội dung cần bổ sung: {note}",
  },
  pending: {
    title: "Hồ sơ đang chờ Vexim duyệt",
    body:
      "Hồ sơ {company} đã gửi và đang chờ Vexim duyệt. Bạn vẫn đăng nhập được để xem trạng thái; quản lý sản phẩm, RFQ, thông báo và báo cáo sẽ mở sau khi Vexim duyệt hồ sơ.", // copy-allow: khối giải thích dài, hiển thị thành đoạn riêng
    disclaimer:
      "Xác nhận tài khoản không đồng nghĩa duyệt giấy tờ, xác thực nhà máy, lịch sử giao hàng hoặc công khai hồ sơ.",
    steps: {
      submit: { label: "Khai hồ sơ", note: "Đã gửi" },
      review: { label: "Xác nhận hồ sơ", note: "Đang chờ Vexim" },
      open: { label: "Mở cổng nhà cung cấp", note: "Khi Vexim xác nhận" },
      products: { label: "Thêm sản phẩm & nhận RFQ", note: "Sau khi mở cổng" },
    },
  },
  degraded: {
    title: "Một phần dữ liệu cổng chưa tải được",
    body:
      "Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.",
    labels: {
      products: "sản phẩm",
      invites: "danh sách RFQ được chuyển",
      certificates: "chứng nhận",
      submissions: "hồ sơ tự gửi",
      requests: "yêu cầu kiểm định",
      documents: "giấy tờ đợt kiểm",
      items: "bằng chứng đã nộp",
    },
  },
  status: {
    aria: "Trạng thái gian hàng",
    published: "Hồ sơ đang công khai",
    unpublished: "Hồ sơ chưa công khai",
    portalOpen: "Cổng đã mở",
    checks: {
      business: "Xác thực doanh nghiệp",
      l2Partner: "L2 · Nhà máy đối tác",
      l2Factory: "L2 · Nhà máy",
      l2Unknown: "L2 · Chưa rõ loại hình",
      l3: "L3 · Xuất khẩu",
    },
    products: "{count} sản phẩm",
    certificates: "{count} chứng nhận",
    viewPublic: "Xem trang công khai",
    publicNote: "Trang công khai chỉ mở sau khi nội dung được duyệt và hồ sơ được xuất bản.",
  },
  kpi: {
    aria: "Số liệu gian hàng",
    approved: { label: "Sản phẩm đã duyệt nội dung", note: "Trên {total} sản phẩm trong gian hàng" },
    pending: { label: "Đang chờ duyệt", note: "{draft} bản nháp · {changes} cần chỉnh sửa · {paused} tạm ẩn" },
    rfqs: {
      label: "RFQ cần bạn phản hồi",
      nextDue: "Hạn gần nhất {date}",
      overdue: "Có RFQ quá hạn từ {date}",
      none: "Không có hạn nào đang mở",
    },
    received: { label: "RFQ nhận trong 30 ngày", note: "{count} lời mời đã có phản hồi" },
  },
  work: {
    title: "Việc đang chờ bạn",
    sub: "Chỉ hiện mục đang có việc. Mở từng trang để xử lý chi tiết.",
    empty: "Không có việc nào đang chờ. Sản phẩm, giấy tờ và RFQ đều đang ở trạng thái ổn.",
    rows: {
      changes: "Sản phẩm cần chỉnh sửa theo góp ý",
      pending: "Sản phẩm đang chờ duyệt nội dung",
      rfqs: "RFQ đang chờ bạn phản hồi",
      expiring: "Chứng nhận sắp hết hạn trong 60 ngày",
      submissions: "Hồ sơ xác thực đang chờ xét",
    },
  },
  footer: "Thông tin người mua chỉ được chia sẻ sau khi hai bên đồng ý giới thiệu. Mọi trao đổi đi qua cổng này.",
  levelChip: { approved: "Đã duyệt", pending: "Đang chờ xét", off: "Chưa duyệt" },
  pendingRefresh: "Trạng thái tự cập nhật khi trang đang mở.",
  verificationPanel: {
    title: "Xác minh doanh nghiệp",
    sub: "Ba bước độc lập, xếp theo tiến độ. Mỗi bước có trang riêng để nộp bằng chứng và xem kết quả.",
    counter: "{approved}/3 bước đã duyệt",
    progressAria: "Số bước xác minh đã được duyệt",
    step: "Bước {level}",
    here: "Đang ở đây",
    footnote:
      "Tải bằng chứng không tự cấp huy hiệu. Mỗi bước chỉ chuyển sang Đã duyệt khi hồ sơ được đối chiếu thủ công và người có quyền duyệt phê kết quả.", // copy-allow: khối giải thích dài, hiển thị thành đoạn riêng
  },
};

export const overviewMessages = { en, vi } as const;

/** Nhãn trạng thái chip cấp xác minh, dùng cho `LevelChip` ở portal-ui. */
export type LevelChipMessages = OverviewMessages["levelChip"];
