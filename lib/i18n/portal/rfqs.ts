/**
 * Chuỗi cụm 5a: trang RFQ & báo giá của cổng nhà cung cấp.
 *
 * Gồm cả nhãn trạng thái lời mời và câu thay thế do `lib/supplier-portal/dashboard.ts`
 * sinh ra: đó là câu chữ hiển thị, không phải dữ liệu nghiệp vụ. Hàm trong đó nhận
 * `language` với mặc định `vi`, nên API và CRM không đổi hành vi.
 */
const en = {
  metaTitle: "RFQs and quotes",
  eyebrow: "Supplier portal · private",
  title: "RFQs and quotes",
  sub: "Only quote requests already sent to your company. Buyer details stay private.",
  badge: {
    tasks: "{count} need a reply",
    invites: "{count} invitations",
  },
  degraded: {
    title: "Some RFQ data could not be loaded",
    body: "Everything else still works. If this keeps happening, contact support to check the configuration.",
    labelInvites: "invitations sent",
    labelProducts: "products",
  },
  tasks: {
    title: "Waiting for your reply",
    sub: "Answer the quote invitation in your inbox. Do not contact the buyer directly.",
    empty: "No RFQ is waiting for a reply.",
    overdue: "Reply overdue: ",
    due: "Reply due: ",
    dueFallback: "as stated in the invitation",
    reply: "Reply by email",
    subject: "Reply to {code}",
  },
  invites: {
    title: "Invitations sent",
    sub: "Newest first. Each row is one quote request sent to you, not an order.",
    empty: "No RFQ has been sent to your company yet.",
    viewAll: "View all",
    sentAt: "sent {at}",
    due: "Reply due: {at}",
    quoteRecorded: "Quoted price recorded: {value}",
    replied: "Reply recorded on {at}; it will be processed next.",
  },
  report: {
    title: "Quote invitation report",
    sub: "Counts only RFQs actually sent to your company, not views or revenue.",
    rangeAria: "Report range",
    days: "{count} days",
    sent: "Sent",
    responded: "Answered",
    quoted: "Quoted",
    selected: "Selected",
    productHead: "Linked product",
    invitesHead: "Invitations",
    quotedHead: "Quoted",
    empty: "No invitation in the last {days} days.",
    footnote: "Shared RFQs and RFQs with no linked product are grouped separately; the title a buyer typed is never guessed into a product.",
  },
  status: {
    sent_to_supplier: "Waiting for your reply",
    quoted: "Quote recorded",
    declined: "Declined",
    no_response: "No reply received",
    presented_to_buyer: "Quote presented to buyer",
    selected: "Selected",
    not_selected: "Not selected",
    processing: "In progress",
  },
  fallback: {
    title: "Item from the invitation",
    quantity: "As stated in the invitation",
    destination: "As stated in the invitation",
    productRow: "No linked product",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type RfqsMessages = DeepStrings<typeof en>;

const vi: RfqsMessages = {
  metaTitle: "RFQ & báo giá",
  eyebrow: "Cổng nhà cung cấp · riêng tư",
  title: "RFQ & báo giá",
  sub: "Chỉ những yêu cầu báo giá đã được chuyển tới doanh nghiệp. Thông tin người mua được giữ kín.",
  badge: {
    tasks: "{count} cần phản hồi",
    invites: "{count} lời mời",
  },
  degraded: {
    title: "Một phần dữ liệu RFQ chưa tải được",
    body: "Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.",
    labelInvites: "danh sách RFQ được chuyển",
    labelProducts: "sản phẩm",
  },
  tasks: {
    title: "Cần bạn phản hồi",
    sub: "Trả lời thư mời chào giá trong hộp thư của bạn. Không liên hệ người mua trực tiếp.",
    empty: "Không có RFQ nào đang chờ phản hồi.",
    overdue: "Đã quá hạn phản hồi: ",
    due: "Hạn phản hồi: ",
    dueFallback: "theo thư mời đã gửi",
    reply: "Trả lời qua email",
    subject: "Phản hồi {code}",
  },
  invites: {
    title: "Lời mời đã chuyển",
    sub: "Mới nhất ở trên. Mỗi dòng là một lần yêu cầu báo giá được chuyển tới, không phải đơn hàng.",
    empty: "Chưa có RFQ nào được chuyển tới doanh nghiệp.",
    viewAll: "Xem tất cả",
    sentAt: "chuyển ngày {at}",
    due: "Hạn phản hồi: {at}",
    quoteRecorded: "Giá đã ghi nhận: {value}",
    replied: "Đã ghi nhận phản hồi ngày {at}; nội dung sẽ được xử lý tiếp.",
  },
  report: {
    title: "Báo cáo lời mời báo giá",
    sub: "Chỉ tính RFQ thực sự chuyển tới doanh nghiệp, không tính lượt xem hay doanh thu.",
    rangeAria: "Khoảng thời gian báo cáo",
    days: "{count} ngày",
    sent: "Được chuyển",
    responded: "Đã phản hồi",
    quoted: "Đã ghi báo giá",
    selected: "Được chọn",
    productHead: "Sản phẩm nguồn",
    invitesHead: "Lời mời",
    quotedHead: "Có báo giá",
    empty: "Chưa có lời mời trong {days} ngày qua.",
    footnote: "RFQ chung hoặc RFQ không gắn sản phẩm xác thực được nhóm riêng; không suy đoán từ tên sản phẩm người mua tự nhập.",
  },
  status: {
    sent_to_supplier: "Chờ bạn phản hồi",
    quoted: "Đã ghi nhận báo giá",
    declined: "Đã từ chối",
    no_response: "Chưa nhận phản hồi",
    presented_to_buyer: "Đã trình báo giá",
    selected: "Được chọn",
    not_selected: "Không được chọn",
    processing: "Đang xử lý",
  },
  fallback: {
    title: "Mặt hàng theo thư mời",
    quantity: "Theo thư mời",
    destination: "Theo thư mời",
    productRow: "Chưa liên kết sản phẩm của bạn",
  },
};

export const rfqsMessages = { en, vi };
