/**
 * Chuỗi trang "Dịch vụ Vexim" trong cổng nhà cung cấp.
 *
 * Nhà cung cấp đã đăng nhập nên trang không có thẻ "Đăng ký miễn phí" như /for-suppliers.
 * Đây chỉ là yêu cầu tư vấn: không ghi giá, không hứa kết quả, không có nút mua.
 */
const en = {
  metaTitle: "Vexim services",
  eyebrow: "Grow your business",
  title: "Vexim services",
  sub: "Request a consultation. Vexim contacts you to discuss scope and a quote. Nothing is charged here.",
  fitLabel: "Good fit when",
  request: "Request a consultation",
  requestOpen: "Request in progress",
  cancel: "Cancel",
  send: "Send request",
  sending: "Sending…",
  noteLabel: "What do you need? (optional)",
  notePlaceholder: "For example: an English website for our cashew factory, ready before the next trade fair.",
  contactLine: "Vexim will contact {email}.",
  services: {
    international_website: {
      title: "Export website",
      body: "A multilingual B2B website for food and agricultural exporters, built for buyer search.",
      fit: "You have no English website yet, or your current one does not bring inquiries.",
    },
    featured_ads: {
      title: "Featured placement",
      body: "Discuss a business banner on Vexim Trade: placement, banner size and display period.",
      fit: "You are launching a product line or want more buyers to see your storefront.",
    },
    fda_compliance: {
      title: "US FDA compliance",
      body: "Consulting and paperwork for exporting food to the United States.",
      fit: "You plan to sell to the US or need FDA registration renewed.",
    },
  },
  mine: {
    title: "My requests",
    empty: "No requests yet. Pick a service above to ask Vexim for a consultation.",
    reference: "Reference",
    sentOn: "Sent {date}",
    updatedOn: "Updated {date}",
  },
  status: {
    submitted: "Sent",
    in_consultation: "In consultation",
    quoted: "Quote sent",
    closed: "Closed",
  },
  result: {
    sent: "Request {reference} sent. Vexim will contact you within one business day.",
    duplicate: "You already have an open request for this service. Vexim will contact you about it.",
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
  eyebrow: "Phát triển kinh doanh",
  title: "Dịch vụ Vexim",
  sub: "Gửi yêu cầu tư vấn, Vexim sẽ liên hệ trao đổi phạm vi và báo giá. Gửi yêu cầu không mất phí.",
  fitLabel: "Phù hợp khi",
  request: "Yêu cầu tư vấn",
  requestOpen: "Đang xử lý yêu cầu",
  cancel: "Huỷ",
  send: "Gửi yêu cầu",
  sending: "Đang gửi…",
  noteLabel: "Bạn cần gì? (không bắt buộc)",
  notePlaceholder: "Ví dụ: website tiếng Anh cho nhà máy hạt điều, cần xong trước hội chợ tới.",
  contactLine: "Vexim sẽ liên hệ qua {email}.",
  services: {
    international_website: {
      title: "Website xuất khẩu",
      body: "Website B2B đa ngôn ngữ cho doanh nghiệp xuất khẩu thực phẩm, nông sản, dễ được người mua tìm thấy.",
      fit: "Bạn chưa có website tiếng Anh, hoặc website hiện tại chưa mang lại yêu cầu báo giá.",
    },
    featured_ads: {
      title: "Quảng cáo nổi bật",
      body: "Trao đổi về banner doanh nghiệp trên Vexim Trade: vị trí, kích thước và thời gian hiển thị.",
      fit: "Bạn ra mắt dòng sản phẩm mới hoặc muốn nhiều người mua biết đến gian hàng hơn.",
    },
    fda_compliance: {
      title: "Tuân thủ FDA Hoa Kỳ",
      body: "Tư vấn và hỗ trợ hồ sơ để xuất khẩu thực phẩm sang Hoa Kỳ.",
      fit: "Bạn định bán sang Mỹ hoặc cần gia hạn đăng ký FDA.",
    },
  },
  mine: {
    title: "Yêu cầu của tôi",
    empty: "Chưa có yêu cầu nào. Chọn một dịch vụ ở trên để nhờ Vexim tư vấn.",
    reference: "Mã yêu cầu",
    sentOn: "Gửi ngày {date}",
    updatedOn: "Cập nhật {date}",
  },
  status: {
    submitted: "Đã gửi",
    in_consultation: "Đang tư vấn",
    quoted: "Đã báo giá",
    closed: "Đã đóng",
  },
  result: {
    sent: "Đã gửi yêu cầu {reference}. Vexim sẽ liên hệ trong vòng 1 ngày làm việc.",
    duplicate: "Bạn đã có một yêu cầu đang xử lý cho dịch vụ này. Vexim sẽ liên hệ về yêu cầu đó.",
    invalid: "Dịch vụ này không còn. Tải lại trang rồi thử lại.",
    tooLong: "Ghi chú tối đa 1.200 ký tự.",
    signIn: "Hãy đăng nhập lại để gửi yêu cầu.",
    notApproved: "Dịch vụ mở sau khi Vexim duyệt tài khoản của bạn.",
    failed: "Chưa gửi được yêu cầu. Thử lại sau ít phút.",
  },
};

export const servicesMessages = { en, vi };
