/**
 * Chuỗi trang "Dịch vụ Vexim" trong cổng nhà cung cấp.
 *
 * Nhà cung cấp đã đăng nhập nên trang không có thẻ "Đăng ký miễn phí" như /for-suppliers.
 * Đây chỉ là yêu cầu tư vấn: không ghi giá, không hứa kết quả, không có nút mua.
 * Mỗi dịch vụ có câu giá trị chính (tagline) và 3 lợi ích cụ thể, chỉ nêu việc Vexim làm thật.
 */
const en = {
  metaTitle: "Vexim services",
  eyebrow: "Services for suppliers",
  title: "Vexim services",
  sub: "Solutions that help your business reach international buyers. Free consultation, reply within one business day.",
  fitLabel: "Best for",
  request: "Request a consultation",
  requestPlan: "Request an upgrade",
  servicesTitle: "Consulting services",
  requestOpen: "Request in progress",
  cancel: "Cancel",
  send: "Send request",
  sending: "Sending…",
  noteLabel: "Your needs (optional)",
  notePlaceholder: "For example: an English website for our cashew factory, ready before the next trade fair.",
  contactLine: "A Vexim specialist will contact {email}.",
  services: {
    international_website: {
      title: "Export website",
      tagline: "Your own English sales channel, built to international B2B standards.",
      points: [
        "Multilingual website presenting your production capacity and certificates",
        "Built for search, so buyers can find you on Google",
        "Quoted on the pages you actually need",
      ],
      fit: "Businesses without an English website, or whose current site brings no inquiries.",
    },
    featured_ads: {
      title: "Featured placement",
      tagline: "Put your brand where buyers look first on Vexim Trade.",
      points: [
        "Business banner in prominent positions on the marketplace",
        "You choose the position, size and display period",
        "Clear quote before anything goes live",
      ],
      fit: "Businesses launching a product line, entering a harvest season or building brand awareness.",
    },
    fda_compliance: {
      title: "US FDA compliance",
      tagline: "Guidance to complete the legal steps for exporting food to the United States.",
      points: [
        "FDA facility registration and renewal",
        "U.S. Agent, labelling, FSVP and Prior Notice support",
        "A first review of which steps your products need",
      ],
      fit: "Businesses preparing to export to the US or renewing their FDA registration.",
    },
    plan_upgrade: {
      title: "Membership plan",
      tagline: "Present your business more professionally and reach more buyers.",
      points: [
        "Unlimited product listings with Pro: your full export range in one storefront",
        "A premium storefront with A+ content and video that lets buyers see your factory, process and quality",
        "English articles about your business on Vexim Trade, so buyers can find you on Google",
        "Pro: featured in Vexim's weekly email to international buyers who follow your product category",
      ],
      fit: "Businesses that need more listings or want a stronger presence with buyers.",
    },
  },
  mine: {
    title: "My requests",
    empty: "No requests yet. Choose a service above to request a consultation.",
    reference: "Reference",
    sentOn: "Sent {date}",
    updatedOn: "Updated {date}",
  },
  status: {
    submitted: "Sent",
    active: "Active",
    cancelled: "Cancelled",
    expired: "Expired",
  },
  result: {
    sent: "Request {reference} sent. A Vexim specialist will contact you within one business day.",
    duplicate: "You already have a request in progress for this service. Vexim will contact you about it.",
    invalid: "This service is not available. Reload the page and try again.",
    tooLong: "Keep the note under 1,200 characters.",
    signIn: "Sign in again to send a request.",
    notApproved: "Services open once Vexim has approved your account.",
    failed: "Could not send the request. Try again in a moment.",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type ServicesMessages = DeepStrings<typeof en>;

const vi: ServicesMessages = {
  metaTitle: "Dịch vụ Vexim",
  eyebrow: "Dịch vụ dành cho nhà cung cấp",
  title: "Dịch vụ Vexim",
  sub: "Giải pháp giúp doanh nghiệp tiếp cận người mua quốc tế. Tư vấn miễn phí, phản hồi trong 1 ngày làm việc.",
  fitLabel: "Phù hợp với",
  request: "Đăng ký tư vấn",
  requestPlan: "Đăng ký nâng gói",
  servicesTitle: "Dịch vụ tư vấn",
  requestOpen: "Yêu cầu đang được xử lý",
  cancel: "Huỷ",
  send: "Gửi yêu cầu",
  sending: "Đang gửi…",
  noteLabel: "Nhu cầu của doanh nghiệp (không bắt buộc)",
  notePlaceholder: "Ví dụ: website tiếng Anh cho nhà máy hạt điều, hoàn thành trước hội chợ sắp tới.",
  contactLine: "Chuyên viên Vexim sẽ liên hệ qua {email}.",
  services: {
    international_website: {
      title: "Website xuất khẩu",
      tagline: "Kênh bán hàng riêng bằng tiếng Anh, theo chuẩn B2B quốc tế.",
      points: [
        "Website đa ngôn ngữ, giới thiệu năng lực sản xuất và chứng nhận",
        "Xây dựng theo chuẩn tìm kiếm để người mua tìm thấy trên Google",
        "Báo giá theo đúng số trang doanh nghiệp cần",
      ],
      fit: "Doanh nghiệp chưa có website tiếng Anh, hoặc website hiện tại chưa tạo ra yêu cầu báo giá.",
    },
    featured_ads: {
      title: "Quảng cáo nổi bật",
      tagline: "Đưa thương hiệu đến vị trí người mua nhìn thấy đầu tiên trên Vexim Trade.",
      points: [
        "Banner doanh nghiệp tại các vị trí nổi bật trên sàn",
        "Chủ động chọn vị trí, kích thước và thời gian hiển thị",
        "Báo giá rõ ràng trước khi triển khai",
      ],
      fit: "Doanh nghiệp ra mắt dòng sản phẩm mới, vào mùa vụ hoặc cần tăng độ nhận biết thương hiệu.",
    },
    fda_compliance: {
      title: "Tuân thủ FDA Hoa Kỳ",
      tagline: "Hỗ trợ hoàn thiện thủ tục pháp lý để xuất khẩu thực phẩm vào Hoa Kỳ.",
      points: [
        "Đăng ký và gia hạn cơ sở với FDA",
        "Hỗ trợ U.S. Agent, nhãn hàng hoá, FSVP và Prior Notice",
        "Rà soát trước để xác định sản phẩm cần bước nào",
      ],
      fit: "Doanh nghiệp chuẩn bị xuất khẩu sang Hoa Kỳ hoặc cần gia hạn đăng ký FDA.",
    },
    plan_upgrade: {
      title: "Gói thành viên",
      tagline: "Trình bày chuyên nghiệp hơn, được người mua biết đến nhiều hơn.",
      points: [
        "Đăng sản phẩm không giới hạn với gói Pro: đưa trọn danh mục hàng xuất khẩu lên một gian hàng",
        "Gian hàng cao cấp với nội dung A+ và video, cho người mua thấy rõ nhà máy, quy trình và chất lượng",
        "Bài giới thiệu doanh nghiệp bằng tiếng Anh trên Vexim Trade, giúp người mua tìm thấy bạn trên Google",
        "Gói Pro: xuất hiện nổi bật trong thư tuần gửi người mua quốc tế đang theo dõi đúng ngành hàng của bạn",
      ],
      fit: "Doanh nghiệp cần đăng thêm sản phẩm hoặc muốn hiện diện rõ nét hơn với người mua.",
    },
  },
  mine: {
    title: "Yêu cầu của tôi",
    empty: "Chưa có yêu cầu nào. Chọn một dịch vụ ở trên để đăng ký tư vấn.",
    reference: "Mã yêu cầu",
    sentOn: "Gửi ngày {date}",
    updatedOn: "Cập nhật {date}",
  },
  status: {
    submitted: "Đã gửi",
    active: "Đã mở",
    cancelled: "Đã huỷ",
    expired: "Hết hạn",
  },
  result: {
    sent: "Đã gửi yêu cầu {reference}. Chuyên viên Vexim sẽ liên hệ trong vòng 1 ngày làm việc.",
    duplicate: "Doanh nghiệp đã có yêu cầu đang xử lý cho dịch vụ này. Vexim sẽ liên hệ về yêu cầu đó.",
    invalid: "Dịch vụ này hiện không khả dụng. Vui lòng tải lại trang và thử lại.",
    tooLong: "Ghi chú tối đa 1.200 ký tự.",
    signIn: "Vui lòng đăng nhập lại để gửi yêu cầu.",
    notApproved: "Dịch vụ được mở sau khi Vexim duyệt tài khoản doanh nghiệp.",
    failed: "Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.",
  },
};

export const servicesMessages = { en, vi };
